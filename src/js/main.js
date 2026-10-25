/**
 * MODULE: src/js/main.js
 * Kết nối các module (firebase.js, auth.js, students.js, grades.js),
 * Tích hợp Event Delegation toàn cục trên `document` và hàm showModal/hideModal đồng nhất
 * để mọi nút bấm trong bảng hoạt động nhạy bén ngay từ lần nhấp đầu tiên, không bao giờ đơ giao diện.
 */

import {
  STORAGE_KEY,
  AUTH_STORAGE_KEY,
  CLOUD_CFG_STORAGE_KEY,
  DEFAULT_CLASSES,
  DEFAULT_SUBJECTS,
  AppState,
  CloudSync,
  registerExternalHooks,
  initData,
  persistData,
  showToast,
  showModal,
  hideModal,
  logAuditTrail,
  updateAllViews,
  renderSpreadsheet,
  setSheetScaleMode,
  toggleCurrentSheetLock,
  renderMasterTable,
  renderDashboard,
  renderDebtCadetsSection,
  exportReportExcel,
  renderLanguages,
  openLangModal,
  renderAuditLog,
  deleteSubject,
  deleteAllSubjectsInSemester,
  deleteAllSubjectsAllSemesters,
  renderSubjectsSettings,
  exportClassExcel,
  exportMasterExcel,
  exportLanguageExcel,
  downloadExcelTemplate,
  handleExcelFileUpload,
  executeExcelImport,
  renderCumulativeTable,
  openTranscriptModal,
  exportCumulativeExcel,
  handleInlineCumulativeMetaChange,
  getCurrentUserClassScope,
  getSubjectTargetClasses,
  normalizeAchievements,
  normalizeSubjectsCatalog,
  initCloudSyncConfig,
  updateShareLinksInModal,
  connectFirebaseRealtime,
  pushDataToCloud
} from './grades.js';

import {
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_PROJECT_REF,
  upsertStudentToSupabase,
  upsertSubjectToSupabase,
  upsertLanguageToSupabase
} from './supabase.js';

import {
  renderStudentView,
  populateStudentPicker,
  openConfirmDeleteModal,
  executeCascadeDeleteCadet,
  executeClearAllStudents,
  downloadQuickImportTemplate,
  handleQuickImportFileUpload,
  executeQuickImport,
  resetQuickImportModalState,
  renderProfilesTable,
  switchProfileSubtab,
  openStudentProfileModal,
  updatePartyDatesDisplay,
  exportStudentProfiles,
  validateAndFormatParentDob,
  openCadetDetailPage,
  closeCadetDetailPage
} from './students.js';

import {
  AuthState,
  canUserConfigureLangStandard,
  initAuthSubscription,
  handleRoleChange,
  switchTab,
  closeAuthModal,
  openLoginModal,
  updateAuthUI,
  handleLogout,
  handleMockLogin,
  handleCadetSubmit
} from './auth.js';

/**
 * Hàm trợ giúp gán sự kiện an toàn có kiểm tra tồn tại phần tử (Null Check)
 */
function safeOn(elementOrId, eventName, handler) {
  const el = typeof elementOrId === 'string'
    ? document.getElementById(elementOrId)
    : elementOrId;
  if (el && typeof el.addEventListener === 'function') {
    el.addEventListener(eventName, handler);
  }
  return el;
}

/**
 * Đọc danh sách các lớp được tích chọn (Checkboxes) trong Modal Thêm/Sửa Môn Chuyên Ngành
 */
export function getSelectedTargetClassesFromModal() {
  const classScope = getCurrentUserClassScope();
  if (classScope) return [classScope];

  const checkboxes = document.querySelectorAll('.subj-target-class-cb:checked');
  if (checkboxes && checkboxes.length > 0) {
    return Array.from(checkboxes).map(cb => cb.value.trim().toUpperCase()).filter(Boolean);
  }

  // Fallback nếu có select cũ
  const fallbackSelect = document.getElementById('newSubjTargetClass');
  if (fallbackSelect && fallbackSelect.value) {
    return [fallbackSelect.value.trim().toUpperCase()];
  }
  return [];
}

/**
 * Thiết lập trạng thái tích chọn các ô Checkbox lớp trong Modal Thêm/Sửa Môn Chuyên Ngành
 */
export function setSelectedTargetClassesInModal(classesList = []) {
  const classScope = getCurrentUserClassScope();
  const normalized = classScope
    ? [classScope]
    : (Array.isArray(classesList) && classesList.length > 0 ? classesList : ['OTQS1']);

  document.querySelectorAll('.subj-target-class-cb').forEach(cb => {
    cb.checked = normalized.includes(cb.value);
    cb.disabled = !!classScope;
  });
}

/**
 * Mở Modal Chỉnh sửa Môn học (Hỗ trợ chỉnh sửa cả nhiều lớp áp dụng cho môn chuyên ngành)
 */
export function openEditSubjectModal(subjectId) {
  const subj = AppState.subjects.find(s => s.id === subjectId);
  if (!subj) return;

  const classScope = getCurrentUserClassScope();
  const targetClasses = getSubjectTargetClasses(subj);
  if (classScope && (subj.category !== 'specialized' || !targetClasses.includes(classScope))) {
    showToast(`Tài khoản Lớp ${classScope} chỉ được phép chỉnh sửa môn chuyên ngành của lớp mình!`, 'error');
    return;
  }

  const editIdInput = document.getElementById('editSubjId');
  if (editIdInput) editIdInput.value = subj.id;

  const modalTitle = document.getElementById('modalAddSubjectTitle');
  if (modalTitle) modalTitle.textContent = `Cập Nhật Môn Học: ${subj.code}`;

  const codeEl = document.getElementById('newSubjCode');
  const nameEl = document.getElementById('newSubjName');
  const semEl = document.getElementById('newSubjSemester');
  const credEl = document.getElementById('newSubjCredits');
  const catEl = document.getElementById('newSubjCategory');

  if (codeEl) codeEl.value = subj.code;
  if (nameEl) nameEl.value = subj.name;
  if (semEl) semEl.value = String(subj.semester);
  if (credEl) credEl.value = String(subj.credits);
  if (catEl) {
    catEl.value = subj.category === 'specialized' ? 'specialized' : 'common';
    catEl.disabled = !!classScope;
  }

  const targetWrapper = document.getElementById('newSubjTargetClassWrapper');
  if (targetWrapper) {
    if (subj.category === 'specialized' || classScope) {
      targetWrapper.classList.remove('hidden');
    } else {
      targetWrapper.classList.add('hidden');
    }
  }

  setSelectedTargetClassesInModal(targetClasses);
  showModal('modalAddSubject');
}

