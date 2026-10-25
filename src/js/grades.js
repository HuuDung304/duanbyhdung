/**
 * MODULE: src/js/grades.js
 * Quản lý Kho dữ liệu (AppState & localStorage), Phân loại Môn học (Môn chung & Môn chuyên ngành),
 * Bảng điểm Lớp theo Năm học (Năm 1 -> Năm 5), Bảng điểm cuộn dọc cho Học viên,
 * Điểm tích lũy (DTB HK1 (10), DTB HKII (10), Ngoại ngữ hiện tại, Chuẩn CNTT),
 * Tổng hợp Toàn Đại đội (Lọc theo kỳ), Báo cáo giao ban (Rớt < 4.0 định dạng [Tên môn] ([Số tín chỉ] TC)).
 */

export const ExternalHooks = {
  renderProfilesTable: null,
  renderStudentView: null,
  handleRoleChange: null,
  openStudentProfileModal: null,
  openCadetDetailPage: null
};

export function registerExternalHooks(hooks = {}) {
  Object.assign(ExternalHooks, hooks);
}

import {
  SUPABASE_CONFIG,
  SUPABASE_URL,
  SUPABASE_KEY,
  SUPABASE_PROJECT_REF,
  buildDeterministicStudentId,
  initSupabaseClient,
  loadAllDataFromSupabase,
  upsertStudentToSupabase,
  upsertStudentsBulkToSupabase,
  upsertSubjectToSupabase,
  deleteSubjectFromSupabase,
  deleteSubjectsByIdsFromSupabase,
  deleteAllSubjectsFromSupabase,
  upsertGradeToSupabase,
  deleteGradeFromSupabase,
  upsertGradesBulkToSupabase,
  upsertLanguageToSupabase,
  saveUnitSettingsToSupabase,
  subscribeSupabaseRealtime
} from './supabase.js';

export const STORAGE_KEY = 'dd460_firestore_app_data';
export const AUTH_STORAGE_KEY = 'dd460_auth_session';
export const CLOUD_CFG_STORAGE_KEY = 'dd460_cloud_cfg';

/**
 * Hiển thị / Ẩn Modal an toàn tuyệt đối (Xóa bỏ hoàn toàn xung đột class hidden và inline style.display)
 */
export function showModal(modalId) {
  const m = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!m) return;
  m.classList.remove('hidden');
  m.classList.add('flex', 'items-center', 'justify-center');
  m.style.display = 'flex';
  m.style.pointerEvents = 'auto';
  m.style.visibility = 'visible';
  m.style.opacity = '1';
}

export function hideModal(modalId) {
  const m = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!m) return;
  m.classList.add('hidden');
  m.classList.remove('flex');
  m.style.display = 'none';
}

export const DEFAULT_CLASSES = ['OTQS1', 'OTQS2', 'TTG1', 'TTG2', 'XMCB'];

export const LANGUAGE_LEVEL_OPTIONS = [
  'Chưa đạt',
  'A1.1',
  'A1',
  'A2.1',
  'A2',
  'A2.2',
  'B1.1',
  'B1',
  'B1.2',
  'B2'
];

export const LANGUAGE_LEVEL_RANK = {
  'Chưa đạt': 0,
  'A1.1': 1,
  'A1': 2,
  'A2.1': 3,
  'A2': 4,
  'A2.2': 5,
  'B1.1': 6,
  'B1': 7,
  'B1.2': 8,
  'B2': 9
};

export function evaluateLangLevelStatus(actualLevel, requiredStandard = null) {
  const std = requiredStandard || AppState.requiredLangStandard || 'A2';
  const cur = actualLevel || 'Chưa đạt';
  const curRank = LANGUAGE_LEVEL_RANK[cur] !== undefined ? LANGUAGE_LEVEL_RANK[cur] : 0;
  const reqRank = LANGUAGE_LEVEL_RANK[std] !== undefined ? LANGUAGE_LEVEL_RANK[std] : 4;
  const isPassed = curRank >= reqRank && cur !== 'Chưa đạt';
  return {
    isPassed,
    requiredStandard: std,
    actualLevel: cur,
    statusText: isPassed ? `Đạt chuẩn (${std})` : 'Chưa đạt',
    badgeHtml: isPassed
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">✅ Đạt (${std})</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-700 border border-rose-300 whitespace-nowrap">⚠️ Chưa đạt (Chuẩn ${std})</span>`
  };
}

export const IT_STANDARD_OPTIONS = [
  'Chưa đạt',
  'Đạt chuẩn CNTT cơ bản',
  'Đạt chuẩn CNTT nâng cao'
];

// --- 1. DANH MỤC MÔN HỌC: MÔN HỌC CHUNG (common) & MÔN HỌC CHUYÊN NGÀNH (specialized) ---
// Khởi tạo danh mục môn học trống hoàn toàn (Loại bỏ hoàn toàn Auto-Seeding 49 môn mẫu cứng)
export const DEFAULT_SUBJECTS = [];

// Khởi tạo danh sách học viên trống hoàn toàn (Loại bỏ hoàn toàn Auto-Seeding 37 học viên mẫu cứng)
export const DEFAULT_STUDENTS = [];

// Định dạng ngày hiển thị chuẩn Việt Nam (hỗ trợ cả YYYY, DD/MM/YYYY, YYYY-MM-DD)
export function formatVN(dateStr) {
  if (!dateStr) return '-';
  const s = String(dateStr).trim();
  if (!s) return '-';
  if (/^\d{4}$/.test(s)) return s;
  if (s.includes('/')) return s;
  const parts = s.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return s;
}

// Chuẩn hóa danh hiệu thành mảng (Array) không bắt buộc
export function normalizeAchievements(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(x => String(x || '').trim()).filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s || s === '-' || s === 'Không có' || s === 'Chưa có danh hiệu') return [];
  return s.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
}

export function formatAchievementsText(raw) {
  const arr = normalizeAchievements(raw);
  return arr.length > 0 ? arr.join(', ') : 'Chưa có danh hiệu';
}

// Chuẩn hóa nhẹ nhàng cấu trúc trường dữ liệu của học viên thực tế (Tuyệt đối không tự gán dữ liệu mẫu cứng)
export function enrichStudentsProfile(students) {
  if (!Array.isArray(students)) return;
  students.forEach((s) => {
    if (!s || typeof s !== 'object') return;
    if ('trainingScore' in s) delete s.trainingScore;
    if (!s.position) s.position = s.role || 'Học viên';
    if (!s.role) s.role = s.position;
    if (s.hometown === undefined) s.hometown = '';
    if (s.enlistmentDate === undefined) s.enlistmentDate = '';
    if (s.permanentAddress === undefined) s.permanentAddress = s.hometown || '';
    if (s.currentAddress === undefined) s.currentAddress = '';
    if (!s.politicalStatus) s.politicalStatus = 'DOAN_VIEN';
    if (s.party_joined_date === undefined) s.party_joined_date = null;
    if (s.official_party_date === undefined) s.official_party_date = null;
    if (s.father_name === undefined) s.father_name = '';
    if (s.father_birth_date === undefined) s.father_birth_date = '';
    else if (s.father_birth_date && s.father_birth_date.includes('-')) s.father_birth_date = formatVN(s.father_birth_date);
    if (s.father_job === undefined) s.father_job = '';
    if (s.father_hometown === undefined) s.father_hometown = '';
    if (s.mother_name === undefined) s.mother_name = '';
    if (s.mother_birth_date === undefined) s.mother_birth_date = '';
    else if (s.mother_birth_date && s.mother_birth_date.includes('-')) s.mother_birth_date = formatVN(s.mother_birth_date);
    if (s.mother_job === undefined) s.mother_job = '';
    if (s.mother_hometown === undefined) s.mother_hometown = '';
    s.achievements = normalizeAchievements(s.achievements);
    if (!s.currentLangLevel) s.currentLangLevel = 'A2';
    if (!s.itStandard) s.itStandard = 'Đạt chuẩn CNTT cơ bản';
  });
}

export function getSubjectTargetClasses(sub) {
  if (!sub) return [];
  if (!sub.category || sub.category === 'common' || sub.targetClass === 'all') {
    return [...DEFAULT_CLASSES];
  }
  if (Array.isArray(sub.targetClasses) && sub.targetClasses.length > 0) {
    return sub.targetClasses.map(c => String(c || '').trim().toUpperCase()).filter(Boolean);
  }
  if (typeof sub.targetClass === 'string' && sub.targetClass.trim() !== '' && sub.targetClass !== 'all') {
    return sub.targetClass.split(/[,;\s]+/).map(c => c.trim().toUpperCase()).filter(Boolean);
  }
  return ['OTQS1'];
}

export function doesSubjectApplyToClass(sub, className) {
  if (!sub) return false;
  const isCommon = !sub.category || sub.category === 'common' || sub.targetClass === 'all';
  if (isCommon) return true;
  if (!className || String(className).toLowerCase() === 'all') return true;
  const targetCls = String(className).trim().toUpperCase();
  const classesList = getSubjectTargetClasses(sub);
  return classesList.includes(targetCls);
}

export function normalizeSubjectsCatalog(subjects) {
  if (!Array.isArray(subjects)) return [];
  return subjects.map(sub => {
    const isSpec = sub.category === 'specialized' || (sub.targetClass && sub.targetClass !== 'all') || (Array.isArray(sub.targetClasses) && sub.targetClasses.length > 0);
    const targetClasses = isSpec ? getSubjectTargetClasses({ ...sub, category: 'specialized' }) : [];
    return {
      ...sub,
      semester: Number(sub.semester) || 1,
      credits: Number(sub.credits) || 3,
      category: isSpec ? 'specialized' : 'common',
      targetClasses: isSpec ? targetClasses : [],
      targetClass: isSpec ? targetClasses.join(', ') : 'all'
    };
  });
}

export function getSubjectsForClass(className, semester = null) {
  const rawCls = className ? String(className).trim().toUpperCase() : null;
  const targetCls = (rawCls === 'ALL') ? null : rawCls;
  return AppState.subjects.filter(sub => {
    if (!doesSubjectApplyToClass(sub, targetCls)) return false;
    if (semester !== null && semester !== undefined && semester !== 'all') {
      return Number(sub.semester) === Number(semester);
    }
    return true;
  });
}

// Khởi tạo bảng điểm trống hoàn toàn (Không tự sinh điểm mẫu)
export function generateInitialGrades() {
  return {};
}

// Khởi tạo dữ liệu ngoại ngữ trống hoàn toàn (Không tự sinh dữ liệu mẫu)
export function generateInitialLanguages() {
  return {};
}

export function generateInitialLocks() {
  const locks = {};
  DEFAULT_CLASSES.forEach(c => {
    for (let y = 1; y <= 5; y++) {
      locks[`${c}_year_${y}`] = false;
    }
    for (let s = 1; s <= 10; s++) {
      locks[`${c}_${s}`] = false;
    }
  });
  return locks;
}

export const AppState = {
  role: 'admin',
  currentUser: {
    type: 'admin',
    username: 'admin',
    displayName: 'Chỉ huy Đại đội (Admin)'
  },
  selectedClassLeaderClass: 'OTQS1',
  studentViewingId: '',
  activeTab: 'tab-sheet',
  previousTabBeforeDetail: 'tab-sheet',
  viewingDetailStudentId: null,
  studentProfileEditMode: false,
  isLoadingCloud: true,

  // Trạng thái ban đầu trống dữ liệu học viên & điểm số (Không dùng dữ liệu mẫu cứng)
  classes: [...DEFAULT_CLASSES],
  subjects: [...DEFAULT_SUBJECTS],
  students: [],
  grades: {},
  languages: {},
  locks: {},
  auditLogs: [],

  currentSheetClass: 'OTQS1',
  currentSheetSemester: '1',
  currentSheetScale: '10',
  settingsSelectedYear: 1,
  settingsCategoryFilter: 'all',
  cumulativeSelectedYear: '1',
  requiredLangStandard: 'A2',
  masterFilters: {
    class: 'all',
    semester: 'all',
    rank: 'all',
    debt: 'all',
    search: ''
  }
};

export function getCurrentUserClassScope() {
  if (AppState.role === 'admin' || AppState.role === 'company_officer') {
    return null;
  }
  if (AppState.role && AppState.role.startsWith('class_leader_')) {
    return AppState.role.replace('class_leader_', '');
  }
  if (AppState.role === 'student') {
    const st = getLoggedInStudent();
    return st ? st.class : null;
  }
  return null;
}

export function getScopedStudents() {
  if (AppState.role === 'student') {
    const self = getLoggedInStudent();
    return self ? [self] : [];
  }
  const classScope = getCurrentUserClassScope();
  if (classScope) {
    return AppState.students.filter(s => s.class === classScope);
  }
  return [...AppState.students];
}

export function getLoggedInStudent() {
  const u = AppState.currentUser;
  if (!u) return null;
  const code = (u.code || '').toUpperCase().trim();
  const sid = u.studentId;
  return AppState.students.find(s =>
    (sid && s.id === sid) || (code && s.code.toUpperCase() === code)
  ) || null;
}

/**
 * Áp dụng dữ liệu thực tế từ Firebase Realtime Database (`military_units/daidoi460`) vào AppState.
 * - Khi trên Firebase đã xóa học viên (hoặc xóa sạch hết học viên khiến `parsed.students` là `[]` / `undefined`),
 *   hệ thống bắt buộc cập nhật `AppState.students = []`, `AppState.grades = {}`, `AppState.languages = {}`
 *   để mọi máy tính mới đều hiển thị đúng trạng thái đã xóa, tuyệt đối không hồi phục dữ liệu cũ.
 */
export function applyCloudSnapshotToState(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    AppState.subjects = [];
    AppState.students = [];
    AppState.grades = {};
    AppState.languages = {};
    return false;
  }

  // Luôn lấy đúng mảng môn học từ Supabase (kể cả khi mảng rỗng [] sau khi xóa hết môn)
  AppState.subjects = normalizeSubjectsCatalog(Array.isArray(parsed.subjects) ? parsed.subjects : []);

  // Luôn lấy đúng mảng học viên từ Supabase (kể cả khi mảng rỗng [] - 0 bản ghi)
  AppState.students = Array.isArray(parsed.students) ? parsed.students : [];
  enrichStudentsProfile(AppState.students);

  // Luôn cập nhật đúng đối tượng điểm và ngoại ngữ từ Supabase (nếu trống thì gán {})
  AppState.grades = (parsed.grades && typeof parsed.grades === 'object') ? parsed.grades : {};
  AppState.languages = (parsed.languages && typeof parsed.languages === 'object') ? parsed.languages : {};
  AppState.locks = (parsed.locks && typeof parsed.locks === 'object' && Object.keys(parsed.locks).length > 0)
    ? parsed.locks
    : generateInitialLocks();
  AppState.auditLogs = Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [];

  if (parsed.requiredLangStandard) {
    AppState.requiredLangStandard = parsed.requiredLangStandard;
  }
  return true;
}

/**
 * Khởi tạo dữ liệu khi trang vừa tải (DOMContentLoaded):
 * 1. Đặt trạng thái ban đầu là bản trống hoàn toàn (`students: []`, `subjects: []`, `grades: {}`, `languages: {}`).
 * 2. Chờ hàm đọc dữ liệu từ Supabase (`students`, `subjects`, `grades`, `languages`, `unit_settings`) trả về xong rồi mới render bảng.
 * 3. Tuyệt đối KHÔNG tự động sinh dữ liệu mẫu (No Auto-Seeding).
 */
export async function initData() {
  initSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  AppState.subjects = [];
  AppState.students = [];
  AppState.grades = {};
  AppState.languages = {};
  AppState.locks = generateInitialLocks();
  AppState.auditLogs = [];
  AppState.requiredLangStandard = 'A2';
  AppState.isLoadingCloud = true;

  // Render trạng thái đang chờ đồng bộ từ Supabase
  updateAllViews();

  try {
    const cloudData = await loadAllDataFromSupabase(CloudSync.unitRoomId || 'daidoi460');
    if (cloudData && typeof cloudData === 'object') {
      applyCloudSnapshotToState(cloudData);
    }
  } catch (err) {
    console.warn('Lỗi tải dữ liệu ban đầu từ Supabase:', err);
  } finally {
    AppState.isLoadingCloud = false;
    updateAllViews();
  }
}

export function persistData(immediate = false) {
  return pushDataToCloud(immediate);
}

// --- 2. CÔNG CỤ TÍNH ĐIỂM THEO MÔN CHUNG + MÔN CHUYÊN NGÀNH CỦA TỪNG LỚP ---
export function calculateSemesterGPA(studentId, semester) {
  const student = AppState.students.find(s => s.id === studentId);
  const studentClass = student ? student.class : AppState.currentSheetClass;
  const studentGrades = AppState.grades[studentId] || {};
  const semSubjects = getSubjectsForClass(studentClass, semester);
  if (semSubjects.length === 0) return 0;

  let totalPoints = 0;
  let totalCredits = 0;
  semSubjects.forEach(s => {
    const score = studentGrades[s.id];
    if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
      totalPoints += Number(score) * s.credits;
      totalCredits += s.credits;
    }
  });
  return totalCredits > 0 ? (totalPoints / totalCredits) : 0;
}

export function calculateSemesterGPA4(studentId, semester) {
  const student = AppState.students.find(s => s.id === studentId);
  const studentClass = student ? student.class : AppState.currentSheetClass;
  const studentGrades = AppState.grades[studentId] || {};
  const semSubjects = getSubjectsForClass(studentClass, semester);
  if (semSubjects.length === 0) return 0;

  let totalPoints4 = 0;
  let totalCredits = 0;
  semSubjects.forEach(s => {
    const score = studentGrades[s.id];
    if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
      const { scale4 } = getGradeLetterAndScale4(score);
      totalPoints4 += scale4 * s.credits;
      totalCredits += s.credits;
    }
  });
  return totalCredits > 0 ? (totalPoints4 / totalCredits) : 0;
}

export function calculateAcademicYearGPA(studentId, yearNum = 1) {
  const student = AppState.students.find(s => s.id === studentId);
  const studentClass = student ? student.class : AppState.currentSheetClass;
  const studentGrades = AppState.grades[studentId] || {};
  const y = Number(yearNum) || 1;
  const sem1 = 2 * y - 1;
  const sem2 = 2 * y;
  const yearSubjects = [
    ...getSubjectsForClass(studentClass, sem1),
    ...getSubjectsForClass(studentClass, sem2)
  ];
  if (yearSubjects.length === 0) return 0;

  let totalPoints = 0;
  let totalCredits = 0;
  yearSubjects.forEach(s => {
    const score = studentGrades[s.id];
    if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
      totalPoints += Number(score) * s.credits;
      totalCredits += s.credits;
    }
  });
  return totalCredits > 0 ? (totalPoints / totalCredits) : 0;
}

export function calculateAcademicYearGPA4(studentId, yearNum = 1) {
  const student = AppState.students.find(s => s.id === studentId);
  const studentClass = student ? student.class : AppState.currentSheetClass;
  const studentGrades = AppState.grades[studentId] || {};
  const y = Number(yearNum) || 1;
  const sem1 = 2 * y - 1;
  const sem2 = 2 * y;
  const yearSubjects = [
    ...getSubjectsForClass(studentClass, sem1),
    ...getSubjectsForClass(studentClass, sem2)
  ];
  if (yearSubjects.length === 0) return 0;

  let totalPoints4 = 0;
  let totalCredits = 0;
  yearSubjects.forEach(s => {
    const score = studentGrades[s.id];
    if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
      const { scale4 } = getGradeLetterAndScale4(score);
      totalPoints4 += scale4 * s.credits;
      totalCredits += s.credits;
    }
  });
  return totalCredits > 0 ? (totalPoints4 / totalCredits) : 0;
}

export function calculateYearGPA(studentId) {
  const student = AppState.students.find(s => s.id === studentId);
  const studentClass = student ? student.class : AppState.currentSheetClass;
  const studentGrades = AppState.grades[studentId] || {};
  const applicableSubjects = getSubjectsForClass(studentClass);

  let totalPoints = 0;
  let totalCredits = 0;
  applicableSubjects.forEach(s => {
    const score = studentGrades[s.id];
    if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
      totalPoints += Number(score) * s.credits;
      totalCredits += s.credits;
    }
  });
  return totalCredits > 0 ? (totalPoints / totalCredits) : 0;
}

export function calculateCourseGPA10(studentId) {
  return calculateYearGPA(studentId);
}

export function getScale3FromScore10(score10) {
  if (score10 === undefined || score10 === null || score10 === '' || isNaN(score10)) return 0;
  return (Number(score10) / 10) * 3;
}

export function calculateCourseGPA3(studentId) {
  return (calculateYearGPA(studentId) / 10) * 3;
}

export function getSemesterCredits(semester, className = null) {
  return getSubjectsForClass(className, semester).reduce((sum, s) => sum + Number(s.credits || 0), 0);
}

export function getTotalCourseCredits(className = 'OTQS1') {
  return getSubjectsForClass(className).reduce((sum, s) => sum + Number(s.credits || 0), 0);
}

export function setSheetScaleMode(scaleMode) {
  AppState.currentSheetScale = scaleMode === '4' ? '4' : '10';
  const btn10 = document.getElementById('btnSheetScale10');
  const btn4 = document.getElementById('btnSheetScale4');
  if (btn10 && btn4) {
    if (AppState.currentSheetScale === '4') {
      btn4.className = 'px-3 py-1.5 rounded-md text-xs font-extrabold transition bg-blue-700 text-white shadow-sm';
      btn10.className = 'px-3 py-1.5 rounded-md text-xs font-bold transition text-slate-600 hover:text-slate-900';
    } else {
      btn10.className = 'px-3 py-1.5 rounded-md text-xs font-extrabold transition bg-army-800 text-gold-300 shadow-sm';
      btn4.className = 'px-3 py-1.5 rounded-md text-xs font-bold transition text-slate-600 hover:text-slate-900';
    }
  }
  renderSpreadsheet();
}

export function getHighestRussianCertInfo(studentId) {
  const st = AppState.students.find(s => s.id === studentId);
  const l = AppState.languages[studentId] || { lang: 'Tiếng Nga', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT', extraCert: '' };
  const currentLvl = st?.currentLangLevel || l.currentLevel || 'A2';
  const itStd = st?.itStandard || l.itStandard || 'Đạt chuẩn CNTT cơ bản';

  const russianLevelsOrder = [
    { key: 'B12', label: 'B1.2', desc: 'Chuẩn Đầu ra Tốt nghiệp' },
    { key: 'B11', label: 'B1.1', desc: 'Chuẩn Năm thứ 4' },
    { key: 'A22', label: 'A2.2', desc: 'Chuẩn Năm thứ 3' },
    { key: 'A21', label: 'A2.1', desc: 'Chuẩn Năm thứ 2' },
    { key: 'A1',  label: 'A1',   desc: 'Chuẩn Năm thứ 1' }
  ];

  const primaryTitle = `${l.lang || 'Tiếng Nga'}: Mức ${currentLvl}`;
  const primaryStatus = `Chuẩn CNTT: ${itStd}`;

  const detailedLevels = russianLevelsOrder.slice().reverse().map(lvl => {
    const stVal = l[lvl.key] || 'CT';
    return {
      lang: l.lang || 'Tiếng Nga',
      level: lvl.label,
      status: stVal === 'Đ' ? 'Đạt (Đ)' : stVal === 'KĐ' ? 'Không đạt (KĐ)' : 'Chưa thi (CT)',
      passed: stVal === 'Đ'
    };
  });

  const extraCerts = [];
  if (l.extraCert && String(l.extraCert).trim() !== '') {
    extraCerts.push(String(l.extraCert).trim());
  }

  return {
    highestLevel: currentLvl,
    itStandard: itStd,
    primaryTitle,
    primaryStatus,
    detailedLevels,
    extraCerts
  };
}

export function getClassification(gpa) {
  if (gpa >= 8.5) return 'Xuất sắc';
  if (gpa >= 8.0) return 'Giỏi';
  if (gpa >= 7.0) return 'Khá';
  if (gpa >= 6.5) return 'Trung bình Khá';
  if (gpa >= 5.0) return 'Trung bình';
  return 'Yếu';
}

export function getClassificationBadge(rank) {
  switch (rank) {
    case 'Xuất sắc':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300 whitespace-nowrap">Xuất sắc</span>';
    case 'Giỏi':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">Giỏi</span>';
    case 'Khá':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap">Khá</span>';
    case 'Trung bình Khá':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-300 whitespace-nowrap">TB Khá</span>';
    case 'Trung bình':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">Trung bình</span>';
    default:
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap">Yếu</span>';
  }
}

export function getDebtSubjects(studentId, semesterFilter = null, yearFilter = null) {
  const student = AppState.students.find(s => s.id === studentId);
  const studentClass = student ? student.class : AppState.currentSheetClass;
  const studentGrades = AppState.grades[studentId] || {};
  let subjs = getSubjectsForClass(studentClass);

  if (semesterFilter && semesterFilter !== 'all') {
    subjs = subjs.filter(s => Number(s.semester) === Number(semesterFilter));
  } else if (yearFilter && yearFilter !== 'all') {
    const y = Number(yearFilter);
    subjs = subjs.filter(s => Number(s.semester) === (2 * y - 1) || Number(s.semester) === (2 * y));
  }

  const debts = [];
  subjs.forEach(s => {
    const score = studentGrades[s.id];
    if (score !== undefined && score !== null && score !== '' && !isNaN(score) && Number(score) < 4.0) {
      debts.push({ subject: s, score: Number(score) });
    }
  });
  return debts;
}

export function formatFailedSubjectItem(subject) {
  if (!subject) return '';
  return `${subject.name} (${subject.credits} TC)`;
}

export function isCurrentSheetLocked() {
  const key = `${AppState.currentSheetClass}_year_${AppState.currentSheetSemester}`;
  return !!AppState.locks[key];
}

export function canUserEditCurrentSheet() {
  if (AppState.role === 'admin') return true;
  if (AppState.role === 'company_officer') {
    return !isCurrentSheetLocked();
  }
  if (AppState.role && AppState.role.startsWith('class_leader_')) {
    const leaderClass = AppState.role.replace('class_leader_', '');
    if (leaderClass !== AppState.currentSheetClass) return false;
    return !isCurrentSheetLocked();
  }
  return false;
}

// --- 3. TỐI ƯU HÓA THÔNG BÁO KHI LƯU DỮ LIỆU (CHỈ HIỂN THỊ KHI LỖI) ---
export function showToast(message, type = 'error') {
  if (type !== 'error') {
    return;
  }

  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-xs font-bold text-white bg-rose-800 border border-rose-500 transition-all transform duration-300 translate-y-2 opacity-0';
  toast.innerHTML = `
    <svg class="w-4 h-4 flex-shrink-0 text-rose-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
    <span>${message}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3800);
}

