import { sanitizeHTML } from './safe-html.js';
/**
 * MODULE: src/js/auth.js
 * Quản lý Xác thực, Trang đăng nhập riêng biệt (No Autocomplete) & Phân quyền RBAC
 * tối ưu cho 70-80 người đăng nhập đồng thời:
 * 1. Tài khoản Admin cố định: `huudung` | `hd304` (Toàn quyền quản lý hệ thống).
 * 2. Tài khoản Cán bộ Đại đội cố định: `canbo` | `canbon460` (Chỉ xem, lọc và xuất toàn bộ đại đội).
 * 3. 5 Tài khoản Lớp cố định (OTQS1, OTQS2, TTG1, TTG2, XMCB):
 *    - Tên đăng nhập: `otqs1`, `otqs2`, `ttg1`, `ttg2`, `xmcb`
 *    - Mật khẩu: `[tên_lớp]a@` (`otqs1a@`, `otqs2a@`, `ttg1a@`, `ttg2a@`, `xmcba@`)
 *    - Mở khóa tính năng "Báo cáo giao ban" (`tab-dashboard`), cô lập dữ liệu tuyệt đối trong phạm vi lớp mình phụ trách.
 * 4. Tài khoản Học viên (Student): Xác thực bằng truy vấn Mã học viên trực tiếp trên Supabase (`findStudentByCodeOnSupabase`)
 *    sử dụng `.maybeSingle()` an toàn + Retry chống nghẽn mạng.
 * 5. Chống Double Submit nút Đăng nhập: Khóa nút (`disabled = true`) và hiển thị "⏳ Đang xác thực..." ngay khi bấm.
 */

import {
  AUTH_STORAGE_KEY,
  DEFAULT_CLASSES,
  AppState,
  getCurrentUserClassScope,
  showToast,
  hideModal,
  updateAllViews,
  renderSpreadsheet,
  renderCumulativeTable,
  renderMasterTable,
  renderDashboard,
  renderLanguages,
  renderAuditLog,
  renderSubjectsSettings
} from './grades.js';

import {
  renderStudentView,
  renderProfilesTable,
  closeCadetDetailPage
} from './students.js';

import {
  findStudentByCodeOnSupabase,
  withButtonLock
} from './supabase.js';

export const GENERIC_LOGIN_ERROR_MESSAGE = 'Sai thông tin đăng nhập hoặc mã học viên không tồn tại';

// Danh mục 5 tài khoản Lớp cố định với mật khẩu chuẩn [tên_lớp]a@
export const CLASS_ACCOUNTS = {
  'otqs1': { classCode: 'OTQS1', pass: 'otqs1a@', displayName: 'Tài khoản Lớp OTQS1' },
  'otqs2': { classCode: 'OTQS2', pass: 'otqs2a@', displayName: 'Tài khoản Lớp OTQS2' },
  'ttg1':  { classCode: 'TTG1',  pass: 'ttg1a@',  displayName: 'Tài khoản Lớp TTG1' },
  'ttg2':  { classCode: 'TTG2',  pass: 'ttg2a@',  displayName: 'Tài khoản Lớp TTG2' },
  'xmcb':  { classCode: 'XMCB',  pass: 'xmcba@',  displayName: 'Tài khoản Lớp XMCB' }
};

export function canUserConfigureLangStandard() {
  return AppState.role === 'admin';
}

/**
 * Ẩn/Chặn hoàn toàn giao diện quản lý chính khi chưa đăng nhập
 */
export function hideMainAppUI() {
  const headerEl = document.querySelector('header');
  const navEl = document.querySelector('nav');
  const mainEl = document.querySelector('main');
  [headerEl, navEl, mainEl].forEach(el => {
    if (!el) return;
    el.classList.add('hidden');
    el.style.setProperty('display', 'none', 'important');
  });
}

/**
 * Hiển thị lại giao diện quản lý chính sau khi đã xác thực thành công
 */
