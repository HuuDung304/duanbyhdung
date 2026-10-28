import { requestDestructiveConfirmation } from './components/destructive-confirm.js';
import { installOfficerReadOnlyGuard } from './access-controls.js';
import { calendarDate, politicalDates } from './profile-rules.js';

/**
 * MODULE: src/js/main.js
 * Kết nối các module (supabase.js, auth.js, students.js, grades.js),
 * Áp dụng triệt để Event Delegation toàn cục trên `document` (click, submit, change, input, keydown),
 * chống Crash khởi tạo (Try/Catch + Idempotency Guard), dọn dẹp CSS Overlay/Modal chặn click,
 * và cơ chế Chống Double Submit ("⏳ Đang xử lý...") hỗ trợ 70-80 người dùng thao tác đồng thời mượt mà.
 */

import {
  STORAGE_KEY,
  AUTH_STORAGE_KEY,
  CLOUD_CFG_STORAGE_KEY,
  DEFAULT_CLASSES,
  DEFAULT_SUBJECTS,
  LANGUAGE_LEVEL_OPTIONS,
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
  exportDashboardLanguageExcel,
  exportFailedStudentsExcel,
  downloadExcelTemplate,
  handleExcelFileUpload,
  executeExcelImport,
  renderCumulativeTable,
  openTranscriptModal,
  exportCumulativeExcel,
  handleInlineCumulativeMetaChange,
  getCurrentUserClassScope,
  getSubjectTargetClasses,
  expandCourseAbbreviation,
  getFullSubjectName,
  normalizeCourseText,
  buildDeterministicSubjectId,
  normalizeAchievements,
  normalizeDateVN,
  normalizeSubjectsCatalog,
  initCloudSyncConfig,
  updateShareLinksInModal,
  connectFirebaseRealtime,
  pushDataToCloud,
  isAnyEditFormActive,
  applyCloudSnapshotToState
} from './grades.js';