export function initApp() {
  // 1. Đăng ký các hook liên kết giữa các module và biến toàn cục
  registerExternalHooks({
    renderProfilesTable,
    renderStudentView,
    handleRoleChange,
    openStudentProfileModal,
    openCadetDetailPage
  });

  window.AppState = AppState;
  window.AuthState = AuthState;
  window.handleMockLogin = handleMockLogin;
  window.handleCadetSubmit = handleCadetSubmit;
  window.openLoginModal = openLoginModal;
  window.closeAuthModal = closeAuthModal;
  window.handleLogout = handleLogout;
  window.switchTab = switchTab;
  window.executeCascadeDeleteCadet = executeCascadeDeleteCadet;
  window.executeClearAllStudents = executeClearAllStudents;
  window.clearAllStudentsOnFirebase = executeClearAllStudents;
  window.deleteAllSubjectsInSemester = deleteAllSubjectsInSemester;
  window.deleteAllSubjectsAllSemesters = deleteAllSubjectsAllSemesters;
  window.openConfirmDeleteModal = openConfirmDeleteModal;
  window.openCadetDetailPage = openCadetDetailPage;
  window.closeCadetDetailPage = closeCadetDetailPage;
  window.openEditSubjectModal = openEditSubjectModal;

  // 2. Khởi tạo dữ liệu từ Firebase Firestore và đăng ký lắng nghe trạng thái đăng nhập
  initData();
  initAuthSubscription();

  // --- ĐĂNG NHẬP, ĐĂNG XUẤT & PHÂN QUYỀN ---
  safeOn('btnOpenLoginModal', 'click', () => openLoginModal(false));
  safeOn('btnCornerSwitchRole', 'click', () => openLoginModal(false));
  safeOn('btnLogout', 'click', handleLogout);
  safeOn('btnCornerLogout', 'click', handleLogout);

  const tabAdmin = document.getElementById('tabBtnAdminLogin');
  const tabCadet = document.getElementById('tabBtnCadetLogin');
  const formAdmin = document.getElementById('formAdminLogin');
  const formCadet = document.getElementById('formCadetLogin');

  if (tabAdmin) {
    tabAdmin.addEventListener('click', () => {
      tabAdmin.className = 'py-2.5 px-3 rounded-lg bg-gold-500 text-slate-950 font-black shadow-sm transition';
      if (tabCadet) tabCadet.className = 'py-2.5 px-3 rounded-lg text-slate-300 hover:text-white font-bold transition';
      if (formAdmin) formAdmin.classList.remove('hidden');
      if (formCadet) formCadet.classList.add('hidden');
      const err1 = document.getElementById('loginAdminError');
      if (err1) { err1.classList.add('hidden'); err1.style.display = 'none'; }
    });
  }

  if (tabCadet) {
    tabCadet.addEventListener('click', () => {
      tabCadet.className = 'py-2.5 px-3 rounded-lg bg-emerald-600 text-white font-black shadow-sm transition';
      if (tabAdmin) tabAdmin.className = 'py-2.5 px-3 rounded-lg text-slate-300 hover:text-white font-bold transition';
      if (formCadet) formCadet.classList.remove('hidden');
      if (formAdmin) formAdmin.classList.add('hidden');
      const err2 = document.getElementById('loginCadetError');
      if (err2) { err2.classList.add('hidden'); err2.style.display = 'none'; }
    });
  }

  if (formAdmin) {
    formAdmin.addEventListener('submit', function(e) {
      e.preventDefault();
      e.stopPropagation();
      handleMockLogin(e);
      return false;
    });
  }

  safeOn('btnSubmitAdminLogin', 'click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    handleMockLogin(e);
  });

  ['loginAdminUser', 'loginAdminPass'].forEach(id => {
    safeOn(id, 'keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleMockLogin(e);
      }
    });
  });

  if (formCadet) {
    formCadet.addEventListener('submit', function(e) {
      e.preventDefault();
      e.stopPropagation();
      handleCadetSubmit(e);
      return false;
    });
  }

  safeOn('btnSubmitCadetLogin', 'click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    handleCadetSubmit(e);
  });

  safeOn('loginCadetCode', 'keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleCadetSubmit(e);
    }
  });

  // 3. KIỂM SOÁT TRUY CẬP BẮT BUỘC QUA TRANG ĐĂNG NHẬP RIÊNG BIỆT (LƯU TRẠNG THÁI TRONG sessionStorage)
  try {
    const savedSession = sessionStorage.getItem(AUTH_STORAGE_KEY);
    const parsedSession = savedSession ? JSON.parse(savedSession) : null;
    if (parsedSession && ['admin', 'company_officer', 'class_account', 'class_leader', 'student'].includes(parsedSession.type)) {
      AuthState.setUser(parsedSession, true);
      closeAuthModal();
    } else {
      // Khi chưa đăng nhập, bắt buộc ẩn toàn bộ màn hình chính và hiển thị trang đăng nhập riêng biệt
      AuthState.setUser(null, true);
      openLoginModal(true);
    }
  } catch (err) {
    AuthState.setUser(null, true);
    openLoginModal(true);
  }

  populateStudentPicker();

  // --- CHUYỂN ĐỔI TAB ĐIỀU HƯỚNG ---
  document.querySelectorAll('.nav-tab').forEach(tabBtn => {
    if (!tabBtn) return;
    tabBtn.addEventListener('click', function(e) {
      if (e) e.preventDefault();
      switchTab(this.dataset.tab);
    });
  });

  safeOn('roleSelector', 'change', function() {
    handleRoleChange(this.value);
  });

  // --- BẢNG ĐIỂM LỚP / ĐẠI ĐỘI (THEO NĂM HỌC 1-5) & CHẾ ĐỘ HỆ 10 / HỆ 4 ---
  safeOn('sheetClassSelect', 'change', function() {
    const classScope = getCurrentUserClassScope();
    if (classScope && this.value !== classScope) {
      this.value = classScope;
      return;
    }
    AppState.currentSheetClass = this.value;
    renderSpreadsheet();
  });

  safeOn('sheetSemesterSelect', 'change', function() {
    AppState.currentSheetSemester = this.value;
    renderSpreadsheet();
  });

  safeOn('btnSheetScale10', 'click', () => setSheetScaleMode('10'));
  safeOn('btnSheetScale4', 'click', () => setSheetScaleMode('4'));
  safeOn('btnToggleLock', 'click', toggleCurrentSheetLock);

  safeOn('studentSelfLangLevelSelect', 'change', function() {
    if (AppState.role === 'student') return;
    const sid = AppState.studentViewingId;
    if (sid) handleInlineCumulativeMetaChange(sid, 'currentLangLevel', this.value);
  });
  safeOn('studentSelfItStandardSelect', 'change', function() {
    if (AppState.role === 'student') return;
    const sid = AppState.studentViewingId;
    if (sid) handleInlineCumulativeMetaChange(sid, 'itStandard', this.value);
  });

  // --- THIẾT LẬP CHUẨN NGOẠI NGỮ PHẢI ĐẠT ĐƯỢC (DÀNH CHO ADMIN & CÁN BỘ) ---
  document.querySelectorAll('.required-lang-standard-select').forEach(sel => {
    if (!sel) return;
    sel.value = AppState.requiredLangStandard || 'A2';
    sel.addEventListener('change', function() {
      if (!canUserConfigureLangStandard()) {
        showToast('Chỉ Admin và Cán bộ Đại đội mới có quyền cấu hình chuẩn ngoại ngữ!', 'error');
        this.value = AppState.requiredLangStandard || 'A2';
        return;
      }
      AppState.requiredLangStandard = this.value;
      document.querySelectorAll('.required-lang-standard-select').forEach(s => { s.value = AppState.requiredLangStandard; });
      document.querySelectorAll('.required-lang-standard-badge').forEach(b => { b.textContent = AppState.requiredLangStandard; });
      persistData();
      updateAllViews();
    });
  });

  safeOn('langFilterClass', 'change', renderLanguages);

  // --- BỘ LỌC TỔNG HỢP TOÀN ĐẠI ĐỘI ---
  safeOn('masterFilterClass', 'change', function() {
    AppState.masterFilters.class = this.value;
    renderMasterTable();
  });
  safeOn('masterFilterSemester', 'change', function() {
    AppState.masterFilters.semester = this.value;
    renderMasterTable();
  });
  safeOn('masterFilterRank', 'change', function() {
    AppState.masterFilters.rank = this.value;
    renderMasterTable();
  });
  safeOn('masterFilterDebt', 'change', function() {
    AppState.masterFilters.debt = this.value;
    renderMasterTable();
  });
  safeOn('masterSearch', 'input', function() {
    AppState.masterFilters.search = this.value;
    renderMasterTable();
  });

  // --- BỘ LỌC BẢNG ĐIỂM TÍCH LŨY ---
  ['cumulFilterClass', 'cumulFilterYear', 'cumulFilterRank', 'cumulFilterDebt'].forEach(id => {
    safeOn(id, 'change', renderCumulativeTable);
  });
  safeOn('cumulSearchInput', 'input', renderCumulativeTable);

  // --- BỘ LỌC BẢNG HỒ SƠ QUÂN NHÂN ---
  ['profileFilterClass', 'profileFilterPosition', 'profileFilterPolitical'].forEach(id => {
    safeOn(id, 'change', renderProfilesTable);
  });
  safeOn('profileSearchInput', 'input', renderProfilesTable);

  // --- XUẤT / NHẬP EXCEL ---
  safeOn('btnExportClassExcel', 'click', exportClassExcel);
  safeOn('btnExportMasterExcel', 'click', exportMasterExcel);
  safeOn('btnExportLangExcel', 'click', exportLanguageExcel);
  safeOn('btnExportProfileExcel', 'click', () => exportStudentProfiles());
  safeOn('btnExportCumulativeExcel', 'click', exportCumulativeExcel);
  safeOn('btnDownloadTemplate', 'click', downloadExcelTemplate);
  safeOn('btnExportReportExcel', 'click', exportReportExcel);

  safeOn('reportDebtFilterClass', 'change', function() {
    renderDebtCadetsSection();
  });

  safeOn('btnImportExcel', 'click', () => {
    if (AppState.role === 'student') return;
    showModal('modalImportExcel');
  });

  const dropZone = document.getElementById('dropZone');
  const excelFileInput = document.getElementById('excelFileInput');
  if (dropZone && excelFileInput) {
    dropZone.addEventListener('click', () => excelFileInput.click());
  }
  if (excelFileInput) {
    excelFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files.length > 0) handleExcelFileUpload(e.target.files[0]);
    });
  }
  safeOn('btnConfirmImport', 'click', executeExcelImport);

  // --- THÊM HỌC VIÊN MỚI (TỰ DO NHẬP LIỆU) ---
  ['btnAddCadetModalBtn', 'btnAddCadetCumulBtn', 'btnAddCadetMasterBtn'].forEach(id => {
    safeOn(id, 'click', () => {
      const classScope = getCurrentUserClassScope();
      const clsSelect = document.getElementById('newCadetClass');
      if (clsSelect && classScope) {
        clsSelect.innerHTML = `<option value="${classScope}">Lớp ${classScope}</option>`;
        clsSelect.value = classScope;
        clsSelect.disabled = true;
      } else if (clsSelect) {
        clsSelect.disabled = false;
      }
      showModal('modalAddCadet');
    });
  });

  safeOn('formAddCadet', 'submit', function(e) {
    e.preventDefault();
    const codeEl = document.getElementById('newCadetCode');
    const nameEl = document.getElementById('newCadetName');
    const rankEl = document.getElementById('newCadetRank');
    const clsEl = document.getElementById('newCadetClass');
    const dobEl = document.getElementById('newCadetDob');
    const roleEl = document.getElementById('newCadetRole');

    const code = codeEl ? codeEl.value.trim().toUpperCase() : '';
    const name = nameEl ? nameEl.value.trim() : '';
    const rank = rankEl ? rankEl.value : 'Hạ sĩ';
    const cls = getCurrentUserClassScope() || (clsEl ? clsEl.value : 'OTQS1');
    const dob = dobEl ? dobEl.value : '2004-01-01';
    const role = (roleEl && roleEl.value.trim()) ? roleEl.value.trim() : 'Học viên';

    if (!code || !name) {
      showToast('Vui lòng nhập đầy đủ Mã học viên và Họ tên!', 'error');
      return;
    }

    if (AppState.students.some(s => s.code.toLowerCase() === code.toLowerCase())) {
      showToast('Mã học viên này đã tồn tại trong hệ thống!', 'error');
      return;
    }

    const newId = 'hv_' + Date.now();
    const newStudent = {
      id: newId,
      code,
      name,
      rank,
      class: cls,
      dob,
      role,
      position: role,
      hometown: 'Quảng Xương, Thanh Hóa',
      permanentAddress: 'Quảng Xương, Thanh Hóa',
      currentAddress: 'Bắc Từ Liêm, Hà Nội',
      achievements: [],
      currentLangLevel: 'A2',
      itStandard: 'Đạt chuẩn CNTT cơ bản'
    };
    AppState.students.push(newStudent);
    AppState.grades[newId] = {};
    AppState.languages[newId] = { lang: 'Tiếng Nga', currentLevel: 'A2', itStandard: 'Đạt chuẩn CNTT cơ bản', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT' };

    // Lưu trực tiếp Document học viên mới lên Firestore để học viên có thể dùng Mã HV đăng nhập ngay trên mọi thiết bị
    upsertStudentToSupabase(newStudent, AppState.languages[newId]);
    logAuditTrail(newId, '', '', '', `Thêm mới học viên ${name} (${code})`);
    persistData();
    populateStudentPicker();
    updateAllViews();

    hideModal('modalAddCadet');
    this.reset();
  });

  // --- CẬP NHẬT CHỨNG CHỈ NGOẠI NGỮ ---
  safeOn('btnAddLangCertBtn', 'click', () => {
    openLangModal(null);
  });

  safeOn('formUpdateLang', 'submit', function(e) {
    e.preventDefault();
    const sid = document.getElementById('langStudentId')?.value;
    if (!sid) return;
    const lang = document.getElementById('langChoice')?.value || 'Tiếng Nga';
    const A1 = document.getElementById('langLevelA1')?.value || 'Đ';
    const A21 = document.getElementById('langLevelA21')?.value || 'Đ';
    const A22 = document.getElementById('langLevelA22')?.value || 'Đ';
    const B11 = document.getElementById('langLevelB11')?.value || 'CT';
    const B12 = document.getElementById('langLevelB12')?.value || 'CT';
    const extraCert = document.getElementById('langExtraCert')?.value || '';

    const prev = AppState.languages[sid] || {};
    AppState.languages[sid] = { ...prev, lang, A1, A21, A22, B11, B12, extraCert };
    upsertLanguageToSupabase(sid, AppState.languages[sid]);
    logAuditTrail(sid, '', 'Ngoại ngữ', `${lang}: B1.1 ${B11}, B1.2 ${B12}`, 'Cập nhật chứng chỉ ngoại ngữ');
    persistData();
    updateAllViews();
    hideModal('modalUpdateLang');
  });

  // --- QUẢN LÝ MÔN HỌC: MÔN CHUNG & MÔN CHUYÊN NGÀNH (CHỌN NHIỀU LỚP BẰNG CHECKBOX) ---
  const syncModalAddSubjCategoryUI = () => {
    const catSelect = document.getElementById('newSubjCategory');
    const targetClsWrapper = document.getElementById('newSubjTargetClassWrapper');
    const classScope = getCurrentUserClassScope();

    if (classScope) {
      if (catSelect) {
        catSelect.value = 'specialized';
        catSelect.disabled = true;
      }
      if (targetClsWrapper) targetClsWrapper.classList.remove('hidden');
      setSelectedTargetClassesInModal([classScope]);
      return;
    }

    if (catSelect) catSelect.disabled = false;
    if (catSelect && targetClsWrapper) {
      if (catSelect.value === 'specialized') {
        targetClsWrapper.classList.remove('hidden');
        if (getSelectedTargetClassesFromModal().length === 0) {
          const defCls = (AppState.currentSheetClass && AppState.currentSheetClass !== 'all')
            ? [AppState.currentSheetClass]
            : ['OTQS1'];
          setSelectedTargetClassesInModal(defCls);
        }
      } else {
        targetClsWrapper.classList.add('hidden');
      }
    }
  };

  safeOn('newSubjCategory', 'change', syncModalAddSubjCategoryUI);

  safeOn('btnSelectAllTargetClasses', 'click', () => {
    if (getCurrentUserClassScope()) return;
    setSelectedTargetClassesInModal([...DEFAULT_CLASSES]);
  });

  safeOn('btnClearAllTargetClasses', 'click', () => {
    if (getCurrentUserClassScope()) return;
    document.querySelectorAll('.subj-target-class-cb').forEach(cb => { cb.checked = false; });
  });

  const openCreateSubjectModal = (defaultSem = '1', defaultCat = 'common') => {
    const editIdInput = document.getElementById('editSubjId');
    if (editIdInput) editIdInput.value = '';
    const modalTitle = document.getElementById('modalAddSubjectTitle');
    if (modalTitle) modalTitle.textContent = 'Thêm Môn Học Mới';

    const codeEl = document.getElementById('newSubjCode');
    const nameEl = document.getElementById('newSubjName');
    const credEl = document.getElementById('newSubjCredits');
    const semSelect = document.getElementById('newSubjSemester');
    const catSelect = document.getElementById('newSubjCategory');

    if (codeEl) codeEl.value = '';
    if (nameEl) nameEl.value = '';
    if (credEl) credEl.value = '3';
    if (semSelect) semSelect.value = String(defaultSem);
    if (catSelect) catSelect.value = defaultCat;

    const defCls = getCurrentUserClassScope()
      ? [getCurrentUserClassScope()]
      : (AppState.currentSheetClass && AppState.currentSheetClass !== 'all' ? [AppState.currentSheetClass] : ['OTQS1']);
    setSelectedTargetClassesInModal(defCls);
    syncModalAddSubjCategoryUI();
    showModal('modalAddSubject');
  };

  safeOn('btnAddSubjectBtn', 'click', () => {
    const curYear = AppState.settingsSelectedYear || 1;
    openCreateSubjectModal(String(2 * curYear - 1), getCurrentUserClassScope() ? 'specialized' : 'common');
  });

  safeOn('btnAddSubjectFromSheetBtn', 'click', () => {
    const curYear = parseInt(AppState.currentSheetSemester, 10) || 1;
    openCreateSubjectModal(String(2 * curYear - 1), getCurrentUserClassScope() ? 'specialized' : 'common');
  });

  safeOn('btnResetDefaultCurriculum', 'click', () => {
    deleteAllSubjectsAllSemesters();
  });

  safeOn('btnClearAllSubjectsBtn', 'click', () => {
    deleteAllSubjectsAllSemesters();
  });

  safeOn('formAddSubject', 'submit', function(e) {
    e.preventDefault();
    const editSubjId = document.getElementById('editSubjId')?.value.trim() || '';
    const codeEl = document.getElementById('newSubjCode');
    const nameEl = document.getElementById('newSubjName');
    const semEl = document.getElementById('newSubjSemester');
    const credEl = document.getElementById('newSubjCredits');

    const code = codeEl ? codeEl.value.trim().toUpperCase() : '';
    const name = nameEl ? nameEl.value.trim() : '';
    const semester = parseInt(semEl ? semEl.value : '1', 10);
    const credits = parseInt(credEl ? credEl.value : '3', 10);
    const classScope = getCurrentUserClassScope();
    const category = classScope ? 'specialized' : (document.getElementById('newSubjCategory')?.value || 'common');

    let targetClasses = [];
    let targetClass = 'all';

    if (category === 'specialized') {
      targetClasses = getSelectedTargetClassesFromModal();
      if (targetClasses.length === 0) {
        showToast('Vui lòng tích chọn ít nhất 1 lớp cho môn học chuyên ngành!', 'error');
        return;
      }
      targetClass = targetClasses.join(', ');
    }

    if (!code || !name) {
      showToast('Vui lòng điền đầy đủ mã môn và tên môn học!', 'error');
      return;
    }

    if (isNaN(credits) || credits < 1 || credits > 15) {
      showToast('Số tín chỉ không hợp lệ (nhập từ 1 đến 15 tín chỉ)!', 'error');
      return;
    }

    if (editSubjId) {
      const existingSubj = AppState.subjects.find(s => s.id === editSubjId);
      if (existingSubj) {
        existingSubj.code = code;
        existingSubj.name = name;
        existingSubj.semester = semester;
        existingSubj.credits = credits;
        existingSubj.category = category;
        existingSubj.targetClasses = category === 'specialized' ? targetClasses : [];
        existingSubj.targetClass = category === 'specialized' ? targetClass : 'all';

        upsertSubjectToSupabase(existingSubj);
        logAuditTrail('', existingSubj.id, 'Cập nhật môn', `${name} (${code}) - ${category === 'specialized' ? 'Chuyên ngành ' + targetClass : 'Môn chung'}`, `HK${semester}`);
      }
    } else {
      // Nếu môn chuyên ngành đã tồn tại cùng mã và cùng kỳ, tự động gộp thêm các lớp vừa chọn
      const existingSameCode = AppState.subjects.find(s =>
        s.code.toUpperCase() === code &&
        Number(s.semester) === semester &&
        s.category === category
      );

      if (existingSameCode) {
        if (category === 'common') {
          showToast(`Mã môn chung "${code}" đã tồn tại trong Học kỳ ${semester}!`, 'error');
          return;
        }
        const merged = Array.from(new Set([...getSubjectTargetClasses(existingSameCode), ...targetClasses]));
        existingSameCode.name = name;
        existingSameCode.credits = credits;
        existingSameCode.targetClasses = merged;
        existingSameCode.targetClass = merged.join(', ');
        upsertSubjectToSupabase(existingSameCode);
        logAuditTrail('', existingSameCode.id, 'Mở rộng lớp môn CN', `${name} (${code}) -> Lớp ${existingSameCode.targetClass}`, `HK${semester}`);
      } else {
        const newSubId = 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
        const newSubjectObj = {
          id: newSubId,
          code,
          name,
          semester,
          credits,
          category,
          targetClasses: category === 'specialized' ? targetClasses : [],
          targetClass: category === 'specialized' ? targetClass : 'all'
        };
        AppState.subjects.push(newSubjectObj);
        upsertSubjectToSupabase(newSubjectObj);
        logAuditTrail('', newSubId, 'Thêm môn', `${name} (${code}) - ${category === 'specialized' ? 'Chuyên ngành ' + targetClass : 'Môn chung'}`, `HK${semester}`);
      }
    }

    const targetYear = Math.ceil(semester / 2);
    AppState.settingsSelectedYear = targetYear;

    persistData();
    updateAllViews();
    hideModal('modalAddSubject');
  });

  // ============================================================================
  // EVENT DELEGATION TOÀN CỤC TRÊN DOCUMENT (KHẮC PHỤC TRIỆT ĐỂ LỖI ĐƠ NÚT BẤM)
  // ============================================================================
  document.addEventListener('click', function(e) {
    const target = e.target;
    if (!target || typeof target.closest !== 'function') return;

    // 1. Đóng Modal (.modal-close)
    const closeBtn = target.closest('.modal-close');
    if (closeBtn) {
      const m = closeBtn.closest('.fixed');
      if (m) {
        e.preventDefault();
        if (m.id === 'modalAuthLogin') {
          closeAuthModal();
        } else {
          hideModal(m);
        }
      }
      return;
    }

    // 2. Xóa môn học (.btn-del-subj)
    const delSubjBtn = target.closest('.btn-del-subj');
    if (delSubjBtn && delSubjBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      deleteSubject(delSubjBtn.dataset.id);
      return;
    }

    // 2b. Xóa tất cả các môn trong học kỳ (.btn-clear-sem-subjects)
    const clearSemSubjBtn = target.closest('.btn-clear-sem-subjects');
    if (clearSemSubjBtn && clearSemSubjBtn.dataset.sem) {
      e.preventDefault();
      e.stopPropagation();
      deleteAllSubjectsInSemester(Number(clearSemSubjBtn.dataset.sem));
      return;
    }

    // 2c. Xóa tất cả các môn toàn khóa (.btn-clear-all-subjects)
    const clearAllSubjBtn = target.closest('.btn-clear-all-subjects');
    if (clearAllSubjBtn) {
      e.preventDefault();
      e.stopPropagation();
      deleteAllSubjectsAllSemesters();
      return;
    }

    // 2d. Xóa tất cả học viên (.btn-clear-all-students)
    const clearAllStuBtn = target.closest('.btn-clear-all-students');
    if (clearAllStuBtn) {
      e.preventDefault();
      e.stopPropagation();
      executeClearAllStudents();
      return;
    }

    // 3. Sửa môn học / Sửa lớp áp dụng môn chuyên ngành (.btn-edit-subj)
    const editSubjBtn = target.closest('.btn-edit-subj');
    if (editSubjBtn && editSubjBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openEditSubjectModal(editSubjBtn.dataset.id);
      return;
    }

    // 4. Thêm môn học nhanh theo Học kỳ (.btn-add-to-sem)
    const addSemBtn = target.closest('.btn-add-to-sem');
    if (addSemBtn) {
      e.preventDefault();
      const targetSem = addSemBtn.dataset.sem || '1';
      const targetCat = addSemBtn.dataset.cat || 'common';
      openCreateSubjectModal(targetSem, targetCat);
      return;
    }

    // 5. Chuyển tab Năm học trong cấu hình môn học (.btn-setting-year-tab)
    const yearTabBtn = target.closest('.btn-setting-year-tab');
    if (yearTabBtn && yearTabBtn.dataset.year) {
      e.preventDefault();
      AppState.settingsSelectedYear = Number(yearTabBtn.dataset.year);
      renderSubjectsSettings();
      return;
    }

    // 6. Xem chi tiết quân nhân (.btn-view-cadet-detail, .btn-sheet-profile, .btn-master-profile)
    const detailBtn = target.closest('.btn-view-cadet-detail, .btn-sheet-profile, .btn-master-profile');
    if (detailBtn && detailBtn.dataset.id) {
      e.preventDefault();
      openCadetDetailPage(detailBtn.dataset.id);
      return;
    }

    // 7. Mở Modal Sửa hồ sơ quân nhân (.btn-open-profile)
    const editProfBtn = target.closest('.btn-open-profile');
    if (editProfBtn && editProfBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openStudentProfileModal(editProfBtn.dataset.id);
      return;
    }

    // 8. Mở Modal Xác nhận Xóa quân nhân (.btn-trigger-delete)
    const delCadetBtn = target.closest('.btn-trigger-delete');
    if (delCadetBtn && delCadetBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openConfirmDeleteModal(delCadetBtn.dataset.id);
      return;
    }

    // 9. Mở Modal Phiếu điểm tích lũy (.btn-open-transcript)
    const transcriptBtn = target.closest('.btn-open-transcript');
    if (transcriptBtn && transcriptBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openTranscriptModal(transcriptBtn.dataset.id);
      return;
    }

    // 10. Mở Modal Cập nhật chứng chỉ ngoại ngữ (.btn-edit-lang)
    const editLangBtn = target.closest('.btn-edit-lang');
    if (editLangBtn && editLangBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openLangModal(editLangBtn.dataset.id);
      return;
    }
  });

  // Event Delegation cho sự kiện `change` trên các ô select/input trong bảng động
  document.addEventListener('change', function(e) {
    const target = e.target;
    if (!target || !target.classList) return;

    // 1. Đổi số tín chỉ trực tiếp trong bảng môn học (.input-subj-credits)
    if (target.classList.contains('input-subj-credits')) {
      const sId = target.dataset.id;
      const newCreds = parseInt(target.value, 10);
      if (isNaN(newCreds) || newCreds < 1 || newCreds > 15) {
        showToast('Số tín chỉ không hợp lệ (nhập từ 1 đến 15 tín chỉ)!', 'error');
        return;
      }
      const s = AppState.subjects.find(x => x.id === sId);
      if (s) {
        const oldCreds = s.credits;
        s.credits = newCreds;
        upsertSubjectToSupabase(s);
        logAuditTrail('', sId, `${oldCreds} TC`, `${newCreds} TC`, `Cập nhật số tín chỉ môn ${s.name}`);
        persistData();
        renderSubjectsSettings();
        updateAllViews();
      }
      return;
    }

    // 2. Đổi trình độ ngoại ngữ trực tiếp trên bảng (.select-lang-tab-level, .select-cumul-lang)
    if (target.classList.contains('select-lang-tab-level') || target.classList.contains('select-cumul-lang')) {
      if (target.dataset.id) {
        handleInlineCumulativeMetaChange(target.dataset.id, 'currentLangLevel', target.value);
      }
      return;
    }

    // 3. Đổi chuẩn CNTT trực tiếp trên bảng (.select-cumul-it)
    if (target.classList.contains('select-cumul-it')) {
      if (target.dataset.id) {
        handleInlineCumulativeMetaChange(target.dataset.id, 'itStandard', target.value);
      }
      return;
    }
  });

  // --- MODAL HỒ SƠ QUÂN NHÂN & 2 LỰA CHỌN NHẬP NGÀY SINH BỐ / MẸ ---
  document.querySelectorAll('.profile-subtab').forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', function() {
      switchProfileSubtab(this.dataset.subtab);
    });
  });

  safeOn('profFormFatherDobMode', 'change', function() {
    const inp = document.getElementById('profFormFatherBirthDate');
    if (inp) inp.placeholder = this.value === 'year' ? 'VD: 1975' : 'VD: 15/05/1975';
  });

  safeOn('profFormMotherDobMode', 'change', function() {
    const inp = document.getElementById('profFormMotherBirthDate');
    if (inp) inp.placeholder = this.value === 'year' ? 'VD: 1978' : 'VD: 20/10/1978';
  });

  safeOn('btnAddNewProfile', 'click', () => {
    openStudentProfileModal(null);
  });

  safeOn('formStudentProfile', 'submit', function(e) {
    e.preventDefault();
    const sid = document.getElementById('profFormId')?.value.trim() || '';
    const code = document.getElementById('profFormCode')?.value.trim().toUpperCase() || '';
    const name = document.getElementById('profFormName')?.value.trim() || '';
    const rank = document.getElementById('profFormRank')?.value || 'Hạ sĩ';
    const cls = getCurrentUserClassScope() || document.getElementById('profFormClass')?.value || 'OTQS1';
    const pos = (document.getElementById('profFormPosition')?.value || 'Học viên').trim() || 'Học viên';
    const dob = document.getElementById('profFormDob')?.value || '';
    const enlistment = document.getElementById('profFormEnlistment')?.value.trim() || '';
    const phone = document.getElementById('profFormPhone')?.value.trim() || '';
    const hometown = document.getElementById('profFormHometown')?.value.trim() || '';
    const permAddress = document.getElementById('profFormPermAddress')?.value.trim() || '';
    const currAddress = document.getElementById('profFormCurrAddress')?.value.trim() || '';

    const politicalStatus = document.getElementById('profFormPoliticalStatus')?.value || 'DOAN_VIEN';
    const partyJoinedDate = document.getElementById('profFormPartyJoinedDate')?.value || '';
    const officialPartyDate = document.getElementById('profFormOfficialPartyDate')?.value || '';

    const fatherName = document.getElementById('profFormFatherName')?.value.trim() || '';
    const fatherDobRaw = document.getElementById('profFormFatherBirthDate')?.value.trim() || '';
    const fatherHometown = document.getElementById('profFormFatherHometown')?.value.trim() || '';
    const fatherJob = document.getElementById('profFormFatherJob')?.value.trim() || '';

    const motherName = document.getElementById('profFormMotherName')?.value.trim() || '';
    const motherDobRaw = document.getElementById('profFormMotherBirthDate')?.value.trim() || '';
    const motherHometown = document.getElementById('profFormMotherHometown')?.value.trim() || '';
    const motherJob = document.getElementById('profFormMotherJob')?.value.trim() || '';

    const achievementsRaw = document.getElementById('profFormAchievements')?.value || '';
    const achievementsArr = normalizeAchievements(achievementsRaw);

    const fCheck = validateAndFormatParentDob(fatherDobRaw, 'Bố');
    if (!fCheck.valid) {
      showToast(fCheck.error, 'error');
      return;
    }

    const mCheck = validateAndFormatParentDob(motherDobRaw, 'Mẹ');
    if (!mCheck.valid) {
      showToast(mCheck.error, 'error');
      return;
    }

    if (sid) {
      const s = AppState.students.find(x => x.id === sid);
      if (!s) {
        showToast('Không tìm thấy dữ liệu quân nhân để cập nhật!', 'error');
        return;
      }

      if (AppState.role === 'student') {
        const currentCode = (AppState.currentUser?.code || '').toUpperCase().trim();
        const currentSid = AppState.currentUser?.studentId;
        if (sid !== currentSid && (!currentCode || s.code.toUpperCase() !== currentCode)) {
          showToast('Lỗi bảo mật: Bạn không có quyền chỉnh sửa hồ sơ của quân nhân khác!', 'error');
          return;
        }
      }

      s.name = name;
      s.rank = rank;
      if (AppState.role !== 'student') {
        s.code = code;
        s.class = cls;
      }
      s.position = pos;
      s.role = pos;
      s.dob = dob;
      s.enlistmentDate = enlistment;
      s.phone = phone;
      s.hometown = hometown;
      s.permanentAddress = permAddress;
      s.currentAddress = currAddress;
      s.politicalStatus = politicalStatus;
      s.party_joined_date = partyJoinedDate || null;
      s.official_party_date = officialPartyDate || null;
      s.father_name = fatherName;
      s.father_birth_date = fCheck.value;
      s.father_hometown = fatherHometown;
      s.father_job = fatherJob;
      s.mother_name = motherName;
      s.mother_birth_date = mCheck.value;
      s.mother_hometown = motherHometown;
      s.mother_job = motherJob;
      s.achievements = achievementsArr;

      upsertStudentToSupabase(s, AppState.languages[s.id]);
      logAuditTrail(s.id, '', '', '', 'Cập nhật hồ sơ quân nhân ' + name);
    } else {
      if (AppState.role === 'student') {
        showToast('Học viên không có quyền thêm mới quân nhân!', 'error');
        return;
      }
      if (AppState.students.some(x => x.code.toLowerCase() === code.toLowerCase())) {
        showToast('Mã học viên này đã tồn tại trong hệ thống!', 'error');
        return;
      }
      const newId = 'hv_' + Date.now();
      const newStudent = {
        id: newId,
        code,
        name,
        rank,
        class: cls,
        position: pos,
        role: pos,
        dob,
        enlistmentDate: enlistment,
        phone,
        hometown,
        permanentAddress: permAddress,
        currentAddress: currAddress,
        politicalStatus,
        party_joined_date: partyJoinedDate || null,
        official_party_date: officialPartyDate || null,
        father_name: fatherName,
        father_birth_date: fCheck.value,
        father_hometown: fatherHometown,
        father_job: fatherJob,
        mother_name: motherName,
        mother_birth_date: mCheck.value,
        mother_hometown: motherHometown,
        mother_job: motherJob,
        achievements: achievementsArr,
        currentLangLevel: 'A2',
        itStandard: 'Đạt chuẩn CNTT cơ bản'
      };
      AppState.students.push(newStudent);
      AppState.grades[newId] = {};
      AppState.languages[newId] = { lang: 'Tiếng Nga', currentLevel: 'A2', itStandard: 'Đạt chuẩn CNTT cơ bản', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT' };
      upsertStudentToSupabase(newStudent, AppState.languages[newId]);
      logAuditTrail(newId, '', '', '', 'Thêm mới quân nhân ' + name + ' (' + code + ')');
    }

    persistData();
    populateStudentPicker();
    updateAllViews();
    if (AppState.viewingDetailStudentId) {
      openCadetDetailPage(AppState.viewingDetailStudentId);
    }
    hideModal('modalStudentProfile');
  });

  // --- NHẬP NHANH QUÂN SỐ TỪ EXCEL ---
  const openQuickImportModal = () => {
    resetQuickImportModalState();
    showModal('modalQuickImportExcel');
  };

  safeOn('btnQuickImportExcel', 'click', openQuickImportModal);
  safeOn('btnImportProfileExcel', 'click', openQuickImportModal);
  safeOn('btnDownloadQuickTemplate', 'click', downloadQuickImportTemplate);

  const quickDropZone = document.getElementById('quickImportDropZone');
  const quickFileInput = document.getElementById('quickImportFileInput');
  if (quickDropZone && quickFileInput) {
    quickDropZone.addEventListener('click', () => quickFileInput.click());
  }
  if (quickFileInput) {
    quickFileInput.addEventListener('change', function() {
      if (this.files && this.files[0]) handleQuickImportFileUpload(this.files[0]);
    });
  }

  safeOn('btnExecuteQuickImport', 'click', executeQuickImport);

  safeOn('btnExecuteDeleteCadet', 'click', () => {
    const targetId = document.getElementById('deleteCadetTargetId')?.value;
    if (targetId) executeCascadeDeleteCadet(targetId);
  });

  ['btnClearAllStudentsSheet', 'btnClearAllStudentsProfiles', 'btnClearAllStudentsCumul', 'btnClearAllStudentsMaster'].forEach(btnId => {
    safeOn(btnId, 'click', () => {
      executeClearAllStudents();
    });
  });

  safeOn('btnStudentSelfEdit', 'click', () => {
    switchTab('tab-profiles');
    AppState.studentProfileEditMode = true;
    renderProfilesTable();
  });

  safeOn('btnJumpToClassSheet', 'click', () => {
    hideModal('modalStudentProfile');
    const sid = document.getElementById('profFormId')?.value;
    const student = AppState.students.find(s => s.id === sid);
    if (student) {
      AppState.currentSheetClass = student.class;
      const classSelect = document.getElementById('sheetClassSelect');
      if (classSelect) classSelect.value = student.class;
    }
    switchTab('tab-sheet');
  });

  safeOn('profFormPoliticalStatus', 'change', function() {
    updatePartyDatesDisplay(this.value);
  });

  safeOn('btnClearLog', 'click', () => {
    AppState.auditLogs = [];
    persistData();
    renderAuditLog();
  });

  // --- ĐỒNG BỘ ĐÁM MÂY FIREBASE FIRESTORE ---
  initCloudSyncConfig();

  const openCloudModal = () => {
    updateShareLinksInModal();
    showModal('modalCloudSync');
  };

  safeOn('btnOpenCloudModal', 'click', openCloudModal);
  safeOn('btnCloudStatus', 'click', openCloudModal);

  safeOn('btnSaveCloudConfig', 'click', () => {
    const unit = document.getElementById('cfgUnitRoomId')?.value.trim() || 'daidoi460';
    const url = document.getElementById('cfgFirebaseDbUrl')?.value.trim() || SUPABASE_URL;
    const key = document.getElementById('cfgFirebaseApiKey')?.value.trim() || SUPABASE_KEY;
    const prj = document.getElementById('cfgFirebaseProjectId')?.value.trim() || SUPABASE_PROJECT_REF;

    CloudSync.unitRoomId = unit;
    CloudSync.supabaseUrl = url;
    CloudSync.supabaseKey = key;
    CloudSync.supabaseProjectRef = prj;

    connectFirebaseRealtime();
    persistData(true);
    updateShareLinksInModal();
    hideModal('modalCloudSync');
  });

  safeOn('btnPushInitialData', 'click', () => {
    persistData();
  });
}

let _appInitialized = false;
function bootAppOnce() {
  if (_appInitialized || window._appInitialized) return;
  _appInitialized = true;
  window._appInitialized = true;
  initApp();
}

// Bọc toàn bộ xử lý sự kiện & khởi tạo trong DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  bootAppOnce();
});
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  bootAppOnce();
}