export function showMainAppUI() {
  const headerEl = document.querySelector('header');
  const navEl = document.querySelector('nav');
  const mainEl = document.querySelector('main');
  [headerEl, navEl, mainEl].forEach(el => {
    if (!el) return;
    el.classList.remove('hidden', 'pointer-events-none', 'select-none', 'blur-md', 'opacity-20', 'opacity-40');
    el.style.removeProperty('display');
    el.style.pointerEvents = '';
  });
}

// Cập nhật tên Tab động theo vai trò (Học viên vs Cán bộ/Admin/Tài khoản Lớp)
export function syncNavigationTabLabels(role) {
  const isStudent = role === 'student';
  const isClassAccount = role && role.startsWith('class_leader_');
  const tabSheet = document.querySelector('.nav-tab[data-tab="tab-sheet"] .tab-label-text');
  const tabCumulative = document.querySelector('.nav-tab[data-tab="tab-cumulative"] .tab-label-text');
  const tabProfiles = document.querySelector('.nav-tab[data-tab="tab-profiles"] .tab-label-text');
  const tabDashboard = document.querySelector('.nav-tab[data-tab="tab-dashboard"]');

  if (tabSheet) {
    tabSheet.textContent = isStudent ? 'Bảng Điểm' : 'Bảng Điểm Lớp';
  }
  if (tabCumulative) {
    tabCumulative.textContent = 'Tiếng Nga và Tích lũy';
  }
  if (tabProfiles) {
    tabProfiles.textContent = 'Hồ Sơ Quân Nhân';
  }
  if (tabDashboard) {
    const labelSpan = tabDashboard.querySelector('.tab-dashboard-label');
    if (labelSpan) {
      labelSpan.textContent = isClassAccount ? 'Báo cáo giao ban lớp' : 'Báo cáo giao ban';
    }
  }
}

// Đồng bộ và cô lập tuyệt đối các bộ chọn lớp trên toàn hệ thống
export function enforceClassIsolationOnSelectors() {
  const classScope = getCurrentUserClassScope();
  const classFilterSelectors = [
    { id: 'sheetClassSelect', includeAll: true, allLabel: '🏢 Toàn bộ Đại đội 460 (Tất cả 5 Lớp)' },
    { id: 'profileFilterClass', includeAll: true, allLabel: '-- Toàn bộ Đại đội (5 Lớp) --' },
    { id: 'cumulFilterClass', includeAll: true, allLabel: '-- Toàn bộ Đại đội (5 Lớp) --' },
    { id: 'langFilterClass', includeAll: true, allLabel: '-- Toàn bộ Đại đội (5 Lớp) --' },
    { id: 'masterFilterClass', includeAll: true, allLabel: '-- Tất cả các lớp (Toàn Đại đội) --' },
    { id: 'dashboardClassFilter', includeAll: true, allLabel: '-- Toàn bộ Đại đội --' },
    { id: 'reportCourseFilterClass', includeAll: true, allLabel: '-- Toàn bộ Đại đội --' },
    { id: 'reportYearsFilterClass', includeAll: true, allLabel: '-- Toàn bộ Đại đội --' },
    { id: 'reportDebtFilterClass', includeAll: true, allLabel: '-- Toàn bộ Đại đội --' },
    { id: 'newCadetClass', includeAll: false },
    { id: 'profFormClass', includeAll: false }
  ];

  classFilterSelectors.forEach(cfg => {
    const el = document.getElementById(cfg.id);
    if (!el) return;

    if (classScope) {
      el.innerHTML = sanitizeHTML(`<option value="${classScope}">Lớp ${classScope}</option>`);
      el.value = classScope;
      el.disabled = true;
    } else {
      el.disabled = false;
      const currentVal = el.value;
      let html = '';
      if (cfg.includeAll) {
        html += `<option value="all">${cfg.allLabel}</option>`;
      }
      html += DEFAULT_CLASSES.map(c => `<option value="${c}">Lớp ${c}</option>`).join('');
      el.innerHTML = sanitizeHTML(html);
      if (currentVal && (currentVal === 'all' || DEFAULT_CLASSES.includes(currentVal))) {
        el.value = currentVal;
      } else if (cfg.id === 'sheetClassSelect') {
        el.value = AppState.currentSheetClass || 'OTQS1';
      }
    }
  });
}