import {
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_PROJECT_REF,
  buildDeterministicStudentId,
  withButtonLock,
  loadAllDataFromSupabase,
  upsertStudentToSupabase,
  upsertSubjectToSupabase
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
  loadStudentsTable,
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
 * Dọn dẹp toàn bộ lớp phủ Modal phụ khi khởi động để đảm bảo không có phần tử ẩn nào chặn thao tác click chuột
 */
export function sanitizeModalOverlays() {
  const secondaryModalIds = [
    'modalCloudSync',
    'modalImportExcel',
    'modalAddCadet',
    'modalUpdateLang',
    'modalAddSubject',
    'modalQuickImportExcel',
    'modalConfirmDeleteCadet',
    'modalStudentProfile',
    'modalTranscriptDetail'
  ];

  secondaryModalIds.forEach(id => {
    const m = document.getElementById(id);
    if (m) {
      m.classList.add('hidden');
      m.classList.remove('flex', 'items-center', 'justify-center');
      m.style.setProperty('display', 'none', 'important');
      m.style.pointerEvents = 'none';
      m.style.visibility = 'hidden';
      m.style.opacity = '0';
      m.style.zIndex = '-1';
      m.setAttribute('aria-hidden', 'true');
    }
  });

  const toastBox = document.getElementById('toastContainer');
  if (toastBox) {
    toastBox.style.pointerEvents = 'none';
  }

  if (document.body) {
    document.body.classList.remove('overflow-hidden', 'modal-open', 'pointer-events-none');
    document.body.style.pointerEvents = 'auto';
    document.body.style.overflow = '';
  }
}

/**
 * Chuyển đổi qua lại giữa 2 tab trên Modal Đăng nhập (Admin/Cán bộ/Lớp <-> Học viên)
 */
export function switchLoginTab(mode = 'admin') {
  const tabAdmin = document.getElementById('tabBtnAdminLogin');
  const tabCadet = document.getElementById('tabBtnCadetLogin');
  const formAdmin = document.getElementById('formAdminLogin');
  const formCadet = document.getElementById('formCadetLogin');

  if (mode === 'cadet') {
    if (tabCadet) {
      tabCadet.className = 'py-2.5 px-3 rounded-lg bg-emerald-600 text-white font-black shadow-sm transition';
    }
    if (tabAdmin) {
      tabAdmin.className = 'py-2.5 px-3 rounded-lg text-slate-300 hover:text-white font-bold transition';
    }
    if (formCadet) {
      formCadet.classList.remove('hidden');
      formCadet.style.display = 'block';
    }
    if (formAdmin) {
      formAdmin.classList.add('hidden');
      formAdmin.style.display = 'none';
    }
    const err2 = document.getElementById('loginCadetError');
    if (err2) {
      err2.classList.add('hidden');
      err2.style.display = 'none';
    }
  } else {
    if (tabAdmin) {
      tabAdmin.className = 'py-2.5 px-3 rounded-lg bg-gold-500 text-slate-950 font-black shadow-sm transition';
    }
    if (tabCadet) {
      tabCadet.className = 'py-2.5 px-3 rounded-lg text-slate-300 hover:text-white font-bold transition';
    }
    if (formAdmin) {
      formAdmin.classList.remove('hidden');
      formAdmin.style.display = 'block';
    }
    if (formCadet) {
      formCadet.classList.add('hidden');
      formCadet.style.display = 'none';
    }
    const err1 = document.getElementById('loginAdminError');
    if (err1) {
      err1.classList.add('hidden');
      err1.style.display = 'none';
    }
  }
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
 * Đồng bộ hiển thị khung chọn lớp áp dụng trong Modal Thêm/Sửa Môn học
 */
export function syncModalAddSubjCategoryUI() {
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
}

/**
 * Mở Modal Thêm Môn học mới
 */
export function openCreateSubjectModal(defaultSem = '1', defaultCat = 'common') {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
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
}

/**
 * Mở Modal Chỉnh sửa Môn học (Hỗ trợ chỉnh sửa cả nhiều lớp áp dụng cho môn chuyên ngành)
 */
export function openEditSubjectModal(subjectId) {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
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

/**
 * Mở Modal Thêm Học viên mới
 */
export function openAddCadetModal() {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
  const modalEl = document.getElementById('modalAddCadet');
  const alreadyOpen = modalEl && !modalEl.classList.contains('hidden');
  const classScope = getCurrentUserClassScope();
  const clsSelect = document.getElementById('newCadetClass');
  if (clsSelect && classScope) {
    clsSelect.innerHTML = `<option value="${classScope}">Lớp ${classScope}</option>`;
    clsSelect.value = classScope;
    clsSelect.disabled = true;
  } else if (clsSelect) {
    clsSelect.disabled = false;
  }
  if (!alreadyOpen) {
    const codeEl = document.getElementById('newCadetCode');
    const nameEl = document.getElementById('newCadetName');
    const dobEl = document.getElementById('newCadetDob');
    if (codeEl) codeEl.value = '';
    if (nameEl) nameEl.value = '';
    if (dobEl) dobEl.value = '';
  }
  showModal('modalAddCadet');
}

/**
 * Xử lý Submit Form Thêm Học viên mới (#formAddCadet)
 */
async function submitAddCadetForm(formEl) {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
  const submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;
  await withButtonLock(submitBtn, '⏳ Đang xử lý...', async () => {
    const codeEl = document.getElementById('newCadetCode');
    const nameEl = document.getElementById('newCadetName');
    const rankEl = document.getElementById('newCadetRank');
    const clsEl = document.getElementById('newCadetClass');
    const dobEl = document.getElementById('newCadetDob');
    const roleEl = document.getElementById('newCadetRole');

    const code = codeEl ? codeEl.value.trim().toUpperCase() : '';
    const rawName = nameEl ? nameEl.value.trim() : '';
    const name = expandCourseAbbreviation(rawName, code);
    const rank = rankEl ? rankEl.value : 'Hạ sĩ';
    const cls = getCurrentUserClassScope() || (clsEl ? clsEl.value : 'OTQS1');
    let dob;
    try { dob = calendarDate(dobEl ? dobEl.value : ''); }
    catch (error) { showToast(error.message, 'error'); return; }
    const role = (roleEl && roleEl.value.trim()) ? roleEl.value.trim() : 'Học viên';

    if (!code || !name) {
      showToast('Vui lòng nhập đầy đủ Mã học viên và Họ tên!', 'error');
      return;
    }

    if (AppState.students.some(s => s.code.toLowerCase() === code.toLowerCase())) {
      showToast('Mã học viên này đã tồn tại trong hệ thống!', 'error');
      return;
    }

    const newId = buildDeterministicStudentId(code);
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
      currentLangLevel: 'Chưa đạt',

    };
    const defaultLang = {
      lang: 'Tiếng Nga',
      currentLevel: 'Chưa đạt',

      A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT'
    };

    const res = await upsertStudentToSupabase(newStudent, defaultLang);
    if (res && res.error) {
      showToast('Không thể thêm học viên: ' + (res.error.message || 'Vui lòng thử lại'), 'error');
      return;
    }

    if (!AppState.students.some(s => s.code.toUpperCase() === code)) {
      AppState.students.push(newStudent);
    }
    if (!AppState.grades[newStudent.id]) AppState.grades[newStudent.id] = {};
    AppState.languages[newStudent.id] = defaultLang;

    logAuditTrail(newStudent.id, '', '', '', `Thêm mới học viên ${name} (${code})`);
    hideModal('modalAddCadet');
    if (formEl && typeof formEl.reset === 'function') formEl.reset();
    populateStudentPicker();
    loadStudentsTable({ force: true });
    updateAllViews({ force: true });
    showToast(`Đã thêm mới học viên ${name} (${code}) lên Supabase!`, 'success');
  });
}

/**
 * Xử lý Submit Form Cập nhật Chứng chỉ Ngoại ngữ (#formUpdateLang)
 */
async function submitUpdateLangForm(formEl) {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
  const submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;
  await withButtonLock(submitBtn, '⏳ Đang xử lý...', async () => {
    const sid = document.getElementById('langStudentId')?.value;
    if (!sid) return;
    const selectedStudent = AppState.students.find(student => student.id === sid);
    const scope = getCurrentUserClassScope();
    if (!selectedStudent || AppState.role === 'student' || (scope && selectedStudent.class !== scope)) { showToast('Bạn không được sửa chứng chỉ của học viên này.', 'error'); return; }
    const level = document.getElementById('langActualLevel')?.value || 'Chưa đạt';
    if (!LANGUAGE_LEVEL_OPTIONS.includes(level)) return;
    const lang = document.getElementById('langChoice')?.value || 'Tiếng Nga';
    const A1 = document.getElementById('langLevelA1')?.value || 'Đ';
    const A21 = document.getElementById('langLevelA21')?.value || 'Đ';
    const A22 = document.getElementById('langLevelA22')?.value || 'Đ';
    const B11 = document.getElementById('langLevelB11')?.value || 'CT';
    const B12 = document.getElementById('langLevelB12')?.value || 'CT';
    const extraCert = document.getElementById('langExtraCert')?.value || '';

    const prev = AppState.languages[sid] || {};
    const previousLevel = selectedStudent.currentLangLevel;
    selectedStudent.currentLangLevel = level;
    AppState.languages[sid] = { ...prev, lang, currentLevel: level, A1, A21, A22, B11, B12, extraCert };
    const saved = await upsertStudentToSupabase(selectedStudent, AppState.languages[sid]);
    if (saved?.error) { selectedStudent.currentLangLevel = previousLevel; AppState.languages[sid] = prev; showToast(saved.error.message || 'Không lưu được chứng chỉ.', 'error'); return; }
    logAuditTrail(sid, '', 'Ngoại ngữ', `${lang}: B1.1 ${B11}, B1.2 ${B12}`, 'Cập nhật chứng chỉ ngoại ngữ');
    hideModal('modalUpdateLang');
    updateAllViews({ force: true });
    showToast('Đã lưu chứng chỉ ngoại ngữ lên Supabase!', 'success');
  });
}

/**
 * Xử lý Submit Form Thêm / Sửa Môn học (#formAddSubject)
 */
async function submitAddSubjectForm(formEl) {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
  const submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;
  await withButtonLock(submitBtn, '⏳ Đang xử lý...', async () => {
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

        await upsertSubjectToSupabase(existingSubj);
        logAuditTrail('', existingSubj.id, 'Cập nhật môn', `${name} (${code}) - ${category === 'specialized' ? 'Chuyên ngành ' + targetClass : 'Môn chung'}`, `HK${semester}`);
      }
    } else {
      // Kiểm tra trùng theo Khóa Kết Hợp (course_name + class_code + semester)
      const normNewName = normalizeCourseText(name);
      const existingCompositeMatch = AppState.subjects.find(s => {
        if (Number(s.semester) !== semester || s.category !== category) return false;
        const sameNameOrCode = normalizeCourseText(s.name) === normNewName || s.code.toUpperCase() === code;
        if (!sameNameOrCode) return false;
        if (category === 'common') return true;
        const existingClasses = getSubjectTargetClasses(s);
        const hasClassOverlap = targetClasses.some(c => existingClasses.includes(c));
        return hasClassOverlap || (normalizeCourseText(s.name) === normNewName && Number(s.credits) === credits && s.code.toUpperCase() === code);
      });

      if (existingCompositeMatch) {
        if (category === 'common') {
          showToast(`Môn học chung "${name}" (${code}) đã tồn tại trong Học kỳ ${semester}!`, 'error');
          return;
        }
        const merged = Array.from(new Set([...getSubjectTargetClasses(existingCompositeMatch), ...targetClasses]));
        existingCompositeMatch.name = name;
        existingCompositeMatch.credits = credits;
        existingCompositeMatch.targetClasses = merged;
        existingCompositeMatch.targetClass = merged.join(', ');
        await upsertSubjectToSupabase(existingCompositeMatch);
        logAuditTrail('', existingCompositeMatch.id, 'Cập nhật môn CN', `${name} (${code}) -> Lớp ${existingCompositeMatch.targetClass}`, `HK${semester}`);
      } else {
        const newSubId = buildDeterministicSubjectId({
          code,
          name,
          category,
          targetClasses: category === 'specialized' ? targetClasses : [],
          semester
        });
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
        await upsertSubjectToSupabase(newSubjectObj);
        logAuditTrail('', newSubId, 'Thêm môn', `${name} (${code}) - ${category === 'specialized' ? 'Chuyên ngành ' + targetClass : 'Môn chung'}`, `HK${semester}`);
      }
    }

    const targetYear = Math.ceil(semester / 2);
    AppState.settingsSelectedYear = targetYear;

    hideModal('modalAddSubject');
    updateAllViews({ force: true });
    showToast(`Đã lưu môn học ${name} (${code}) lên Supabase!`, 'success');
  });
}