// --- 4. GIAO DIỆN BẢNG ĐIỂM: LỚP (THEO NĂM HỌC 1-5) & HỌC VIÊN (CUỘN DỌC NĂM 1-5) ---
export function renderSpreadsheet() {
  const isStudent = AppState.role === 'student';
  const classWrapper = document.getElementById('classSpreadsheetWrapper');
  const studentVerticalWrapper = document.getElementById('studentVerticalGradesWrapper');
  const instructionBanner = document.getElementById('sheetInstructionBanner');

  const btnImport = document.getElementById('btnImportExcel');
  const btnAddCadet = document.getElementById('btnAddCadetModalBtn');
  const btnAddSubj = document.getElementById('btnAddSubjectFromSheetBtn');
  const btnExport = document.getElementById('btnExportClassExcel');
  const sheetClassBox = document.getElementById('sheetClassSelectBox');
  const sheetYearBox = document.getElementById('sheetYearSelectBox');
  const sheetLockBox = document.getElementById('sheetLockBox');

  if (isStudent) {
    if (btnImport) { btnImport.classList.add('hidden'); btnImport.style.display = 'none'; }
    if (btnAddCadet) { btnAddCadet.classList.add('hidden'); btnAddCadet.style.display = 'none'; }
    if (btnAddSubj) { btnAddSubj.classList.add('hidden'); btnAddSubj.style.display = 'none'; }
    if (sheetClassBox) sheetClassBox.classList.add('hidden');
    if (sheetYearBox) sheetYearBox.classList.add('hidden');
    if (sheetLockBox) sheetLockBox.classList.add('hidden');
    if (instructionBanner) instructionBanner.classList.add('hidden');
    if (btnExport) {
      btnExport.innerHTML = `
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <span>Xuất Bảng Điểm Cá Nhân (.xlsx)</span>
      `;
    }
    if (classWrapper) classWrapper.classList.add('hidden');
    if (studentVerticalWrapper) {
      studentVerticalWrapper.classList.remove('hidden');
      renderStudentVerticalGrades();
    }
    return;
  }

  if (btnImport) { btnImport.classList.remove('hidden'); btnImport.style.display = ''; }
  if (btnAddCadet) { btnAddCadet.classList.remove('hidden'); btnAddCadet.style.display = ''; }
  if (btnAddSubj) { btnAddSubj.classList.remove('hidden'); btnAddSubj.style.display = ''; }
  if (sheetClassBox) sheetClassBox.classList.remove('hidden');
  if (sheetYearBox) sheetYearBox.classList.remove('hidden');
  if (sheetLockBox) sheetLockBox.classList.remove('hidden');
  if (instructionBanner) instructionBanner.classList.remove('hidden');
  if (btnExport) {
    btnExport.innerHTML = `
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
      <span>Xuất Excel Lớp</span>
    `;
  }
  if (studentVerticalWrapper) studentVerticalWrapper.classList.add('hidden');
  if (classWrapper) classWrapper.classList.remove('hidden');

  const thead = document.getElementById('spreadsheetThead');
  const tbody = document.getElementById('spreadsheetTbody');
  const tfoot = document.getElementById('spreadsheetTfoot');
  if (!thead || !tbody) return;

  const classScope = getCurrentUserClassScope();
  if (classScope) {
    AppState.currentSheetClass = classScope;
  }
  const selectedClass = AppState.currentSheetClass || 'OTQS1';

  const sheetClassSelect = document.getElementById('sheetClassSelect');
  if (sheetClassSelect) {
    if (classScope) {
      sheetClassSelect.innerHTML = `<option value="${classScope}">Lớp ${classScope}</option>`;
      sheetClassSelect.value = classScope;
      sheetClassSelect.disabled = true;
    } else {
      sheetClassSelect.disabled = false;
      sheetClassSelect.innerHTML =
        `<option value="all" ${selectedClass === 'all' ? 'selected' : ''}>🏢 Toàn bộ Đại đội 460 (Tất cả 5 Lớp)</option>` +
        DEFAULT_CLASSES.map(c => `<option value="${c}" ${c === selectedClass ? 'selected' : ''}>Lớp ${c}</option>`).join('');
    }
  }

  let yearNum = parseInt(AppState.currentSheetSemester, 10);
  if (isNaN(yearNum) || yearNum < 1 || yearNum > 5) {
    yearNum = 1;
    AppState.currentSheetSemester = '1';
  }
  const sheetSemesterSelect = document.getElementById('sheetSemesterSelect');
  if (sheetSemesterSelect && sheetSemesterSelect.value !== String(yearNum)) {
    sheetSemesterSelect.value = String(yearNum);
  }

  const sem1 = 2 * yearNum - 1;
  const sem2 = 2 * yearNum;
  const isScale4 = AppState.currentSheetScale === '4';

  const btnScale10 = document.getElementById('btnSheetScale10');
  const btnScale4 = document.getElementById('btnSheetScale4');
  if (btnScale10 && btnScale4) {
    if (isScale4) {
      btnScale4.className = 'px-3 py-1.5 rounded-md text-xs font-extrabold transition bg-blue-700 text-white shadow-sm';
      btnScale10.className = 'px-3 py-1.5 rounded-md text-xs font-bold transition text-slate-600 hover:text-slate-900';
    } else {
      btnScale10.className = 'px-3 py-1.5 rounded-md text-xs font-extrabold transition bg-army-800 text-gold-300 shadow-sm';
      btnScale4.className = 'px-3 py-1.5 rounded-md text-xs font-bold transition text-slate-600 hover:text-slate-900';
    }
  }

  const classStudents = selectedClass === 'all' ? [...AppState.students] : AppState.students.filter(s => s.class === selectedClass);
  const subsHK1 = getSubjectsForClass(selectedClass, sem1);
  const subsHK2 = getSubjectsForClass(selectedClass, sem2);
  const activeSubjects = [...subsHK1, ...subsHK2];

  const canEdit = canUserEditCurrentSheet();
  const isLocked = isCurrentSheetLocked();

  const lockBadge = document.getElementById('sheetLockBadge');
  const btnToggleLock = document.getElementById('btnToggleLock');
  if (lockBadge && btnToggleLock) {
    if (isLocked) {
      lockBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300';
      lockBadge.innerHTML = `🔒 Sổ điểm Năm ${yearNum}: ĐÃ KHÓA`;
      btnToggleLock.textContent = 'Mở Khóa Sổ';
      btnToggleLock.className = 'text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-1.5 px-3 rounded-lg transition';
    } else {
      lockBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300';
      lockBadge.innerHTML = `🔓 Sổ điểm Năm ${yearNum}: Mở`;
      btnToggleLock.textContent = 'Khóa Sổ Điểm';
      btnToggleLock.className = 'text-xs bg-rose-700 hover:bg-rose-800 text-white font-medium py-1.5 px-3 rounded-lg transition';
    }
    if (AppState.role === 'admin') {
      btnToggleLock.classList.remove('hidden');
    } else {
      btnToggleLock.classList.add('hidden');
    }
  }

  const renderSubjTh = (s) => {
    const isSpec = s.category === 'specialized';
    return `
      <th class="py-2 px-2 text-center min-w-[92px] max-w-[120px] ${isSpec ? 'bg-amber-50/80' : ''} group relative" title="${s.name} (${s.credits} TC • ${isSpec ? 'Môn chuyên ngành ' + s.targetClass : 'Môn chung'})">
        <div class="flex items-center justify-center gap-1">
          <span class="font-bold ${isSpec ? 'text-amber-900' : 'text-slate-800'} truncate">${s.code}</span>
          ${isSpec ? `<span class="px-1 py-0.2 rounded text-[9px] font-black bg-amber-200 text-amber-900">CN</span>` : ''}
        </div>
        <div class="text-[10px] text-slate-600 truncate font-medium">${s.name}</div>
        <div class="text-[9px] text-slate-400 font-normal">(${s.credits} TC)</div>
      </th>
    `;
  };

  let theadHtml = `
    <tr class="divide-x divide-slate-300 bg-army-900 text-white text-[11px] uppercase">
      <th rowspan="2" class="py-2.5 px-2 text-center w-10">STT</th>
      <th rowspan="2" class="py-2.5 px-3 w-28">Mã HV</th>
      <th rowspan="2" class="py-2.5 px-4 min-w-[175px]">Họ và Tên</th>
      <th rowspan="2" class="py-2.5 px-2 text-center w-24">Ngày sinh</th>
      <th colspan="${Math.max(1, subsHK1.length) + 1}" class="py-1.5 px-2 text-center bg-army-800 text-gold-300 font-bold border-b border-army-700">
        <div class="flex items-center justify-center gap-2 flex-wrap">
          <span>Học Kỳ 1 - Năm Thứ ${yearNum} (Kỳ ${sem1})</span>
          ${(canEdit && subsHK1.length > 0) ? `<button type="button" class="btn-clear-sem-subjects text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded shadow-sm transition cursor-pointer normal-case" data-sem="${sem1}" title="Xóa tất cả các môn trong Học kỳ ${sem1}">🗑️ Xóa hết môn Kỳ ${sem1}</button>` : ''}
        </div>
      </th>
      <th colspan="${Math.max(1, subsHK2.length) + 1}" class="py-1.5 px-2 text-center bg-slate-800 text-emerald-300 font-bold border-b border-slate-700">
        <div class="flex items-center justify-center gap-2 flex-wrap">
          <span>Học Kỳ 2 - Năm Thứ ${yearNum} (Kỳ ${sem2})</span>
          ${(canEdit && subsHK2.length > 0) ? `<button type="button" class="btn-clear-sem-subjects text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white px-2 py-0.5 rounded shadow-sm transition cursor-pointer normal-case" data-sem="${sem2}" title="Xóa tất cả các môn trong Học kỳ ${sem2}">🗑️ Xóa hết môn Kỳ ${sem2}</button>` : ''}
        </div>
      </th>
      <th rowspan="2" class="py-2.5 px-3 text-center bg-gold-500 text-slate-950 font-black min-w-[130px]">
        Điểm trung bình<br>1 năm học (${isScale4 ? 'Hệ 4' : 'Hệ 10'})
      </th>
      <th rowspan="2" class="py-2.5 px-3 text-center bg-army-800 text-gold-300 font-bold min-w-[120px]">
        Xếp loại<br>năm đấy
      </th>
    </tr>
    <tr class="divide-x divide-slate-300 bg-slate-100 text-slate-700">
      ${subsHK1.length > 0 ? subsHK1.map(renderSubjTh).join('') : '<th class="py-2 px-2 text-center text-slate-400 italic">Chưa có môn</th>'}
      <th class="py-2 px-2 text-center bg-army-100 text-army-900 font-extrabold min-w-[78px]">ĐTB HK1</th>
      ${subsHK2.length > 0 ? subsHK2.map(renderSubjTh).join('') : '<th class="py-2 px-2 text-center text-slate-400 italic">Chưa có môn</th>'}
      <th class="py-2 px-2 text-center bg-emerald-100 text-emerald-900 font-extrabold min-w-[78px]">ĐTB HK2</th>
    </tr>
  `;
  thead.innerHTML = theadHtml;

  let tbodyHtml = '';
  const subjectSums = {};
  const subjectCounts = {};
  activeSubjects.forEach(s => {
    subjectSums[s.id] = 0;
    subjectCounts[s.id] = 0;
  });

  let totalYearGpaSum = 0;
  let totalHk1Sum = 0;
  let totalHk2Sum = 0;

  if (AppState.isLoadingCloud) {
    tbodyHtml = `<tr><td colspan="25" class="py-12 text-center text-army-700 font-bold animate-pulse">⏳ Đang tải dữ liệu thực tế từ cơ sở dữ liệu đám mây Supabase (wxiimjbseovuxmvolswh)...</td></tr>`;
  } else if (classStudents.length === 0) {
    tbodyHtml = `<tr><td colspan="25" class="py-12 text-center text-slate-400 font-medium">${selectedClass === 'all' ? 'Đại đội 460 hiện chưa có dữ liệu học viên (0 đồng chí).' : 'Lớp ' + selectedClass + ' hiện chưa có dữ liệu học viên.'} Bấm <strong>"+ Thêm Học Viên Thủ Công"</strong> hoặc <strong>"Nhập nhanh từ Excel"</strong> để thêm mới.</td></tr>`;
  } else {
    classStudents.forEach((student, sIdx) => {
      const studentGrades = AppState.grades[student.id] || {};
      const hk1Gpa10 = calculateSemesterGPA(student.id, sem1);
      const hk2Gpa10 = calculateSemesterGPA(student.id, sem2);
      const yearGpa10 = calculateAcademicYearGPA(student.id, yearNum);

      const hk1Gpa4 = calculateSemesterGPA4(student.id, sem1);
      const hk2Gpa4 = calculateSemesterGPA4(student.id, sem2);
      const yearGpa4 = calculateAcademicYearGPA4(student.id, yearNum);

      const dispHk1 = isScale4 ? hk1Gpa4 : hk1Gpa10;
      const dispHk2 = isScale4 ? hk2Gpa4 : hk2Gpa10;
      const dispYear = isScale4 ? yearGpa4 : yearGpa10;

      totalHk1Sum += dispHk1;
      totalHk2Sum += dispHk2;
      totalYearGpaSum += dispYear;

      const yearRank = getClassification(yearGpa10);

      let colCounter = 0;
      const renderScoreCell = (subj) => {
        const subColIdx = colCounter++;
        const isApplicable = doesSubjectApplyToClass(subj, student.class);
        if (!isApplicable) {
          return `<td class="p-0 text-center bg-slate-100/80 text-slate-300 text-[10px] select-none" title="Môn chuyên ngành riêng của Lớp ${subj.targetClass}">-</td>`;
        }
        const score = studentGrades[subj.id] !== undefined ? studentGrades[subj.id] : '';
        const isFail = score !== '' && !isNaN(score) && Number(score) < 4.0;
        const { letter, scale4 } = getGradeLetterAndScale4(score);

        if (score !== '' && !isNaN(score)) {
          subjectSums[subj.id] += isScale4 ? Number(scale4) : Number(score);
          subjectCounts[subj.id]++;
        }

        if (isScale4) {
          return `
            <td class="p-0 text-center ${isFail ? 'bg-rose-50 text-rose-700 font-bold' : 'bg-blue-50/20 text-blue-900'}">
              <input type="text" value="${score !== '' && !isNaN(score) ? `${scale4.toFixed(1)} (${letter})` : '-'}" disabled readonly
                class="w-full h-8 text-center text-xs font-bold bg-transparent border-0 cursor-default select-none ${isFail ? 'text-rose-700' : 'text-blue-800'}" />
            </td>
          `;
        } else if (canEdit) {
          return `
            <td class="p-0 text-center relative ${isFail ? 'bg-rose-50 text-rose-700 font-bold' : ''}">
              <input type="text"
                data-student="${student.id}"
                data-subject="${subj.id}"
                data-row="${sIdx}"
                data-col="${subColIdx}"
                value="${score !== '' ? Number(score).toFixed(1) : ''}"
                class="grid-cell-input w-full h-8 text-center text-xs font-semibold bg-transparent border-0 focus:outline-none transition"
                maxlength="4" />
            </td>
          `;
        } else {
          return `
            <td class="p-0 text-center ${isFail ? 'bg-rose-50 text-rose-700 font-bold' : 'text-slate-800'}">
              <input type="text" value="${score !== '' ? Number(score).toFixed(1) : '-'}" disabled readonly
                class="w-full h-8 text-center text-xs font-semibold bg-slate-50/70 text-slate-700 border-0 cursor-not-allowed select-none" />
            </td>
          `;
        }
      };

      tbodyHtml += `
        <tr class="divide-x divide-slate-200 hover:bg-slate-50 transition" data-student-id="${student.id}">
          <td class="py-2 px-2 text-center font-medium text-slate-500">${sIdx + 1}</td>
          <td class="py-2 px-3 font-mono font-semibold text-slate-700">${student.code}</td>
          <td class="py-2 px-4 font-semibold text-slate-900 flex items-center justify-between gap-2">
            <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline font-bold text-left" data-id="${student.id}" title="Nhấp để xem trang chi tiết quân nhân">${student.name}</button>
            <span class="text-[10px] text-slate-400 font-normal whitespace-nowrap">${selectedClass === 'all' ? `<strong class="text-army-700">[${student.class}]</strong> ` : ''}${student.rank}</span>
          </td>
          <td class="py-2 px-2 text-center text-slate-600 text-[11px] whitespace-nowrap">${formatVN(student.dob)}</td>
          ${subsHK1.length > 0 ? subsHK1.map(renderScoreCell).join('') : '<td class="text-center text-slate-300">-</td>'}
          <td class="py-2 px-2 text-center font-bold text-army-900 bg-army-50/70 cell-hk1-gpa">${dispHk1.toFixed(2)}</td>
          ${subsHK2.length > 0 ? subsHK2.map(renderScoreCell).join('') : '<td class="text-center text-slate-300">-</td>'}
          <td class="py-2 px-2 text-center font-bold text-emerald-900 bg-emerald-50/70 cell-hk2-gpa">${dispHk2.toFixed(2)}</td>
          <td class="py-2 px-3 text-center font-black text-sm ${isScale4 ? 'text-blue-900 bg-blue-50' : 'text-army-900 bg-gold-100/70'} cell-year-gpa">${dispYear.toFixed(2)}</td>
          <td class="py-2 px-3 text-center cell-year-rank">${getClassificationBadge(yearRank)}</td>
        </tr>
      `;
    });
  }
  tbody.innerHTML = tbodyHtml;

  if (classStudents.length === 0) {
    tfoot.innerHTML = `<tr><td colspan="100%" class="py-2.5 px-3 text-center text-slate-400 text-xs italic">Quân số lớp ${selectedClass}: 0 đồng chí</td></tr>`;
  } else {
    const avgHk1 = (totalHk1Sum / classStudents.length).toFixed(2);
    const avgHk2 = (totalHk2Sum / classStudents.length).toFixed(2);
    const avgYear = (totalYearGpaSum / classStudents.length).toFixed(2);

    const renderAvgTd = (s) => {
      const avg = subjectCounts[s.id] > 0 ? (subjectSums[s.id] / subjectCounts[s.id]).toFixed(2) : '-';
      return `<td class="py-2.5 px-2 text-center text-slate-800 font-bold">${avg}</td>`;
    };

    tfoot.innerHTML = `
      <tr class="divide-x divide-slate-300 bg-slate-100">
        <td colspan="4" class="py-2.5 px-4 text-right uppercase text-slate-700 font-bold tracking-wider">ĐIỂM TRUNG BÌNH ${selectedClass === 'all' ? 'TOÀN ĐẠI ĐỘI 460' : 'LỚP ' + selectedClass} (NĂM THỨ ${yearNum}):</td>
        ${subsHK1.length > 0 ? subsHK1.map(renderAvgTd).join('') : '<td>-</td>'}
        <td class="py-2.5 px-2 text-center font-black text-army-900 bg-army-100/70">${avgHk1}</td>
        ${subsHK2.length > 0 ? subsHK2.map(renderAvgTd).join('') : '<td>-</td>'}
        <td class="py-2.5 px-2 text-center font-black text-emerald-900 bg-emerald-100/70">${avgHk2}</td>
        <td class="py-2.5 px-3 text-center font-black text-sm text-army-950 bg-gold-200/80">${avgYear}</td>
        <td class="py-2.5 px-3 text-center text-[11px] text-slate-600 font-semibold">Quân số: ${classStudents.length} đ/c</td>
      </tr>
    `;
  }

  if (canEdit) {
    attachSpreadsheetGridEvents();
  }
}