let lastAppliedRole = null;
export function handleRoleChange(newRole) {
  if (!newRole) newRole = 'guest';
  const previousRole = lastAppliedRole;
  lastAppliedRole = newRole;
  AppState.role = newRole;
  if (previousRole !== newRole && ['admin', 'company_officer'].includes(newRole)) {
    AppState.dashboardFilters.class = 'all';
    for (const id of ['dashboardClassFilter', 'reportCourseFilterClass', 'reportYearsFilterClass', 'reportDebtFilterClass', 'reportsClassSelect']) {
      const select = document.getElementById(id);
      if (select) select.value = 'all';
    }
  }
  document.body.toggleAttribute('data-unit-readonly', newRole === 'company_officer');
  if (newRole === 'company_officer') {
    AppState.studentProfileEditMode = false;
    for (const id of ['modalStudentProfile', 'modalAddCadet', 'modalAddSubject', 'modalUpdateLang', 'modalImportExcel', 'modalQuickImportExcel', 'modalCloudConfig']) hideModal(id);
    AppState.isEditingForm = false;
    AppState.editingModalId = null;
    AppState.editingStudentId = null;
  }
  const badge = document.getElementById('roleBadge');
  const studentPanel = document.getElementById('studentPersonalPanel');
  const adminOnlyElements = document.querySelectorAll('.admin-only');
  const leaderAllowedElements = document.querySelectorAll('.leader-allowed');

  // Mở khóa mục "Báo cáo giao ban" (tab-dashboard) cho 5 Tài khoản Lớp
  const restrictedTabsForStudent = ['tab-master', 'tab-dashboard', 'tab-languages', 'tab-audit', 'tab-settings', 'tab-cumulative'];
  const restrictedTabsForClassAccount = ['tab-master'];

  syncNavigationTabLabels(newRole);
  enforceClassIsolationOnSelectors();

  document.querySelectorAll('.nav-tab').forEach(tabBtn => {
    const tabId = tabBtn.dataset.tab;
    if (newRole === 'student' && restrictedTabsForStudent.includes(tabId)) {
      tabBtn.classList.add('hidden');
      tabBtn.style.display = 'none';
    } else if (newRole.startsWith('class_leader_') && restrictedTabsForClassAccount.includes(tabId)) {
      tabBtn.classList.add('hidden');
      tabBtn.style.display = 'none';
    } else if (newRole !== 'guest') {
      tabBtn.classList.remove('hidden');
      tabBtn.style.display = '';
    }
  });

  if (newRole === 'admin') {
    if (badge) {
      badge.textContent = 'Admin Hệ thống (huudung)';
      badge.className = 'text-[11px] px-2 py-0.5 rounded font-semibold bg-emerald-700 text-emerald-100';
    }
    if (studentPanel) studentPanel.classList.add('hidden');
    adminOnlyElements.forEach(el => el.classList.remove('hidden'));
    leaderAllowedElements.forEach(el => el.classList.remove('hidden'));
  } else if (newRole === 'company_officer') {
    if (badge) {
      badge.textContent = 'Cán bộ Đại đội (canbo)';
      badge.className = 'text-[11px] px-2 py-0.5 rounded font-semibold bg-blue-700 text-blue-100';
    }
    if (studentPanel) studentPanel.classList.add('hidden');
    adminOnlyElements.forEach(el => el.classList.add('hidden'));
    leaderAllowedElements.forEach(el => el.classList.add('hidden'));
  } else if (newRole.startsWith('class_leader_')) {
    const cls = newRole.replace('class_leader_', '');
    AppState.selectedClassLeaderClass = cls;
    AppState.currentSheetClass = cls;
    AppState.masterFilters.class = cls;

    if (badge) {
      badge.textContent = `Tài khoản Lớp ${cls}`;
      badge.className = 'text-[11px] px-2 py-0.5 rounded font-semibold bg-amber-600 text-amber-100';
    }
    if (studentPanel) studentPanel.classList.add('hidden');
    adminOnlyElements.forEach(el => el.classList.add('hidden'));
    leaderAllowedElements.forEach(el => el.classList.remove('hidden'));
  } else if (newRole === 'student') {
    if (badge) {
      badge.textContent = 'Học viên (Cá nhân)';
      badge.className = 'text-[11px] px-2 py-0.5 rounded font-semibold bg-purple-700 text-purple-100';
    }
    if (studentPanel) studentPanel.classList.remove('hidden');
    adminOnlyElements.forEach(el => el.classList.add('hidden'));
    leaderAllowedElements.forEach(el => el.classList.add('hidden'));
    renderStudentView();
  }

  window.dispatchEvent(new Event('report-role-change'));
  renderSpreadsheet();
}