/**
 * Xử lý Submit Form Hồ sơ Quân nhân (#formStudentProfile)
 */
async function submitStudentProfileForm(formEl) {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
  const submitBtn = formEl ? formEl.querySelector('button[type="submit"]') : null;
  await withButtonLock(submitBtn, '⏳ Đang xử lý...', async () => {
    const sid = document.getElementById('profFormId')?.value.trim() || '';
    const code = document.getElementById('profFormCode')?.value.trim().toUpperCase() || '';
    const name = document.getElementById('profFormName')?.value.trim() || '';
    const rank = document.getElementById('profFormRank')?.value || 'Hạ sĩ';
    const cls = getCurrentUserClassScope() || document.getElementById('profFormClass')?.value || 'OTQS1';
    const pos = (document.getElementById('profFormPosition')?.value || 'Học viên').trim() || 'Học viên';
    let dob;
    try { dob = calendarDate(document.getElementById('profFormDob')?.value); }
    catch (error) { showToast(error.message, 'error'); return; }
    const enlistment = document.getElementById('profFormEnlistment')?.value.trim() || '';
    const phone = document.getElementById('profFormPhone')?.value.trim() || '';
    const hometown = document.getElementById('profFormHometown')?.value.trim() || '';
    const permAddress = document.getElementById('profFormPermAddress')?.value.trim() || '';
    const currAddress = document.getElementById('profFormCurrAddress')?.value.trim() || '';

    let politics;
    try { politics = politicalDates(document.getElementById('profFormPoliticalStatus')?.value, document.getElementById('profFormPartyJoinedDate')?.value, document.getElementById('profFormOfficialPartyDate')?.value); }
    catch (error) { showToast(error.message, 'error'); return; }
    const { politicalStatus, party_joined_date: partyJoinedDate, official_party_date: officialPartyDate } = politics;

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

      const res = await upsertStudentToSupabase(s, AppState.languages[s.id]);
      if (res && res.error) {
        showToast('Có lỗi khi cập nhật hồ sơ: ' + (res.error.message || 'Vui lòng thử lại'), 'error');
        return;
      }
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
      const newId = buildDeterministicStudentId(code);
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
        currentLangLevel: 'Chưa đạt',

      };
      const defaultLang = {
        lang: 'Tiếng Nga',
        currentLevel: 'Chưa đạt',

        A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT'
      };
      const res = await upsertStudentToSupabase(newStudent, defaultLang);
      if (res && res.error) {
        showToast('Không thể thêm mới quân nhân: ' + (res.error.message || 'Vui lòng thử lại'), 'error');
        return;
      }
      if (!AppState.students.some(x => x.code.toUpperCase() === code)) {
        AppState.students.push(newStudent);
      }
      if (!AppState.grades[newStudent.id]) AppState.grades[newStudent.id] = {};
      AppState.languages[newStudent.id] = defaultLang;
      logAuditTrail(newStudent.id, '', '', '', 'Thêm mới quân nhân ' + name + ' (' + code + ')');
    }

    // Chỉ mở khóa trạng thái Cô lập Form Chỉnh Sửa (Isolate Edit State) và làm mới bảng SAU KHI đã Lưu lên Supabase thành công
    AppState.isEditingForm = false;
    AppState.editingModalId = null;
    AppState.editingStudentId = null;
    AppState.editingFormHydratedKey = null;
    hideModal('modalStudentProfile');

    if (AppState.hasPendingCloudRefresh) {
      AppState.hasPendingCloudRefresh = false;
      try {
        const fresh = await loadAllDataFromSupabase(CloudSync.unitRoomId || 'daidoi460');
        if (fresh && typeof fresh === 'object') {
          const savedRecord = AppState.students.find(x => (sid && x.id === sid) || x.code.toUpperCase() === code);
          applyCloudSnapshotToState(fresh);
          if (savedRecord) {
            const idx = AppState.students.findIndex(x => x.id === savedRecord.id || x.code.toUpperCase() === savedRecord.code.toUpperCase());
            if (idx !== -1) AppState.students[idx] = { ...AppState.students[idx], ...savedRecord };
            else AppState.students.push(savedRecord);
          }
        }
      } catch (err) {
        console.warn('Post-save cloud refresh warning:', err);
      }
    }

    populateStudentPicker();
    loadStudentsTable({ force: true });
    updateAllViews({ force: true });
    if (AppState.viewingDetailStudentId) {
      openCadetDetailPage(AppState.viewingDetailStudentId);
    }
    showToast(`Đã lưu hồ sơ quân nhân ${name} (${code}) lên Supabase!`, 'success');
  });
}