export function renderStudentVerticalGrades() {
  const container = document.getElementById('studentVerticalGradesWrapper');
  if (!container) return;

  const student = getLoggedInStudent() || AppState.students.find(s => s.id === AppState.studentViewingId) || AppState.students[0];
  if (!student) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400">Không tìm thấy thông tin bảng điểm học viên.</div>`;
    return;
  }

  const studentGrades = AppState.grades[student.id] || {};
  const isScale4 = AppState.currentSheetScale === '4';
  const yearNames = {
    1: 'NĂM THỨ NHẤT (NĂM 1)',
    2: 'NĂM THỨ HAI (NĂM 2)',
    3: 'NĂM THỨ BA (NĂM 3)',
    4: 'NĂM THỨ TƯ (NĂM 4)',
    5: 'NĂM THỨ NĂM (NĂM 5 - TỐT NGHIỆP)'
  };

  const renderSemesterSubjectsGrid = (semNumber, termLabel) => {
    const subs = getSubjectsForClass(student.class, semNumber);
    const semGpa10 = calculateSemesterGPA(student.id, semNumber);
    const semGpa4 = calculateSemesterGPA4(student.id, semNumber);
    const semCreds = subs.reduce((sum, s) => sum + s.credits, 0);

    const subjCards = subs.map(s => {
      const sc = studentGrades[s.id];
      const hasScore = sc !== undefined && sc !== null && sc !== '' && !isNaN(sc);
      const isFail = hasScore && Number(sc) < 4.0;
      const { letter, scale4 } = getGradeLetterAndScale4(sc);
      const dispScore = !hasScore ? '-' : isScale4 ? `${scale4.toFixed(1)} (${letter})` : Number(sc).toFixed(1);
      const isSpec = s.category === 'specialized';

      return `
        <div class="p-3 rounded-lg border ${isFail ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200'} shadow-sm flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-mono font-bold text-[11px] text-army-800">${s.code}</span>
              <span class="px-1.5 py-0.2 rounded text-[9px] font-bold ${isSpec ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600'}">
                ${isSpec ? 'Chuyên ngành ' + student.class : 'Môn chung'}
              </span>
              <span class="text-[10px] text-slate-400 font-semibold">(${s.credits} TC)</span>
            </div>
            <div class="text-xs font-bold text-slate-900 truncate mt-0.5" title="${s.name}">${s.name}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="text-sm font-black ${isFail ? 'text-rose-700' : isScale4 ? 'text-blue-800' : 'text-army-900'}">${dispScore}</div>
            <div class="text-[10px] font-semibold ${isFail ? 'text-rose-600' : 'text-emerald-600'}">${!hasScore ? 'Chưa có' : isFail ? 'Rớt (< 4.0)' : 'Đạt'}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="p-4 bg-slate-50/70 border-b border-slate-200 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-md bg-army-800 text-gold-300 font-extrabold text-xs uppercase">${termLabel} (Học kỳ ${semNumber})</span>
            <span class="text-xs text-slate-500 font-medium">${subs.length} môn học • ${semCreds} tín chỉ</span>
          </div>
          <div class="text-xs font-bold text-slate-700 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm">
            ĐTB: <strong class="text-army-900 text-sm">${(isScale4 ? semGpa4 : semGpa10).toFixed(2)}</strong>
            <span class="text-[11px] text-slate-400 ml-1">(Hệ 10: ${semGpa10.toFixed(2)} • Hệ 4: ${semGpa4.toFixed(2)})</span>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          ${subjCards || '<div class="text-xs text-slate-400 italic col-span-3">Chưa có môn học trong học kỳ này.</div>'}
        </div>
      </div>
    `;
  };

  let blocksHtml = '';
  for (let y = 1; y <= 5; y++) {
    const sem1 = 2 * y - 1;
    const sem2 = 2 * y;
    const yearGpa10 = calculateAcademicYearGPA(student.id, y);
    const yearGpa4 = calculateAcademicYearGPA4(student.id, y);
    const yearRank = getClassification(yearGpa10);
    const yearDebts = getDebtSubjects(student.id, null, y);

    blocksHtml += `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="bg-gradient-to-r from-army-900 to-army-800 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b-2 border-gold-500">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-gold-500 text-slate-950 font-black text-xs flex items-center justify-center">N${y}</span>
            <div>
              <h4 class="text-sm font-black uppercase tracking-wide text-gold-300">${yearNames[y]}</h4>
              <p class="text-[11px] text-slate-300">Lớp ${student.class} • Gồm Học kỳ 1 (Kỳ ${sem1}) & Học kỳ 2 (Kỳ ${sem2})</p>
            </div>
          </div>
          <span class="text-xs font-bold px-3 py-1 rounded-full bg-army-950/60 text-gold-300 border border-gold-500/40">
            Khối Năm Học Thứ ${y}
          </span>
        </div>

        <!-- HÀNG 1: Các môn học và điểm số của Học kỳ 1 -->
        ${renderSemesterSubjectsGrid(sem1, 'Hàng 1 — Học Kỳ 1')}

        <!-- HÀNG 2: Các môn học và điểm số của Học kỳ 2 -->
        ${renderSemesterSubjectsGrid(sem2, 'Hàng 2 — Học Kỳ 2')}

        <!-- HÀNG 3: Điểm tổng kết năm (Điểm trung bình năm học) và Xếp loại của năm đó -->
        <div class="p-4 bg-amber-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-md bg-gold-500 text-slate-950 font-black text-xs uppercase">Hàng 3 — Điểm Tổng Kết Năm Thứ ${y}</span>
            ${yearDebts.length > 0
              ? `<span class="text-xs font-bold text-rose-700">⚠️ Học phần rớt: ${yearDebts.map(d => formatFailedSubjectItem(d.subject)).join(', ')}</span>`
              : `<span class="text-xs font-semibold text-emerald-700">✅ Hoàn thành 100% học phần Năm thứ ${y}</span>`
            }
          </div>
          <div class="flex flex-wrap items-center gap-4">
            <div class="text-xs font-bold text-slate-700">
              Điểm trung bình năm học:
              <span class="text-lg font-black text-army-900 ml-1">${(isScale4 ? yearGpa4 : yearGpa10).toFixed(2)}</span>
              <span class="text-[11px] text-slate-500">(Hệ 10: ${yearGpa10.toFixed(2)} | Hệ 4: ${yearGpa4.toFixed(2)})</span>
            </div>
            <div class="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span>Xếp loại năm:</span>
              ${getClassificationBadge(yearRank)}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = `<div class="space-y-6">${blocksHtml}</div>`;
}

export function attachSpreadsheetGridEvents() {
  const inputs = document.querySelectorAll('.grid-cell-input');

  inputs.forEach(input => {
    input.addEventListener('focus', function() {
      this.dataset.originalVal = this.value;
      this.select();
    });

    input.addEventListener('keydown', function(e) {
      const row = parseInt(this.dataset.row);
      const col = parseInt(this.dataset.col);

      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        const next = document.querySelector(`.grid-cell-input[data-row="${row + 1}"][data-col="${col}"]`);
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = document.querySelector(`.grid-cell-input[data-row="${row - 1}"][data-col="${col}"]`);
        if (prev) prev.focus();
      } else if (e.key === 'ArrowRight' || e.key === 'Tab') {
        if (e.key === 'ArrowRight' && this.selectionEnd < this.value.length) return;
        e.preventDefault();
        const nextCol = document.querySelector(`.grid-cell-input[data-row="${row}"][data-col="${col + 1}"]`);
        if (nextCol) nextCol.focus();
      } else if (e.key === 'ArrowLeft') {
        if (this.selectionStart > 0) return;
        e.preventDefault();
        const prevCol = document.querySelector(`.grid-cell-input[data-row="${row}"][data-col="${col - 1}"]`);
        if (prevCol) prevCol.focus();
      }
    });

    input.addEventListener('change', function() {
      handleGradeChange(this);
    });
  });
}

export function handleGradeChange(inputEl) {
  if (!canUserEditCurrentSheet()) {
    showToast('Bạn không có quyền chỉnh sửa điểm số của lớp này!', 'error');
    inputEl.value = inputEl.dataset.originalVal || '';
    return;
  }
  let rawVal = inputEl.value.trim().replace(',', '.');
  const origVal = inputEl.dataset.originalVal || '';
  const studentId = inputEl.dataset.student;
  const subjectId = inputEl.dataset.subject;

  if (rawVal === '') {
    if (AppState.grades[studentId]) {
      delete AppState.grades[studentId][subjectId];
    }
    deleteGradeFromSupabase(studentId, subjectId);
    logAuditTrail(studentId, subjectId, origVal, 'Trống', 'Xóa điểm trên Supabase');
    persistData(true);
    renderSpreadsheet();
    updateAllViews();
    return;
  }

  const num = parseFloat(rawVal);
  if (isNaN(num) || num < 0.0 || num > 10.0) {
    showToast('Điểm không hợp lệ! Vui lòng nhập số từ 0.0 đến 10.0', 'error');
    inputEl.value = origVal;
    return;
  }

  const rounded = Math.round(num * 10) / 10;
  inputEl.value = rounded.toFixed(1);

  if (!AppState.grades[studentId]) {
    AppState.grades[studentId] = {};
  }
  AppState.grades[studentId][subjectId] = rounded;
  upsertGradeToSupabase(studentId, subjectId, rounded);

  if (origVal !== rounded.toFixed(1)) {
    logAuditTrail(studentId, subjectId, origVal, rounded.toFixed(1), 'Cập nhật điểm trực tiếp lên Supabase');
  }

  persistData(true);
  renderSpreadsheet();
  updateAllViews();
}

export function logAuditTrail(studentId, subjectId, oldVal, newVal, reason) {
  const student = AppState.students.find(s => s.id === studentId);
  const subject = AppState.subjects.find(s => s.id === subjectId);
  const now = new Date();
  const timestamp = now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0') + ' ' +
    String(now.getHours()).padStart(2, '0') + ':' +
    String(now.getMinutes()).padStart(2, '0') + ':' +
    String(now.getSeconds()).padStart(2, '0');

  let actor = AppState.currentUser?.displayName || 'Chỉ huy Đại đội (Admin)';
  if (AppState.role && AppState.role.startsWith('class_leader_')) {
    const cls = AppState.role.replace('class_leader_', '');
    actor = `Tài khoản Lớp ${cls}`;
  }

  AppState.auditLogs.unshift({
    timestamp,
    actor,
    student: student ? `${student.name} (${student.code})` : studentId,
    class: student ? student.class : (getCurrentUserClassScope() || 'Toàn ĐĐ'),
    subject: subject ? subject.code : subjectId,
    oldVal: oldVal || 'Chưa có',
    newVal: newVal,
    reason: reason || 'Chỉnh sửa dữ liệu'
  });

  if (AppState.auditLogs.length > 200) {
    AppState.auditLogs.pop();
  }
}

// --- 5. TỔNG HỢP TOÀN ĐẠI ĐỘI (CÓ BỘ LỌC THEO KỲ & BỎ CỘT ĐIỂM RÈN LUYỆN) ---
export function renderMasterTable() {
  const tbody = document.getElementById('masterTableBody');
  const footer = document.getElementById('masterTableFooter');
  if (!tbody) return;
  const filters = AppState.masterFilters;

  const classScope = getCurrentUserClassScope();
  const masterClassSelect = document.getElementById('masterFilterClass');
  if (masterClassSelect) {
    if (classScope) {
      masterClassSelect.innerHTML = `<option value="${classScope}">Lớp ${classScope}</option>`;
      masterClassSelect.value = classScope;
      masterClassSelect.disabled = true;
      filters.class = classScope;
    } else {
      masterClassSelect.disabled = false;
    }
  }

  const semFilter = document.getElementById('masterFilterSemester')?.value || filters.semester || 'all';
  filters.semester = semFilter;

  const thSemCol = document.getElementById('masterThScoreLabel');
  if (thSemCol) {
    thSemCol.textContent = semFilter === 'all' ? 'ĐTB Toàn Khóa' : `ĐTB Học Kỳ ${semFilter}`;
  }

  let filtered = getScopedStudents();

  if (filters.class && filters.class !== 'all') {
    filtered = filtered.filter(s => s.class === filters.class);
  }

  const getStudentTargetGpa = (sid) => {
    if (semFilter !== 'all') {
      return calculateSemesterGPA(sid, Number(semFilter));
    }
    return calculateYearGPA(sid);
  };

  if (filters.rank && filters.rank !== 'all') {
    filtered = filtered.filter(s => getClassification(getStudentTargetGpa(s.id)) === filters.rank);
  }

  if (filters.debt === 'debt_only') {
    filtered = filtered.filter(s => getDebtSubjects(s.id, semFilter).length > 0);
  } else if (filters.debt === 'no_debt') {
    filtered = filtered.filter(s => getDebtSubjects(s.id, semFilter).length === 0);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase().trim();
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.code.toLowerCase().includes(q)
    );
  }

  filtered.sort((a, b) => getStudentTargetGpa(b.id) - getStudentTargetGpa(a.id));

  let html = '';
  filtered.forEach((student, idx) => {
    const gpa1 = calculateSemesterGPA(student.id, 1);
    const gpa2 = calculateSemesterGPA(student.id, 2);
    const targetGpa = getStudentTargetGpa(student.id);
    const rank = getClassification(targetGpa);
    const debts = getDebtSubjects(student.id, semFilter);

    html += `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-3 text-center text-slate-500 font-medium">${idx + 1}</td>
        <td class="py-2.5 px-3 font-mono font-bold">
          <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline" data-id="${student.id}">${student.code}</button>
        </td>
        <td class="py-2.5 px-4 font-bold text-slate-900">
          <button type="button" class="btn-view-cadet-detail hover:text-army-800 hover:underline text-left font-bold" data-id="${student.id}">${student.name}</button>
        </td>
        <td class="py-2.5 px-2 text-center text-slate-600">${student.rank}</td>
        <td class="py-2.5 px-3 text-center font-bold text-army-800">${student.class}</td>
        <td class="py-2.5 px-3 text-center text-slate-500 text-[11px]">${formatVN(student.dob)}</td>
        <td class="py-2.5 px-3 text-center font-semibold text-slate-700 bg-slate-50">${gpa1.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center font-semibold text-slate-700 bg-slate-50">${gpa2.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center font-black text-army-800 bg-gold-50">${targetGpa.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center">${getClassificationBadge(rank)}</td>
        <td class="py-2.5 px-3 text-center">
          ${debts.length > 0 ?
            `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700" title="${debts.map(d => formatFailedSubjectItem(d.subject)).join(', ')}">⚠️ Rớt: ${debts.map(d => formatFailedSubjectItem(d.subject)).join(', ')}</span>` :
            `<span class="text-emerald-700 font-bold text-[11px]">✅ Đạt chuẩn</span>`
          }
        </td>
        <td class="py-2.5 px-3 text-center">
          <button type="button" class="btn-view-cadet-detail text-xs text-army-700 hover:text-army-900 font-semibold underline" data-id="${student.id}">
            Xem chi tiết
          </button>
        </td>
      </tr>
    `;
  });

  if (filtered.length === 0) {
    html = `<tr><td colspan="12" class="py-8 text-center text-slate-400">Không tìm thấy học viên nào phù hợp với bộ lọc hiện tại.</td></tr>`;
  }
  tbody.innerHTML = html;

  if (footer) {
    const scopeTotal = getScopedStudents().length;
    const semLabel = semFilter === 'all' ? 'Toàn khóa (10 Học kỳ)' : `Học kỳ ${semFilter}`;
    footer.innerHTML = `
      <span>Hiển thị <strong>${filtered.length}</strong> / ${scopeTotal} học viên • Bộ lọc kỳ: <strong>${semLabel}</strong></span>
      <span class="text-[11px] text-slate-500">Đại đội 460 • Tiểu đoàn 4</span>
    `;
  }
}

// --- 6. BÁO CÁO GIAO BAN (RỚT MÔN < 4.0 ĐỊNH DẠNG [Tên môn] ([Số tín chỉ] TC) & XÓA ĐIỂM RÈN LUYỆN) ---
export function renderDashboard() {
  const elTotal = document.getElementById('statTotalCadets');
  if (!elTotal) return;

  const scopedStudents = getScopedStudents();
  const classScope = getCurrentUserClassScope();
  const visibleClasses = classScope ? [classScope] : DEFAULT_CLASSES;

  const totalCadets = scopedStudents.length;
  elTotal.textContent = totalCadets;

  let totalYearGpaSum = 0;
  let goodCount = 0;
  let debtStudentCount = 0;
  let totalDebtFailsCount = 0;

  const rankCounts = {
    'Xuất sắc': 0,
    'Giỏi': 0,
    'Khá': 0,
    'Trung bình Khá': 0,
    'Trung bình': 0,
    'Yếu': 0
  };

  const classStats = {};
  visibleClasses.forEach(c => {
    classStats[c] = {
      count: 0,
      totalGpa: 0,
      xs: 0,
      gioi: 0,
      kha: 0,
      tbk: 0,
      tb: 0,
      yeu: 0,
      debtStudents: 0,
      totalFails: 0
    };
  });

  const debtCadetsList = [];

  scopedStudents.forEach(s => {
    const yearGpa = calculateYearGPA(s.id);
    totalYearGpaSum += yearGpa;
    const rank = getClassification(yearGpa);
    if (rankCounts[rank] !== undefined) rankCounts[rank]++;

    if (rank === 'Xuất sắc' || rank === 'Giỏi') {
      goodCount++;
    }

    const debts = getDebtSubjects(s.id);
    const hasDebt = debts.length > 0;
    if (hasDebt) {
      debtStudentCount++;
      totalDebtFailsCount += debts.length;
      debtCadetsList.push({
        student: s,
        yearGpa: yearGpa,
        rank: rank,
        debts: debts,
        failCount: debts.length
      });
    }

    const cs = classStats[s.class];
    if (cs) {
      cs.count++;
      cs.totalGpa += yearGpa;
      if (rank === 'Xuất sắc') cs.xs++;
      else if (rank === 'Giỏi') cs.gioi++;
      else if (rank === 'Khá') cs.kha++;
      else if (rank === 'Trung bình Khá') cs.tbk++;
      else if (rank === 'Trung bình') cs.tb++;
      else cs.yeu++;

      if (hasDebt) {
        cs.debtStudents++;
        cs.totalFails += debts.length;
      }
    }
  });

  const avgCompanyGpa = totalCadets > 0 ? (totalYearGpaSum / totalCadets).toFixed(2) : '0.00';
  const goodRate = totalCadets > 0 ? ((goodCount / totalCadets) * 100).toFixed(1) : '0.0';

  const elAvg = document.getElementById('statAvgGPA');
  if (elAvg) elAvg.textContent = avgCompanyGpa;
  const elGoodRate = document.getElementById('statGoodRate');
  if (elGoodRate) elGoodRate.textContent = `${goodRate}%`;
  const elGoodCount = document.getElementById('statGoodCount');
  if (elGoodCount) elGoodCount.textContent = `${goodCount} / ${totalCadets} học viên (ĐTB ≥ 8.00)`;
  const elDebtCount = document.getElementById('statDebtCount');
  if (elDebtCount) elDebtCount.textContent = debtStudentCount;
  const elDebtFails = document.getElementById('statDebtTotalFails');
  if (elDebtFails) elDebtFails.textContent = totalDebtFailsCount;

  const companyTbody = document.getElementById('reportCompanyTableBody');
  const companyTfoot = document.getElementById('reportCompanyTableFooter');
  if (companyTbody) {
    const rankMeta = [
      { name: 'Xuất sắc', standard: 'ĐTB ≥ 8.50', desc: 'Đạt danh hiệu Học viên Giỏi / Chiến sĩ thi đua', badge: 'bg-purple-100 text-purple-900 border-purple-300' },
      { name: 'Giỏi', standard: 'ĐTB: 8.00 - 8.49', desc: 'Đạt danh hiệu Học viên Khá Giỏi tiêu biểu', badge: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
      { name: 'Khá', standard: 'ĐTB: 7.00 - 7.99', desc: 'Học lực vững chắc, an tâm công tác', badge: 'bg-blue-100 text-blue-900 border-blue-300' },
      { name: 'Trung bình Khá', standard: 'ĐTB: 6.50 - 6.99', desc: 'Đạt chuẩn tiếp thu kiến thức chuyên ngành', badge: 'bg-cyan-100 text-cyan-900 border-cyan-300' },
      { name: 'Trung bình', standard: 'ĐTB: 5.00 - 6.49', desc: 'Cần duy trì nền nếp tự học', badge: 'bg-amber-100 text-amber-900 border-amber-300' },
      { name: 'Yếu', standard: 'ĐTB < 5.00', desc: 'Cần kèm cặp phụ đạo và ôn thi lại', badge: 'bg-rose-100 text-rose-900 border-rose-300' }
    ];

    companyTbody.innerHTML = rankMeta.map((item, idx) => {
      const count = rankCounts[item.name] || 0;
      const rate = totalCadets > 0 ? ((count / totalCadets) * 100).toFixed(1) : '0.0';
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 text-center text-slate-500 font-medium">${idx + 1}</td>
          <td class="py-2.5 px-4 font-bold text-slate-900">
            <span class="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold border ${item.badge}">${item.name}</span>
          </td>
          <td class="py-2.5 px-4 text-center font-mono font-semibold text-slate-700 bg-slate-50/60">${item.standard}</td>
          <td class="py-2.5 px-4 text-center font-extrabold text-sm text-slate-900">${count} đ/c</td>
          <td class="py-2.5 px-4 text-center font-black text-sm text-army-800">${rate}%</td>
          <td class="py-2.5 px-4 text-slate-600">${item.desc}</td>
        </tr>
      `;
    }).join('');

    if (companyTfoot) {
      const failStudentRate = totalCadets > 0 ? ((debtStudentCount / totalCadets) * 100).toFixed(1) : '0.0';
      companyTfoot.innerHTML = `
        <tr class="bg-slate-100 border-t-2 border-slate-300 text-slate-900">
          <td colspan="3" class="py-3 px-4 uppercase text-army-900 font-black">TỔNG QUÂN SỐ:</td>
          <td class="py-3 px-4 text-center text-army-800 text-base font-black">${totalCadets} đ/c</td>
          <td class="py-3 px-4 text-center text-army-800 text-base font-black">100.0%</td>
          <td class="py-3 px-4 text-slate-800">
            <div class="flex flex-wrap items-center gap-3">
              <span>ĐTB Chung: <strong class="text-army-800 font-black text-sm">${avgCompanyGpa}/10</strong></span>
              <span class="text-slate-300">|</span>
              <span class="text-rose-700">HV rớt môn (&lt; 4.0): <strong class="font-black text-rose-800">${debtStudentCount} đ/c (${failStudentRate}%)</strong></span>
              <span class="text-slate-300">|</span>
              <span class="text-rose-700">Tổng lượt rớt: <strong class="font-black text-rose-800">${totalDebtFailsCount} học phần</strong></span>
            </div>
          </td>
        </tr>
      `;
    }
  }

  const classTbody = document.getElementById('reportClassTableBody');
  const classTfoot = document.getElementById('reportClassTableFooter');
  if (classTbody) {
    classTbody.innerHTML = visibleClasses.map((clsName, idx) => {
      const cs = classStats[clsName] || { count: 0, totalGpa: 0, xs: 0, gioi: 0, kha: 0, tbk: 0, tb: 0, yeu: 0, debtStudents: 0, totalFails: 0 };
      const cCount = cs.count;
      const cGpa = cCount > 0 ? (cs.totalGpa / cCount).toFixed(2) : '0.00';
      const rXs = cCount > 0 ? ((cs.xs / cCount) * 100).toFixed(1) : '0.0';
      const rGioi = cCount > 0 ? ((cs.gioi / cCount) * 100).toFixed(1) : '0.0';
      const rKha = cCount > 0 ? ((cs.kha / cCount) * 100).toFixed(1) : '0.0';
      const rTbk = cCount > 0 ? ((cs.tbk / cCount) * 100).toFixed(1) : '0.0';
      const rTb = cCount > 0 ? ((cs.tb / cCount) * 100).toFixed(1) : '0.0';
      const rYeu = cCount > 0 ? ((cs.yeu / cCount) * 100).toFixed(1) : '0.0';
      const rDebt = cCount > 0 ? ((cs.debtStudents / cCount) * 100).toFixed(1) : '0.0';

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-2 text-center text-slate-500 font-medium">${idx + 1}</td>
          <td class="py-2.5 px-3 font-bold text-army-800 text-sm">${clsName}</td>
          <td class="py-2.5 px-2 text-center font-extrabold text-slate-900">${cCount}</td>
          <td class="py-2.5 px-2 text-center font-semibold text-purple-900 bg-purple-50/30">${cs.xs} <span class="text-[10px] text-slate-500 font-normal">(${rXs}%)</span></td>
          <td class="py-2.5 px-2 text-center font-semibold text-emerald-900 bg-emerald-50/30">${cs.gioi} <span class="text-[10px] text-slate-500 font-normal">(${rGioi}%)</span></td>
          <td class="py-2.5 px-2 text-center font-semibold text-blue-900 bg-blue-50/30">${cs.kha} <span class="text-[10px] text-slate-500 font-normal">(${rKha}%)</span></td>
          <td class="py-2.5 px-2 text-center font-semibold text-cyan-900 bg-cyan-50/30">${cs.tbk} <span class="text-[10px] text-slate-500 font-normal">(${rTbk}%)</span></td>
          <td class="py-2.5 px-2 text-center font-semibold text-amber-900 bg-amber-50/30">${cs.tb} <span class="text-[10px] text-slate-500 font-normal">(${rTb}%)</span></td>
          <td class="py-2.5 px-2 text-center font-semibold text-rose-900 bg-rose-50/30">${cs.yeu} <span class="text-[10px] text-slate-500 font-normal">(${rYeu}%)</span></td>
          <td class="py-2.5 px-3 text-center font-black ${cs.debtStudents > 0 ? 'text-rose-700 bg-rose-50' : 'text-slate-400'}">
            ${cs.debtStudents > 0 ? `${cs.debtStudents} đ/c <span class="text-[10px] font-normal">(${rDebt}%)</span>` : '0'}
          </td>
          <td class="py-2.5 px-3 text-center font-black ${cs.totalFails > 0 ? 'text-rose-800 bg-rose-100/60' : 'text-slate-400'}">
            ${cs.totalFails > 0 ? `<span class="px-2 py-0.5 rounded bg-rose-200 text-rose-950 font-black">${cs.totalFails} lượt</span>` : '0'}
          </td>
          <td class="py-2.5 px-2 text-center font-black text-army-800 bg-gold-50/60 text-sm">${cGpa}</td>
        </tr>
      `;
    }).join('');

    if (classTfoot) {
      const failStudentRate = totalCadets > 0 ? ((debtStudentCount / totalCadets) * 100).toFixed(1) : '0.0';
      classTfoot.innerHTML = `
        <tr class="bg-slate-100 border-t-2 border-slate-300 text-slate-900 font-bold">
          <td colspan="2" class="py-3 px-3 uppercase text-army-900 font-black">TỔNG CỘNG:</td>
          <td class="py-3 px-2 text-center font-black text-army-800 text-sm">${totalCadets}</td>
          <td class="py-3 px-2 text-center text-purple-900 font-bold">${rankCounts['Xuất sắc']}</td>
          <td class="py-3 px-2 text-center text-emerald-900 font-bold">${rankCounts['Giỏi']}</td>
          <td class="py-3 px-2 text-center text-blue-900 font-bold">${rankCounts['Khá']}</td>
          <td class="py-3 px-2 text-center text-cyan-900 font-bold">${rankCounts['Trung bình Khá']}</td>
          <td class="py-3 px-2 text-center text-amber-900 font-bold">${rankCounts['Trung bình']}</td>
          <td class="py-3 px-2 text-center text-rose-900 font-bold">${rankCounts['Yếu']}</td>
          <td class="py-3 px-3 text-center text-rose-800 font-black">${debtStudentCount} đ/c (${failStudentRate}%)</td>
          <td class="py-3 px-3 text-center text-rose-900 font-black">${totalDebtFailsCount} lượt</td>
          <td class="py-3 px-2 text-center text-army-800 font-black text-sm">${avgCompanyGpa}</td>
        </tr>
      `;
    }
  }

  renderDebtCadetsSection(debtCadetsList);
}

export function renderDebtCadetsSection(debtCadetsList) {
  const tbody = document.getElementById('reportDebtCadetsTableBody');
  const footer = document.getElementById('reportDebtCadetsFooter');
  if (!tbody) return;

  const classScope = getCurrentUserClassScope();
  const filterSelect = document.getElementById('reportDebtFilterClass');
  if (filterSelect) {
    if (classScope) {
      filterSelect.innerHTML = `<option value="${classScope}">Lớp ${classScope}</option>`;
      filterSelect.value = classScope;
      filterSelect.disabled = true;
    } else {
      filterSelect.disabled = false;
    }
  }
  const filterClass = classScope || filterSelect?.value || 'all';

  let list = debtCadetsList || [];
  if (!debtCadetsList) {
    getScopedStudents().forEach(s => {
      const debts = getDebtSubjects(s.id);
      if (debts.length > 0) {
        list.push({
          student: s,
          yearGpa: calculateYearGPA(s.id),
          rank: getClassification(calculateYearGPA(s.id)),
          debts: debts,
          failCount: debts.length
        });
      }
    });
  }

  if (filterClass !== 'all') {
    list = list.filter(item => item.student.class === filterClass);
  }

  list.sort((a, b) => b.failCount - a.failCount || a.yearGpa - b.yearGpa);

  let rowsHtml = '';
  if (list.length === 0) {
    rowsHtml = `
      <tr>
        <td colspan="9" class="py-10 text-center font-bold text-emerald-700 bg-emerald-50/40">
          ✅ Không có học viên nào rớt học phần (điểm &lt; 4.0) ${filterClass !== 'all' ? `ở lớp ${filterClass}` : 'toàn Đại đội'}!
        </td>
      </tr>
    `;
  } else {
    list.forEach((item, idx) => {
      const s = item.student;
      const debtsBadges = item.debts.map(d => {
        const formattedName = formatFailedSubjectItem(d.subject);
        return `
          <span class="inline-flex items-center gap-1.5 bg-rose-100 text-rose-900 font-bold px-2.5 py-1 rounded-md text-xs border border-rose-300 mr-1.5 mb-1 shadow-sm">
            <span>${formattedName}</span>
            <span class="bg-rose-600 text-white px-1.5 py-0.2 rounded text-[10px] font-black" title="Điểm học phần: ${Number(d.score).toFixed(1)}">${Number(d.score).toFixed(1)}</span>
          </span>
        `;
      }).join('');

      rowsHtml += `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 text-center text-slate-500 font-medium">${idx + 1}</td>
          <td class="py-2.5 px-3 font-mono font-bold">
            <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline" data-id="${s.id}">
              ${s.code}
            </button>
          </td>
          <td class="py-2.5 px-4 font-bold text-slate-900">
            <button type="button" class="btn-view-cadet-detail hover:text-army-800 hover:underline text-left font-bold" data-id="${s.id}">
              ${s.name}
            </button>
          </td>
          <td class="py-2.5 px-2 text-center text-slate-600">${s.rank}</td>
          <td class="py-2.5 px-2 text-center font-bold text-army-800">${s.class}</td>
          <td class="py-2.5 px-4">${debtsBadges}</td>
          <td class="py-2.5 px-3 text-center font-black bg-rose-50 text-rose-700 text-sm">
            <span class="px-2.5 py-0.5 rounded-full bg-rose-200 text-rose-950 font-black">${item.failCount} học phần</span>
          </td>
          <td class="py-2.5 px-4 text-[11px] text-slate-700 leading-relaxed">
            Phân công Cán sự lớp <strong>${s.class}</strong> kèm cặp; duy trì tự học tối; đăng ký ôn và thi lại học phần.
          </td>
          <td class="py-2.5 px-3 text-center">
            <button type="button" class="btn-open-transcript px-2.5 py-1 rounded bg-army-700 hover:bg-army-800 text-white font-semibold text-[11px] shadow-sm transition" data-id="${s.id}">
              Phiếu Điểm
            </button>
          </td>
        </tr>
      `;
    });
  }
  tbody.innerHTML = rowsHtml;

  if (footer) {
    const totalFailsInFilter = list.reduce((sum, item) => sum + item.failCount, 0);
    footer.innerHTML = `
      <span>Hiển thị <strong>${list.length}</strong> học viên có học phần rớt (&lt; 4.0) • Tổng số <strong>${totalFailsInFilter}</strong> học phần rớt</span>
      <span class="text-[11px] text-slate-500 italic">Định dạng chuẩn: [Tên môn] ([Số tín chỉ] TC)</span>
    `;
  }

  // Event Delegation xử lý .btn-open-transcript tại document
}

export function exportReportExcel() {
  const scopedStudents = getScopedStudents();
  const totalCadets = scopedStudents.length;
  let totalYearGpaSum = 0;
  let debtStudentCount = 0;
  let totalDebtFailsCount = 0;

  const rankCounts = { 'Xuất sắc': 0, 'Giỏi': 0, 'Khá': 0, 'Trung bình Khá': 0, 'Trung bình': 0, 'Yếu': 0 };
  const debtCadetsList = [];

  scopedStudents.forEach(s => {
    const yearGpa = calculateYearGPA(s.id);
    totalYearGpaSum += yearGpa;
    const rank = getClassification(yearGpa);
    if (rankCounts[rank] !== undefined) rankCounts[rank]++;

    const debts = getDebtSubjects(s.id);
    if (debts.length > 0) {
      debtStudentCount++;
      totalDebtFailsCount += debts.length;
      debtCadetsList.push({ student: s, yearGpa, rank, debts, failCount: debts.length });
    }
  });

  const avgCompanyGpa = totalCadets > 0 ? (totalYearGpaSum / totalCadets).toFixed(2) : '0.00';

  const rows1 = [
    ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    ['BÁO CÁO GIAO BAN KẾT QUẢ HỌC TẬP & PHÂN LOẠI HỌC LỰC'],
    [`(Trích xuất ngày: ${new Date().toLocaleDateString('vi-VN')})`],
    [],
    ['STT', 'Xếp loại Học lực', 'Tiêu chuẩn ĐTB (Hệ 10)', 'Số lượng (đ/c)', 'Tỷ lệ (%)'],
    [1, 'Xuất sắc', 'ĐTB >= 8.50', rankCounts['Xuất sắc'], totalCadets > 0 ? ((rankCounts['Xuất sắc']/totalCadets)*100).toFixed(1) + '%' : '0%'],
    [2, 'Giỏi', 'ĐTB: 8.00 - 8.49', rankCounts['Giỏi'], totalCadets > 0 ? ((rankCounts['Giỏi']/totalCadets)*100).toFixed(1) + '%' : '0%'],
    [3, 'Khá', 'ĐTB: 7.00 - 7.99', rankCounts['Khá'], totalCadets > 0 ? ((rankCounts['Khá']/totalCadets)*100).toFixed(1) + '%' : '0%'],
    [4, 'Trung bình Khá', 'ĐTB: 6.50 - 6.99', rankCounts['Trung bình Khá'], totalCadets > 0 ? ((rankCounts['Trung bình Khá']/totalCadets)*100).toFixed(1) + '%' : '0%'],
    [5, 'Trung bình', 'ĐTB: 5.00 - 6.49', rankCounts['Trung bình'], totalCadets > 0 ? ((rankCounts['Trung bình']/totalCadets)*100).toFixed(1) + '%' : '0%'],
    [6, 'Yếu', 'ĐTB < 5.00', rankCounts['Yếu'], totalCadets > 0 ? ((rankCounts['Yếu']/totalCadets)*100).toFixed(1) + '%' : '0%'],
    ['TỔNG', 'ĐTB Chung: ' + avgCompanyGpa, '', totalCadets, '100.0%']
  ];

  const rows2 = [
    ['TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    ['DANH SÁCH HỌC VIÊN RỚT MÔN (ĐIỂM DƯỚI 4.0)'],
    [],
    ['STT', 'Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp', 'Các học phần bị rớt (< 4.0)', 'Số học phần rớt', 'Biện pháp khắc phục']
  ];

  debtCadetsList.forEach((item, idx) => {
    const s = item.student;
    const failedStr = item.debts.map(d => formatFailedSubjectItem(d.subject)).join('; ');
    rows2.push([
      idx + 1,
      s.code,
      s.name,
      s.rank,
      s.class,
      failedStr,
      item.failCount,
      `Phân công Cán sự lớp ${s.class} kèm cặp; ôn thi lại.`
    ]);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(rows1);
  const ws2 = XLSX.utils.aoa_to_sheet(rows2);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Thong_Ke_Giao_Ban');
  XLSX.utils.book_append_sheet(wb, ws2, 'Danh_Sach_Rot_Mon');
  XLSX.writeFile(wb, 'Bao_Cao_Giao_Ban_Dai_Doi_460.xlsx');
}

// --- 7. CHỨNG CHỈ NGOẠI NGỮ ---
export function renderLanguages() {
  const summaryContainer = document.getElementById('languageClassSummary');
  const tbody = document.getElementById('languageTableBody');
  if (!summaryContainer || !tbody) return;

  const canConfigStd = AppState.role === 'admin' || AppState.role === 'company_officer';
  const reqStd = AppState.requiredLangStandard || 'A2';
  document.querySelectorAll('.required-lang-standard-select').forEach(sel => {
    sel.value = reqStd;
    sel.disabled = !canConfigStd;
  });
  document.querySelectorAll('.required-lang-standard-badge').forEach(b => {
    b.textContent = reqStd;
  });

  const classScope = getCurrentUserClassScope();
  const langClassSelect = document.getElementById('langFilterClass');
  if (langClassSelect) {
    if (classScope) {
      langClassSelect.innerHTML = `<option value="${classScope}">Lớp ${classScope}</option>`;
      langClassSelect.value = classScope;
      langClassSelect.disabled = true;
    } else {
      langClassSelect.disabled = false;
    }
  }
  const selectedLangClass = classScope || langClassSelect?.value || 'all';
  const visibleClasses = classScope ? [classScope] : DEFAULT_CLASSES;

  let summaryHtml = '';
  visibleClasses.forEach(cls => {
    const clsStudents = AppState.students.filter(s => s.class === cls);
    let stdPassed = 0;
    clsStudents.forEach(s => {
      const curLvl = s.currentLangLevel || AppState.languages[s.id]?.currentLevel || 'A2';
      if (evaluateLangLevelStatus(curLvl, reqStd).isPassed) stdPassed++;
    });
    const rate = clsStudents.length > 0 ? Math.round((stdPassed / clsStudents.length) * 100) : 0;

    summaryHtml += `
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs font-bold text-army-800">Lớp ${cls}</div>
        <div class="text-lg font-black text-slate-900 mt-1">${rate}%</div>
        <div class="text-[11px] text-slate-500">${stdPassed}/${clsStudents.length} đạt chuẩn ${reqStd}</div>
      </div>
    `;
  });
  summaryContainer.innerHTML = summaryHtml;

  let langStudentsList = getScopedStudents();
  if (selectedLangClass !== 'all') {
    langStudentsList = langStudentsList.filter(s => s.class === selectedLangClass);
  }

  let tableHtml = '';

  if (langStudentsList.length === 0) {
    tableHtml = `<tr><td colspan="12" class="py-8 text-center text-slate-400">Chưa có dữ liệu học viên.</td></tr>`;
  } else {
    langStudentsList.forEach((student, idx) => {
      const l = AppState.languages[student.id] || { lang: 'Tiếng Nga', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'Đ', B12: 'CT' };
      const curLvl = student.currentLangLevel || l.currentLevel || 'A2';
      const evalStatus = evaluateLangLevelStatus(curLvl, reqStd);

      const badge = (status) => {
        if (status === 'Đ') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Đạt (Đ)</span>';
        if (status === 'KĐ') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">K.Đạt (KĐ)</span>';
        return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">Chưa thi</span>';
      };

      const canEditLang = AppState.role === 'admin' || AppState.role === 'company_officer' ||
        (AppState.role && AppState.role.startsWith('class_leader_') && AppState.role.replace('class_leader_', '') === student.class);

      const levelSelectHtml = canEditLang
        ? `<select class="select-lang-tab-level border ${evalStatus.isPassed ? 'border-slate-300 text-army-900' : 'border-rose-400 text-rose-800 bg-rose-50/40'} rounded-lg px-2 py-1 text-xs font-bold bg-white" data-id="${student.id}">
            ${LANGUAGE_LEVEL_OPTIONS.map(opt => `<option value="${opt}" ${opt === curLvl ? 'selected' : ''}>${opt}</option>`).join('')}
          </select>`
        : `<span class="font-bold text-army-900">${curLvl}</span>`;

      tableHtml += `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 text-center text-slate-500 font-medium">${idx + 1}</td>
          <td class="py-2.5 px-3 font-mono font-bold">
            <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline" data-id="${student.id}">${student.code}</button>
          </td>
          <td class="py-2.5 px-4 font-bold text-slate-900">
            <button type="button" class="btn-view-cadet-detail hover:text-army-800 hover:underline text-left font-bold" data-id="${student.id}">${student.name}</button>
          </td>
          <td class="py-2.5 px-3 text-center font-bold text-army-800">${student.class}</td>
          <td class="py-2.5 px-3 text-center font-semibold text-slate-700">${l.lang}</td>
          <td class="py-2.5 px-3 text-center">${badge(l.A1)}</td>
          <td class="py-2.5 px-3 text-center">${badge(l.A21)}</td>
          <td class="py-2.5 px-3 text-center">${badge(l.A22)}</td>
          <td class="py-2.5 px-3 text-center">${badge(l.B11)}</td>
          <td class="py-2.5 px-3 text-center">${badge(l.B12)}</td>
          <td class="py-2.5 px-3 text-center">
            <div class="flex flex-col items-center gap-1">
              ${levelSelectHtml}
              ${evalStatus.badgeHtml}
            </div>
          </td>
          <td class="py-2.5 px-3 text-center">
            ${canEditLang
              ? `<button type="button" class="btn-edit-lang text-xs text-army-700 hover:text-army-900 font-semibold underline" data-id="${student.id}">Cập nhật</button>`
              : `<span class="text-[11px] text-slate-400 italic">Chỉ xem</span>`
            }
          </td>
        </tr>
      `;
    });
  }
  tbody.innerHTML = tableHtml;

  // Event Delegation xử lý .btn-edit-lang & .select-lang-tab-level tại document
}

export function openLangModal(studentId) {
  if (AppState.role === 'student') {
    showToast('Học viên không có quyền sửa bảng chứng chỉ đơn vị!', 'error');
    return;
  }
  const scoped = getScopedStudents();
  if (scoped.length === 0) {
    showToast('Chưa có học viên nào trong danh sách!', 'error');
    return;
  }

  let activeId = studentId || scoped[0].id;
  const sel = document.getElementById('langStudentSelect');
  if (sel) {
    sel.innerHTML = scoped.map(s => `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${s.name} (${s.code} - ${s.class})</option>`).join('');
    sel.onchange = function() {
      loadStudentLangData(this.value);
    };
  }

  loadStudentLangData(activeId);
  showModal('modalUpdateLang');
}

export function loadStudentLangData(studentId) {
  const student = AppState.students.find(s => s.id === studentId);
  if (!student) return;
  const l = AppState.languages[studentId] || { lang: 'Tiếng Nga', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT' };

  document.getElementById('langStudentId').value = studentId;
  const nameEl = document.getElementById('langStudentName');
  if (nameEl) nameEl.textContent = `${student.name} (${student.code} - ${student.class})`;
  document.getElementById('langChoice').value = l.lang || 'Tiếng Nga';
  document.getElementById('langLevelA1').value = l.A1 || 'Đ';
  document.getElementById('langLevelA21').value = l.A21 || 'Đ';
  document.getElementById('langLevelA22').value = l.A22 || 'Đ';
  document.getElementById('langLevelB11').value = l.B11 || 'CT';
  document.getElementById('langLevelB12').value = l.B12 || 'CT';
  const extraInput = document.getElementById('langExtraCert');
  if (extraInput) extraInput.value = l.extraCert || '';
}

export function renderPrintableReport() {
  // Đã xóa bỏ hoàn toàn mục Văn bản Báo cáo Quân sự theo yêu cầu Mục 7
}

// --- 9. LỊCH SỬ SỬA ĐIỂM ---
export function renderAuditLog() {
  const tbody = document.getElementById('auditTableBody');
  if (!tbody) return;

  const classScope = getCurrentUserClassScope();
  const logs = classScope
    ? AppState.auditLogs.filter(l => l.class === classScope)
    : AppState.auditLogs;

  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">Chưa có bản ghi lịch sử chỉnh sửa nào.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map(log => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-2 px-3 font-mono text-[11px] text-slate-500">${log.timestamp}</td>
      <td class="py-2 px-3 font-semibold text-slate-800">${log.actor}</td>
      <td class="py-2 px-3 font-medium text-slate-900">${log.student}</td>
      <td class="py-2 px-3 text-slate-600 font-semibold">${log.class}</td>
      <td class="py-2 px-3 text-army-800 font-bold">${log.subject}</td>
      <td class="py-2 px-3 text-center text-slate-500">${log.oldVal}</td>
      <td class="py-2 px-3 text-center font-bold text-emerald-700">${log.newVal}</td>
      <td class="py-2 px-3 text-slate-600 italic text-[11px]">${log.reason}</td>
    </tr>
  `).join('');
}

// --- 10. QUẢN LÝ DANH MỤC MÔN HỌC: MÔN HỌC CHUNG & MÔN HỌC CHUYÊN NGÀNH ---
export function deleteSubject(subjectId) {
  if (!subjectId) return;
  const subj = AppState.subjects.find(s => s.id === subjectId);
  if (!subj) return;

  const classScope = getCurrentUserClassScope();
  if (AppState.role === 'student') {
    showToast('Học viên không có quyền xóa môn học!', 'error');
    return;
  }
  const targetClasses = getSubjectTargetClasses(subj);
  if (classScope && (subj.category !== 'specialized' || !targetClasses.includes(classScope))) {
    showToast(`Tài khoản Lớp ${classScope} chỉ được phép xóa môn chuyên ngành thuộc lớp ${classScope}!`, 'error');
    return;
  }

  // Nếu tài khoản Lớp xóa môn chuyên ngành đang gắn cho nhiều lớp thì chỉ gỡ lớp đó ra khỏi danh sách lớp của môn
  if (classScope && targetClasses.length > 1) {
    const remaining = targetClasses.filter(c => c !== classScope);
    subj.targetClasses = remaining;
    subj.targetClass = remaining.join(', ');
    upsertSubjectToSupabase(subj);
    logAuditTrail('', subjectId, subj.name, `Gỡ khỏi Lớp ${classScope}`, `Cập nhật lớp môn chuyên ngành ${subj.code} trên Supabase`);
    persistData(true);
    updateAllViews();
    return;
  }

  AppState.subjects = AppState.subjects.filter(s => s.id !== subjectId);
  Object.keys(AppState.grades).forEach(stId => {
    if (AppState.grades[stId] && AppState.grades[stId][subjectId] !== undefined) {
      delete AppState.grades[stId][subjectId];
    }
  });

  deleteSubjectFromSupabase(subjectId);
  logAuditTrail('', subjectId, subj.name, 'Đã xóa', `Xóa vĩnh viễn môn học ${subj.name} (${subj.code}) trên Supabase`);
  persistData(true);
  updateAllViews();
}

/**
 * Xóa tất cả các môn học trong một Học kỳ cụ thể (`semesterNumber`) trực tiếp trên Supabase
 */
export function deleteAllSubjectsInSemester(semesterNumber) {
  const sem = Number(semesterNumber);
  if (!sem || sem < 1 || sem > 10) return;

  if (AppState.role === 'student') {
    showToast('Học viên không có quyền xóa môn học!', 'error');
    return;
  }

  const classScope = getCurrentUserClassScope();
  let removedCount = 0;
  const removedIds = [];

  if (classScope) {
    const nextSubjects = [];
    AppState.subjects.forEach(sub => {
      if (Number(sub.semester) !== sem) {
        nextSubjects.push(sub);
        return;
      }
      const targetClasses = getSubjectTargetClasses(sub);
      if (sub.category === 'specialized' && targetClasses.includes(classScope)) {
        removedCount++;
        if (targetClasses.length > 1) {
          const remaining = targetClasses.filter(c => c !== classScope);
          sub.targetClasses = remaining;
          sub.targetClass = remaining.join(', ');
          upsertSubjectToSupabase(sub);
          nextSubjects.push(sub);
        } else {
          removedIds.push(sub.id);
        }
      } else {
        nextSubjects.push(sub);
      }
    });
    AppState.subjects = nextSubjects;
  } else {
    const toRemove = AppState.subjects.filter(s => Number(s.semester) === sem);
    removedCount = toRemove.length;
    toRemove.forEach(sub => {
      removedIds.push(sub.id);
    });
    AppState.subjects = AppState.subjects.filter(s => Number(s.semester) !== sem);
  }

  if (removedCount === 0) {
    showToast(`Học kỳ ${sem} hiện không có môn học nào để xóa!`, 'error');
    return;
  }

  if (removedIds.length > 0) {
    deleteSubjectsByIdsFromSupabase(removedIds);
    if (AppState.grades && typeof AppState.grades === 'object') {
      Object.keys(AppState.grades).forEach(stId => {
        if (!AppState.grades[stId]) return;
        removedIds.forEach(subId => {
          if (AppState.grades[stId][subId] !== undefined) {
            delete AppState.grades[stId][subId];
          }
        });
      });
    }
  }

  logAuditTrail('', '', `Học kỳ ${sem}`, `Xóa ${removedCount} môn`, `Xóa vĩnh viễn các môn học trong Học kỳ ${sem} trên Supabase`);
  persistData(true);
  updateAllViews();
}

/**
 * Xóa vĩnh viễn tất cả các môn học của toàn khóa (10 Học kỳ) trực tiếp trên Supabase
 */
export function deleteAllSubjectsAllSemesters() {
  if (AppState.role !== 'admin' && AppState.role !== 'company_officer') {
    showToast('Chỉ Admin hoặc Cán bộ Đại đội mới có quyền xóa toàn bộ môn học toàn khóa!', 'error');
    return;
  }

  AppState.subjects = [];
  if (AppState.grades && typeof AppState.grades === 'object') {
    Object.keys(AppState.grades).forEach(stId => {
      AppState.grades[stId] = {};
    });
  }

  deleteAllSubjectsFromSupabase();
  logAuditTrail('', '', 'Xóa toàn bộ môn', '0 môn học', 'Xóa trắng toàn bộ danh mục môn học 10 kỳ trên Supabase');
  persistData(true);
  updateAllViews();
}

export function renderSubjectsSettings() {
  if (!AppState.settingsSelectedYear) AppState.settingsSelectedYear = 1;
  const y = AppState.settingsSelectedYear;
  const semA = 2 * y - 1;
  const semB = 2 * y;

  const classScope = getCurrentUserClassScope();
  const visibleSubjects = classScope
    ? getSubjectsForClass(classScope)
    : AppState.subjects;

  const yearMeta = {
    1: { title: 'Năm Thứ 1', s1Label: 'Kỳ 1', s2Label: 'Kỳ 2', note: 'Giai đoạn Đại cương & Quân sự cơ bản' },
    2: { title: 'Năm Thứ 2', s1Label: 'Kỳ 3', s2Label: 'Kỳ 4', note: 'Cơ sở Khối ngành & Kỹ thuật cơ sở' },
    3: { title: 'Năm Thứ 3', s1Label: 'Kỳ 5', s2Label: 'Kỳ 6', note: 'Cơ sở Chuyên ngành Khí tài' },
    4: { title: 'Năm Thứ 4', s1Label: 'Kỳ 7', s2Label: 'Kỳ 8', note: 'Chuyên ngành Khí tài Quân sự' },
    5: { title: 'Năm Thứ 5', s1Label: 'Kỳ 9', s2Label: 'Kỳ 10', note: 'Chuyên đề, Thực tập & Đồ án tốt nghiệp' }
  };

  const currentMeta = yearMeta[y] || yearMeta[1];

  const commonSubjs = visibleSubjects.filter(s => !s.category || s.category === 'common' || s.targetClass === 'all');
  const specSubjs = visibleSubjects.filter(s => s.category === 'specialized' && s.targetClass !== 'all');

  const elTotalCreds = document.getElementById('statSettingsTotalCredits');
  if (elTotalCreds) elTotalCreds.textContent = `${commonSubjs.length} môn chung`;
  const elTotalSubjs = document.getElementById('statSettingsTotalSubjects');
  if (elTotalSubjs) elTotalSubjs.textContent = `${specSubjs.length} môn chuyên ngành`;

  const elYearTitle = document.getElementById('statSettingsSelectedYearTitle');
  if (elYearTitle) elYearTitle.textContent = currentMeta.title;
  const elYearSub = document.getElementById('statSettingsSelectedYearSub');
  if (elYearSub) elYearSub.textContent = `Học kỳ ${semA} & Học kỳ ${semB} • ${currentMeta.note}`;

  const listA = visibleSubjects.filter(s => Number(s.semester) === semA);
  const listB = visibleSubjects.filter(s => Number(s.semester) === semB);
  const credsA = listA.reduce((sum, s) => sum + s.credits, 0);
  const credsB = listB.reduce((sum, s) => sum + s.credits, 0);

  const elYearCredits = document.getElementById('statSettingsSelectedYearCredits');
  if (elYearCredits) elYearCredits.textContent = `${listA.length + listB.length} môn`;
  const elYearBreakdown = document.getElementById('statSettingsSelectedYearBreakdown');
  if (elYearBreakdown) elYearBreakdown.textContent = `Kỳ ${semA}: ${listA.length} môn (${credsA} TC) • Kỳ ${semB}: ${listB.length} môn (${credsB} TC)`;

  const tabsContainer = document.getElementById('settingsYearTabsContainer');
  if (tabsContainer) {
    let tabsHtml = '';
    for (let yearNum = 1; yearNum <= 5; yearNum++) {
      const s1 = 2 * yearNum - 1;
      const s2 = 2 * yearNum;
      const ySubjs = visibleSubjects.filter(s => Number(s.semester) === s1 || Number(s.semester) === s2);
      const yCommon = ySubjs.filter(s => !s.category || s.category === 'common' || s.targetClass === 'all').length;
      const ySpec = ySubjs.filter(s => s.category === 'specialized').length;
      const isActive = (yearNum === y);

      tabsHtml += `
        <button type="button" class="btn-setting-year-tab p-3 rounded-xl border text-left transition ${
          isActive ?
            'bg-army-800 text-white border-army-900 shadow-md ring-2 ring-gold-400' :
            'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
        }" data-year="${yearNum}">
          <div class="flex items-center justify-between">
            <span class="text-xs font-black uppercase ${isActive ? 'text-gold-300' : 'text-slate-900'}">NĂM THỨ ${yearNum}</span>
            <span class="text-[10px] font-bold px-1.5 py-0.2 rounded ${isActive ? 'bg-gold-500 text-slate-950' : 'bg-slate-200 text-slate-700'}">Kỳ ${s1}-${s2}</span>
          </div>
          <div class="text-[11px] ${isActive ? 'text-slate-200' : 'text-slate-500'} mt-1 font-medium">${yCommon} Môn chung • ${ySpec} Môn CN</div>
        </button>
      `;
    }
    tabsContainer.innerHTML = tabsHtml;

    tabsContainer.querySelectorAll('.btn-setting-year-tab').forEach(b => {
      b.addEventListener('click', function() {
        AppState.settingsSelectedYear = Number(this.dataset.year);
        renderSubjectsSettings();
      });
    });
  }

  const semContainer = document.getElementById('settingsSemestersContainer');
  if (!semContainer) return;

  const renderSubjectRows = (arr, emptyMsg) => {
    if (arr.length === 0) {
      return `<tr><td colspan="6" class="py-5 text-center text-slate-400 italic">${emptyMsg}</td></tr>`;
    }
    return arr.map((s, idx) => {
      const isSpec = s.category === 'specialized';
      const targetClasses = getSubjectTargetClasses(s);
      const targetClassesLabel = targetClasses.join(', ');
      const canModify = AppState.role === 'admin' || AppState.role === 'company_officer' ||
        (classScope && isSpec && targetClasses.includes(classScope));
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2 px-2 text-center text-slate-400 font-medium">${idx + 1}</td>
          <td class="py-2 px-3 font-mono font-bold text-army-800">${s.code}</td>
          <td class="py-2 px-3 font-semibold text-slate-900">${s.name}</td>
          <td class="py-2 px-2 text-center">
            ${isSpec
              ? `<span class="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 text-amber-900 border border-amber-300">Chuyên ngành: Lớp ${targetClassesLabel}</span>`
              : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Môn học chung (Toàn ĐĐ)</span>`
            }
          </td>
          <td class="py-2 px-2 text-center">
            ${canModify ? `
              <div class="inline-flex items-center gap-1">
                <input type="number" min="1" max="15" value="${s.credits}" data-id="${s.id}" class="input-subj-credits w-14 text-center py-1 px-1 border border-slate-300 rounded-lg font-black text-army-900 bg-slate-50 text-xs">
                <span class="text-[10px] text-slate-500 font-semibold">TC</span>
              </div>
            ` : `<span class="font-bold text-army-800 text-xs">${s.credits} TC</span>`}
          </td>
          <td class="py-2 px-2 text-center">
            ${canModify ? `
              <div class="inline-flex items-center gap-1">
                <button type="button" class="btn-edit-subj text-army-700 hover:text-army-900 font-bold text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 transition" data-id="${s.id}">
                  ✏️ Sửa
                </button>
                <button type="button" class="btn-del-subj text-rose-600 hover:text-rose-800 font-bold text-xs px-2 py-1 rounded hover:bg-rose-50 transition" data-id="${s.id}">
                  🗑️ Xóa
                </button>
              </div>
            ` : '-'}
          </td>
        </tr>
      `;
    }).join('');
  };

  const renderSemesterCard = (semNumber, semList, label) => {
    const commonInSem = semList.filter(s => !s.category || s.category === 'common' || s.targetClass === 'all');
    const specInSem = semList.filter(s => s.category === 'specialized');
    return `
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col space-y-0">
        <div class="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h4 class="font-extrabold text-sm text-army-900 uppercase">Học Kỳ ${semNumber} (${label})</h4>
            <div class="text-[11px] text-slate-500 mt-0.5">${commonInSem.length} môn học chung &bull; ${specInSem.length} môn học chuyên ngành</div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${!classScope ? `
              <button type="button" class="btn-add-to-sem inline-flex items-center gap-1 text-[11px] font-bold bg-army-700 hover:bg-army-800 text-white px-2.5 py-1.5 rounded-lg shadow-sm transition cursor-pointer" data-sem="${semNumber}" data-cat="common">
                + Môn Chung
              </button>
            ` : ''}
            <button type="button" class="btn-add-to-sem inline-flex items-center gap-1 text-[11px] font-bold bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 rounded-lg shadow-sm transition cursor-pointer" data-sem="${semNumber}" data-cat="specialized">
              + Môn Chuyên Ngành
            </button>
            <button type="button" class="btn-clear-sem-subjects inline-flex items-center gap-1 text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 rounded-lg shadow-sm transition cursor-pointer" data-sem="${semNumber}" title="Xóa tất cả các môn học trong Học kỳ ${semNumber}">
              🗑️ Xóa tất cả môn Kỳ ${semNumber}
            </button>
          </div>
        </div>

        <div class="bg-emerald-50/60 px-4 py-2 border-b border-emerald-200 text-[11px] font-extrabold text-emerald-950 uppercase flex items-center justify-between">
          <span>1. Môn Học Chung (Áp dụng tự động cho tất cả các lớp)</span>
          <span>${commonInSem.reduce((sum, s) => sum + s.credits, 0)} TC</span>
        </div>
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="py-2 px-2 text-center w-10">STT</th>
                <th class="py-2 px-3 w-20">Mã môn</th>
                <th class="py-2 px-3">Tên môn học</th>
                <th class="py-2 px-2 text-center">Phân loại</th>
                <th class="py-2 px-2 text-center w-24">Tín chỉ</th>
                <th class="py-2 px-2 text-center w-16">Xóa</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${renderSubjectRows(commonInSem, 'Chưa có môn học chung trong kỳ này.')}
            </tbody>
          </table>
        </div>

        <div class="bg-amber-50/80 px-4 py-2 border-y border-amber-200 text-[11px] font-extrabold text-amber-950 uppercase flex items-center justify-between">
          <span>2. Môn Học Chuyên Ngành (${classScope ? 'Lớp ' + classScope : 'Chỉ định riêng theo từng lớp: OTQS1, OTQS2, TTG1, TTG2, XMCB'})</span>
          <span>${specInSem.length} môn</span>
        </div>
        <div class="overflow-x-auto custom-scrollbar">
          <table class="w-full text-xs text-left border-collapse whitespace-nowrap">
            <thead class="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
              <tr>
                <th class="py-2 px-2 text-center w-10">STT</th>
                <th class="py-2 px-3 w-20">Mã môn</th>
                <th class="py-2 px-3">Tên môn học</th>
                <th class="py-2 px-2 text-center">Thuộc Lớp</th>
                <th class="py-2 px-2 text-center w-24">Tín chỉ</th>
                <th class="py-2 px-2 text-center w-16">Xóa</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 bg-white">
              ${renderSubjectRows(specInSem, 'Chưa có môn chuyên ngành trong kỳ này.')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  };

  semContainer.innerHTML = `
    ${renderSemesterCard(semA, listA, currentMeta.s1Label)}
    ${renderSemesterCard(semB, listB, currentMeta.s2Label)}
  `;

  // Event Delegation xử lý .btn-add-to-sem, .btn-edit-subj, .btn-del-subj & .input-subj-credits tại document
}

export function updateAllViews() {
  if (typeof renderSpreadsheet === 'function') renderSpreadsheet();
  if (typeof ExternalHooks.renderProfilesTable === 'function') ExternalHooks.renderProfilesTable();
  if (typeof renderCumulativeTable === 'function') renderCumulativeTable();
  if (typeof renderMasterTable === 'function') renderMasterTable();
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderLanguages === 'function') renderLanguages();
  if (typeof renderAuditLog === 'function') renderAuditLog();
  if (typeof renderSubjectsSettings === 'function') renderSubjectsSettings();
  if (typeof renderDebtCadetsSection === 'function') renderDebtCadetsSection();
  if (AppState.role === 'student' && typeof ExternalHooks.renderStudentView === 'function') {
    ExternalHooks.renderStudentView();
  }
}

export function toggleCurrentSheetLock() {
  if (AppState.role !== 'admin') {
    showToast('Chỉ Chỉ huy Đại đội mới có thẩm quyền khóa/mở sổ điểm!', 'error');
    return;
  }
  const key = `${AppState.currentSheetClass}_year_${AppState.currentSheetSemester}`;
  AppState.locks[key] = !AppState.locks[key];
  persistData();
  renderSpreadsheet();
}

// --- 13. XUẤT / NHẬP EXCEL ---
export function exportStudentPersonalExcel() {
  const student = getLoggedInStudent() || AppState.students.find(s => s.id === AppState.studentViewingId) || AppState.students[0];
  if (!student) {
    showToast('Không tìm thấy thông tin học viên để xuất bảng điểm!', 'error');
    return;
  }

  const studentGrades = AppState.grades[student.id] || {};
  const rows = [
    ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    ['BẢNG ĐIỂM VÀ THÔNG TIN CÁ NHÂN QUÂN NHÂN'],
    [],
    ['I. THÔNG TIN LÝ LỊCH CÁ NHÂN'],
    ['Họ và tên:', student.name, 'Mã học viên:', student.code],
    ['Cấp bậc:', student.rank, 'Lớp:', student.class],
    ['Chức vụ:', student.position || student.role || 'Học viên', 'Ngày sinh:', formatVN(student.dob)],
    ['Nhập ngũ:', student.enlistmentDate || '02/2022', 'Quê quán:', student.hometown || ''],
    ['Trình độ ngoại ngữ:', student.currentLangLevel || 'A2', 'Chuẩn CNTT:', student.itStandard || 'Đạt chuẩn CNTT cơ bản'],
    ['Danh hiệu đạt được:', formatAchievementsText(student.achievements)],
    [],
    ['II. BẢNG ĐIỂM CHI TIẾT TỪ NĂM NHẤT ĐẾN NĂM NĂM (5 NĂM - 10 HỌC KỲ)']
  ];

  for (let y = 1; y <= 5; y++) {
    const sem1 = 2 * y - 1;
    const sem2 = 2 * y;
    const subs1 = getSubjectsForClass(student.class, sem1);
    const subs2 = getSubjectsForClass(student.class, sem2);
    const gpa1 = calculateSemesterGPA(student.id, sem1);
    const gpa2 = calculateSemesterGPA(student.id, sem2);
    const yearGpa = calculateAcademicYearGPA(student.id, y);
    const yearRank = getClassification(yearGpa);

    rows.push([]);
    rows.push([`NĂM HỌC THỨ ${y} (HỌC KỲ ${sem1} & HỌC KỲ ${sem2})`]);
    rows.push(['Hàng 1 - Học kỳ 1:', ...subs1.map(s => `${s.name} (${s.credits} TC): ${studentGrades[s.id] !== undefined ? studentGrades[s.id] : '-'}`), `ĐTB HK1: ${gpa1.toFixed(2)}`]);
    rows.push(['Hàng 2 - Học kỳ 2:', ...subs2.map(s => `${s.name} (${s.credits} TC): ${studentGrades[s.id] !== undefined ? studentGrades[s.id] : '-'}`), `ĐTB HK2: ${gpa2.toFixed(2)}`]);
    rows.push(['Hàng 3 - Tổng kết Năm học:', `Điểm trung bình Năm thứ ${y}: ${yearGpa.toFixed(2)}`, `Xếp loại Năm thứ ${y}: ${yearRank}`]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bang_Diem_Ca_Nhan');

  // Định dạng tên file bắt buộc: Bảng điểm(thông tin cá nhân) - [Họ và tên học viên].xlsx
  const exactFilename = `Bảng điểm(thông tin cá nhân) - ${student.name}.xlsx`;
  XLSX.writeFile(wb, exactFilename);
}

export function exportClassExcel() {
  if (AppState.role === 'student') {
    exportStudentPersonalExcel();
    return;
  }

  const cls = getCurrentUserClassScope() || AppState.currentSheetClass || 'OTQS1';
  const yearNum = parseInt(AppState.currentSheetSemester, 10) || 1;
  const sem1 = 2 * yearNum - 1;
  const sem2 = 2 * yearNum;
  const classStudents = cls === 'all' ? [...AppState.students] : AppState.students.filter(s => s.class === cls);
  const subs1 = getSubjectsForClass(cls, sem1);
  const subs2 = getSubjectsForClass(cls, sem2);

  const headers = ['STT', 'Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp', 'Ngày sinh'];
  subs1.forEach(s => headers.push(`${s.code} (${s.credits}TC)`));
  headers.push('ĐTB HK1');
  subs2.forEach(s => headers.push(`${s.code} (${s.credits}TC)`));
  headers.push('ĐTB HK2', 'Điểm trung bình 1 năm học', 'Xếp loại năm đấy');

  const rows = [
    ['BỘ QUỐC PHÒNG - HỌC VIỆN KỸ THUẬT QUÂN SỰ'],
    ['TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    [`BẢNG ĐIỂM LỚP ${cls} - NĂM HỌC THỨ ${yearNum} (HỌC KỲ ${sem1} & HỌC KỲ ${sem2})`],
    [],
    headers
  ];

  classStudents.forEach((student, idx) => {
    const studentGrades = AppState.grades[student.id] || {};
    const row = [idx + 1, student.code, student.name, student.rank, student.class, formatVN(student.dob)];
    subs1.forEach(s => row.push(studentGrades[s.id] !== undefined ? studentGrades[s.id] : ''));
    row.push(calculateSemesterGPA(student.id, sem1).toFixed(2));
    subs2.forEach(s => row.push(studentGrades[s.id] !== undefined ? studentGrades[s.id] : ''));
    const gy = calculateAcademicYearGPA(student.id, yearNum);
    row.push(calculateSemesterGPA(student.id, sem2).toFixed(2), gy.toFixed(2), getClassification(gy));
    rows.push(row);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map(() => ({ wch: 15 }));
  ws['!cols'][2] = { wch: 24 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Diem_${cls}_Nam${yearNum}`);
  XLSX.writeFile(wb, `Bang_Diem_${cls}_Nam_Hoc_${yearNum}.xlsx`);
}

export function exportMasterExcel() {
  const semFilter = AppState.masterFilters.semester || 'all';
  const headers = [
    'STT', 'Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp', 'Ngày sinh',
    'ĐTB HK1', 'ĐTB HK2', semFilter === 'all' ? 'ĐTB Toàn khóa' : `ĐTB Học kỳ ${semFilter}`,
    'Xếp loại Học lực', 'Học phần rớt (< 4.0)'
  ];

  const rows = [
    ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    ['BẢNG TỔNG HỢP KẾT QUẢ HỌC TẬP TOÀN ĐẠI ĐỘI 460'],
    [],
    headers
  ];

  getScopedStudents().forEach((student, idx) => {
    const g1 = calculateSemesterGPA(student.id, 1);
    const g2 = calculateSemesterGPA(student.id, 2);
    const gy = semFilter === 'all' ? calculateYearGPA(student.id) : calculateSemesterGPA(student.id, Number(semFilter));
    const debts = getDebtSubjects(student.id, semFilter);

    rows.push([
      idx + 1,
      student.code,
      student.name,
      student.rank,
      student.class,
      formatVN(student.dob),
      g1.toFixed(2),
      g2.toFixed(2),
      gy.toFixed(2),
      getClassification(gy),
      debts.length > 0 ? debts.map(d => formatFailedSubjectItem(d.subject)).join('; ') : 'Đạt chuẩn'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map(() => ({ wch: 16 }));
  ws['!cols'][2] = { wch: 24 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tong_Hop_Dai_Doi');
  XLSX.writeFile(wb, 'Tong_Hop_Diem_Dai_Doi_460.xlsx');
}

export function exportLanguageExcel() {
  const headers = ['STT', 'Mã HV', 'Họ và Tên', 'Lớp', 'Ngoại Ngữ', 'Trình Độ Hiện Tại', 'Chuẩn CNTT', 'A1', 'A2.1', 'A2.2', 'B1.1', 'B1.2'];
  const rows = [
    ['TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    ['BẢNG THEO DÕI CHỨNG CHỈ NGOẠI NGỮ & CHUẨN CNTT'],
    [],
    headers
  ];

  getScopedStudents().forEach((s, idx) => {
    const l = AppState.languages[s.id] || { lang: 'Tiếng Nga', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'Đ', B12: 'CT' };
    rows.push([
      idx + 1,
      s.code,
      s.name,
      s.class,
      l.lang,
      s.currentLangLevel || l.currentLevel || 'A2',
      s.itStandard || l.itStandard || 'Đạt chuẩn CNTT cơ bản',
      l.A1,
      l.A21,
      l.A22,
      l.B11,
      l.B12
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Chung_Chi_Ngoai_Ngu');
  XLSX.writeFile(wb, 'Chung_Chi_Ngoai_Ngu_Dai_Doi_460.xlsx');
}

export function downloadExcelTemplate() {
  const cls = getCurrentUserClassScope() || AppState.currentSheetClass || 'OTQS1';
  const yearNum = parseInt(AppState.currentSheetSemester, 10) || 1;
  const activeSubjects = [
    ...getSubjectsForClass(cls, 2 * yearNum - 1),
    ...getSubjectsForClass(cls, 2 * yearNum)
  ];
  const headers = ['Mã HV', 'Họ và Tên', 'Lớp'];
  activeSubjects.forEach(s => headers.push(s.code));

  const sampleRows = [
    headers,
    ['HV2022-0101', 'Nguyễn Văn Hùng', cls, ...activeSubjects.map(() => '8.5')],
    ['HV2022-0102', 'Trần Đức Thắng', cls, ...activeSubjects.map(() => '8.0')]
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleRows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhap_Diem');
  XLSX.writeFile(wb, `Mau_Nhap_Diem_${cls}_Nam_${yearNum}.xlsx`);
}

export let parsedImportData = null;

export function handleExcelFileUpload(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

      if (!jsonRows || jsonRows.length < 2) {
        showToast('File Excel không có dữ liệu hợp lệ!', 'error');
        return;
      }

      let headerIdx = -1;
      for (let i = 0; i < Math.min(jsonRows.length, 15); i++) {
        const rowArr = Array.isArray(jsonRows[i]) ? jsonRows[i] : [];
        const nonEmptyCells = rowArr.filter(c => String(c || '').trim() !== '');
        if (nonEmptyCells.length < 2) continue;
        const rowStr = nonEmptyCells.map(c => String(c).toLowerCase()).join(' | ');
        if (
          rowStr.includes('mã hv') ||
          rowStr.includes('mã học viên') ||
          rowStr.includes('họ và tên') ||
          rowStr.includes('họ tên') ||
          rowStr.includes('gdct')
        ) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) headerIdx = 0;

      const headers = jsonRows[headerIdx].map(h => String(h || '').trim());
      const rows = jsonRows.slice(headerIdx + 1).filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''));

      parsedImportData = { headers, rows };
      const statusEl = document.getElementById('importFileStatus');
      if (statusEl) {
        statusEl.textContent = `File hợp lệ: Đã đọc được ${rows.length} dòng dữ liệu. Sẵn sàng nhập lên Supabase.`;
        statusEl.classList.remove('hidden');
      }
      const btnConfirm = document.getElementById('btnConfirmImport');
      if (btnConfirm) {
        btnConfirm.disabled = false;
        btnConfirm.textContent = 'Nhập Dữ Liệu';
      }
    } catch (err) {
      console.error(err);
      showToast('Lỗi khi đọc file Excel! Vui lòng kiểm tra lại định dạng file.', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

export async function executeExcelImport() {
  if (AppState.role === 'student') {
    showToast('Học viên không có quyền nhập điểm từ file Excel!', 'error');
    return;
  }
  if (!parsedImportData) return;
  const { headers, rows } = parsedImportData;
  const classScope = getCurrentUserClassScope();
  const btnConfirm = document.getElementById('btnConfirmImport');
  const origText = btnConfirm ? btnConfirm.textContent : 'Nhập Dữ Liệu';

  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.textContent = '⏳ Đang lưu lên Supabase...';
  }

  try {
    let updatedCount = 0;
    let createdStudentsCount = 0;

    const normHeaders = headers.map(h => String(h || '').trim().toLowerCase());
    const firstColIsStt = normHeaders[0] === 'stt' || normHeaders[0] === 'tt';
    const offset = firstColIsStt ? 1 : 0;

    let codeCol = normHeaders.findIndex(h => h.includes('mã hv') || h.includes('mã học viên') || h.includes('mã qn') || h === 'mã');
    if (codeCol === -1) codeCol = offset;

    let nameCol = normHeaders.findIndex(h => (h.includes('họ và tên') || h.includes('họ tên') || h === 'tên') && !h.includes('bố') && !h.includes('mẹ'));
    if (nameCol === -1) nameCol = codeCol + 1;

    let rankCol = normHeaders.findIndex(h => h.includes('cấp bậc') || h.includes('quân hàm'));
    let classCol = normHeaders.findIndex(h => h === 'lớp' || h.startsWith('lớp '));

    const reservedCols = new Set([0, codeCol, nameCol, rankCol, classCol].filter(idx => idx >= 0));
    const subjectCols = [];
    const bulkGradeEntries = [];

    headers.forEach((h, colIdx) => {
      if (!h || reservedCols.has(colIdx)) return;
      const lowerH = h.toLowerCase();
      if (
        lowerH === 'stt' ||
        lowerH.includes('đtb') ||
        lowerH.includes('dtb') ||
        lowerH.includes('xếp loại') ||
        lowerH.includes('tín chỉ') ||
        lowerH.includes('học phần rớt') ||
        lowerH.includes('ngoại ngữ') ||
        lowerH.includes('cntt')
      ) {
        return;
      }
      const cleanH = h.split('(')[0].trim().toUpperCase();
      if (!cleanH) return;
      const found = AppState.subjects.find(s => s.code.toUpperCase() === cleanH || s.name.toUpperCase() === cleanH);
      if (found) {
        subjectCols.push({ colIdx, subjectId: found.id });
      }
    });

    rows.forEach((row, rIdx) => {
      let studentCode = row[codeCol] !== undefined && row[codeCol] !== null ? String(row[codeCol]).trim().toUpperCase() : '';
      const studentName = row[nameCol] !== undefined && row[nameCol] !== null ? String(row[nameCol]).trim() : '';

      if (studentCode === 'STT' || studentCode === 'MÃ HV' || (!studentCode && !studentName)) return;
      if ((!studentCode || /^\d{1,3}$/.test(studentCode)) && studentName) {
        const byName = AppState.students.find(s => s.name.toLowerCase() === studentName.toLowerCase());
        if (byName) {
          studentCode = byName.code.toUpperCase();
        } else {
          const targetCls = classScope || AppState.currentSheetClass || 'OTQS1';
          studentCode = `HV${targetCls}-${String(rIdx + 1).padStart(3, '0')}`;
        }
      }
      if (!studentCode) return;

      let student = AppState.students.find(s => s.code.toLowerCase() === studentCode.toLowerCase());

      // Nếu học viên trong file Excel chưa có trong danh sách, tự động tạo mới học viên đó!
      if (!student) {
        let rowCls = classCol >= 0 && row[classCol] ? String(row[classCol]).trim().toUpperCase().replace(/^LỚP\s+/i, '') : '';
        if (classScope) rowCls = classScope;
        else if (!DEFAULT_CLASSES.includes(rowCls)) rowCls = AppState.currentSheetClass || 'OTQS1';

        const rowRank = rankCol >= 0 && row[rankCol] ? String(row[rankCol]).trim() : 'Thượng sĩ';
        const newId = buildDeterministicStudentId(studentCode);

        student = {
          id: newId,
          code: studentCode,
          name: studentName || ('Quân nhân ' + studentCode),
          rank: rowRank,
          class: rowCls,
          position: 'Học viên',
          role: 'Học viên',
          dob: '2003-01-01',
          enlistmentDate: '02/2022',
          phone: '',
          hometown: '',
          permanentAddress: '',
          currentAddress: '',
          politicalStatus: 'DOAN_VIEN',
          party_joined_date: null,
          official_party_date: null,
          father_name: '',
          father_birth_date: '',
          father_hometown: '',
          father_job: '',
          mother_name: '',
          mother_birth_date: '',
          mother_hometown: '',
          mother_job: '',
          achievements: [],
          currentLangLevel: 'A2',
          itStandard: 'Đạt chuẩn CNTT cơ bản'
        };
        AppState.students.push(student);
        AppState.grades[newId] = {};
        AppState.languages[newId] = {
          lang: 'Tiếng Nga',
          currentLevel: 'A2',
          itStandard: 'Đạt chuẩn CNTT cơ bản',
          A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT'
        };
        createdStudentsCount++;
      }

      if (classScope && student.class !== classScope) return;

      if (!AppState.grades[student.id]) {
        AppState.grades[student.id] = {};
      }

      subjectCols.forEach(sc => {
        const rawScore = row[sc.colIdx];
        if (rawScore !== undefined && rawScore !== null && String(rawScore).trim() !== '') {
          const num = parseFloat(String(rawScore).replace(',', '.'));
          if (!isNaN(num) && num >= 0 && num <= 10) {
            const rounded = Math.round(num * 10) / 10;
            AppState.grades[student.id][sc.subjectId] = rounded;
            bulkGradeEntries.push({ studentId: student.id, subjectId: sc.subjectId, score: rounded });
            updatedCount++;
          }
        }
      });
    });

    if (createdStudentsCount > 0 || AppState.students.length > 0) {
      await upsertStudentsBulkToSupabase(AppState.students, AppState.languages);
    }

    if (bulkGradeEntries.length > 0) {
      await upsertGradesBulkToSupabase(bulkGradeEntries);
    }

    logAuditTrail('', '', 'Excel File', `${updatedCount} điểm (${createdStudentsCount} HV mới)`, 'Nhập dữ liệu điểm từ file Excel lên Supabase');
    await persistData(true);
    updateAllViews();
    hideModal('modalImportExcel');
    parsedImportData = null;
    showToast(`Đã lưu thành công ${updatedCount} điểm số${createdStudentsCount > 0 ? ` và ${createdStudentsCount} học viên mới` : ''} lên Supabase!`, 'success');
  } catch (err) {
    console.error('Lỗi khi nhập Excel điểm lên Supabase:', err);
    showToast('Có lỗi khi lưu điểm từ Excel lên Supabase: ' + (err.message || err), 'error');
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.textContent = origText;
    }
  }
}

// --- 16. ĐIỂM TÍCH LŨY ---
export function getGradeLetterAndScale4(score10) {
  if (score10 === undefined || score10 === null || isNaN(score10) || score10 === '') {
    return { letter: '-', scale4: 0, status: 'Chưa thi' };
  }
  const s = Number(score10);
  if (s >= 8.5) return { letter: 'A', scale4: 4.0, status: 'Đạt (Giỏi)' };
  if (s >= 8.0) return { letter: 'B+', scale4: 3.5, status: 'Đạt (Khá Giỏi)' };
  if (s >= 7.0) return { letter: 'B', scale4: 3.0, status: 'Đạt (Khá)' };
  if (s >= 6.5) return { letter: 'C+', scale4: 2.5, status: 'Đạt (TB Khá)' };
  if (s >= 5.5) return { letter: 'C', scale4: 2.0, status: 'Đạt (TB)' };
  if (s >= 5.0) return { letter: 'D+', scale4: 1.5, status: 'Đạt (TB Yếu)' };
  if (s >= 4.0) return { letter: 'D', scale4: 1.0, status: 'Đạt (Tối thiểu)' };
  return { letter: 'F', scale4: 0.0, status: 'Rớt môn (< 4.0)' };
}

export function calculateCumulativeGPA4(studentId) {
  const student = AppState.students.find(s => s.id === studentId);
  const studentClass = student ? student.class : AppState.currentSheetClass;
  const studentGrades = AppState.grades[studentId] || {};
  const subjs = getSubjectsForClass(studentClass);

  let totalPoints = 0;
  let totalCredits = 0;
  subjs.forEach(sub => {
    const score = studentGrades[sub.id];
    if (score !== undefined && score !== null && score !== '' && !isNaN(score)) {
      const { scale4 } = getGradeLetterAndScale4(score);
      totalPoints += scale4 * sub.credits;
      totalCredits += sub.credits;
    }
  });
  return totalCredits > 0 ? (totalPoints / totalCredits) : 0;
}

export function calculateCreditsPassed(studentId) {
  const student = AppState.students.find(s => s.id === studentId);
  const studentClass = student ? student.class : AppState.currentSheetClass;
  const studentGrades = AppState.grades[studentId] || {};
  const subjs = getSubjectsForClass(studentClass);

  let passedCredits = 0;
  subjs.forEach(sub => {
    const score = studentGrades[sub.id];
    if (score !== undefined && score !== null && score !== '' && !isNaN(score) && Number(score) >= 4.0) {
      passedCredits += sub.credits;
    }
  });
  return passedCredits;
}

export function handleInlineCumulativeMetaChange(studentId, field, value) {
  const s = AppState.students.find(x => x.id === studentId);
  if (!s) return;

  const classScope = getCurrentUserClassScope();
  if (AppState.role === 'student') {
    const self = getLoggedInStudent();
    if (!self || self.id !== studentId) {
      showToast('Bạn chỉ được phép cập nhật thông tin của chính mình!', 'error');
      return;
    }
  } else if (classScope && s.class !== classScope) {
    showToast('Bạn chỉ được phép cập nhật dữ liệu trong phạm vi lớp của mình!', 'error');
    return;
  }

  if (!AppState.languages[studentId]) {
    AppState.languages[studentId] = { lang: 'Tiếng Nga', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT' };
  }

  if (field === 'currentLangLevel') {
    s.currentLangLevel = value;
    AppState.languages[studentId].currentLevel = value;
  } else if (field === 'itStandard') {
    s.itStandard = value;
    AppState.languages[studentId].itStandard = value;
  }

  upsertStudentToSupabase(s, AppState.languages[studentId]);
  persistData(true);
  updateAllViews();
}

export function renderCumulativeTable() {
  const tbody = document.getElementById('cumulativeTableBody');
  const footer = document.getElementById('cumulativeTableFooter');
  if (!tbody) return;

  const canConfigStd = AppState.role === 'admin' || AppState.role === 'company_officer';
  document.querySelectorAll('.required-lang-standard-select').forEach(sel => {
    sel.value = AppState.requiredLangStandard || 'A2';
    sel.disabled = !canConfigStd;
  });
  document.querySelectorAll('.required-lang-standard-badge').forEach(b => {
    b.textContent = AppState.requiredLangStandard || 'A2';
  });

  const classScope = getCurrentUserClassScope();
  const cumulClassSelect = document.getElementById('cumulFilterClass');
  if (cumulClassSelect) {
    if (classScope) {
      cumulClassSelect.innerHTML = `<option value="${classScope}">Lớp ${classScope}</option>`;
      cumulClassSelect.value = classScope;
      cumulClassSelect.disabled = true;
    } else {
      cumulClassSelect.disabled = false;
    }
  }

  const filterClass = classScope || cumulClassSelect?.value || 'all';
  const filterRank = document.getElementById('cumulFilterRank')?.value || 'all';
  const filterDebt = document.getElementById('cumulFilterDebt')?.value || 'all';
  const filterYear = parseInt(document.getElementById('cumulFilterYear')?.value || AppState.cumulativeSelectedYear || '1', 10) || 1;
  AppState.cumulativeSelectedYear = String(filterYear);
  const searchKey = (document.getElementById('cumulSearchInput')?.value || '').toLowerCase().trim();

  let scoped = getScopedStudents();
  let filtered = [...scoped];

  if (filterClass !== 'all') {
    filtered = filtered.filter(s => s.class === filterClass);
  }
  if (filterRank !== 'all') {
    filtered = filtered.filter(s => getClassification(calculateYearGPA(s.id)) === filterRank);
  }
  if (filterDebt === 'pass_all') {
    filtered = filtered.filter(s => getDebtSubjects(s.id).length === 0);
  } else if (filterDebt === 'has_debt') {
    filtered = filtered.filter(s => getDebtSubjects(s.id).length > 0);
  }
  if (searchKey) {
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(searchKey) ||
      s.code.toLowerCase().includes(searchKey)
    );
  }

  filtered.sort((a, b) => {
    const diff = calculateYearGPA(b.id) - calculateYearGPA(a.id);
    if (Math.abs(diff) > 0.001) return diff;
    return a.name.localeCompare(b.name, 'vi');
  });

  // Cập nhật 3 khối thống kê (đã xóa khối "DTB tích lũy toàn đại đội 3")
  let goodCount = 0;
  let debtCount = 0;
  scoped.forEach(s => {
    const g10 = calculateYearGPA(s.id);
    if (g10 >= 8.0) goodCount++;
    if (getDebtSubjects(s.id).length > 0) debtCount++;
  });

  const rate = scoped.length > 0 ? ((goodCount / scoped.length) * 100).toFixed(1) : '0.0';
  const elGoodRate = document.getElementById('cumulGoodRate');
  if (elGoodRate) elGoodRate.textContent = `${rate}%`;
  const elGoodCount = document.getElementById('cumulGoodCount');
  if (elGoodCount) elGoodCount.textContent = `${goodCount} / ${scoped.length} quân nhân (ĐTB ≥ 8.00)`;
  const elDebtCount = document.getElementById('cumulDebtCount');
  if (elDebtCount) elDebtCount.textContent = debtCount;
  const elTotalCount = document.getElementById('cumulStatTotalCadets');
  if (elTotalCount) elTotalCount.textContent = `${scoped.length} đồng chí`;

  const sem1 = 2 * filterYear - 1;
  const sem2 = 2 * filterYear;

  let rowsHtml = '';
  filtered.forEach((s, idx) => {
    const gpa10 = calculateYearGPA(s.id);
    const gpa4 = calculateCumulativeGPA4(s.id);
    const gpaHK1 = calculateSemesterGPA(s.id, sem1);
    const gpaHK2 = calculateSemesterGPA(s.id, sem2);
    const passedTC = calculateCreditsPassed(s.id);
    const totalCourseTC = getTotalCourseCredits(s.class);
    const debts = getDebtSubjects(s.id);
    const rank = getClassification(gpa10);
    const curLang = s.currentLangLevel || AppState.languages[s.id]?.currentLevel || 'A2';
    const curIt = s.itStandard || AppState.languages[s.id]?.itStandard || 'Đạt chuẩn CNTT cơ bản';

    const langEval = evaluateLangLevelStatus(curLang, AppState.requiredLangStandard);
    const canEditMeta = AppState.role === 'admin' || AppState.role === 'company_officer' ||
      (AppState.role && AppState.role.startsWith('class_leader_') && AppState.role.replace('class_leader_', '') === s.class);

    const langOptionsHtml = LANGUAGE_LEVEL_OPTIONS.map(opt =>
      `<option value="${opt}" ${opt === curLang ? 'selected' : ''}>${opt}</option>`
    ).join('');

    const itOptionsHtml = IT_STANDARD_OPTIONS.map(opt =>
      `<option value="${opt}" ${opt === curIt ? 'selected' : ''}>${opt}</option>`
    ).join('');

    rowsHtml += `
      <tr class="hover:bg-slate-50 transition" data-student-id="${s.id}">
        <td class="py-2.5 px-2 text-center text-slate-500 font-medium">${idx + 1}</td>
        <td class="py-2.5 px-3 font-mono font-bold">
          <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline" data-id="${s.id}">
            ${s.code}
          </button>
        </td>
        <td class="py-2.5 px-4 font-bold text-slate-900">
          <button type="button" class="btn-view-cadet-detail hover:text-army-800 hover:underline text-left font-bold" data-id="${s.id}" title="Nhấp để xem chi tiết quân nhân">
            ${s.name}
          </button>
        </td>
        <td class="py-2.5 px-2 text-center text-slate-600">${s.rank}</td>
        <td class="py-2.5 px-2 text-center font-bold text-army-800">${s.class}</td>
        <td class="py-2.5 px-2 text-center font-bold text-emerald-700">${passedTC} / ${totalCourseTC} TC</td>
        <td class="py-2.5 px-2 text-center font-semibold text-slate-800 bg-slate-50">${gpaHK1.toFixed(2)}</td>
        <td class="py-2.5 px-2 text-center font-semibold text-slate-800 bg-slate-50">${gpaHK2.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center font-black text-slate-950 bg-gold-200/80 text-sm">${gpa10.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center">${getClassificationBadge(rank)}</td>
        <td class="py-2.5 px-2 text-center font-extrabold text-blue-800 bg-blue-50/60 text-xs">${gpa4.toFixed(2)} / 4.00</td>
        <td class="py-2 px-2 text-center">
          <div class="flex flex-col items-center gap-1">
            <select class="select-cumul-lang border ${langEval.isPassed ? 'border-slate-300 text-army-900' : 'border-rose-400 text-rose-800 bg-rose-50/40'} rounded-lg px-2 py-1 text-xs font-bold bg-white focus:ring-1 focus:ring-army-600" data-id="${s.id}" ${canEditMeta ? '' : 'disabled'}>
              ${langOptionsHtml}
            </select>
            ${langEval.badgeHtml}
          </div>
        </td>
        <td class="py-2 px-2 text-center">
          <select class="select-cumul-it border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 bg-white focus:ring-1 focus:ring-army-600" data-id="${s.id}" ${canEditMeta ? '' : 'disabled'}>
            ${itOptionsHtml}
          </select>
        </td>
        <td class="py-2.5 px-3 text-center">
          ${debts.length > 0 ?
            `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700" title="${debts.map(d => formatFailedSubjectItem(d.subject)).join(', ')}">⚠️ Rớt ${debts.length} môn</span>` :
            `<span class="text-emerald-700 font-bold text-[11px]">✅ Đạt 100%</span>`
          }
        </td>
        <td class="py-2.5 px-3 text-center">
          <button type="button" class="btn-open-transcript px-2.5 py-1 rounded bg-army-700 hover:bg-army-800 text-white font-semibold text-[11px] shadow-sm transition" data-id="${s.id}">
            Phiếu Điểm
          </button>
        </td>
      </tr>
    `;
  });

  if (filtered.length === 0) {
    rowsHtml = `<tr><td colspan="15" class="p-8 text-center text-slate-400">Không tìm thấy quân nhân nào phù hợp với bộ lọc.</td></tr>`;
  }
  tbody.innerHTML = rowsHtml;

  if (footer) {
    footer.innerHTML = `
      <span>Hiển thị <strong>${filtered.length}</strong> / ${scoped.length} quân nhân (Đang xem cột DTB HK1 (10) & DTB HKII (10) của Năm thứ ${filterYear})</span>
      <span class="text-[11px] text-slate-500">Hỗ trợ chọn trực tiếp Trình độ ngoại ngữ hiện tại (A1.1, A1, A2.1, A2, B1.1, B1...) & Chuẩn CNTT</span>
    `;
  }

  // Event Delegation xử lý .btn-open-transcript, .select-cumul-lang, .select-cumul-it tại document
}

export function openTranscriptModal(studentId) {
  if (AppState.role === 'student') {
    const selfStudent = getLoggedInStudent();
    if (!selfStudent || selfStudent.id !== studentId) {
      showToast('Bảo mật: Học viên chỉ được phép xem phiếu điểm tích lũy của chính mình!', 'error');
      return;
    }
  }

  const student = AppState.students.find(s => s.id === studentId);
  if (!student) return;

  const classScope = getCurrentUserClassScope();
  if (classScope && student.class !== classScope) {
    showToast(`Tài khoản Lớp ${classScope} không được phép truy cập dữ liệu của lớp khác!`, 'error');
    return;
  }

  const gpa10 = calculateYearGPA(student.id);
  const gpa4 = calculateCumulativeGPA4(student.id);
  const passedTC = calculateCreditsPassed(student.id);
  const totalCourseTC = getTotalCourseCredits(student.class);
  const rank = getClassification(gpa10);
  const pos = student.position || student.role || 'Học viên';

  document.getElementById('transcriptModalTitle').textContent = `Phiếu Điểm Tích Lũy Toàn Khóa: ${student.name}`;
  document.getElementById('tcName').textContent = student.name;
  document.getElementById('tcCode').textContent = student.code;
  document.getElementById('tcClass').textContent = `${student.class} • ${pos}`;
  document.getElementById('tcRank').textContent = `${student.rank} • Ngoại ngữ: ${student.currentLangLevel || 'A2'} • ${student.itStandard || 'Đạt chuẩn CNTT cơ bản'}`;

  document.getElementById('tcGpa10').textContent = gpa10.toFixed(2);
  document.getElementById('tcGpa4').textContent = `${gpa4.toFixed(2)} / 4.00`;
  document.getElementById('tcCredits').textContent = `${passedTC} / ${totalCourseTC} TC`;
  document.getElementById('tcClassification').textContent = rank;

  const studentGrades = AppState.grades[student.id] || {};
  const renderSubjRow = (sub, idx) => {
    const sc10 = studentGrades[sub.id];
    const hasScore = sc10 !== undefined && sc10 !== null && sc10 !== '' && !isNaN(sc10);
    const { letter, scale4, status } = getGradeLetterAndScale4(sc10);
    const sc4 = hasScore ? scale4.toFixed(1) : '-';
    const isFail = hasScore && Number(sc10) < 4.0;

    return `
      <tr class="hover:bg-slate-50 ${isFail ? 'bg-rose-50/50' : ''}">
        <td class="p-2 text-center text-slate-500">${idx + 1}</td>
        <td class="p-2 font-mono font-bold text-slate-700">${sub.code}</td>
        <td class="p-2 font-medium text-slate-900">${sub.name} ${sub.category === 'specialized' ? `<span class="text-[10px] font-bold text-amber-800">(CN ${sub.targetClass})</span>` : ''}</td>
        <td class="p-2 text-center font-bold text-gold-600">${sub.credits}</td>
        <td class="p-2 text-center font-bold ${isFail ? 'text-rose-700 font-black' : 'text-slate-800'}">${hasScore ? Number(sc10).toFixed(1) : '-'}</td>
        <td class="p-2 text-center font-black ${isFail ? 'text-rose-700' : 'text-army-800'}">${letter}</td>
        <td class="p-2 text-center font-bold text-blue-800">${sc4}</td>
        <td class="p-2 text-center">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isFail ? 'bg-rose-100 text-rose-800' : hasScore ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
            ${status}
          </span>
        </td>
      </tr>
    `;
  };

  const hk1Subs = getSubjectsForClass(student.class, 1);
  const hk2Subs = getSubjectsForClass(student.class, 2);
  const elHk1 = document.getElementById('tcHk1TableBody');
  const elHk2 = document.getElementById('tcHk2TableBody');
  if (elHk1) elHk1.innerHTML = hk1Subs.map(renderSubjRow).join('');
  if (elHk2) elHk2.innerHTML = hk2Subs.map(renderSubjRow).join('');

  const s1El = document.getElementById('tcHk1Summary');
  const s2El = document.getElementById('tcHk2Summary');
  if (s1El) s1El.textContent = `DTB HK1 (10): ${calculateSemesterGPA(student.id, 1).toFixed(2)}`;
  if (s2El) s2El.textContent = `DTB HKII (10): ${calculateSemesterGPA(student.id, 2).toFixed(2)}`;

  showModal('modalTranscriptDetail');
}

export function exportCumulativeExcel() {
  const classScope = getCurrentUserClassScope();
  const targetClass = classScope || document.getElementById('cumulFilterClass')?.value || 'all';
  const targetRank = document.getElementById('cumulFilterRank')?.value || 'all';
  const filterYear = parseInt(document.getElementById('cumulFilterYear')?.value || AppState.cumulativeSelectedYear || '1', 10) || 1;
  const sem1 = 2 * filterYear - 1;
  const sem2 = 2 * filterYear;

  let studentsToExport = getScopedStudents();
  if (targetClass !== 'all') {
    studentsToExport = studentsToExport.filter(s => s.class === targetClass);
  }
  if (targetRank !== 'all') {
    studentsToExport = studentsToExport.filter(s => getClassification(calculateYearGPA(s.id)) === targetRank);
  }

  studentsToExport.sort((a, b) => calculateYearGPA(b.id) - calculateYearGPA(a.id));

  const headers = [
    'STT', 'Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp',
    'Tín chỉ tích lũy', 'DTB HK1 (10)', 'DTB HKII (10)',
    'ĐTB Tích Lũy (Hệ 10)', 'Xếp loại (Hệ 10)', 'Điểm Hệ 4 (/4.0)',
    'Trình độ ngoại ngữ hiện tại', 'Chuẩn CNTT', 'Số học phần rớt (< 4.0)'
  ];

  const rows = [
    ['BỘ QUỐC PHÒNG - HỌC VIỆN KỸ THUẬT QUÂN SỰ'],
    ['TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    [targetClass !== 'all' ? `BẢNG ĐIỂM TÍCH LŨY - LỚP ${targetClass}` : 'BẢNG ĐIỂM TÍCH LŨY TOÀN ĐẠI ĐỘI 460'],
    [],
    headers
  ];

  studentsToExport.forEach((s, idx) => {
    const gpa10 = calculateYearGPA(s.id);
    const gpa4 = calculateCumulativeGPA4(s.id);
    const gpaHK1 = calculateSemesterGPA(s.id, sem1);
    const gpaHK2 = calculateSemesterGPA(s.id, sem2);
    const passedTC = calculateCreditsPassed(s.id);
    const totalTC = getTotalCourseCredits(s.class);
    const debts = getDebtSubjects(s.id);

    rows.push([
      idx + 1,
      s.code,
      s.name,
      s.rank,
      s.class,
      `${passedTC} / ${totalTC} TC`,
      gpaHK1.toFixed(2),
      gpaHK2.toFixed(2),
      gpa10.toFixed(2),
      getClassification(gpa10),
      gpa4.toFixed(2),
      s.currentLangLevel || 'A2',
      s.itStandard || 'Đạt chuẩn CNTT cơ bản',
      debts.length
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map(() => ({ wch: 16 }));
  ws['!cols'][2] = { wch: 24 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Diem_Tich_Luy');
  XLSX.writeFile(wb, `Bang_Diem_Tich_Luy_${targetClass !== 'all' ? targetClass : 'Dai_Doi_460'}.xlsx`);
}

// --- 17. ĐỒNG BỘ ĐÁM MÂY SUPABASE (wxiimjbseovuxmvolswh) ---
export const CloudSync = {
  unitRoomId: 'daidoi460',
  supabaseUrl: SUPABASE_URL,
  supabaseKey: SUPABASE_KEY,
  supabaseProjectRef: SUPABASE_PROJECT_REF,
  isOnline: true,
  realtimeChannel: null,
  debounceTimer: null,
  isIncomingSync: false
};

export function initCloudSyncConfig() {
  CloudSync.unitRoomId = SUPABASE_CONFIG.unitId || 'daidoi460';
  CloudSync.supabaseUrl = SUPABASE_URL;
  CloudSync.supabaseKey = SUPABASE_KEY;
  CloudSync.supabaseProjectRef = SUPABASE_PROJECT_REF;
  updateShareLinksInModal();
  connectFirebaseRealtime();
}

export function updateShareLinksInModal() {
  const cfgRoom = document.getElementById('cfgUnitRoomId');
  if (cfgRoom) cfgRoom.value = CloudSync.unitRoomId;
  const cfgUrl = document.getElementById('cfgFirebaseDbUrl');
  if (cfgUrl) cfgUrl.value = CloudSync.supabaseUrl;
  const cfgKey = document.getElementById('cfgFirebaseApiKey');
  if (cfgKey) cfgKey.value = CloudSync.supabaseKey;
  const cfgPrj = document.getElementById('cfgFirebaseProjectId');
  if (cfgPrj) cfgPrj.value = CloudSync.supabaseProjectRef;
}

export function connectFirebaseRealtime() {
  const dot = document.getElementById('cloudDot');
  const lbl = document.getElementById('cloudStatusLabel');

  initSupabaseClient(
    CloudSync.supabaseUrl || SUPABASE_URL,
    CloudSync.supabaseKey || SUPABASE_KEY
  );

  if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
  if (lbl) lbl.textContent = `Supabase (${CloudSync.supabaseProjectRef})`;

  CloudSync.realtimeChannel = subscribeSupabaseRealtime(async () => {
    if (CloudSync.isIncomingSync) return;
    CloudSync.isIncomingSync = true;
    try {
      const freshData = await loadAllDataFromSupabase(CloudSync.unitRoomId || 'daidoi460');
      if (freshData && typeof freshData === 'object') {
        applyCloudSnapshotToState(freshData);
        AppState.isLoadingCloud = false;
        updateAllViews();
      }
    } catch (err) {
      console.warn('Supabase realtime refresh error:', err);
    } finally {
      setTimeout(() => { CloudSync.isIncomingSync = false; }, 250);
    }
  });
}

export function pushDataToCloud(immediate = false) {
  if (CloudSync.isIncomingSync) return Promise.resolve();
  clearTimeout(CloudSync.debounceTimer);

  const executeWrite = () => {
    return saveUnitSettingsToSupabase(AppState, CloudSync.unitRoomId || 'daidoi460').catch(err => {
      console.warn('Supabase settings sync error:', err);
    });
  };

  if (immediate) {
    return executeWrite();
  } else {
    CloudSync.debounceTimer = setTimeout(executeWrite, 180);
    return Promise.resolve();
  }
}