export const AuthState = {
  _user: null,
  _listeners: [],

  subscribe(listener) {
    if (typeof listener === 'function') {
      this._listeners.push(listener);
    }
  },

  getUser() {
    return this._user;
  },

  setUser(newUser, skipPersist = false) {
    this._user = newUser;
    AppState.currentUser = newUser;

    if (newUser) {
      if (newUser.type === 'admin') {
        AppState.role = 'admin';
      } else if (newUser.type === 'company_officer') {
        AppState.role = 'company_officer';
      } else if ((newUser.type === 'class_account' || newUser.type === 'class_leader') && newUser.class) {
        AppState.role = 'class_leader_' + newUser.class;
        AppState.currentSheetClass = newUser.class;
      } else if (newUser.type === 'student') {
        const student = AppState.students.find(s => s.code.toUpperCase() === (newUser.code || '').toUpperCase().trim());
        AppState.role = 'student';
        AppState.studentViewingId = newUser.studentId || (student ? student.id : AppState.students[0]?.id);
        if (newUser.class || student?.class) {
          AppState.currentSheetClass = newUser.class || student.class;
        }
      }

      showMainAppUI();

      if (!skipPersist) {
        try {
          sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(newUser));
        } catch (e) {
          console.warn('sessionStorage write error:', e);
        }
      }
    } else {
      AppState.role = 'guest';
      AppState.currentUser = null;
      hideMainAppUI();
      try {
        sessionStorage.removeItem(AUTH_STORAGE_KEY);
      } catch (e) {
        console.warn('sessionStorage remove error:', e);
      }
    }

    this._notify();
  },

  _notify() {
    this._listeners.forEach(fn => {
      try {
        fn(this._user, AppState.role);
      } catch (err) {
        console.error('Error in AuthState listener:', err);
      }
    });
  }
};

export function initAuthSubscription() {
  if (AuthState._listeners.length > 0) return;
  AuthState.subscribe((user, role) => {
    closeCadetDetailPage(true);
    updateAuthUI();
    if (user && role !== 'guest') {
      showMainAppUI();
      handleRoleChange(role);
      switchTab(role === 'student' ? 'tab-sheet' : 'tab-dashboard');
      updateAllViews();
    } else {
      hideMainAppUI();
    }
  });
}

export function switchTab(targetTabId) {
  if (targetTabId === 'tab-languages') targetTabId = 'tab-cumulative';
  if (!targetTabId) targetTabId = 'tab-sheet';
  closeCadetDetailPage(true);

  const restrictedTabsForStudent = ['tab-master', 'tab-dashboard', 'tab-languages', 'tab-audit', 'tab-settings', 'tab-cumulative'];
  const restrictedTabsForClassAccount = ['tab-master'];

  if (AppState.role === 'student' && restrictedTabsForStudent.includes(targetTabId)) {
    targetTabId = 'tab-sheet';
  } else if (AppState.role && AppState.role.startsWith('class_leader_') && restrictedTabsForClassAccount.includes(targetTabId)) {
    targetTabId = 'tab-sheet';
  }
  AppState.activeTab = targetTabId;

  document.querySelectorAll('.nav-tab').forEach(b => {
    if (b.dataset.tab === targetTabId) {
      b.classList.add('active', 'border-gold-400', 'text-gold-400');
      b.classList.remove('border-transparent', 'text-slate-300');
    } else {
      b.classList.remove('active', 'border-gold-400', 'text-gold-400');
      b.classList.add('border-transparent', 'text-slate-300');
    }
  });

  document.querySelectorAll('.tab-content').forEach(section => {
    if (section.id === targetTabId) {
      section.classList.remove('hidden');
      section.classList.add('active');
      section.style.display = 'block';
    } else {
      section.classList.add('hidden');
      section.classList.remove('active');
      section.style.display = 'none';
    }
  });

  if (targetTabId === 'tab-sheet') renderSpreadsheet();
  else if (targetTabId === 'tab-profiles') renderProfilesTable();
  else if (targetTabId === 'tab-cumulative') renderCumulativeTable();
  else if (targetTabId === 'tab-master') renderMasterTable();
  else if (targetTabId === 'tab-dashboard') renderDashboard();
  else if (targetTabId === 'tab-languages') renderLanguages();
  else if (targetTabId === 'tab-audit') renderAuditLog();
  else if (targetTabId === 'tab-settings') renderSubjectsSettings();
  if (targetTabId === 'tab-reports') window.dispatchEvent(new Event('report-role-change'));
}