/**
 * Mở Modal Nhập nhanh Quân số từ Excel
 */
function openQuickImportModal() {
  resetQuickImportModalState();
  showModal('modalQuickImportExcel');
}

/**
 * Mở Modal Cấu hình Đồng bộ Đám mây Supabase
 */
function openCloudModal() {
  updateShareLinksInModal();
  showModal('modalCloudSync');
}

/**
 * Đăng ký toàn bộ Event Delegation (click, submit, change, input, keydown) trên `document`.
 * Chỉ đăng ký đúng 1 lần duy nhất và hoạt động bất chấp DOM được render lại.
 */
let _delegationRegistered = false;
function registerGlobalEventDelegation() {
  if (_delegationRegistered) return;
  _delegationRegistered = true;
  window.__dd460DelegationRegistered = true;

  if (window.__dd460ClickHandler) document.removeEventListener('click', window.__dd460ClickHandler);
  if (window.__dd460SubmitHandler) document.removeEventListener('submit', window.__dd460SubmitHandler);
  if (window.__dd460ChangeHandler) document.removeEventListener('change', window.__dd460ChangeHandler);
  if (window.__dd460InputHandler) document.removeEventListener('input', window.__dd460InputHandler);
  if (window.__dd460KeydownHandler) document.removeEventListener('keydown', window.__dd460KeydownHandler);

  // ==========================================================================
  // 1. EVENT DELEGATION CHO SỰ KIỆN CLICK TRÊN TOÀN BỘ DOCUMENT
  // ==========================================================================
  window.__dd460ClickHandler = async function(e) {
    const target = e.target;
    if (!target || typeof target.closest !== 'function') return;

    // --- A. ĐĂNG NHẬP, CHUYỂN TAB ĐĂNG NHẬP, ĐỔI TÀI KHOẢN & ĐĂNG XUẤT ---
    const btnAdminLogin = target.closest('#btnSubmitAdminLogin');
    if (btnAdminLogin) {
      e.preventDefault();
      e.stopPropagation();
      await handleMockLogin(e);
      return;
    }

    const btnCadetLogin = target.closest('#btnSubmitCadetLogin');
    if (btnCadetLogin) {
      e.preventDefault();
      e.stopPropagation();
      await handleCadetSubmit(e);
      return;
    }

    const tabAdmin = target.closest('#tabBtnAdminLogin');
    if (tabAdmin) {
      e.preventDefault();
      switchLoginTab('admin');
      return;
    }

    const tabCadet = target.closest('#tabBtnCadetLogin');
    if (tabCadet) {
      e.preventDefault();
      switchLoginTab('cadet');
      return;
    }

    const openLoginBtn = target.closest('#btnOpenLoginModal, #btnCornerSwitchRole');
    if (openLoginBtn) {
      e.preventDefault();
      openLoginModal(false);
      return;
    }

    const logoutBtn = target.closest('#btnLogout, #btnCornerLogout');
    if (logoutBtn) {
      e.preventDefault();
      handleLogout();
      return;
    }

    // --- B. ĐÓNG MODAL (.modal-close) ---
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

    // --- C. CHUYỂN ĐỔI TAB ĐIỀU HƯỚNG CHÍNH (.nav-tab) & SUBTAB HỒ SƠ (.profile-subtab) ---
    const navTabBtn = target.closest('.nav-tab');
    if (navTabBtn && navTabBtn.dataset.tab) {
      e.preventDefault();
      switchTab(navTabBtn.dataset.tab);
      return;
    }

    const profileSubtabBtn = target.closest('.profile-subtab');
    if (profileSubtabBtn && profileSubtabBtn.dataset.subtab) {
      e.preventDefault();
      switchProfileSubtab(profileSubtabBtn.dataset.subtab);
      return;
    }

    // --- D. CHẾ ĐỘ THANG ĐIỂM 10 / 4 & KHÓA SỔ ĐIỂM ---
    if (target.closest('#btnSheetScale10')) {
      e.preventDefault();
      setSheetScaleMode('10');
      return;
    }

    if (target.closest('#btnSheetScale4')) {
      e.preventDefault();
      setSheetScaleMode('4');
      return;
    }

    if (target.closest('#btnToggleLock')) {
      e.preventDefault();
      toggleCurrentSheetLock();
      return;
    }

    // --- E. THÊM / SỬA / XÓA MÔN HỌC & CẤU HÌNH CHƯƠNG TRÌNH ĐÀO TẠO ---
    if (target.closest('#btnAddSubjectBtn')) {
      e.preventDefault();
      const curYear = AppState.settingsSelectedYear || 1;
      openCreateSubjectModal(String(2 * curYear - 1), getCurrentUserClassScope() ? 'specialized' : 'common');
      return;
    }

    if (target.closest('#btnAddSubjectFromSheetBtn')) {
      e.preventDefault();
      const curYear = parseInt(AppState.currentSheetSemester, 10) || 1;
      openCreateSubjectModal(String(2 * curYear - 1), getCurrentUserClassScope() ? 'specialized' : 'common');
      return;
    }

    const addSemBtn = target.closest('.btn-add-to-sem');
    if (addSemBtn) {
      e.preventDefault();
      const targetSem = addSemBtn.dataset.sem || '1';
      const targetCat = addSemBtn.dataset.cat || 'common';
      openCreateSubjectModal(targetSem, targetCat);
      return;
    }

    const editSubjBtn = target.closest('.btn-edit-subj');
    if (editSubjBtn && editSubjBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openEditSubjectModal(editSubjBtn.dataset.id);
      return;
    }

    const delSubjBtn = target.closest('.btn-del-subj');
    if (delSubjBtn && delSubjBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      deleteSubject(delSubjBtn.dataset.id, delSubjBtn);
      return;
    }

    const clearSemSubjBtn = target.closest('.btn-clear-sem-subjects');
    if (clearSemSubjBtn && clearSemSubjBtn.dataset.sem) {
      e.preventDefault();
      e.stopPropagation();
      deleteAllSubjectsInSemester(Number(clearSemSubjBtn.dataset.sem), clearSemSubjBtn);
      return;
    }

    const clearAllSubjBtn = target.closest('.btn-clear-all-subjects, #btnResetDefaultCurriculum, #btnClearAllSubjectsBtn');
    if (clearAllSubjBtn) {
      e.preventDefault();
      e.stopPropagation();
      deleteAllSubjectsAllSemesters(clearAllSubjBtn);
      return;
    }

    const yearTabBtn = target.closest('.btn-setting-year-tab');
    if (yearTabBtn && yearTabBtn.dataset.year) {
      e.preventDefault();
      AppState.settingsSelectedYear = Number(yearTabBtn.dataset.year);
      renderSubjectsSettings();
      return;
    }

    if (target.closest('#btnSelectAllTargetClasses')) {
      e.preventDefault();
      if (!getCurrentUserClassScope()) {
        setSelectedTargetClassesInModal([...DEFAULT_CLASSES]);
      }
      return;
    }

    if (target.closest('#btnClearAllTargetClasses')) {
      e.preventDefault();
      if (!getCurrentUserClassScope()) {
        document.querySelectorAll('.subj-target-class-cb').forEach(cb => { cb.checked = false; });
      }
      return;
    }

    // --- F. THÊM / SỬA / XÓA HỌC VIÊN & HỒ SƠ QUÂN NHÂN ---
    if (target.closest('#btnAddCadetModalBtn, #btnAddCadetCumulBtn, #btnAddCadetMasterBtn')) {
      e.preventDefault();
      openAddCadetModal();
      return;
    }

    if (target.closest('#btnAddNewProfile')) {
      e.preventDefault();
      openStudentProfileModal(null);
      return;
    }

    const editProfBtn = target.closest('.btn-open-profile');
    if (editProfBtn && editProfBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openStudentProfileModal(editProfBtn.dataset.id);
      return;
    }

    const detailBtn = target.closest('.btn-view-cadet-detail, .btn-sheet-profile, .btn-master-profile');
    if (detailBtn && detailBtn.dataset.id) {
      e.preventDefault();
      openCadetDetailPage(detailBtn.dataset.id);
      return;
    }

    const delCadetBtn = target.closest('.btn-trigger-delete');
    if (delCadetBtn && delCadetBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openConfirmDeleteModal(delCadetBtn.dataset.id);
      return;
    }

    const execDelBtn = target.closest('#btnExecuteDeleteCadet');
    if (execDelBtn) {
      e.preventDefault();
      const targetId = document.getElementById('deleteCadetTargetId')?.value;
      if (targetId) executeCascadeDeleteCadet(targetId, execDelBtn);
      return;
    }

    const clearAllStuBtn = target.closest('.btn-clear-all-students, #btnClearAllStudentsSheet, #btnClearAllStudentsProfiles, #btnClearAllStudentsCumul, #btnClearAllStudentsMaster');
    if (clearAllStuBtn) {
      e.preventDefault();
      e.stopPropagation();
      executeClearAllStudents(clearAllStuBtn);
      return;
    }

    const transcriptBtn = target.closest('.btn-open-transcript');
    if (transcriptBtn && transcriptBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openTranscriptModal(transcriptBtn.dataset.id);
      return;
    }

    if (target.closest('#btnStudentSelfEdit')) {
      e.preventDefault();
      AppState.studentProfileEditMode = true;
      AppState.isEditingForm = true;
      switchTab('tab-profiles');
      renderProfilesTable({ force: true });
      return;
    }

    if (target.closest('#btnJumpToClassSheet')) {
      e.preventDefault();
      hideModal('modalStudentProfile');
      const sid = document.getElementById('profFormId')?.value;
      const student = AppState.students.find(s => s.id === sid);
      if (student) {
        AppState.currentSheetClass = student.class;
        const classSelect = document.getElementById('sheetClassSelect');
        if (classSelect) classSelect.value = student.class;
      }
      switchTab('tab-sheet');
      return;
    }

    // --- G. CHỨNG CHỈ NGOẠI NGỮ ---
    if (target.closest('#btnAddLangCertBtn')) {
      e.preventDefault();
      openLangModal(null);
      return;
    }

    const editLangBtn = target.closest('.btn-edit-lang');
    if (editLangBtn && editLangBtn.dataset.id) {
      e.preventDefault();
      e.stopPropagation();
      openLangModal(editLangBtn.dataset.id);
      return;
    }

    // --- H. XUẤT / NHẬP EXCEL ---
    if (target.closest('#btnExportClassExcel')) {
      e.preventDefault();
      exportClassExcel();
      return;
    }

    if (target.closest('#btnExportMasterExcel')) {
      e.preventDefault();
      exportMasterExcel();
      return;
    }

    if (target.closest('#btnExportLanguageSummary')) { e.preventDefault(); exportDashboardLanguageExcel(); return; }
    if (target.closest('#btnExportFailedStudents')) { e.preventDefault(); exportFailedStudentsExcel(); return; }

    if (target.closest('#btnExportLangExcel')) {
      e.preventDefault();
      exportLanguageExcel();
      return;
    }

    if (target.closest('#btnExportProfileExcel')) {
      e.preventDefault();
      exportStudentProfiles();
      return;
    }

    if (target.closest('#btnExportCumulativeExcel')) {
      e.preventDefault();
      exportCumulativeExcel();
      return;
    }

    if (target.closest('#btnExportReportExcel')) {
      e.preventDefault();
      exportReportExcel();
      return;
    }

    if (target.closest('#btnDownloadTemplate')) {
      e.preventDefault();
      downloadExcelTemplate();
      return;
    }

    if (target.closest('#btnImportExcel')) {
      e.preventDefault();
      if (AppState.role !== 'student') {
        showModal('modalImportExcel');
      }
      return;
    }

    if (target.closest('#dropZone')) {
      const excelFileInput = document.getElementById('excelFileInput');
      if (excelFileInput && target !== excelFileInput) {
        excelFileInput.click();
      }
      return;
    }

    if (target.closest('#btnConfirmImport')) {
      e.preventDefault();
      executeExcelImport();
      return;
    }

    if (target.closest('#btnQuickImportExcel, #btnImportProfileExcel')) {
      e.preventDefault();
      openQuickImportModal();
      return;
    }

    if (target.closest('#btnDownloadQuickTemplate')) {
      e.preventDefault();
      downloadQuickImportTemplate();
      return;
    }

    if (target.closest('#quickImportDropZone')) {
      const quickFileInput = document.getElementById('quickImportFileInput');
      if (quickFileInput && target !== quickFileInput) {
        quickFileInput.click();
      }
      return;
    }

    if (target.closest('#btnExecuteQuickImport')) {
      e.preventDefault();
      executeQuickImport();
      return;
    }

    // --- I. NHẬT KÝ HỆ THỐNG & ĐỒNG BỘ SUPABASE CLOUD ---
    const clearLogBtn = target.closest('#btnClearLog');
    if (clearLogBtn) {
      e.preventDefault();
      if (AppState.role !== 'admin') return;
      if (!(await requestDestructiveConfirmation({ title: 'Xóa toàn bộ nhật ký?', message: 'Các hoạt động đã ghi nhận sẽ bị xóa khỏi nhật ký hệ thống.', phrase: 'XÓA NHẬT KÝ' })) || AppState.role !== 'admin') return;
      await withButtonLock(clearLogBtn, '⏳ Đang xử lý...', async () => {
        const previousLogs = AppState.auditLogs;
        AppState.auditLogs = [];
        try { await persistData(true); } catch (error) { AppState.auditLogs = previousLogs; throw error; }
        renderAuditLog();
      });
      return;
    }

    if (target.closest('#btnOpenCloudModal, #btnCloudStatus')) {
      e.preventDefault();
      openCloudModal();
      return;
    }

    const saveCloudBtn = target.closest('#btnSaveCloudConfig');
    if (saveCloudBtn) {
      e.preventDefault();
      await withButtonLock(saveCloudBtn, '⏳ Đang xử lý...', async () => {
        const unit = document.getElementById('cfgUnitRoomId')?.value.trim() || 'daidoi460';
        const url = document.getElementById('cfgFirebaseDbUrl')?.value.trim() || SUPABASE_URL;
        const key = document.getElementById('cfgFirebaseApiKey')?.value.trim() || SUPABASE_KEY;
        const prj = document.getElementById('cfgFirebaseProjectId')?.value.trim() || SUPABASE_PROJECT_REF;

        CloudSync.unitRoomId = unit;
        CloudSync.supabaseUrl = url;
        CloudSync.supabaseKey = key;
        CloudSync.supabaseProjectRef = prj;

        connectFirebaseRealtime();
        await persistData(true);
        updateShareLinksInModal();
        hideModal('modalCloudSync');
        showToast('Đã lưu cấu hình kết nối Supabase!', 'success');
      });
      return;
    }

    const pushInitBtn = target.closest('#btnPushInitialData');
    if (pushInitBtn) {
      e.preventDefault();
      await withButtonLock(pushInitBtn, '⏳ Đang xử lý...', async () => {
        await persistData(true);
        showToast('Đã đồng bộ cấu hình đơn vị lên Supabase!', 'success');
      });
      return;
    }
  };

  document.addEventListener('click', window.__dd460ClickHandler);

  // ==========================================================================
  // 2. EVENT DELEGATION CHO SỰ KIỆN SUBMIT FORM TRÊN TOÀN BỘ DOCUMENT
  // ==========================================================================
  window.__dd460SubmitHandler = async function(e) {
    const form = e.target;
    if (!form || !form.id) return;

    // Luôn chặn hành vi reload trang mặc định của trình duyệt
    e.preventDefault();
    e.stopPropagation();

    if (form.id === 'formAdminLogin') {
      await handleMockLogin(e);
      return;
    }

    if (form.id === 'formCadetLogin') {
      await handleCadetSubmit(e);
      return;
    }

    if (form.id === 'formAddCadet') {
      await submitAddCadetForm(form);
      return;
    }

    if (form.id === 'formUpdateLang') {
      await submitUpdateLangForm(form);
      return;
    }

    if (form.id === 'formAddSubject') {
      await submitAddSubjectForm(form);
      return;
    }

    if (form.id === 'formStudentProfile') {
      await submitStudentProfileForm(form);
      return;
    }
  };

  document.addEventListener('submit', window.__dd460SubmitHandler);

  // ==========================================================================
  // 3. EVENT DELEGATION CHO SỰ KIỆN CHANGE TRÊN TOÀN BỘ DOCUMENT
  // ==========================================================================
  window.__dd460ChangeHandler = async function(e) {
    const target = e.target;
    if (!target) return;
    const id = target.id || '';

    // 3.1 Các ô chọn bộ lọc & cấu hình theo ID
    if (id === 'roleSelector') {
      handleRoleChange(target.value);
      return;
    }

    if (id === 'sheetClassSelect') {
      const classScope = getCurrentUserClassScope();
      if (classScope && target.value !== classScope) {
        target.value = classScope;
        return;
      }
      AppState.currentSheetClass = target.value;
      renderSpreadsheet();
      return;
    }

    if (id === 'sheetSemesterSelect') {
      AppState.currentSheetSemester = target.value;
      renderSpreadsheet();
      return;
    }

    if (id === 'studentSelfLangLevelSelect') {
      if (AppState.role === 'student') return;
      const sid = AppState.studentViewingId;
      if (sid) await handleInlineCumulativeMetaChange(sid, 'currentLangLevel', target.value, target);
      return;
    }



    if (id === 'langFilterClass') {
      renderLanguages();
      return;
    }

    if (id === 'masterFilterClass') {
      AppState.masterFilters.class = target.value;
      renderMasterTable();
      return;
    }

    if (id === 'masterFilterSemester') {
      AppState.masterFilters.semester = target.value;
      renderMasterTable();
      return;
    }

    if (id === 'masterFilterRank') {
      AppState.masterFilters.rank = target.value;
      renderMasterTable();
      return;
    }

    if (id === 'masterFilterDebt') {
      AppState.masterFilters.debt = target.value;
      renderMasterTable();
      return;
    }

    if (['cumulFilterClass', 'cumulFilterYear', 'cumulFilterRank', 'cumulFilterDebt'].includes(id)) {
      renderCumulativeTable();
      return;
    }

    if (['profileFilterClass', 'profileFilterPosition', 'profileFilterPolitical'].includes(id)) {
      renderProfilesTable();
      return;
    }

    if (id === 'reportDebtFilterClass') {
      renderDebtCadetsSection();
      return;
    }

    if (id === 'dashboardTimeframeMode') {
      if (!AppState.dashboardFilters) AppState.dashboardFilters = { mode: 'course', semester: 1, year: 1, class: 'all' };
      AppState.dashboardFilters.mode = target.value;
      renderDashboard();
      return;
    }

    if (id === 'dashboardSemesterSelect') {
      if (!AppState.dashboardFilters) AppState.dashboardFilters = { mode: 'course', semester: 1, year: 1, class: 'all' };
      AppState.dashboardFilters.semester = parseInt(target.value, 10) || 1;
      renderDashboard();
      return;
    }

    if (id === 'dashboardYearSelect') {
      if (!AppState.dashboardFilters) AppState.dashboardFilters = { mode: 'course', semester: 1, year: 1, class: 'all' };
      AppState.dashboardFilters.year = parseInt(target.value, 10) || 1;
      renderDashboard();
      return;
    }

    if (id === 'dashboardClassFilter') {
      if (!AppState.dashboardFilters) AppState.dashboardFilters = { mode: 'course', semester: 1, year: 1, class: 'all' };
      const classScope = getCurrentUserClassScope();
      AppState.dashboardFilters.class = classScope || target.value || 'all';
      const debtSelect = document.getElementById('reportDebtFilterClass');
      if (debtSelect && !classScope) {
        debtSelect.value = AppState.dashboardFilters.class;
      }
      renderDashboard();
      return;
    }

    if (id === 'excelFileInput') {
      if (target.files && target.files.length > 0) {
        handleExcelFileUpload(target.files[0]);
      }
      return;
    }

    if (id === 'quickImportFileInput') {
      if (target.files && target.files[0]) {
        handleQuickImportFileUpload(target.files[0]);
      }
      return;
    }

    if (id === 'newSubjCategory') {
      syncModalAddSubjCategoryUI();
      return;
    }





    if (
      (target.dataset && target.dataset.vnDateInput === 'true') ||
      ['profFormDob', 'newCadetDob', 'inlineProfDob', 'profFormPartyJoinedDate', 'profFormOfficialPartyDate', 'inlineProfPartyJoined', 'inlineProfPartyOfficial'].includes(id)
    ) {
      const raw = target.value;
      if (raw && String(raw).trim() !== '') {
        target.value = normalizeDateVN(raw, String(raw).trim());
      }
      return;
    }

    if (id === 'profFormPoliticalStatus') {
      updatePartyDatesDisplay(target.value);
      return;
    }

    // 3.2 Các ô select/input động theo classList
    if (!target.classList) return;

    if (target.classList.contains('required-lang-standard-select')) {
      if (!canUserConfigureLangStandard()) {
        showToast('Chỉ Admin mới được cấu hình chuẩn ngoại ngữ.', 'error');
        target.value = AppState.requiredLangStandard || 'A2';
        return;
      }
      AppState.requiredLangStandard = target.value;
      document.querySelectorAll('.required-lang-standard-select').forEach(s => { s.value = AppState.requiredLangStandard; });
      document.querySelectorAll('.required-lang-standard-badge').forEach(b => { b.textContent = AppState.requiredLangStandard; });
      persistData(true);
      updateAllViews();
      return;
    }

    if (target.classList.contains('input-subj-credits')) {
      const sId = target.dataset.id;
      const newCreds = parseInt(target.value, 10);
      if (isNaN(newCreds) || newCreds < 1 || newCreds > 15) {
        showToast('Số tín chỉ không hợp lệ (nhập từ 1 đến 15 tín chỉ)!', 'error');
        return;
      }
      const s = AppState.subjects.find(x => x.id === sId);
      if (s) {
        target.disabled = true;
        try {
          const oldCreds = s.credits;
          s.credits = newCreds;
          await upsertSubjectToSupabase(s);
          logAuditTrail('', sId, `${oldCreds} TC`, `${newCreds} TC`, `Cập nhật số tín chỉ môn ${s.name}`);
          renderSubjectsSettings();
          updateAllViews();
        } finally {
          target.disabled = false;
        }
      }
      return;
    }

    if (target.classList.contains('select-lang-tab-level') || target.classList.contains('select-cumul-lang')) {
      if (target.dataset.id) {
        await handleInlineCumulativeMetaChange(target.dataset.id, 'currentLangLevel', target.value, target);
      }
      return;
    }


  };

  document.addEventListener('change', window.__dd460ChangeHandler);

  // ==========================================================================
  // 4. EVENT DELEGATION CHO SỰ KIỆN INPUT (TÌM KIẾM TỨC THỜI)
  // ==========================================================================
  window.__dd460InputHandler = function(e) {
    const target = e.target;
    if (!target || !target.id) return;

    if (target.id === 'masterSearch') {
      AppState.masterFilters.search = target.value;
      renderMasterTable();
      return;
    }

    if (target.id === 'cumulSearchInput') {
      renderCumulativeTable();
      return;
    }

    if (target.id === 'profileSearchInput') {
      renderProfilesTable();
      return;
    }
  };

  document.addEventListener('input', window.__dd460InputHandler);

  // ==========================================================================
  // 5. EVENT DELEGATION CHO PHÍM ENTER TẠI FORM ĐĂNG NHẬP
  // ==========================================================================
  window.__dd460KeydownHandler = function(e) {
    if (e.key !== 'Enter') return;
    const target = e.target;
    if (!target || !target.id) return;

    if (target.id === 'loginAdminUser' || target.id === 'loginAdminPass') {
      e.preventDefault();
      e.stopPropagation();
      handleMockLogin(e);
      return;
    }

    if (target.id === 'loginCadetCode') {
      e.preventDefault();
      e.stopPropagation();
      handleCadetSubmit(e);
      return;
    }
  };
  document.addEventListener('keydown', window.__dd460KeydownHandler);
}