/**
 * Đóng Trang / Modal Đăng nhập sau khi xác thực thành công
 */
export function closeAuthModal() {
  if (!AuthState.getUser() || AppState.role === 'guest') {
    hideMainAppUI();
    return;
  }

  const modal = document.getElementById('modalAuthLogin');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex', 'items-center', 'justify-center');
    modal.style.setProperty('display', 'none', 'important');
    modal.style.pointerEvents = 'none';
    modal.style.visibility = 'hidden';
    modal.style.opacity = '0';
    modal.style.zIndex = '-1';
    modal.setAttribute('aria-hidden', 'true');
  }

  showMainAppUI();

  if (document.body) {
    document.body.classList.remove('overflow-hidden', 'modal-open', 'pointer-events-none');
    document.body.style.pointerEvents = '';
    document.body.style.overflow = '';
  }
}

/**
 * Hiển thị Trang Đăng nhập riêng biệt (No Autocomplete)
 */
export function openLoginModal(forceMandatory = false) {
  const isUnauthenticated = !AuthState.getUser() || AppState.role === 'guest' || forceMandatory === true;
  if (isUnauthenticated && (!AuthState.getUser() || AppState.role === 'guest')) {
    hideMainAppUI();
  }

  const modal = document.getElementById('modalAuthLogin');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex', 'items-center', 'justify-center');
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.pointerEvents = 'auto';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    modal.style.zIndex = '50';
    modal.setAttribute('aria-hidden', 'false');

    const closeBtn = modal.querySelector('.modal-close');
    if (closeBtn) {
      if (!AuthState.getUser() || AppState.role === 'guest') {
        closeBtn.classList.add('hidden');
        closeBtn.style.display = 'none';
      } else {
        closeBtn.classList.remove('hidden');
        closeBtn.style.display = '';
      }
    }
  }

  const uEl = document.getElementById('loginAdminUser');
  const pEl = document.getElementById('loginAdminPass');
  const cEl = document.getElementById('loginCadetCode');
  if (uEl) uEl.value = '';
  if (pEl) pEl.value = '';
  if (cEl) cEl.value = '';

  ['loginAdminError', 'loginCadetError'].forEach(errId => {
    const errBox = document.getElementById(errId);
    if (errBox) {
      errBox.classList.add('hidden');
      errBox.style.display = 'none';
    }
  });
}

export function updateAuthUI() {
  const authRoleIcon = document.getElementById('authRoleIcon');
  const authUserTitle = document.getElementById('authUserTitle');
  const authRoleDesc = document.getElementById('authRoleDesc');
  const adminOnlyElements = document.querySelectorAll('.admin-only');
  const leaderAllowedElements = document.querySelectorAll('.leader-allowed');
  const studentPanel = document.getElementById('studentPersonalPanel');
  const btnLogout = document.getElementById('btnLogout');
  const btnLoginText = document.getElementById('btnLoginText');

  const cBox = document.getElementById('cornerRoleIconBox');
  const cTag = document.getElementById('cornerRoleTag');
  const cTitle = document.getElementById('cornerRoleTitle');
  const cDesc = document.getElementById('cornerRoleDesc');
  const btnCornerLogout = document.getElementById('btnCornerLogout');

  const u = AuthState.getUser() || AppState.currentUser;

  if (!u || AppState.role === 'guest') {
    if (authRoleIcon) authRoleIcon.textContent = '🔒';
    if (authUserTitle) authUserTitle.textContent = 'Chưa đăng nhập';
    if (authRoleDesc) authRoleDesc.textContent = 'Vui lòng đăng nhập';
    if (btnLogout) { btnLogout.classList.add('hidden'); btnLogout.style.display = 'none'; }
    if (btnLoginText) btnLoginText.textContent = 'Đăng Nhập';
    if (studentPanel) { studentPanel.classList.add('hidden'); studentPanel.style.display = 'none'; }
    if (cBox) cBox.textContent = '🔒';
    if (cTag) cTag.textContent = 'CHƯA ĐĂNG NHẬP';
    if (cTitle) cTitle.textContent = 'Khách';
    if (cDesc) cDesc.textContent = '(Vui lòng đăng nhập)';
    if (btnCornerLogout) btnCornerLogout.classList.add('hidden');
    return;
  }

  if (btnLogout) { btnLogout.classList.remove('hidden'); btnLogout.style.display = ''; }
  if (btnLoginText) btnLoginText.textContent = 'Đổi Tài Khoản';
  if (btnCornerLogout) btnCornerLogout.classList.remove('hidden');

  if (AppState.role === 'admin') {
    if (authRoleIcon) authRoleIcon.textContent = '👑';
    if (authUserTitle) authUserTitle.textContent = u.displayName || 'Admin Hệ thống (huudung)';
    if (authRoleDesc) authRoleDesc.textContent = 'Toàn quyền Quản lý Hệ thống Đại đội 460';
    adminOnlyElements.forEach(el => { el.classList.remove('hidden'); el.style.display = ''; });
    leaderAllowedElements.forEach(el => { el.classList.remove('hidden'); el.style.display = ''; });
    if (studentPanel) { studentPanel.classList.add('hidden'); studentPanel.style.display = 'none'; }

    if (cBox) cBox.textContent = '👑';
    if (cTag) { cTag.textContent = 'ADMIN HỆ THỐNG'; cTag.className = 'px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300'; }
    if (cTitle) cTitle.textContent = u.displayName || 'Admin Hệ thống (huudung)';
    if (cDesc) cDesc.textContent = '(Toàn quyền quản lý hệ thống)';
  } else if (AppState.role === 'company_officer') {
    if (authRoleIcon) authRoleIcon.textContent = '🎖️';
    if (authUserTitle) authUserTitle.textContent = u.displayName || 'Cán bộ Đại đội (canbo)';
    if (authRoleDesc) authRoleDesc.textContent = 'Chỉ xem toàn Đại đội, không được chỉnh sửa';
    adminOnlyElements.forEach(el => { el.classList.add('hidden'); el.style.display = 'none'; });
    leaderAllowedElements.forEach(el => { el.classList.add('hidden'); el.style.display = 'none'; });
    if (studentPanel) { studentPanel.classList.add('hidden'); studentPanel.style.display = 'none'; }

    if (cBox) cBox.textContent = '🎖️';
    if (cTag) { cTag.textContent = 'CÁN BỘ ĐẠI ĐỘI'; cTag.className = 'px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-blue-100 text-blue-800 border border-blue-300'; }
    if (cTitle) cTitle.textContent = u.displayName || 'Cán bộ Đại đội (canbo)';
    if (cDesc) cDesc.textContent = '(Chỉ xem toàn bộ Đại đội)';
  } else if (AppState.role && AppState.role.startsWith('class_leader_')) {
    const cls = AppState.role.replace('class_leader_', '');
    if (authRoleIcon) authRoleIcon.textContent = '⭐';
    if (authUserTitle) authUserTitle.textContent = `Tài khoản Lớp ${cls}`;
    if (authRoleDesc) authRoleDesc.textContent = `Cô lập dữ liệu tuyệt đối trong Lớp ${cls}`;
    adminOnlyElements.forEach(el => { el.classList.add('hidden'); el.style.display = 'none'; });
    leaderAllowedElements.forEach(el => { el.classList.remove('hidden'); el.style.display = ''; });
    if (studentPanel) { studentPanel.classList.add('hidden'); studentPanel.style.display = 'none'; }

    if (cBox) cBox.textContent = '⭐';
    if (cTag) { cTag.textContent = `TÀI KHOẢN LỚP ${cls}`; cTag.className = 'px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-amber-100 text-amber-900 border border-amber-300'; }
    if (cTitle) cTitle.textContent = `Tài khoản Lớp ${cls}`;
    if (cDesc) cDesc.textContent = `(Phạm vi dữ liệu cô lập: Lớp ${cls})`;
  } else {
    if (authRoleIcon) authRoleIcon.textContent = '🎓';
    if (authUserTitle) authUserTitle.textContent = u.displayName || (u.name ? `${u.name} (${u.code})` : 'Học viên');
    if (authRoleDesc) authRoleDesc.textContent = `Học viên Lớp ${u.class || ''} (Chỉ xem & sửa hồ sơ cá nhân)`;
    adminOnlyElements.forEach(el => { el.classList.add('hidden'); el.style.display = 'none'; });
    leaderAllowedElements.forEach(el => { el.classList.add('hidden'); el.style.display = 'none'; });
    if (studentPanel) { studentPanel.classList.remove('hidden'); studentPanel.style.display = 'block'; }
    renderStudentView();

    if (cBox) cBox.textContent = '🎓';
    if (cTag) { cTag.textContent = 'HỌC VIÊN'; cTag.className = 'px-1.5 py-0.5 rounded text-[10px] font-black uppercase bg-purple-100 text-purple-900 border border-purple-300'; }
    if (cTitle) cTitle.textContent = u.displayName || (u.name ? `${u.name} (${u.code})` : 'Học viên');
    if (cDesc) cDesc.textContent = `(Chỉ truy cập dữ liệu bản thân)`;
  }
}