let _localAppInitialized = false;

export function initApp() {
  installOfficerReadOnlyGuard(() => AppState.role, showToast);
  // Chốt chặn Idempotent trong cùng một lần tải script
  if (_localAppInitialized) return;
  _localAppInitialized = true;
  window.__dd460AppInitialized = true;

  // 1. Dọn dẹp ngay mọi Modal phụ / Overlay ẩn có nguy cơ chặn click chuột
  try {
    sanitizeModalOverlays();
  } catch (err) {
    console.warn('sanitizeModalOverlays warning:', err);
  }

  // 2. Đăng ký các hook liên kết giữa các module và biến toàn cục trên window
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
  window.switchLoginTab = switchLoginTab;
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
  window.openCreateSubjectModal = openCreateSubjectModal;
  window.openAddCadetModal = openAddCadetModal;
  window.loadStudentsTable = loadStudentsTable;
  window.renderProfilesTable = renderProfilesTable;
  window.openStudentProfileModal = openStudentProfileModal;
  window.isAnyEditFormActive = isAnyEditFormActive;
  window.updateAllViews = updateAllViews;

  // 3. Đăng ký Event Delegation toàn cục trên `document` TRƯỚC TIÊN
  //    để mọi nút bấm và form luôn phản hồi tức thì ngay cả khi mạng chậm
  registerGlobalEventDelegation();

  // 4. Đăng ký lắng nghe trạng thái xác thực và khôi phục phiên đăng nhập
  try {
    initAuthSubscription();
  } catch (err) {
    console.error('initAuthSubscription error:', err);
  }

  try {
    const savedSession = sessionStorage.getItem(AUTH_STORAGE_KEY);
    const parsedSession = savedSession ? JSON.parse(savedSession) : null;
    if (parsedSession && ['admin', 'company_officer', 'class_account', 'class_leader', 'student'].includes(parsedSession.type)) {
      AuthState.setUser(parsedSession, true);
      closeAuthModal();
    } else {
      AuthState.setUser(null, true);
      openLoginModal(true);
    }
  } catch (err) {
    AuthState.setUser(null, true);
    openLoginModal(true);
  }

  // 5. Đồng bộ giá trị mặc định cho bộ chọn chuẩn ngoại ngữ
  try {
    document.querySelectorAll('.required-lang-standard-select').forEach(sel => {
      if (sel) sel.value = AppState.requiredLangStandard || 'A2';
    });
  } catch (err) {
    console.warn('lang selector init warning:', err);
  }

  // 6. Khởi tạo dữ liệu từ Supabase Cloud và cấu hình Realtime
  try {
    initData();
  } catch (err) {
    console.error('initData error:', err);
  }

  try {
    populateStudentPicker();
  } catch (err) {
    console.warn('populateStudentPicker warning:', err);
  }

  try {
    initCloudSyncConfig();
  } catch (err) {
    console.warn('initCloudSyncConfig warning:', err);
  }
}

function bootAppOnce() {
  if (_localAppInitialized) return;
  initApp();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootAppOnce);
} else {
  bootAppOnce();
}