export function handleLogout() {
  AuthState.setUser(null);
  openLoginModal(true);
}

// Biến khóa chống Double Submit khi nhiều người bấm nút Đăng nhập liên tục
let isAdminLoginBusy = false;
let isCadetLoginBusy = false;

export async function handleMockLogin(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  if (isAdminLoginBusy) return false;
  const userEl = document.getElementById('loginAdminUser');
  const passEl = document.getElementById('loginAdminPass');
  const user = userEl ? userEl.value : '';
  const pass = passEl ? passEl.value : '';
  return await processAdminLogin(user, pass);
}

export async function processAdminLogin(user, pass) {
  if (isAdminLoginBusy) return false;
  isAdminLoginBusy = true;

  try {
    return await withButtonLock('btnSubmitAdminLogin', '⏳ Đang xác thực...', async () => {
      const u = (user || '').toLowerCase().trim();
      const p = (pass || '').trim();
      const errBox = document.getElementById('loginAdminError');
      const errMsg = document.getElementById('loginAdminErrorMsg');

      if (errBox) {
        errBox.classList.add('hidden');
        errBox.style.display = 'none';
      }

      // 1. Tài khoản Admin cố định: huudung | hd304
      if (u === 'huudung' && p === 'hd304') {
        const userObj = {
          type: 'admin',
          username: 'huudung',
          displayName: 'Admin Hệ thống (huudung)'
        };
        AuthState.setUser(userObj);
        closeAuthModal();
        switchTab('tab-dashboard');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }

      // 2. Tài khoản Cán bộ Đại đội cố định: canbo | canbon460
      if (u === 'canbo' && p === 'canbon460') {
        const userObj = {
          type: 'company_officer',
          username: 'canbo',
          displayName: 'Cán bộ Đại đội (canbo)'
        };
        AppState.currentSheetClass = 'all';
        AuthState.setUser(userObj);
        closeAuthModal();
        switchTab('tab-dashboard');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }

      // 3. 5 Tài khoản Lớp riêng biệt: otqs1/otqs1a@, otqs2/otqs2a@, ttg1/ttg1a@, ttg2/ttg2a@, xmcb/xmcba@
      if (CLASS_ACCOUNTS[u] && p.toLowerCase() === CLASS_ACCOUNTS[u].pass) {
        const targetCls = CLASS_ACCOUNTS[u].classCode;
        const userObj = {
          type: 'class_account',
          username: u,
          class: targetCls,
          displayName: CLASS_ACCOUNTS[u].displayName
        };
        AuthState.setUser(userObj);
        closeAuthModal();
        switchTab('tab-dashboard');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;
      }

      // Khi nhập sai thông tin: Tuyệt đối không gợi ý hay làm lộ tài khoản có sẵn
      if (errBox) {
        if (errMsg) {
          errMsg.textContent = GENERIC_LOGIN_ERROR_MESSAGE;
        }
        errBox.classList.remove('hidden');
        errBox.style.display = 'flex';
      }
      showToast(GENERIC_LOGIN_ERROR_MESSAGE, 'error');
      return false;
    });
  } finally {
    isAdminLoginBusy = false;
  }
}

export async function handleCadetSubmit(e) {
  if (e) {
    if (typeof e.preventDefault === 'function') e.preventDefault();
    if (typeof e.stopPropagation === 'function') e.stopPropagation();
  }
  if (isCadetLoginBusy) return false;
  const codeEl = document.getElementById('loginCadetCode');
  const code = codeEl ? codeEl.value : '';
  return await processCadetLogin(code);
}

/**
 * Xác thực Học viên bằng Mã học viên (Tối ưu cho 70-80 học viên đăng nhập cùng lúc):
 * - Khóa nút `#btnSubmitCadetLogin` (`disabled = true`) ngay lập tức và hiển thị "⏳ Đang xác thực...".
 * - Sử dụng `findStudentByCodeOnSupabase` (kết hợp `.maybeSingle()` + Auto-Retry chống timeout).
 * - Chỉ mở lại nút sau khi Supabase phản hồi xong.
 */
export async function processCadetLogin(rawCode) {
  if (isCadetLoginBusy) return false;
  isCadetLoginBusy = true;

  try {
    return await withButtonLock('btnSubmitCadetLogin', '⏳ Đang xác thực...', async () => {
      const code = (rawCode || '').toUpperCase().trim();
      const errBox = document.getElementById('loginCadetError') || document.getElementById('loginAdminError');
      const errMsg = document.getElementById('loginCadetErrorMsg') || document.getElementById('loginAdminErrorMsg');

      if (errBox) {
        errBox.classList.add('hidden');
        errBox.style.display = 'none';
      }

      if (!code) {
        if (errBox) {
          if (errMsg) errMsg.textContent = GENERIC_LOGIN_ERROR_MESSAGE;
          errBox.classList.remove('hidden');
          errBox.style.display = 'flex';
        }
        showToast(GENERIC_LOGIN_ERROR_MESSAGE, 'error');
        return false;
      }

      // Truy vấn trực tiếp Mã học viên trên Supabase với `.maybeSingle()` và cơ chế chống timeout
      const student = await findStudentByCodeOnSupabase(code, AppState.students);
      if (!student) {
        if (errBox) {
          if (errMsg) errMsg.textContent = GENERIC_LOGIN_ERROR_MESSAGE;
          errBox.classList.remove('hidden');
          errBox.style.display = 'flex';
        }
        showToast(GENERIC_LOGIN_ERROR_MESSAGE, 'error');
        return false;
      }

      // Đảm bảo học viên vừa tải từ Supabase cũng có mặt trong AppState.students
      if (!AppState.students.some(s => s.id === student.id || s.code.toUpperCase() === student.code.toUpperCase())) {
        AppState.students.push(student);
      }

      const userObj = {
        type: 'student',
        code: student.code,
        studentId: student.id,
        name: student.name,
        displayName: `${student.name} (${student.code})`,
        class: student.class,
        rank: student.rank,
        position: student.position || 'Học viên'
      };

      AuthState.setUser(userObj);
      closeAuthModal();
      switchTab('tab-sheet');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return true;
    });
  } finally {
    isCadetLoginBusy = false;
  }
}