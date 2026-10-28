import { studentBirthYear, collectLanguageStatistics, failedStudentExportRows } from './dashboard-statistics.js';
import { writeReportWorkbook } from './report-workbook.js';
import { requestDestructiveConfirmation } from './components/destructive-confirm.js';
/**
 * MODULE: src/js/grades.js
 * Quản lý Kho dữ liệu (AppState & localStorage), Phân loại Môn học (Môn chung & Môn chuyên ngành),
 * Bảng điểm Lớp theo Năm học (Năm 1 -> Năm 5), Bảng điểm cuộn dọc cho Học viên,
 * Điểm tích lũy (DTB HK1 (10), DTB HKII (10), Ngoại ngữ hiện tại),
 * Tổng hợp Toàn Đại đội (Lọc theo kỳ), Báo cáo giao ban (Rớt < 4.0 định dạng [Tên môn] ([Số tín chỉ] TC)).
 */

export const ExternalHooks = {
  renderBentoDashboard: null,
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
  withButtonLock,
  initSupabaseClient,
  loadAllDataFromSupabase,
  upsertStudentToSupabase,
  upsertStudentsBulkToSupabase,
  upsertSubjectToSupabase,
  upsertSubjectsBulkToSupabase,
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
export const EDIT_MODAL_IDS = [
  'modalStudentProfile',
  'modalAddCadet',
  'modalAddSubject',
  'modalUpdateLang',
  'modalImportExcel',
  'modalQuickImportExcel'
];

/**
 * Kiểm tra xem người dùng có đang mở Modal chỉnh sửa, Form chỉnh sửa trực tiếp (Inline Edit),
 * hoặc đang gõ dữ liệu trong bất kỳ ô nhập liệu nào hay không.
 * Khi hàm này trả về `true`, mọi tác vụ làm mới dữ liệu ngầm (Realtime, initData, re-render toàn cục)
 * đều bị khóa hoàn toàn để bảo vệ tuyệt đối dữ liệu đang gõ của người dùng.
 */
export function isAnyEditFormActive() {
  if (AppState.isEditingForm || AppState.studentProfileEditMode) {
    return true;
  }
  if (typeof document === 'undefined') return false;

  for (const id of EDIT_MODAL_IDS) {
    const m = document.getElementById(id);
    if (m && !m.classList.contains('hidden') && m.getAttribute('aria-hidden') !== 'true') {
      return true;
    }
  }

  const inlineContainer = document.getElementById('studentInlineProfileContainer');
  if (inlineContainer && inlineContainer.dataset && inlineContainer.dataset.inlineEditActive === 'true') {
    return true;
  }

  const activeEl = document.activeElement;
  if (activeEl && activeEl !== document.body) {
    if (typeof activeEl.closest === 'function') {
      const inEditForm = activeEl.closest(
        '#formStudentProfile, #formAddCadet, #formAddSubject, #formUpdateLang, #studentInlineProfileContainer[data-inline-edit-active="true"]'
      );
      if (inEditForm) return true;
    }
    const tag = (activeEl.tagName || '').toUpperCase();
    if ((tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') && !activeEl.readOnly && !activeEl.disabled) {
      if (activeEl.classList && activeEl.classList.contains('grid-cell-input')) return true;
    }
  }
  return false;
}

export function showModal(modalId) {
  const m = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!m) return;
  if (m.id && EDIT_MODAL_IDS.includes(m.id)) {
    AppState.isEditingForm = true;
    AppState.editingModalId = m.id;
  }
  m.classList.remove('hidden');
  m.classList.add('flex', 'items-center', 'justify-center');
  m.style.setProperty('display', 'flex', 'important');
  m.style.pointerEvents = 'auto';
  m.style.visibility = 'visible';
  m.style.opacity = '1';
  m.style.zIndex = '50';
  m.setAttribute('aria-hidden', 'false');
}

export function hideModal(modalId) {
  const m = typeof modalId === 'string' ? document.getElementById(modalId) : modalId;
  if (!m) return;
  m.classList.add('hidden');
  m.classList.remove('flex', 'items-center', 'justify-center');
  m.style.setProperty('display', 'none', 'important');
  m.style.pointerEvents = 'none';
  m.style.visibility = 'hidden';
  m.style.opacity = '0';
  m.style.zIndex = '-1';
  m.setAttribute('aria-hidden', 'true');

  if (m.id && EDIT_MODAL_IDS.includes(m.id)) {
    const stillOpen = EDIT_MODAL_IDS.some(otherId => {
      if (otherId === m.id) return false;
      const el = document.getElementById(otherId);
      return el && !el.classList.contains('hidden') && el.getAttribute('aria-hidden') !== 'true';
    });
    if (!stillOpen && !AppState.studentProfileEditMode) {
      AppState.isEditingForm = false;
      AppState.editingModalId = null;
      AppState.editingStudentId = null;
      AppState.editingFormHydratedKey = null;
    }
  }
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
  const requested = requiredStandard || AppState.requiredLangStandard || 'A2';
  const std = LANGUAGE_LEVEL_RANK[requested] !== undefined ? requested : 'A2';
  const cur = actualLevel || 'Chưa đạt';
  const curRank = LANGUAGE_LEVEL_RANK[cur] !== undefined ? LANGUAGE_LEVEL_RANK[cur] : 0;
  const reqRank = LANGUAGE_LEVEL_RANK[std] !== undefined ? LANGUAGE_LEVEL_RANK[std] : 4;
  const isPassed = curRank >= reqRank && cur !== 'Chưa đạt';
  return {
    isPassed,
    requiredStandard: std,
    actualLevel: cur,
    statusText: isPassed ? `Đạt chuẩn (${std})` : `Chưa đạt (${std})`,
    badgeHtml: isPassed
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 whitespace-nowrap">✅ Đạt (${std})</span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-700 border border-rose-300 whitespace-nowrap">⚠️ Chưa đạt (${std})</span>`
  };
}


// --- 1. DANH MỤC MÔN HỌC: MÔN HỌC CHUNG (common) & MÔN HỌC CHUYÊN NGÀNH (specialized) ---
// Khởi tạo danh mục môn học trống hoàn toàn (Loại bỏ hoàn toàn Auto-Seeding 49 môn mẫu cứng)
export const DEFAULT_SUBJECTS = [];

// Khởi tạo danh sách học viên trống hoàn toàn (Loại bỏ hoàn toàn Auto-Seeding 37 học viên mẫu cứng)
export const DEFAULT_STUDENTS = [];

// Chuẩn hóa ngày sinh / ngày tháng sang chuẩn Việt Nam DD/MM/YYYY (Không bao giờ tự ý reset về 2003-01-01)
export function normalizeDateVN(rawVal, fallback = '') {
  if (rawVal === undefined || rawVal === null) return fallback;
  if (typeof rawVal === 'number' && rawVal > 2500) {
    const date = new Date(Math.round((rawVal - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${d}/${m}/${y}`;
    }
  }
  const s = String(rawVal).trim();
  if (!s || s === '-') return fallback;
  if (/^\d{4}$/.test(s)) return s;

  // YYYY-MM-DD hoặc YYYY/MM/DD
  const ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    const d = String(ymd[3]).padStart(2, '0');
    const m = String(ymd[2]).padStart(2, '0');
    const y = ymd[1];
    return `${d}/${m}/${y}`;
  }

  // DD/MM/YYYY hoặc D-M-YYYY hoặc D.M.YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const d = String(dmy[1]).padStart(2, '0');
    const m = String(dmy[2]).padStart(2, '0');
    const y = dmy[3];
    return `${d}/${m}/${y}`;
  }

  // DDMMYYYY (8 chữ số liền nhau, VD: 15052003 -> 15/05/2003)
  const compact = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (compact) {
    return `${compact[1]}/${compact[2]}/${compact[3]}`;
  }

  // Giữ nguyên chuỗi người dùng đang nhập để tuyệt đối không làm mất dữ liệu khi chuyển ô
  return s;
}

// Định dạng ngày hiển thị chuẩn Việt Nam DD/MM/YYYY (hỗ trợ cả YYYY, DD/MM/YYYY, YYYY-MM-DD)
export function formatVN(dateStr) {
  if (dateStr === undefined || dateStr === null) return '-';
  const normalized = normalizeDateVN(dateStr, '');
  return normalized || '-';
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
    if (s.dob) s.dob = normalizeDateVN(s.dob, '');
    else if (s.dob === undefined) s.dob = '';
    if (!s.politicalStatus) s.politicalStatus = 'DOAN_VIEN';
    if (s.party_joined_date === undefined) s.party_joined_date = null;
    else if (s.party_joined_date) s.party_joined_date = normalizeDateVN(s.party_joined_date, '');
    if (s.official_party_date === undefined) s.official_party_date = null;
    else if (s.official_party_date) s.official_party_date = normalizeDateVN(s.official_party_date, '');
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
    if (!s.currentLangLevel) s.currentLangLevel = 'Chưa đạt';
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

/**
 * Từ điển chuẩn hóa Tên môn học đầy đủ (chống hiển thị tên viết tắt hoặc mã môn học khi hiển thị và xuất file Excel)
 */
export const ABBREVIATION_TO_FULL_COURSE_NAME = {
  'TTQS': 'Thể thao quân sự',
  'GDTC': 'Giáo dục thể chất',
  'LTXS': 'Lý thuyết xác suất thống kê',
  'XSTK': 'Lý thuyết xác suất thống kê',
  'LTXSTK': 'Lý thuyết xác suất thống kê',
  'XS&TK': 'Lý thuyết xác suất thống kê',
  'GDCT': 'Giáo dục chính trị',
  'THMLN': 'Triết học Mác - Lênin',
  'KTCT': 'Kinh tế chính trị Mác - Lênin',
  'CNXHKH': 'Chủ nghĩa xã hội khoa học',
  'TTHCM': 'Tư tưởng Hồ Chí Minh',
  'LSD': 'Lịch sử Đảng Cộng sản Việt Nam',
  'LSĐ': 'Lịch sử Đảng Cộng sản Việt Nam',
  'LSDCSVN': 'Lịch sử Đảng Cộng sản Việt Nam',
  'LSĐCSVN': 'Lịch sử Đảng Cộng sản Việt Nam',
  'DLQD': 'Điều lệnh quản trị bộ đội',
  'ĐLQĐ': 'Điều lệnh quản trị bộ đội',
  'DLDN': 'Điều lệnh đội ngũ',
  'ĐLĐN': 'Điều lệnh đội ngũ',
  'DLTC': 'Điều lệnh tác chiến',
  'ĐLTC': 'Điều lệnh tác chiến',
  'KTCDBB': 'Kỹ thuật chiến đấu bộ binh',
  'KTCĐBB': 'Kỹ thuật chiến đấu bộ binh',
  'CTBB': 'Chiến thuật bộ binh',
  'DHQS': 'Địa hình quân sự',
  'ĐHQS': 'Địa hình quân sự',
  'GT1': 'Giải tích 1',
  'GT2': 'Giải tích 2',
  'GT3': 'Giải tích 3',
  'DSTT': 'Đại số tuyến tính',
  'ĐSTT': 'Đại số tuyến tính',
  'VLDC': 'Vật lý đại cương',
  'VLĐC': 'Vật lý đại cương',
  'VLDC1': 'Vật lý đại cương 1',
  'VLĐC1': 'Vật lý đại cương 1',
  'VLDC2': 'Vật lý đại cương 2',
  'VLĐC2': 'Vật lý đại cương 2',
  'VL1': 'Vật lý đại cương 1',
  'VL2': 'Vật lý đại cương 2',
  'HDC': 'Hóa đại cương',
  'HĐC': 'Hóa đại cương',
  'THDC': 'Tin học đại cương',
  'THĐC': 'Tin học đại cương',
  'KTD': 'Kỹ thuật điện',
  'KTĐ': 'Kỹ thuật điện',
  'KTDT': 'Kỹ thuật điện tử',
  'KTĐT': 'Kỹ thuật điện tử',
  'CKT': 'Cơ kỹ thuật',
  'CHKT': 'Cơ học kỹ thuật',
  'SBVL': 'Sức bền vật liệu',
  'NLCTM': 'Nguyên lý - Chi tiết máy',
  'CTM': 'Chi tiết máy',
  'NLM': 'Nguyên lý máy',
  'VKT': 'Vẽ kỹ thuật',
  'KTCK': 'Kỹ thuật cơ khí',
  'TDH': 'Tự động hóa',
  'TĐH': 'Tự động hóa',
  'NN1': 'Ngoại ngữ cơ bản 1',
  'NN2': 'Ngoại ngữ cơ bản 2',
  'NN3': 'Ngoại ngữ quân sự 1',
  'NN4': 'Ngoại ngữ quân sự 2',
  'TN1': 'Tiếng Nga 1',
  'TN2': 'Tiếng Nga 2',
  'TN3': 'Tiếng Nga chuyên ngành',
  'TA1': 'Tiếng Anh 1',
  'TA2': 'Tiếng Anh 2',
  'TA3': 'Tiếng Anh chuyên ngành',
  'DCDT': 'Động cơ đốt trong',
  'ĐCĐT': 'Động cơ đốt trong',
  'LTOTO': 'Lý thuyết ô tô quân sự',
  'LTÔTÔ': 'Lý thuyết ô tô quân sự',
  'KCOTO': 'Kết cấu ô tô quân sự',
  'KCTTG': 'Kết cấu xe tăng - thiết giáp',
  'KTXM': 'Kỹ thuật xe máy công binh',
  'DATN': 'Đồ án tốt nghiệp',
  'ĐATN': 'Đồ án tốt nghiệp',
  'TTTN': 'Thực tập tốt nghiệp'
};

export function expandCourseAbbreviation(rawText, fallbackCode = '') {
  const cleaned = String(rawText || '').normalize('NFC').trim();
  const codeCleaned = String(fallbackCode || '').normalize('NFC').trim();
  const upper = cleaned.toUpperCase().replace(/\s+/g, '');
  const codeUpper = codeCleaned.toUpperCase().replace(/_(?:OTQS1|OTQS2|TTG1|TTG2|XMCB|ALL)$/i, '').replace(/\s+/g, '');

  if (ABBREVIATION_TO_FULL_COURSE_NAME[upper]) {
    return ABBREVIATION_TO_FULL_COURSE_NAME[upper];
  }
  // Nếu chuỗi có dạng "TTQS - Thể thao quân sự" thì chỉ lấy phần tên đầy đủ "Thể thao quân sự"
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const firstUpper = parts[0].toUpperCase().replace(/\s+/g, '');
      const rest = parts.slice(1).join(' - ');
      if (ABBREVIATION_TO_FULL_COURSE_NAME[firstUpper] && rest.length < 5) {
        return ABBREVIATION_TO_FULL_COURSE_NAME[firstUpper];
      }
      if (parts[0].length <= 12 && /^[A-Z0-9_Đ]+$/i.test(parts[0])) {
        return expandCourseAbbreviation(rest);
      }
    }
  }
  if ((!cleaned || cleaned.toUpperCase() === codeCleaned.toUpperCase()) && ABBREVIATION_TO_FULL_COURSE_NAME[codeUpper]) {
    return ABBREVIATION_TO_FULL_COURSE_NAME[codeUpper];
  }
  return cleaned || codeCleaned || 'Môn học';
}

/**
 * Luôn trả về Tên môn học đầy đủ (course_name), tuyệt đối không trả về mã môn học hoặc từ viết tắt
 */
export function getFullSubjectName(sub) {
  if (!sub) return 'Môn học';
  if (typeof sub === 'string') {
    return expandCourseAbbreviation(sub);
  }
  const rawName = sub.course_name || sub.name || '';
  const rawCode = sub.code || '';
  return expandCourseAbbreviation(rawName, rawCode);
}

export function normalizeSubjectsCatalog(subjects) {
  if (!Array.isArray(subjects)) return [];
  return subjects.map(sub => {
    const isSpec = sub.category === 'specialized' || (sub.targetClass && sub.targetClass !== 'all') || (Array.isArray(sub.targetClasses) && sub.targetClasses.length > 0);
    const targetClasses = isSpec ? getSubjectTargetClasses({ ...sub, category: 'specialized' }) : [];
    const fullCourseName = getFullSubjectName(sub);
    return {
      ...sub,
      name: fullCourseName,
      course_name: fullCourseName,
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

/**
 * Chuẩn hóa chuỗi tên môn học / mã môn học để so khớp chính xác (Unicode NFC, viết hoa, bỏ khoảng trắng thừa)
 */
export function normalizeCourseText(raw) {
  if (!raw) return '';
  return String(raw)
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Tạo slug không dấu an toàn cho ID môn học kết hợp (course_name + class_code + semester)
 */
export function slugifyCourseText(raw) {
  if (!raw) return '';
  return String(raw)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Tạo Khóa Kết Hợp (Composite Key): course_name + class_code + semester
 * Giúp phân biệt chính xác cùng một tên môn học nhưng học ở các lớp khác nhau hoặc học kỳ/năm học khác nhau.
 */
export function buildSubjectCompositeKey(courseName, classCode = 'ALL', semester = 1) {
  const normName = normalizeCourseText(courseName);
  const normClass = String(classCode || 'ALL').trim().toUpperCase() || 'ALL';
  const normSem = Number(semester) || 1;
  return `${normName}__${normClass}__HK${normSem}`;
}

/**
 * Tạo ID tất định (Deterministic ID) cho môn học dựa trên khóa kết hợp (course_name + class_code + semester)
 */
export function buildDeterministicSubjectId({ code = '', name = '', category = 'common', targetClasses = [], semester = 1 }) {
  const sem = Number(semester) || 1;
  const isSpec = category === 'specialized';
  const clsPart = isSpec && Array.isArray(targetClasses) && targetClasses.length > 0
    ? targetClasses.map(c => String(c || '').trim().toLowerCase()).filter(Boolean).sort().join('_')
    : 'all';
  const nameSlug = slugifyCourseText(name || code) || 'mon_hoc';
  const codeSlug = slugifyCourseText(code);
  const tail = codeSlug && codeSlug !== nameSlug ? `${codeSlug}_${nameSlug}` : nameSlug;
  return `sub_hk${sem}_${isSpec ? 'spec_' + clsPart : 'common'}_${tail}`.slice(0, 96);
}

/**
 * Tách thông tin từ tiêu đề cột môn học trong file Excel
 * Hỗ trợ các định dạng:
 * - "Giải tích 1"
 * - "Giải tích 1 (3 TC)" / "Giải tích 1 (3TC)"
 * - "Giải tích 1 (HK1)" / "Giải tích 1 (HK2 - 3 TC)"
 * - "GT1 - Giải tích 1"
 */
export function parseExcelSubjectHeader(rawHeader, defaultSemester = null) {
  const original = String(rawHeader || '').normalize('NFC').trim();
  if (!original) return null;

  let semesterHint = defaultSemester ? Number(defaultSemester) : null;
  let creditsHint = null;
  let classHint = null;

  const semMatch = original.match(/\(\s*(?:HK|HỌC\s*KỲ|KỲ)\s*(\d{1,2})\b[^)]*\)/i) ||
                   original.match(/\[\s*(?:HK|HỌC\s*KỲ|KỲ)\s*(\d{1,2})\b[^\]]*\]/i);
  if (semMatch && semMatch[1]) {
    const parsedSem = parseInt(semMatch[1], 10);
    if (parsedSem >= 1 && parsedSem <= 10) semesterHint = parsedSem;
  }

  const credMatch = original.match(/\(\s*(?:[^)]*?\b)?(\d{1,2})\s*TC\b[^)]*\)/i);
  if (credMatch && credMatch[1]) {
    const parsedCred = parseInt(credMatch[1], 10);
    if (parsedCred >= 1 && parsedCred <= 15) creditsHint = parsedCred;
  }

  for (const cls of DEFAULT_CLASSES) {
    const clsRegex = new RegExp(`\\b${cls}\\b`, 'i');
    if (clsRegex.test(original)) {
      classHint = cls;
      break;
    }
  }

  // Loại bỏ các hậu tố chú thích trong ngoặc đơn/ngoặc vuông ở cuối tên môn
  let cleanTitle = original
    .replace(/\s*\(\s*(?:\d+\s*TC|HK\s*\d+|HỌC\s*KỲ\s*\d+|KỲ\s*\d+|CN\s*[^)]*)[^)]*\)\s*/gi, ' ')
    .replace(/\s*\[\s*(?:\d+\s*TC|HK\s*\d+|HỌC\s*KỲ\s*\d+|KỲ\s*\d+|CN\s*[^\]]*)[^\]]*\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanTitle) {
    cleanTitle = original.split('(')[0].trim();
  }

  let codeCandidate = '';
  let nameCandidate = cleanTitle;
  if (cleanTitle.includes(' - ')) {
    const parts = cleanTitle.split(' - ').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 2 && parts[0].length <= 15) {
      codeCandidate = parts[0].toUpperCase();
      nameCandidate = parts.slice(1).join(' - ');
    }
  }

  const fullExpandedCourseName = expandCourseAbbreviation(nameCandidate || cleanTitle, codeCandidate);
  return {
    original,
    cleanTitle,
    courseName: fullExpandedCourseName,
    codeCandidate: codeCandidate || '',
    normTitle: normalizeCourseText(cleanTitle),
    normCourseName: normalizeCourseText(fullExpandedCourseName),
    normCode: normalizeCourseText(codeCandidate),
    semesterHint,
    creditsHint,
    classHint
  };
}

/**
 * Tìm kiếm hoặc tự động khởi tạo Môn học theo Khóa Kết Hợp (course_name + class_code + semester/term)
 * Đảm bảo khi import Excel có cùng tên môn học ở nhiều lớp hoặc nhiều học kỳ khác nhau,
 * hệ thống luôn nhận diện chính xác đúng môn học của lớp đó và kỳ đó.
 */
export function resolveSubjectByCompositeKey({
  headerInfo,
  studentClass = 'OTQS1',
  semesterHint = null,
  yearHint = 1,
  autoCreate = true,
  newSubjectsMap = null
}) {
  if (!headerInfo || !headerInfo.normTitle) return null;

  const targetCls = (studentClass && String(studentClass).toLowerCase() !== 'all')
    ? String(studentClass).trim().toUpperCase()
    : (headerInfo.classHint || 'OTQS1');

  const effectiveSem = Number(headerInfo.semesterHint || semesterHint || (2 * (Number(yearHint) || 1) - 1)) || 1;
  const sem1 = 2 * (Number(yearHint) || 1) - 1;
  const sem2 = 2 * (Number(yearHint) || 1);

  const matchesTitleOrCode = (sub) => {
    const subFullName = normalizeCourseText(getFullSubjectName(sub));
    const subName = normalizeCourseText(sub.name);
    const subCode = normalizeCourseText(sub.code);
    if (subFullName && (subFullName === headerInfo.normCourseName || subFullName === headerInfo.normTitle)) return true;
    if (subName && (subName === headerInfo.normCourseName || subName === headerInfo.normTitle)) return true;
    if (subCode && (subCode === headerInfo.normTitle || subCode === headerInfo.normCourseName || (headerInfo.normCode && subCode === headerInfo.normCode))) return true;
    return false;
  };

  // Danh sách các môn áp dụng cho lớp của học viên này
  const classApplicable = AppState.subjects.filter(sub => doesSubjectApplyToClass(sub, targetCls));

  // Ưu tiên 1: Khớp chính xác theo Khóa kết hợp (course_name + class_code + effectiveSem)
  // Ưu tiên môn chuyên ngành riêng của lớp trước, sau đó đến môn chung trong cùng học kỳ
  const exactSemMatches = classApplicable.filter(
    sub => Number(sub.semester) === effectiveSem && matchesTitleOrCode(sub)
  );
  if (exactSemMatches.length > 0) {
    const specMatch = exactSemMatches.find(sub => sub.category === 'specialized');
    return specMatch || exactSemMatches[0];
  }

  // Ưu tiên 2: Nếu không có gợi ý kỳ cố định từ tiêu đề, tìm trong 2 học kỳ của Năm học đang chọn (sem1, sem2) cho đúng lớp đó
  if (!headerInfo.semesterHint) {
    const yearMatches = classApplicable.filter(
      sub => (Number(sub.semester) === sem1 || Number(sub.semester) === sem2) && matchesTitleOrCode(sub)
    );
    if (yearMatches.length > 0) {
      const specMatch = yearMatches.find(sub => sub.category === 'specialized');
      return specMatch || yearMatches[0];
    }
  }

  // Ưu tiên 3: Nếu môn học đã tồn tại ở kỳ đúng nhưng đang là môn chuyên ngành của lớp khác -> Mở rộng hoặc tách riêng theo lớp
  const sameSemOtherClass = AppState.subjects.filter(
    sub => Number(sub.semester) === effectiveSem && matchesTitleOrCode(sub)
  );
  if (sameSemOtherClass.length > 0 && !autoCreate) {
    return sameSemOtherClass[0];
  }

  // Ưu tiên 4: Tìm trong toàn khóa của lớp đó nếu môn chỉ xuất hiện duy nhất 1 lần
  if (!headerInfo.semesterHint && !semesterHint) {
    const anySemMatches = classApplicable.filter(matchesTitleOrCode);
    if (anySemMatches.length === 1) {
      return anySemMatches[0];
    }
  }

  if (!autoCreate) return null;

  // Tự động khởi tạo môn học mới theo Khóa kết hợp (course_name + class_code + effectiveSem)
  // nếu trong DB chưa có môn đó cho lớp & kỳ tương ứng để không bị rớt dữ liệu điểm khi đẩy Excel lên!
  const courseName = headerInfo.courseName || headerInfo.cleanTitle;
  const generatedCode = headerInfo.codeCandidate ||
    slugifyCourseText(courseName)
      .split('_')
      .filter(Boolean)
      .map(w => w[0] ? w[0].toUpperCase() : '')
      .join('')
      .slice(0, 8) ||
    'MH';

  const isClassSpecific = sameSemOtherClass.length > 0 || Boolean(headerInfo.classHint);
  const category = isClassSpecific ? 'specialized' : 'common';
  const targetClasses = isClassSpecific ? [targetCls] : [];
  const targetClass = isClassSpecific ? targetCls : 'all';
  const credits = headerInfo.creditsHint || (sameSemOtherClass[0]?.credits) || 3;
  const code = isClassSpecific ? `${generatedCode}_${targetCls}` : generatedCode;

  const newSubId = buildDeterministicSubjectId({
    code,
    name: courseName,
    category,
    targetClasses,
    semester: effectiveSem
  });

  let existingById = AppState.subjects.find(s => s.id === newSubId);
  if (existingById) {
    if (existingById.category === 'specialized' && !getSubjectTargetClasses(existingById).includes(targetCls)) {
      const merged = Array.from(new Set([...getSubjectTargetClasses(existingById), targetCls]));
      existingById.targetClasses = merged;
      existingById.targetClass = merged.join(', ');
      if (newSubjectsMap) newSubjectsMap.set(existingById.id, existingById);
    }
    return existingById;
  }

  const newSubj = {
    id: newSubId,
    code,
    name: courseName,
    semester: effectiveSem,
    credits: Number(credits) || 3,
    category,
    targetClasses,
    targetClass
  };

  AppState.subjects.push(newSubj);
  if (newSubjectsMap) {
    newSubjectsMap.set(newSubj.id, newSubj);
  }
  return newSubj;
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
  isEditingForm: false,
  editingModalId: null,
  editingStudentId: null,
  editingFormHydratedKey: null,
  hasPendingCloudRefresh: false,
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
    year: 1,
    rank: 'all',
    debt: 'all',
    search: ''
  },
  dashboardFilters: {
    mode: 'course', // 'semester' (Theo kỳ) | 'year' (Theo năm) | 'course' (Từ đầu khóa đến giờ)
    semester: 1,
    year: 1,
    class: 'all'
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
      if (isAnyEditFormActive()) {
        // Nếu người dùng đã mở form chỉnh sửa trong lúc đang tải, hoãn đồng bộ ngược để không reset form
        AppState.hasPendingCloudRefresh = true;
      } else {
        applyCloudSnapshotToState(cloudData);
      }
    }
  } catch (err) {
    console.warn('Lỗi tải dữ liệu ban đầu từ Supabase:', err);
    showToast('Không tải được dữ liệu từ Supabase. Kiểm tra kết nối trước khi chỉnh sửa.', 'error');
  } finally {
    AppState.isLoadingCloud = false;
    if (!isAnyEditFormActive()) {
      updateAllViews();
    }
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
  const currentLvl = st?.currentLangLevel || l.currentLevel || 'Chưa đạt';

  const russianLevelsOrder = [
    { key: 'B12', label: 'B1.2', desc: 'Chuẩn Đầu ra Tốt nghiệp' },
    { key: 'B11', label: 'B1.1', desc: 'Chuẩn Năm thứ 4' },
    { key: 'A22', label: 'A2.2', desc: 'Chuẩn Năm thứ 3' },
    { key: 'A21', label: 'A2.1', desc: 'Chuẩn Năm thứ 2' },
    { key: 'A1',  label: 'A1',   desc: 'Chuẩn Năm thứ 1' }
  ];

  const primaryTitle = `${l.lang || 'Tiếng Nga'}: Mức ${currentLvl}`;
  const primaryStatus = evaluateLangLevelStatus(currentLvl).statusText;

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

    primaryTitle,
    primaryStatus,
    detailedLevels,
    extraCerts
  };
}

export const RANK_LEVELS = ['Xuất sắc', 'Giỏi', 'Khá', 'Trung bình khá', 'Trung bình', 'Yếu', 'Kém'];

export function getClassification(gpa) {
  const val = Number(gpa) || 0;
  if (val >= 9.0) return 'Xuất sắc';
  if (val >= 8.0) return 'Giỏi';
  if (val >= 7.0) return 'Khá';
  if (val >= 6.5) return 'Trung bình khá';
  if (val >= 5.5) return 'Trung bình';
  if (val >= 5.0) return 'Yếu';
  return 'Kém';
}

export function getClassificationBadge(rank) {
  switch (rank) {
    case 'Xuất sắc':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">Xuất sắc</span>';
    case 'Giỏi':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 whitespace-nowrap">Giỏi</span>';
    case 'Khá':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">Khá</span>';
    case 'Trung bình khá':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-300 whitespace-nowrap">Trung bình khá</span>';
    case 'Trung bình':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap">Trung bình</span>';
    case 'Yếu':
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-orange-100 text-orange-800 border border-orange-300 whitespace-nowrap">Yếu</span>';
    default:
      return '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 whitespace-nowrap">Kém</span>';
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
  const fullCourseName = getFullSubjectName(subject);
  return `${fullCourseName} (${subject.credits} TC)`;
}

export function isCurrentSheetLocked() {
  const key = `${AppState.currentSheetClass}_year_${AppState.currentSheetSemester}`;
  return !!AppState.locks[key];
}

export function canUserEditCurrentSheet() {
  if (AppState.role === 'admin') return true;
  if (AppState.role === 'company_officer') return false;
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
    <span></span>
  `;
  toast.querySelector('span').textContent = String(message);
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
    const fullName = getFullSubjectName(s);
    return `
      <th class="py-2 px-2 text-center min-w-[125px] max-w-[180px] ${isSpec ? 'bg-amber-50/80' : ''} group relative" title="${fullName} (${s.credits} TC • ${isSpec ? 'Môn chuyên ngành ' + s.targetClass : 'Môn chung'})">
        <div class="flex items-center justify-center gap-1">
          <span class="font-bold ${isSpec ? 'text-amber-900' : 'text-slate-800'} truncate text-[11px]">${fullName}</span>
          ${isSpec ? `<span class="px-1 py-0.2 rounded text-[9px] font-black bg-amber-200 text-amber-900 shrink-0">CN</span>` : ''}
        </div>
        <div class="text-[9px] text-slate-500 font-normal">(${s.credits} TC${isSpec ? ' • ' + s.targetClass : ''})</div>
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

        </div>
      </th>
      <th colspan="${Math.max(1, subsHK2.length) + 1}" class="py-1.5 px-2 text-center bg-slate-800 text-emerald-300 font-bold border-b border-slate-700">
        <div class="flex items-center justify-center gap-2 flex-wrap">
          <span>Học Kỳ 2 - Năm Thứ ${yearNum} (Kỳ ${sem2})</span>

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
    tbodyHtml = `<tr><td colspan="25" class="py-12 text-center text-slate-400 font-medium">${selectedClass === 'all' ? 'Đại đội 460 hiện chưa có dữ liệu học viên (0 đồng chí).' : 'Lớp ' + selectedClass + ' hiện chưa có dữ liệu học viên.'} Vào <strong>Hồ sơ quân nhân → Nhập Excel</strong> để thêm học viên theo mã.</td></tr>`;
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
                value="${score !== '' ? Number(score).toFixed(2) : ''}"
                class="grid-cell-input w-full h-8 text-center text-xs font-semibold bg-transparent border-0 focus:outline-none transition"
                maxlength="5" />
            </td>
          `;
        } else {
          return `
            <td class="p-0 text-center ${isFail ? 'bg-rose-50 text-rose-700 font-bold' : 'text-slate-800'}">
              <input type="text" value="${score !== '' ? Number(score).toFixed(2) : '-'}" disabled readonly
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
  const activeGridInput = (typeof document !== 'undefined' && document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('grid-cell-input'))
    ? {
        studentId: document.activeElement.dataset.student,
        subjectId: document.activeElement.dataset.subject,
        value: document.activeElement.value,
        originalVal: document.activeElement.dataset.originalVal || '',
        selStart: document.activeElement.selectionStart,
        selEnd: document.activeElement.selectionEnd
      }
    : null;

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
    if (activeGridInput && activeGridInput.studentId && activeGridInput.subjectId) {
      const restoredInput = tbody.querySelector(
        `.grid-cell-input[data-student="${activeGridInput.studentId}"][data-subject="${activeGridInput.subjectId}"]`
      );
      if (restoredInput) {
        restoredInput.value = activeGridInput.value;
        restoredInput.dataset.originalVal = activeGridInput.originalVal;
        restoredInput.focus();
        try {
          if (typeof activeGridInput.selStart === 'number' && typeof activeGridInput.selEnd === 'number') {
            restoredInput.setSelectionRange(activeGridInput.selStart, activeGridInput.selEnd);
          }
        } catch (e) {}
      }
    }
  }
}

export function renderStudentVerticalGrades() {
  const container = document.getElementById('studentVerticalGradesWrapper');
  if (!container) return;

  const student = getLoggedInStudent() || (AppState.role !== 'student' ? AppState.students.find(s => s.id === AppState.studentViewingId) || AppState.students[0] : null);
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
      const dispScore = !hasScore ? '-' : isScale4 ? `${scale4.toFixed(1)} (${letter})` : Number(sc).toFixed(2);
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
            <div class="text-xs font-bold text-slate-900 truncate mt-0.5" title="${getFullSubjectName(s)}">${getFullSubjectName(s)}</div>
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

export async function handleGradeChange(inputEl) {
  if (!canUserEditCurrentSheet()) {
    showToast('Bạn không có quyền chỉnh sửa điểm số của lớp này!', 'error');
    inputEl.value = inputEl.dataset.originalVal || '';
    return;
  }
  if (inputEl.dataset.saving === 'true') return;

  let rawVal = inputEl.value.trim().replace(',', '.');
  const origVal = inputEl.dataset.originalVal || '';
  const studentId = inputEl.dataset.student;
  const subjectId = inputEl.dataset.subject;

  if (rawVal === '') {
    inputEl.dataset.saving = 'true';
    inputEl.disabled = true;
    try {
      if (AppState.grades[studentId]) {
        delete AppState.grades[studentId][subjectId];
      }
      await deleteGradeFromSupabase(studentId, subjectId);
      logAuditTrail(studentId, subjectId, origVal, 'Trống', 'Xóa điểm trên Supabase');
      renderSpreadsheet();
      updateAllViews();
    } finally {
      inputEl.dataset.saving = 'false';
      inputEl.disabled = false;
    }
    return;
  }

  const num = Number(rawVal);
  if (isNaN(num) || num < 0.0 || num > 10.0) {
    showToast('Điểm không hợp lệ! Vui lòng nhập số từ 0.0 đến 10.0', 'error');
    inputEl.value = origVal;
    return;
  }

  const rounded = Math.round(num * 100) / 100;
  inputEl.value = rounded.toFixed(2);

  inputEl.dataset.saving = 'true';
  inputEl.disabled = true;
  try {
    if (!AppState.grades[studentId]) {
      AppState.grades[studentId] = {};
    }
    AppState.grades[studentId][subjectId] = rounded;
    await upsertGradeToSupabase(studentId, subjectId, rounded);

    if (origVal !== rounded.toFixed(2)) {
      logAuditTrail(studentId, subjectId, origVal, rounded.toFixed(2), 'Cập nhật điểm trực tiếp lên Supabase');
    }

    renderSpreadsheet();
    updateAllViews();
  } finally {
    inputEl.dataset.saving = 'false';
    inputEl.disabled = false;
  }
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
    subject: subject ? getFullSubjectName(subject) : subjectId,
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

  const year = Math.min(5, Math.max(1, Number(document.getElementById('masterFilterSemester')?.value || filters.year) || 1));
  filters.year = year;
  const sem1 = year * 2 - 1, sem2 = year * 2;
  const thSemCol = document.getElementById('masterThScoreLabel');
  if (thSemCol) thSemCol.textContent = 'ĐTB Cả Năm';

  let filtered = getScopedStudents();

  if (filters.class && filters.class !== 'all') {
    filtered = filtered.filter(s => s.class === filters.class);
  }

  const getStudentTargetGpa = sid => calculateAcademicYearGPA(sid, year);

  if (filters.rank && filters.rank !== 'all') {
    filtered = filtered.filter(s => getClassification(getStudentTargetGpa(s.id)) === filters.rank);
  }

  if (filters.debt === 'debt_only') {
    filtered = filtered.filter(s => getDebtSubjects(s.id, null, year).length > 0);
  } else if (filters.debt === 'no_debt') {
    filtered = filtered.filter(s => getDebtSubjects(s.id, null, year).length === 0);
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
    const gpa1 = calculateSemesterGPA(student.id, sem1);
    const gpa2 = calculateSemesterGPA(student.id, sem2);
    const targetGpa = getStudentTargetGpa(student.id);
    const rank = getClassification(targetGpa);
    const debts = getDebtSubjects(student.id, null, year);

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
    const semLabel = `Năm ${year} (Học kỳ ${sem1} & ${sem2})`;
    footer.innerHTML = `
      <span>Hiển thị <strong>${filtered.length}</strong> / ${scopeTotal} học viên • Năm học: <strong>${semLabel}</strong></span>
      <span class="text-[11px] text-slate-500">Đại đội 460 • Tiểu đoàn 4</span>
    `;
  }
}

// --- 6. BÁO CÁO GIAO BAN (3 BẢNG CHUẨN): BẢNG 1 (TỶ LỆ TÍCH LŨY) • BẢNG 2 (TỶ LỆ TỪNG NĂM & TỪNG HỌC KỲ) • BẢNG 3 (DANH SÁCH HỌC VIÊN RỚT MÔN CẦN BỒI DƯỠNG) ---

export const RANK_META = [
  { name: 'Xuất sắc', standard: '9.00 ≤ ĐTB ≤ 10.00', desc: 'Đạt danh hiệu Học viên Xuất sắc / Chiến sĩ thi đua', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { name: 'Giỏi', standard: '8.00 ≤ ĐTB < 9.00', desc: 'Đạt danh hiệu Học viên Giỏi tiêu biểu', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  { name: 'Khá', standard: '7.00 ≤ ĐTB < 8.00', desc: 'Học lực vững chắc, hoàn thành tốt nhiệm vụ', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { name: 'Trung bình khá', standard: '6.50 ≤ ĐTB < 7.00', desc: 'Cần tiếp tục củng cố kiến thức và nâng cao kết quả học tập', badge: 'bg-cyan-100 text-cyan-900 border-cyan-300' },
  { name: 'Trung bình', standard: '5.50 ≤ ĐTB < 6.50', desc: 'Đạt yêu cầu, cần tăng cường tự học nâng cao điểm số', badge: 'bg-amber-100 text-amber-900 border-amber-300' },
  { name: 'Yếu', standard: '5.00 ≤ ĐTB < 5.50', desc: 'Cần tăng cường ôn tập để nâng cao kết quả', badge: 'bg-orange-100 text-orange-900 border-orange-300' },
  { name: 'Kém', standard: 'ĐTB < 5.00', desc: 'Cần bồi dưỡng; chỉ môn dưới 4.00 mới tính là rớt', badge: 'bg-rose-100 text-rose-900 border-rose-300' }
];

// All screens and exports share the same seven-level classification policy.
export const REPORT_RANK_META = RANK_META;
export const REPORT_RANK_LEVELS = REPORT_RANK_META.map(item => item.name);
export function getReportClassification(score) {
  return getClassification(score);
}

/**
 * Tính toán toàn diện thống kê học lực 7 mức (Xuất sắc, Giỏi, Khá, Trung bình khá, Trung bình, Yếu, Kém),
 * Tỷ lệ đạt/rớt học phần, Tổng số học viên rớt môn, Tổng số lượt rớt và Danh sách chi tiết môn rớt
 * theo từng mốc thời gian:
 * - mode = 'semester' : Theo Học kỳ (HK1 -> HK10)
 * - mode = 'year'     : Theo Năm học (Năm 1 -> Năm 5)
 * - mode = 'course'   : Từ đầu khóa đến nay (Tích lũy toàn khóa)
 */
export function computeTimeframeAcademicStats(studentsList = [], mode = 'course', semester = 1, year = 1, policy = 'academic') {
  const levels = policy === 'report' ? REPORT_RANK_LEVELS : RANK_LEVELS;
  const classify = policy === 'report' ? getReportClassification : getClassification;
  const semNum = Number(semester) || 1;
  const yearNum = Number(year) || 1;
  const totalCadets = Array.isArray(studentsList) ? studentsList.length : 0;

  const rankCounts = Object.fromEntries(levels.map(rank => [rank, 0]));

  const rankDebtStudents = Object.fromEntries(levels.map(rank => [rank, 0]));

  const rankFailInstances = Object.fromEntries(levels.map(rank => [rank, 0]));

  const classScope = getCurrentUserClassScope();
  const visibleClasses = classScope ? [classScope] : DEFAULT_CLASSES;
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
      kem: 0,
      rankCounts: Object.fromEntries(levels.map(rank => [rank, 0])),
      yeu: 0,
      passedCourses: 0,
      failedCourses: 0,
      totalGradedCourses: 0,
      debtStudents: 0,
      totalFails: 0
    };
  });

  let totalGpaSum = 0;
  let goodCount = 0; // Xuất sắc + Giỏi
  let khaGioiXsCount = 0; // Xuất sắc + Giỏi + Khá
  let debtStudentCount = 0;
  let totalDebtFailsCount = 0;
  let passedCourseInstances = 0;
  let failedCourseInstances = 0;
  let totalGradedCourseInstances = 0;

  const debtCadetsList = [];
  const failedCourseDetailsList = [];

  studentsList.forEach(s => {
    const studentGrades = AppState.grades[s.id] || {};
    let applicableSubjects = [];
    let gpa = 0;

    if (mode === 'semester') {
      applicableSubjects = getSubjectsForClass(s.class, semNum);
      gpa = calculateSemesterGPA(s.id, semNum);
    } else if (mode === 'year') {
      const s1 = 2 * yearNum - 1;
      const s2 = 2 * yearNum;
      applicableSubjects = [
        ...getSubjectsForClass(s.class, s1),
        ...getSubjectsForClass(s.class, s2)
      ];
      gpa = calculateAcademicYearGPA(s.id, yearNum);
    } else {
      applicableSubjects = getSubjectsForClass(s.class);
      gpa = calculateYearGPA(s.id);
    }

    totalGpaSum += gpa;
    const rank = classify(gpa);
    const effectiveRank = rankCounts[rank] !== undefined ? rank : 'Trung bình';
    rankCounts[effectiveRank]++;

    if (effectiveRank === 'Xuất sắc' || effectiveRank === 'Giỏi') goodCount++;
    if (effectiveRank === 'Xuất sắc' || effectiveRank === 'Giỏi' || effectiveRank === 'Khá') khaGioiXsCount++;

    const studentDebts = [];
    let studentPassedCourses = 0;
    let studentFailedCourses = 0;

    applicableSubjects.forEach(sub => {
      const rawScore = studentGrades[sub.id];
      if (rawScore !== undefined && rawScore !== null && rawScore !== '' && !isNaN(rawScore)) {
        const numScore = Number(rawScore);
        totalGradedCourseInstances++;
        if (numScore < 4.0) {
          failedCourseInstances++;
          studentFailedCourses++;
          const fullCourseName = getFullSubjectName(sub);
          studentDebts.push({
            subject: { ...sub, name: fullCourseName, course_name: fullCourseName },
            score: numScore
          });
          failedCourseDetailsList.push({
            student: s,
            studentCode: s.code,
            studentName: s.name,
            studentRank: s.rank,
            studentClass: s.class,
            subject: sub,
            courseName: fullCourseName,
            semester: Number(sub.semester) || 1,
            academicYear: Math.ceil((Number(sub.semester) || 1) / 2),
            credits: Number(sub.credits) || 3,
            score: numScore,
            gpa,
            classification: effectiveRank
          });
        } else {
          passedCourseInstances++;
          studentPassedCourses++;
        }
      }
    });

    const hasDebt = studentDebts.length > 0;
    if (hasDebt) {
      debtStudentCount++;
      totalDebtFailsCount += studentDebts.length;
      rankDebtStudents[effectiveRank] = (rankDebtStudents[effectiveRank] || 0) + 1;
      rankFailInstances[effectiveRank] = (rankFailInstances[effectiveRank] || 0) + studentDebts.length;
      debtCadetsList.push({
        student: s,
        yearGpa: gpa,
        rank: effectiveRank,
        debts: studentDebts,
        failCount: studentDebts.length
      });
    }

    const cs = classStats[s.class];
    if (cs) {
      cs.count++;
      cs.totalGpa += gpa;
      cs.rankCounts[effectiveRank]++;
      if (effectiveRank === 'Xuất sắc') cs.xs++;
      else if (effectiveRank === 'Giỏi') cs.gioi++;
      else if (effectiveRank === 'Khá') cs.kha++;
      else if (effectiveRank === 'Trung bình khá') cs.tbk++;
      else if (effectiveRank === 'Trung bình') cs.tb++;
      else if (effectiveRank === 'Yếu') cs.yeu++;
      else cs.kem++;

      cs.passedCourses += studentPassedCourses;
      cs.failedCourses += studentFailedCourses;
      cs.totalGradedCourses += (studentPassedCourses + studentFailedCourses);

      if (hasDebt) {
        cs.debtStudents++;
        cs.totalFails += studentDebts.length;
      }
    }
  });

  const avgGpa = totalCadets > 0 ? (totalGpaSum / totalCadets).toFixed(2) : '0.00';
  const goodRate = totalCadets > 0 ? ((goodCount / totalCadets) * 100).toFixed(1) : '0.0';
  const khaGioiXsRate = totalCadets > 0 ? ((khaGioiXsCount / totalCadets) * 100).toFixed(1) : '0.0';
  const debtStudentRate = totalCadets > 0 ? ((debtStudentCount / totalCadets) * 100).toFixed(1) : '0.0';
  const passStudentCount = Math.max(0, totalCadets - debtStudentCount);
  const passStudentRate = totalCadets > 0 ? ((passStudentCount / totalCadets) * 100).toFixed(1) : '0.0';

  const coursePassRate = totalGradedCourseInstances > 0
    ? ((passedCourseInstances / totalGradedCourseInstances) * 100).toFixed(1)
    : (totalCadets > 0 ? '100.0' : '0.0');
  const courseFailRate = totalGradedCourseInstances > 0
    ? ((failedCourseInstances / totalGradedCourseInstances) * 100).toFixed(1)
    : '0.0';

  const rankRates = {};
  levels.forEach(r => {
    rankRates[r] = totalCadets > 0 ? (((rankCounts[r] || 0) / totalCadets) * 100).toFixed(1) : '0.0';
  });

  const label = mode === 'semester'
    ? `Theo Học kỳ ${semNum} (Năm thứ ${Math.ceil(semNum / 2)})`
    : mode === 'year'
      ? `Theo Năm học thứ ${yearNum} (HK${2 * yearNum - 1} & HK${2 * yearNum})`
      : 'Tích lũy từ đầu khóa đến nay (Toàn khóa)';

  return {
    mode,
    semester: semNum,
    year: yearNum,
    label,
    totalCadets,
    avgGpa,
    rankCounts,
    rankRates,
    rankDebtStudents,
    rankFailInstances,
    goodCount,
    goodRate,
    khaGioiXsCount,
    khaGioiXsRate,
    debtStudentCount,
    debtStudentRate,
    passStudentCount,
    passStudentRate,
    totalDebtFailsCount,
    passedCourseInstances,
    failedCourseInstances,
    totalGradedCourseInstances,
    coursePassRate,
    courseFailRate,
    classStats,
    debtCadetsList,
    failedCourseDetailsList
  };
}

/**
 * Xây dựng dữ liệu 5 Năm học cho Bảng 2:
 * Cấu trúc: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2 -> Năm 3 -> Năm 4 -> Năm 5
 */
export function buildAllYearsBreakdownStats(studentsList = [], policy = 'academic') {
  const yearsData = [];
  for (let y = 1; y <= 5; y++) {
    const sem1Num = 2 * y - 1;
    const sem2Num = 2 * y;
    const hk1Stats = computeTimeframeAcademicStats(studentsList, 'semester', sem1Num, y, policy);
    const hk2Stats = computeTimeframeAcademicStats(studentsList, 'semester', sem2Num, y, policy);
    const fullYearStats = computeTimeframeAcademicStats(studentsList, 'year', sem1Num, y, policy);
    yearsData.push({
      year: y,
      sem1Num,
      sem2Num,
      hk1: hk1Stats,
      hk2: hk2Stats,
      fullYear: fullYearStats
    });
  }
  return yearsData;
}

export function computeReportAcademicStats(studentsList = [], mode = 'course', semester = 1, year = 1) {
  return computeTimeframeAcademicStats(studentsList, mode, semester, year, 'report');
}
export function buildReportYearsBreakdownStats(studentsList = []) {
  return buildAllYearsBreakdownStats(studentsList, 'report');
}

export function renderDashboard() {
  const elTotal = document.getElementById('statTotalCadets');
  if (!elTotal) return;

  if (!AppState.dashboardFilters) {
    AppState.dashboardFilters = { mode: 'course', semester: 1, year: 1, class: 'all' };
  }

  const classScope = getCurrentUserClassScope();
  const dashClassSelect = document.getElementById('dashboardClassFilter');
  if (dashClassSelect) {
    if (classScope) {
      dashClassSelect.innerHTML = `<option value="${classScope}">Lớp ${classScope}</option>`;
      dashClassSelect.value = classScope;
      dashClassSelect.disabled = true;
      AppState.dashboardFilters.class = classScope;
    } else {
      dashClassSelect.disabled = false;
      if (dashClassSelect.value !== AppState.dashboardFilters.class) {
        dashClassSelect.value = AppState.dashboardFilters.class || 'all';
      }
    }
  }

  const selectedClass = classScope || (dashClassSelect ? dashClassSelect.value : (AppState.dashboardFilters.class || 'all'));
  AppState.dashboardFilters.class = selectedClass;
  if (typeof ExternalHooks.renderBentoDashboard === 'function') ExternalHooks.renderBentoDashboard();

  // 1. Tính toán Tỷ lệ Tích lũy từ đầu khóa đến nay (Bảng 1)
  const tableStudents = id => {
    const select = document.getElementById(id);
    const scope = classScope || select?.value || selectedClass || 'all';
    if (select) { select.value = scope; select.disabled = Boolean(classScope); }
    return getScopedStudents().filter(student => scope === 'all' || student.class === scope);
  };
  const courseStats = computeReportAcademicStats(tableStudents('reportCourseFilterClass'), 'course', 1, 1);

  // 2. Tính toán Tỷ lệ theo Từng Năm & Từng Học kỳ: Năm 1 -> Năm 5 (Bảng 2)
  const yearsBreakdown = buildReportYearsBreakdownStats(tableStudents('reportYearsFilterClass'));

  const overviewStudents = getScopedStudents();
  const overviewStats = computeReportAcademicStats(overviewStudents);
  const overviewYears = buildReportYearsBreakdownStats(overviewStudents);
  renderDashboardLanguageSummary();

  // Cập nhật 4 thẻ KPI tổng quan trên đầu Báo cáo giao ban
  elTotal.textContent = overviewStats.totalCadets;
  const elScopeSub = document.getElementById('statScopeSubtitle');
  if (elScopeSub) {
    elScopeSub.textContent = `${classScope ? 'Lớp ' + classScope : 'Toàn Đại đội 460 (5 lớp)'} • Tích lũy từ đầu khóa đến nay`;
  }

  const elAvg = document.getElementById('statAvgGPA');
  if (elAvg) elAvg.textContent = overviewStats.avgGpa;
  const elAvgSub = document.getElementById('statAvgGPASub');
  if (elAvgSub) {
    const yGpas = overviewYears.map(yb => `N${yb.year}: ${yb.fullYear.avgGpa}`).join(' • ');
    elAvgSub.textContent = yGpas;
  }

  const elGoodRate = document.getElementById('statGoodRate');
  if (elGoodRate) elGoodRate.textContent = `${overviewStats.goodRate}%`;
  const elGoodCount = document.getElementById('statGoodCount');
  if (elGoodCount) {
    elGoodCount.textContent = `XS & Giỏi: ${overviewStats.goodCount}/${overviewStats.totalCadets} đ/c • Khá trở lên: ${overviewStats.khaGioiXsCount} đ/c (${overviewStats.khaGioiXsRate}%)`;
  }

  const elPassRate = document.getElementById('statCoursePassRate');
  if (elPassRate) elPassRate.textContent = `${overviewStats.coursePassRate}%`;
  const elFailRate = document.getElementById('statCourseFailRate');
  if (elFailRate) elFailRate.textContent = `${overviewStats.courseFailRate}%`;
  const elPassFailDetail = document.getElementById('statCoursePassFailDetail');
  if (elPassFailDetail) {
    elPassFailDetail.textContent = `${overviewStats.passedCourseInstances} lượt Đạt (${overviewStats.coursePassRate}%) • ${overviewStats.failedCourseInstances} lượt Rớt (${overviewStats.courseFailRate}%)`;
  }

  const elDebtCount = document.getElementById('statDebtCount');
  if (elDebtCount) elDebtCount.textContent = `${overviewStats.debtStudentCount} (${overviewStats.debtStudentRate}%)`;
  const elDebtFails = document.getElementById('statDebtTotalFails');
  if (elDebtFails) elDebtFails.textContent = overviewStats.totalDebtFailsCount;

  const elActiveModeBadge = document.getElementById('reportActiveModeBadge');
  if (elActiveModeBadge) {
    elActiveModeBadge.textContent = `Phạm vi: ${selectedClass === 'all' ? 'Toàn Đại đội 460 (5 Lớp)' : 'Lớp ' + selectedClass}`;
  }

  const courseScope = classScope || document.getElementById('reportCourseFilterClass')?.value || selectedClass;
  const visibleClasses = courseScope && courseScope !== 'all' ? [courseScope] : DEFAULT_CLASSES;

  // =========================================================================
  // BẢNG 1: TỶ LỆ TÍCH LŨY (XẾP LOẠI HỌC LỰC 7 MỨC & TỶ LỆ ĐẠT/RỚT TỪ ĐẦU KHÓA ĐẾN NAY)
  // =========================================================================
  const companyTbody = document.getElementById('reportCompanyTableBody');
  const companyTfoot = document.getElementById('reportCompanyTableFooter');
  if (companyTbody) {
    const rankRowsHtml = REPORT_RANK_META.map((item, idx) => {
      const cCourse = courseStats.rankCounts[item.name] || 0;
      const rCourse = courseStats.rankRates[item.name] || '0.0';

      const classBreakdownStr = visibleClasses.map(clsName => {
        const cs = courseStats.classStats[clsName];
        if (!cs) return `${clsName}: 0`;
        const val = cs.rankCounts[item.name] || 0;
        return `<span class="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[10px] mr-1">${clsName}: <strong>${val}</strong></span>`;
      }).join('');

      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2.5 px-3 text-center text-slate-500 font-medium">${idx + 1}</td>
          <td class="py-2.5 px-4 font-bold text-slate-900">
            <span class="inline-block px-2.5 py-0.5 rounded text-[11px] font-bold border ${item.badge}">${item.name}</span>
          </td>
          <td class="py-2.5 px-3 text-center font-mono font-semibold text-slate-700 bg-slate-50/60">${item.standard}</td>
          <td class="py-2.5 px-3 text-center font-extrabold text-slate-900 bg-amber-50/40">${cCourse} đồng chí</td>
          <td class="py-2.5 px-3 text-center bg-amber-50/60">
            <span class="px-2.5 py-0.5 rounded bg-army-800 text-gold-300 font-black text-xs">${rCourse}%</span>
          </td>
          <td class="py-2.5 px-3 text-left">${classBreakdownStr}</td>
          <td class="py-2.5 px-4 text-slate-600">${item.desc}</td>
        </tr>
      `;
    }).join('');

    // Hai hàng sau các mức xếp loại trong Bảng 1: Tỷ lệ Đạt / Rớt tích lũy từ đầu khóa đến nay
    companyTbody.innerHTML = rankRowsHtml;

    if (companyTfoot) {
      companyTfoot.innerHTML = `
        <tr class="bg-slate-100 border-t-2 border-slate-300 text-slate-900">
          <td colspan="3" class="py-3 px-4 uppercase text-army-900 font-black">TỔNG HỢP TÍCH LŨY TOÀN KHÓA (TỪ ĐẦU KHÓA ĐẾN NAY):</td>
          <td class="py-3 px-3 text-center font-black text-army-900 text-xs">${courseStats.totalCadets} đồng chí (100%)</td>
          <td class="py-3 px-3 text-center font-black text-army-900 text-xs">ĐTB Tích lũy: <span class="text-sm text-army-800">${courseStats.avgGpa}</span></td>
          <td colspan="2" class="py-3 px-4 text-slate-800">
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <span>Tỷ lệ Đạt/Rớt: <strong class="text-emerald-700">${courseStats.coursePassRate}% Đạt</strong> / <strong class="text-rose-700">${courseStats.courseFailRate}% Rớt</strong></span>
              <span class="text-slate-300">|</span>
              <span class="text-rose-700">Tổng số HV rớt môn: <strong class="font-black text-rose-800">${courseStats.debtStudentCount} đ/c (${courseStats.debtStudentRate}%)</strong></span>
              <span class="text-slate-300">|</span>
              <span class="text-rose-700">Tổng số lượt rớt: <strong class="font-black text-rose-800">${courseStats.totalDebtFailsCount} lượt</strong></span>
            </div>
          </td>
        </tr>
      `;
    }
  }

  // =========================================================================
  // BẢNG 2: TỶ LỆ THEO TỪNG NĂM & TỪNG HỌC KỲ
  // Cấu trúc tuần tự: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2 -> Năm 3 -> Năm 4 -> Năm 5
  // =========================================================================
  const matrixThead = document.getElementById('reportYearSemesterMatrixThead');
  const matrixTbody = document.getElementById('reportYearSemesterMatrixBody');
  const matrixTfoot = document.getElementById('reportYearSemesterMatrixFooter');

  if (matrixThead && matrixTbody) {
    const yearColors = [
      { headerBg: 'bg-army-900 text-gold-300', subBg: 'bg-army-800 text-white' },
      { headerBg: 'bg-slate-900 text-emerald-300', subBg: 'bg-slate-800 text-white' },
      { headerBg: 'bg-army-900 text-amber-300', subBg: 'bg-army-800 text-white' },
      { headerBg: 'bg-slate-900 text-cyan-300', subBg: 'bg-slate-800 text-white' },
      { headerBg: 'bg-army-950 text-gold-400', subBg: 'bg-army-900 text-white' }
    ];

    const topYearHeaders = yearsBreakdown.map((yb, idx) => {
      const colStyle = yearColors[idx] || yearColors[0];
      return `
        <th colspan="5" class="py-2.5 px-3 text-center font-black uppercase border-b border-slate-600 ${colStyle.headerBg}">
          NĂM ${yb.year} (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt)
          <div class="text-[10px] font-normal text-slate-200 mt-0.5">Học kỳ ${yb.sem1Num} &amp; Học kỳ ${yb.sem2Num}</div>
        </th>
      `;
    }).join('');

    const subYearHeaders = yearsBreakdown.map((yb, idx) => {
      const colStyle = yearColors[idx] || yearColors[0];
      return `
        <th class="py-2 px-2.5 text-center min-w-[95px] ${colStyle.subBg}">HK1<br><span class="text-[9px] font-normal text-slate-300">(Kỳ ${yb.sem1Num}: SL / %)</span></th>
        <th class="py-2 px-2.5 text-center min-w-[95px] ${colStyle.subBg}">HK2<br><span class="text-[9px] font-normal text-slate-300">(Kỳ ${yb.sem2Num}: SL / %)</span></th>
        <th class="py-2 px-2.5 text-center min-w-[100px] bg-amber-900/90 text-gold-200 font-bold">Cả năm<br><span class="text-[9px] font-normal text-amber-100">(Năm ${yb.year}: SL / %)</span></th>
        <th class="py-2 px-2.5 text-center min-w-[115px] bg-rose-900 text-white font-bold">Số học viên rớt môn<br><span class="text-[9px] font-normal text-rose-200">(Năm ${yb.year})</span></th>
        <th class="py-2 px-2.5 text-center min-w-[95px] bg-rose-950 text-gold-300 font-black">Số lượt rớt<br><span class="text-[9px] font-normal text-rose-200">(Năm ${yb.year})</span></th>
      `;
    }).join('');

    matrixThead.innerHTML = `
      <tr class="divide-x divide-slate-600 bg-army-950 text-white text-xs">
        <th rowspan="2" class="py-2.5 px-2 text-center w-10 sticky left-0 z-20 bg-army-950">STT</th>
        <th rowspan="2" class="py-2.5 px-3 min-w-[155px] sticky left-10 z-20 bg-army-950">Xếp Loại Học Lực / Chỉ Tiêu</th>
        <th rowspan="2" class="py-2.5 px-2 text-center min-w-[115px]">Tiêu Chuẩn</th>
        ${topYearHeaders}
      </tr>
      <tr class="divide-x divide-slate-600 text-[11px]">
        ${subYearHeaders}
      </tr>
    `;

    // 7 hàng xếp loại học lực
    const rankMatrixRows = REPORT_RANK_META.map((item, rIdx) => {
      const yearCells = yearsBreakdown.map(yb => {
        const c1 = yb.hk1.rankCounts[item.name] || 0;
        const r1 = yb.hk1.rankRates[item.name] || '0.0';
        const c2 = yb.hk2.rankCounts[item.name] || 0;
        const r2 = yb.hk2.rankRates[item.name] || '0.0';
        const cy = yb.fullYear.rankCounts[item.name] || 0;
        const ry = yb.fullYear.rankRates[item.name] || '0.0';
        const debtInRank = yb.fullYear.rankDebtStudents[item.name] || 0;
        const failsInRank = yb.fullYear.rankFailInstances[item.name] || 0;

        return `
          <td class="py-2 px-2 text-center border-l border-slate-200">
            <span class="font-bold text-slate-900">${c1}</span>
            <span class="text-[10px] text-slate-500">(${r1}%)</span>
          </td>
          <td class="py-2 px-2 text-center">
            <span class="font-bold text-slate-900">${c2}</span>
            <span class="text-[10px] text-slate-500">(${r2}%)</span>
          </td>
          <td class="py-2 px-2 text-center bg-amber-50/50 font-bold">
            <span class="text-army-950">${cy}</span>
            <span class="text-[10px] text-army-700 font-extrabold">(${ry}%)</span>
          </td>
          <td class="py-2 px-2 text-center ${debtInRank > 0 ? 'text-rose-700 font-bold bg-rose-50/40' : 'text-slate-400'}">
            ${debtInRank > 0 ? `${debtInRank} HV` : '0'}
          </td>
          <td class="py-2 px-2 text-center ${failsInRank > 0 ? 'text-rose-800 font-black bg-rose-50/60' : 'text-slate-400'}">
            ${failsInRank > 0 ? `${failsInRank} lượt` : '0'}
          </td>
        `;
      }).join('');

      return `
        <tr class="divide-x divide-slate-200 hover:bg-slate-50 transition">
          <td class="py-2.5 px-2 text-center text-slate-500 font-medium sticky left-0 bg-white z-10">${rIdx + 1}</td>
          <td class="py-2.5 px-3 font-bold text-slate-900 sticky left-10 bg-white z-10">
            <span class="inline-block px-2 py-0.5 rounded text-[11px] font-bold border ${item.badge}">${item.name}</span>
          </td>
          <td class="py-2.5 px-2 text-center font-mono text-[11px] text-slate-600">${item.standard}</td>
          ${yearCells}
        </tr>
      `;
    }).join('');

    matrixTbody.innerHTML = rankMatrixRows;

    if (matrixTfoot) {
      const footCells = yearsBreakdown.map(yb => `
        <td class="py-3 px-2 text-center border-l border-slate-300 font-bold text-army-900">
          ĐTB HK1: ${yb.hk1.avgGpa}
        </td>
        <td class="py-3 px-2 text-center font-bold text-army-900">
          ĐTB HK2: ${yb.hk2.avgGpa}
        </td>
        <td class="py-3 px-2 text-center bg-amber-100/80 font-black text-army-950">
          ĐTB Năm ${yb.year}: ${yb.fullYear.avgGpa}
        </td>
        <td class="py-3 px-2 text-center bg-rose-100 font-black text-rose-800">
          ${yb.fullYear.debtStudentCount} HV rớt (${yb.fullYear.debtStudentRate}%)
        </td>
        <td class="py-3 px-2 text-center bg-rose-200 font-black text-rose-950">
          ${yb.fullYear.totalDebtFailsCount} lượt rớt
        </td>
      `).join('');

      matrixTfoot.innerHTML = `
        <tr class="divide-x divide-slate-300 bg-slate-100 border-t-2 border-slate-300 text-xs">
          <td colspan="3" class="py-3 px-3 uppercase text-army-900 font-black sticky left-0 bg-slate-100 z-10">
            TỔNG HỢP ĐTB &amp; RỚT MÔN THEO TỪNG NĂM (QUÂN SỐ: ${courseStats.totalCadets} Đ/C):
          </td>
          ${footCells}
        </tr>
      `;
    }
  }

  // =========================================================================
  // BẢNG 3: DANH SÁCH HỌC VIÊN RỚT MÔN (THI LẠI / NỢ HỌC PHẦN) CẦN BỒI DƯỠNG
  // =========================================================================
  renderDebtCadetsSection();
}

export function renderDebtCadetsSection(debtCadetsList = null, failedCourseDetailsList = null) {
  const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
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
  if (filterSelect) { filterSelect.value = filterClass; filterSelect.disabled = Boolean(classScope); }

  let computedStats = null;
  if (!debtCadetsList || !failedCourseDetailsList) {
    computedStats = computeReportAcademicStats(getScopedStudents(), 'course', 1, 1);
  }

  let list = debtCadetsList || (computedStats ? computedStats.debtCadetsList : []);
  let detailRows = failedCourseDetailsList || (computedStats ? computedStats.failedCourseDetailsList : []);

  if (filterClass !== 'all') {
    list = list.filter(item => item.student.class === filterClass);
    detailRows = detailRows.filter(item => item.studentClass === filterClass);
  }

  list.sort((a, b) => b.failCount - a.failCount || a.yearGpa - b.yearGpa);

  let rowsHtml = '';
  if (list.length === 0) {
    rowsHtml = `
      <tr>
        <td colspan="9" class="py-10 text-center font-bold text-emerald-700 bg-emerald-50/40">
          ✅ Không có học viên nào rớt học phần (điểm &lt; 4.0) ${filterClass !== 'all' ? `ở lớp ${filterClass}` : 'trong toàn đơn vị'}!
        </td>
      </tr>
    `;
  } else {
    list.forEach((item, idx) => {
      const s = Object.fromEntries(['id', 'code', 'name', 'rank', 'class'].map(key => [key, escapeText(item.student[key])]));
      const debtsBadges = item.debts.map(d => {
        const fullCourseName = escapeText(getFullSubjectName(d.subject));
        const credits = d.subject ? d.subject.credits : 3;
        const sem = d.subject ? d.subject.semester : 1;
        return `
          <span class="inline-flex items-center gap-1.5 bg-rose-100 text-rose-900 font-bold px-2.5 py-1 rounded-md text-xs border border-rose-300 mr-1.5 mb-1 shadow-sm">
            <span>${fullCourseName} (${credits} TC • HK${sem})</span>
            <span class="bg-rose-600 text-white px-1.5 py-0.2 rounded text-[10px] font-black" title="Điểm học phần: ${Number(d.score).toFixed(2)}">Điểm: ${Number(d.score).toFixed(2)}</span>
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
      <span>Tổng số học viên rớt môn: <strong class="text-rose-700">${list.length} học viên</strong> • Tổng số lượt rớt: <strong class="text-rose-800">${totalFailsInFilter} lượt học phần (&lt; 4.0)</strong></span>
      <span class="text-[11px] text-slate-500 italic">Hiển thị đầy đủ Tên môn học (không viết tắt) &amp; Điểm số cụ thể</span>
    `;
  }
}

/**
 * Xuất file Báo cáo Tình hình Học tập (exportReportExcel):
 * - Chuẩn hóa hiển thị đầy đủ Tên môn học (tuyệt đối không dùng tên viết tắt hay mã môn).
 * - Bao gồm đầy đủ 3 bảng và các chỉ số:
 *   1. Bảng 1: Tỷ lệ Tích lũy (7 mức Xuất sắc, Giỏi, Khá, Trung bình khá, Trung bình, Yếu, Kém + tỷ lệ đạt/rớt từ đầu khóa đến nay)
 *   2. Bảng 2: Tỷ lệ theo Từng Năm & Từng Học kỳ: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2 -> Năm 3 -> Năm 4 -> Năm 5
 *   3. Bảng 3: Danh sách Học viên Rớt môn (Thi lại / Nợ học phần) Cần Bồi dưỡng & Chi tiết cụ thể từng học viên bị rớt môn nào (Tên môn đầy đủ, học kỳ, số tín chỉ, điểm số).
 */
export function exportReportExcel() {
  if (!['admin', 'company_officer'].includes(AppState.role) && !AppState.role?.startsWith('class_leader_')) {
    showToast('Tài khoản không có quyền xuất báo cáo giao ban.', 'error'); return;
  }
  const classScope = getCurrentUserClassScope();
  const selectedClass = classScope || (AppState.dashboardFilters?.class || 'all');

  let scopedStudents = getScopedStudents();
  if (selectedClass && selectedClass !== 'all') {
    scopedStudents = scopedStudents.filter(s => s.class === selectedClass);
  }

  const courseStats = computeReportAcademicStats(scopedStudents, 'course', 1, 1);
  const yearsBreakdown = buildReportYearsBreakdownStats(scopedStudents);

  // =========================================================================
  // SHEET 1: BÁO CÁO GIAO BAN TỔNG HỢP (ĐẦY ĐỦ 3 BẢNG: BẢNG 1, BẢNG 2, BẢNG 3)
  // =========================================================================
  const reportClasses = selectedClass === 'all' ? DEFAULT_CLASSES : [selectedClass];
  const rows1 = [
    ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    ['BÁO CÁO GIAO BAN: TÌNH HÌNH HỌC TẬP, XẾP LOẠI HỌC LỰC & DANH SÁCH HỌC VIÊN RỚT MÔN'],
    [`Đơn vị: ${selectedClass === 'all' ? 'Toàn Đại đội 460 (5 Lớp)' : 'Lớp ' + selectedClass} • Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')}`],
    [],
    ['BẢNG 1: TỶ LỆ TÍCH LŨY (TỪ ĐẦU KHÓA ĐẾN NAY)'],
    ['STT', 'Chỉ tiêu / Xếp loại học lực tích lũy', 'Tiêu chuẩn đánh giá (Hệ 10)', 'Số lượng', 'Tỷ lệ tích lũy (%)', ...reportClasses.map(className => `Lớp ${className}`), 'Ghi chú / Đánh giá chất lượng']
  ];

  REPORT_RANK_META.forEach((item, idx) => {
    rows1.push([
      idx + 1,
      `Xếp loại ${item.name}`,
      item.standard,
      `${courseStats.rankCounts[item.name] || 0} học viên`,
      `${courseStats.rankRates[item.name] || '0.0'}%`,
      ...reportClasses.map(className => courseStats.classStats[className]?.rankCounts[item.name] || 0),
      item.desc
    ]);
  });

  rows1.push(
    [
      'TỔNG',
      'Tổng hợp Tích lũy Toàn khóa',
      `ĐTB tích lũy: ${courseStats.avgGpa}`,
      `${courseStats.totalCadets} học viên`,
      '100.0%',
      `Đạt: ${courseStats.coursePassRate}% | Rớt: ${courseStats.courseFailRate}% | Số HV rớt môn: ${courseStats.debtStudentCount} | Số lượt rớt: ${courseStats.totalDebtFailsCount}`
    ]
  );

  rows1.push([]);
  rows1.push(['BẢNG 2: TỶ LỆ THEO TỪNG NĂM & TỪNG HỌC KỲ (NĂM 1 -> NĂM 2 -> NĂM 3 -> NĂM 4 -> NĂM 5)']);

  // Dòng tiêu đề cấp 1 của Bảng 2: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2...
  const matrixHeader1 = ['STT', 'Xếp loại Học lực / Chỉ tiêu', 'Tiêu chuẩn'];
  const matrixHeader2 = ['', '', ''];
  yearsBreakdown.forEach(yb => {
    matrixHeader1.push(
      `Năm ${yb.year} - HK1 (Kỳ ${yb.sem1Num})`,
      `Năm ${yb.year} - HK2 (Kỳ ${yb.sem2Num})`,
      `Năm ${yb.year} - Cả năm`,
      `Năm ${yb.year} - Số học viên rớt môn`,
      `Năm ${yb.year} - Số lượt rớt`
    );
    matrixHeader2.push('HK1 (SL / %)', 'HK2 (SL / %)', 'Cả năm (SL / %)', 'Số học viên rớt môn', 'Số lượt rớt');
  });
  rows1.push(matrixHeader1);
  rows1.push(matrixHeader2);

  REPORT_RANK_META.forEach((item, idx) => {
    const r = [idx + 1, item.name, item.standard];
    yearsBreakdown.forEach(yb => {
      const c1 = yb.hk1.rankCounts[item.name] || 0;
      const p1 = yb.hk1.rankRates[item.name] || '0.0';
      const c2 = yb.hk2.rankCounts[item.name] || 0;
      const p2 = yb.hk2.rankRates[item.name] || '0.0';
      const cy = yb.fullYear.rankCounts[item.name] || 0;
      const py = yb.fullYear.rankRates[item.name] || '0.0';
      const debtInRank = yb.fullYear.rankDebtStudents[item.name] || 0;
      const failsInRank = yb.fullYear.rankFailInstances[item.name] || 0;
      r.push(`${c1} (${p1}%)`, `${c2} (${p2}%)`, `${cy} (${py}%)`, `${debtInRank} học viên`, `${failsInRank} lượt`);
    });
    rows1.push(r);
  });

  const avgRow = ['TỔNG', 'Điểm trung bình (ĐTB) & Tổng số rớt theo Năm', 'Hệ 10'];

  yearsBreakdown.forEach(yb => {
    avgRow.push(
      `ĐTB HK1: ${yb.hk1.avgGpa}`,
      `ĐTB HK2: ${yb.hk2.avgGpa}`,
      `ĐTB Cả năm: ${yb.fullYear.avgGpa}`,
      `Tổng HV rớt: ${yb.fullYear.debtStudentCount} (${yb.fullYear.debtStudentRate}%)`,
      `Tổng lượt rớt: ${yb.fullYear.totalDebtFailsCount}`
    );
  });

  rows1.push(avgRow);

  rows1.push([]);
  rows1.push(['BẢNG 3: DANH SÁCH HỌC VIÊN RỚT MÔN (THI LẠI / NỢ HỌC PHẦN) CẦN BỒI DƯỠNG']);
  rows1.push([
    'STT',
    'Mã HV',
    'Họ và Tên',
    'Cấp bậc',
    'Lớp',
    'Các Học Phần Bị Rớt (< 4.0) — Tên môn học đầy đủ (Số TC • Học kỳ • Điểm số)',
    'Số Học Phần Rớt',
    'ĐTB Tích Lũy',
    'Xếp Loại Học Lực',
    'Biện Pháp Bồi Dưỡng / Kế Hoạch Khắc Phục'
  ]);

  if (courseStats.debtCadetsList.length === 0) {
    rows1.push(['-', '-', 'Không có học viên nào rớt môn trong phạm vi báo cáo này', '-', '-', '-', 0, '-', '-', '-']);
  } else {
    courseStats.debtCadetsList.forEach((item, idx) => {
      const s = item.student;
      const fullCoursesStr = item.debts
        .map(d => `${getFullSubjectName(d.subject)} (${d.subject.credits} TC - Học kỳ ${d.subject.semester} - Điểm: ${Number(d.score).toFixed(2)})`)
        .join('; ');
      rows1.push([
        idx + 1,
        s.code,
        s.name,
        s.rank,
        s.class,
        fullCoursesStr,
        item.failCount,
        item.yearGpa.toFixed(2),
        item.rank,
        `Phân công Cán sự lớp ${s.class} kèm cặp; duy trì tự học tối; đăng ký ôn và thi lại học phần.`
      ]);
    });
  }

  rows1.push([]);
  rows1.push(['PHỤ LỤC CHI TIẾT: DANH SÁCH CỤ THỂ TỪNG HỌC VIÊN BỊ RỚT MÔN NÀO (TÊN MÔN HỌC ĐẦY ĐỦ & ĐIỂM SỐ CỤ THỂ)']);
  rows1.push(['STT', 'Mã học viên', 'Họ và Tên học viên', 'Cấp bậc', 'Lớp', 'Tên môn học bị rớt (Tên đầy đủ)', 'Học kỳ', 'Năm học', 'Số tín chỉ', 'Điểm số cụ thể']);

  if (courseStats.failedCourseDetailsList.length === 0) {
    rows1.push(['-', '-', 'Không có lượt môn học nào bị rớt (< 4.0)', '-', '-', '-', '-', '-', '-', '-']);
  } else {
    courseStats.failedCourseDetailsList.forEach((d, idx) => {
      rows1.push([
        idx + 1,
        d.studentCode,
        d.studentName,
        d.studentRank,
        d.studentClass,
        getFullSubjectName(d.subject || d.courseName),
        `Học kỳ ${d.semester}`,
        `Năm thứ ${d.academicYear}`,
        d.credits,
        Number(d.score).toFixed(2)
      ]);
    });
  }

  // =========================================================================
  // SHEET 2: BẢNG 2 CHI TIẾT THEO TỪNG NĂM & TỪNG HỌC KỲ (NĂM 1 -> NĂM 5)
  // =========================================================================
  const rows2 = [
    ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    ['BẢNG 2: THỐNG KÊ TỶ LỆ THEO TỪNG NĂM & TỪNG HỌC KỲ (NĂM 1 -> NĂM 5)'],
    ['Cấu trúc chuẩn: Năm 1 (HK1, HK2, Cả năm, Số học viên rớt môn, Số lượt rớt) -> Năm 2 -> Năm 3 -> Năm 4 -> Năm 5'],
    [],
    [
      'Năm học',
      'Mốc trong năm (HK1 / HK2 / Cả năm)',
      'Quân số',
      'Xuất sắc (SL / %)',
      'Giỏi (SL / %)',
      ...REPORT_RANK_LEVELS.slice(2).map(rank => `${rank} (SL / %)`),
      'Tỷ lệ Đạt học phần (%)',
      'Tỷ lệ Rớt học phần (%)',
      'Số học viên rớt môn',
      'Số lượt rớt',
      'ĐTB Chung'
    ]
  ];

  yearsBreakdown.forEach(yb => {
    const pushSubRow = (subTitle, st) => {
      rows2.push([
        `Năm ${yb.year}`,
        subTitle,
        st.totalCadets,
        ...REPORT_RANK_LEVELS.map(rank => `${st.rankCounts[rank]} (${st.rankRates[rank]}%)`),
        `${st.coursePassRate}%`,
        `${st.courseFailRate}%`,
        `${st.debtStudentCount} học viên (${st.debtStudentRate}%)`,
        `${st.totalDebtFailsCount} lượt`,
        st.avgGpa
      ]);
    };
    pushSubRow(`HK1 (Học kỳ ${yb.sem1Num})`, yb.hk1);
    pushSubRow(`HK2 (Học kỳ ${yb.sem2Num})`, yb.hk2);
    pushSubRow(`Cả năm Năm ${yb.year} (HK${yb.sem1Num} & HK${yb.sem2Num})`, yb.fullYear);
  });

  // =========================================================================
  // SHEET 3: DANH SÁCH HỌC VIÊN RỚT MÔN CẦN BỒI DƯỠNG & MÔN HỌC CỤ THỂ BỊ RỚT
  // =========================================================================
  let rows3 = [
    ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    ['BẢNG 3: DANH SÁCH HỌC VIÊN RỚT MÔN (THI LẠI / NỢ HỌC PHẦN) CẦN BỒI DƯỠNG'],
    [`Tổng số học viên rớt môn: ${courseStats.debtStudentCount} đồng chí (${courseStats.debtStudentRate}%) • Tổng số lượt rớt: ${courseStats.totalDebtFailsCount} lượt`],
    [],
    [
      'STT',
      'Mã học viên',
      'Họ và Tên học viên',
      'Cấp bậc',
      'Lớp',
      'Tên môn học bị rớt (Tên đầy đủ, không viết tắt)',
      'Học kỳ',
      'Năm học',
      'Số tín chỉ',
      'Điểm số cụ thể',
      'ĐTB Tích lũy',
      'Xếp loại học lực',
      'Biện pháp bồi dưỡng / Kế hoạch khắc phục'
    ]
  ];

  courseStats.failedCourseDetailsList.forEach((d, idx) => {
    const fullCourseName = getFullSubjectName(d.subject || d.courseName);
    rows3.push([
      idx + 1,
      d.studentCode,
      d.studentName,
      d.studentRank,
      d.studentClass,
      fullCourseName,
      `Học kỳ ${d.semester}`,
      `Năm thứ ${d.academicYear}`,
      d.credits,
      Number(d.score).toFixed(2),
      Number(d.gpa).toFixed(2),
      d.classification,
      `Phân công Cán sự lớp ${d.studentClass} kèm cặp; ôn và thi lại môn ${fullCourseName}`
    ]);
  });

  const table3Start = rows1.findIndex(row => String(row[0] || '').startsWith('BẢNG 3:'));
  const appendixStart = rows1.findIndex(row => String(row[0] || '').startsWith('PHỤ LỤC CHI TIẾT:'));
  rows3 = [rows3[0], ...rows1.slice(table3Start, appendixStart), [], ...rows3.slice(1)];

  // Align summary descriptions with the added per-class columns in Table 1.
  const table2Start = rows1.findIndex(row => String(row[0] || '').startsWith('BẢNG 2:'));
  for (let i = 6 + REPORT_RANK_LEVELS.length; i < table2Start; i++) {
    if (rows1[i]?.length === 6) rows1[i].splice(5, 0, ...reportClasses.map(() => ''));
  }
  const ws1 = XLSX.utils.aoa_to_sheet(rows1);
  ws1['!cols'] = Array.from({ length: Math.max(...rows1.map(row => row.length)) }, (_, index) => ({ wch: index === 0 ? 8 : index === 1 ? 30 : 20 }));

  const ws2 = XLSX.utils.aoa_to_sheet(rows2);
  ws2['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 10 },
    ...REPORT_RANK_LEVELS.map(() => ({ wch: 20 })),
    { wch: 18 }, { wch: 18 }, { wch: 25 }, { wch: 16 }, { wch: 12 }];

  const ws3 = XLSX.utils.aoa_to_sheet(rows3);
  ws3['!cols'] = [
    { wch: 6 }, { wch: 16 }, { wch: 25 }, { wch: 14 }, { wch: 12 },
    { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 },
    { wch: 14 }, { wch: 16 }, { wch: 42 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws1, 'Bao_Cao_Giao_Ban_3_Bang');
  XLSX.utils.book_append_sheet(wb, ws2, 'Bang_2_Ty_Le_Nam_Hoc_Ky');
  XLSX.utils.book_append_sheet(wb, ws3, 'Bang_3_DS_HV_Rot_Mon');
  writeReportWorkbook(wb, `Bao_Cao_Tinh_Hinh_Hoc_Tap_${selectedClass === 'all' ? 'Dai_Doi_460' : selectedClass}.xlsx`);
}

// --- 7. CHỨNG CHỈ NGOẠI NGỮ ---
export function renderLanguages() {
  const summaryContainer = document.getElementById('languageClassSummary');
  const tbody = document.getElementById('languageTableBody');
  if (!summaryContainer || !tbody) return;

  const canConfigStd = AppState.role === 'admin';
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
      const curLvl = s.currentLangLevel || AppState.languages[s.id]?.currentLevel || 'Chưa đạt';
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
      const curLvl = student.currentLangLevel || l.currentLevel || 'Chưa đạt';
      const evalStatus = evaluateLangLevelStatus(curLvl, reqStd);

      const badge = (status) => {
        if (status === 'Đ') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">Đạt (Đ)</span>';
        if (status === 'KĐ') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">K.Đạt (KĐ)</span>';
        return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-300">Chưa thi</span>';
      };

      const canEditLang = AppState.role === 'admin' ||
        (AppState.role && AppState.role.startsWith('class_leader_') && AppState.role.replace('class_leader_', '') === student.class);

      const levelSelectHtml = canEditLang
        ? `<select class="select-lang-tab-level border ${evalStatus.isPassed ? 'border-slate-300 text-army-900' : 'border-rose-400 text-rose-800 bg-rose-50/40'} rounded-lg px-2 py-1 text-xs font-bold bg-white" data-id="${student.id}">
            ${LANGUAGE_LEVEL_OPTIONS.map(opt => `<option value="${opt}" ${opt === curLvl ? 'selected' : ''}>${opt}</option>`).join('')}
          </select>`
        : `<span class="font-bold text-army-900">${curLvl}</span>`;

      tableHtml += `
        <tr class="${evalStatus.isPassed ? 'hover:bg-slate-50' : 'bg-rose-50 text-rose-800'} transition">
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
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
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
  const actualLevel = document.getElementById('langActualLevel');
  if (actualLevel) {
    actualLevel.innerHTML = LANGUAGE_LEVEL_OPTIONS.map(level => `<option value="${level}">${level}</option>`).join('');
    actualLevel.value = student.currentLangLevel || l.currentLevel || 'Chưa đạt';
  }
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
export async function deleteSubject(subjectId, triggerBtn = null) {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
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

  await withButtonLock(triggerBtn, '⏳ Đang xử lý...', async () => {
    // Nếu tài khoản Lớp xóa môn chuyên ngành đang gắn cho nhiều lớp thì chỉ gỡ lớp đó ra khỏi danh sách lớp của môn
    if (classScope && targetClasses.length > 1) {
      const remaining = targetClasses.filter(c => c !== classScope);
      subj.targetClasses = remaining;
      subj.targetClass = remaining.join(', ');
      await upsertSubjectToSupabase(subj);
      logAuditTrail('', subjectId, subj.name, `Gỡ khỏi Lớp ${classScope}`, `Cập nhật lớp môn chuyên ngành ${subj.code} trên Supabase`);
      updateAllViews();
      showToast(`Đã gỡ môn ${subj.name} khỏi Lớp ${classScope}!`, 'success');
      return;
    }

    AppState.subjects = AppState.subjects.filter(s => s.id !== subjectId);
    Object.keys(AppState.grades).forEach(stId => {
      if (AppState.grades[stId] && AppState.grades[stId][subjectId] !== undefined) {
        delete AppState.grades[stId][subjectId];
      }
    });

    await deleteSubjectFromSupabase(subjectId);
    logAuditTrail('', subjectId, subj.name, 'Đã xóa', `Xóa vĩnh viễn môn học ${subj.name} (${subj.code}) trên Supabase`);
    updateAllViews();
    showToast(`Đã xóa vĩnh viễn môn ${subj.name} (${subj.code}) trên Supabase!`, 'success');
  });
}

/**
 * Xóa tất cả các môn học trong một Học kỳ cụ thể (`semesterNumber`) trực tiếp trên Supabase
 */
export async function deleteAllSubjectsInSemester(semesterNumber, triggerBtn = null) {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
  const sem = Number(semesterNumber);
  if (!sem || sem < 1 || sem > 10) return;

  if (AppState.role === 'student') {
    showToast('Học viên không có quyền xóa môn học!', 'error');
    return;
  }

  await withButtonLock(triggerBtn, '⏳ Đang xử lý...', async () => {
    const classScope = getCurrentUserClassScope();
    let removedCount = 0;
    const removedIds = [];
    const updatedSubjects = [];

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
            updatedSubjects.push(sub);
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

    for (const sub of updatedSubjects) {
      await upsertSubjectToSupabase(sub);
    }

    if (removedIds.length > 0) {
      await deleteSubjectsByIdsFromSupabase(removedIds);
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
    updateAllViews();
    showToast(`Đã xóa ${removedCount} môn học trong Học kỳ ${sem}!`, 'success');
  });
}

/**
 * Xóa vĩnh viễn tất cả các môn học của toàn khóa (10 Học kỳ) trực tiếp trên Supabase
 */
export async function deleteAllSubjectsAllSemesters(triggerBtn = null) {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
  if (AppState.role !== 'admin') {
    showToast('Chỉ Admin mới có quyền xóa toàn bộ môn học toàn khóa!', 'error');
    return;
  }

  if (!(await requestDestructiveConfirmation({ title: 'Xóa tất cả môn học?', message: 'Toàn bộ danh mục môn học của 10 học kỳ và điểm số liên quan sẽ bị xóa. Hồ sơ học viên được giữ lại. Thao tác này không thể hoàn tác.', phrase: 'XÓA MÔN HỌC' })) || AppState.role !== 'admin') return;

  await withButtonLock(triggerBtn, '⏳ Đang xử lý...', async () => {
    await deleteAllSubjectsFromSupabase();

    AppState.subjects = [];
    if (AppState.grades && typeof AppState.grades === 'object') {
      Object.keys(AppState.grades).forEach(stId => {
        AppState.grades[stId] = {};
      });
    }

    logAuditTrail('', '', 'Xóa toàn bộ môn', '0 môn học', 'Xóa trắng toàn bộ danh mục môn học 10 kỳ trên Supabase');
    updateAllViews();
    showToast('Đã xóa toàn bộ danh mục môn học trên Supabase!', 'success');
  });
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

  const classCards = document.getElementById('settingsClassSummaries');
  if (classCards) {
    classCards.replaceChildren(...(classScope ? [classScope] : DEFAULT_CLASSES).map(className => {
      const subjects = getSubjectsForClass(className);
      const card = document.createElement('article');
      card.className = 'settings-class-card';
      const title = document.createElement('h4'); title.textContent = `Lớp ${className}`;
      const count = document.createElement('strong'); count.textContent = `${subjects.length} môn`;
      const credits = document.createElement('p'); credits.textContent = `${subjects.reduce((sum, subject) => sum + (Number(subject.credits) || 0), 0)} tín chỉ`;
      card.append(title, count, credits); return card;
    }));
  }

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
          <div class="text-[11px] ${isActive ? 'text-slate-200' : 'text-slate-500'} mt-1 font-medium">${ySubjs.length} môn • ${ySubjs.reduce((sum, subject) => sum + (Number(subject.credits) || 0), 0)} tín chỉ</div>
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
      const canModify = AppState.role === 'admin' ||
        (classScope && isSpec && targetClasses.includes(classScope));
      return `
        <tr class="hover:bg-slate-50 transition">
          <td class="py-2 px-2 text-center text-slate-400 font-medium">${idx + 1}</td>
          <td class="py-2 px-3 font-mono font-bold text-army-800">${s.code}</td>
          <td class="py-2 px-3 font-semibold text-slate-900">${getFullSubjectName(s)}</td>
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

export function updateAllViews(options = {}) {
  const force = Boolean(options && options.force);
  // Cô lập Form Chỉnh Sửa: Khi modal hoặc form chỉnh sửa đang mở,
  // tuyệt đối không gọi các hàm làm mới dữ liệu toàn cục ở chế độ ngầm.
  if (!force && isAnyEditFormActive()) {
    return;
  }
  if (typeof renderSpreadsheet === 'function') renderSpreadsheet();
  if (typeof ExternalHooks.renderProfilesTable === 'function') ExternalHooks.renderProfilesTable({ force });
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
  const student = getLoggedInStudent() || (AppState.role !== 'student' ? AppState.students.find(s => s.id === AppState.studentViewingId) || AppState.students[0] : null);
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
    ['Trình độ ngoại ngữ:', student.currentLangLevel || 'Chưa đạt'],
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
    rows.push(['Hàng 1 - Học kỳ 1:', ...subs1.map(s => `${getFullSubjectName(s)} (${s.credits} TC): ${studentGrades[s.id] !== undefined ? studentGrades[s.id] : '-'}`), `ĐTB HK1: ${gpa1.toFixed(2)}`]);
    rows.push(['Hàng 2 - Học kỳ 2:', ...subs2.map(s => `${getFullSubjectName(s)} (${s.credits} TC): ${studentGrades[s.id] !== undefined ? studentGrades[s.id] : '-'}`), `ĐTB HK2: ${gpa2.toFixed(2)}`]);
    rows.push(['Hàng 3 - Tổng kết Năm học:', `Điểm trung bình Năm thứ ${y}: ${yearGpa.toFixed(2)}`, `Xếp loại Năm thứ ${y}: ${yearRank}`]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 24 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bang_Diem_Ca_Nhan');

  const year = Number(AppState.cumulativeSelectedYear) || 1;
  const cumulative = XLSX.utils.aoa_to_sheet([
    ['BẢNG ĐIỂM TÍCH LŨY CÁ NHÂN'], [`Năm học ${year} · Tích lũy toàn khóa`], [], [],
    ['STT','Mã HV','Họ và Tên','Cấp bậc','Lớp','Tín chỉ tích lũy','ĐTB Tích Lũy (Hệ 10)','Xếp loại (Hệ 10)','Điểm Hệ 4 (/4.0)','Trình độ ngoại ngữ hiện tại','Số học phần rớt (< 4.0)'],
    [1,student.code,student.name,student.rank,student.class,`${calculateCreditsPassed(student.id)} / ${getTotalCourseCredits(student.class)} TC`,calculateYearGPA(student.id).toFixed(2),getClassification(calculateYearGPA(student.id)),calculateCumulativeGPA4(student.id).toFixed(2),student.currentLangLevel || 'Chưa đạt',getDebtSubjects(student.id).length]
  ]);
  cumulative['!cols'] = Array.from({ length: 11 }, (_, i) => ({ wch: i === 2 ? 30 : 20 }));
  XLSX.utils.book_append_sheet(wb,cumulative,'Diem_Tich_Luy');

  // Định dạng tên file bắt buộc: Bảng điểm(thông tin cá nhân) - [Họ và tên học viên].xlsx
  const exactFilename = `Bảng điểm(thông tin cá nhân) - ${student.name}.xlsx`;
  writeReportWorkbook(wb, exactFilename);
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

  // Kiểm tra nếu có môn trùng tên giữa HK1 và HK2 trong cùng 1 năm để gắn nhãn kỳ rõ ràng,
  // còn lại hiển thị trực tiếp Tên môn học (course_name / s.name) thay vì mã ID/mã môn học.
  const subs1Names = new Set(subs1.map(s => normalizeCourseText(getFullSubjectName(s))));
  const subs2Names = new Set(subs2.map(s => normalizeCourseText(getFullSubjectName(s))));

  const headers = ['STT', 'Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp', 'Ngày sinh'];
  subs1.forEach(s => {
    const fullName = getFullSubjectName(s);
    const isDupInYear = subs2Names.has(normalizeCourseText(fullName));
    headers.push(isDupInYear ? `${fullName} (HK${sem1})` : fullName);
  });
  headers.push('ĐTB HK1');
  subs2.forEach(s => {
    const fullName = getFullSubjectName(s);
    const isDupInYear = subs1Names.has(normalizeCourseText(fullName));
    headers.push(isDupInYear ? `${fullName} (HK${sem2})` : fullName);
  });
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
  writeReportWorkbook(wb, `Bang_Diem_${cls}_Nam_Hoc_${yearNum}.xlsx`);
}

export function exportMasterExcel() {
  const year = Math.min(5, Math.max(1, Number(AppState.masterFilters.year) || 1));
  const sem1 = year * 2 - 1, sem2 = year * 2;
  const headers = [
    'STT', 'Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp', 'Ngày sinh',
    'ĐTB HK1', 'ĐTB HK2', 'ĐTB Cả Năm',
    'Xếp loại Học lực', 'Học phần rớt (< 4.0)'
  ];

  const rows = [
    ['HỌC VIỆN KỸ THUẬT QUÂN SỰ - TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    [`BẢNG TỔNG HỢP KẾT QUẢ HỌC TẬP TOÀN ĐẠI ĐỘI 460 - NĂM ${year}`],
    [],
    headers
  ];

  getScopedStudents().forEach((student, idx) => {
    const g1 = calculateSemesterGPA(student.id, sem1);
    const g2 = calculateSemesterGPA(student.id, sem2);
    const gy = calculateAcademicYearGPA(student.id, year);
    const debts = getDebtSubjects(student.id, null, year);

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
  writeReportWorkbook(wb, `Tong_Hop_Diem_Dai_Doi_460_Nam_${year}.xlsx`);
}

export function exportLanguageExcel() {
  const headers = ['STT', 'Mã HV', 'Họ và Tên', 'Lớp', 'Ngoại Ngữ', 'Trình Độ Hiện Tại', 'A1', 'A2.1', 'A2.2', 'B1.1', 'B1.2'];
  const rows = [
    ['TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    ['BẢNG THEO DÕI CHỨNG CHỈ NGOẠI NGỮ'],
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
      s.currentLangLevel || l.currentLevel || 'Chưa đạt',
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
  writeReportWorkbook(wb, 'Chung_Chi_Ngoai_Ngu_Dai_Doi_460.xlsx');
}

export function getDashboardLanguageData() {
  const scope = getCurrentUserClassScope();
  let classes = scope ? [scope] : DEFAULT_CLASSES;
  const standard = evaluateLangLevelStatus('Chưa đạt', AppState.requiredLangStandard).requiredStandard;
  const selected = AppState.activeTab === 'tab-reports' ? document.getElementById('reportsClassSelect')?.value || 'all' : 'all';
  if (!scope && selected !== 'all') classes = [selected];
  const students = getScopedStudents().filter(student => scope || selected === 'all' || student.class === selected);
  return { standard, scope: scope || (selected !== 'all' ? selected : null), ...collectLanguageStatistics(students, AppState.languages || {}, standard, evaluateLangLevelStatus, classes) };
}

export function renderDashboardLanguageSummary() {
  const tbody = document.getElementById('dashboardLanguageSummaryBody');
  if (!tbody) return;
  if (!['admin', 'company_officer'].includes(AppState.role) && !AppState.role?.startsWith('class_leader_')) { tbody.replaceChildren(); return; }
  const { rows, standard, scope } = getDashboardLanguageData();
  const select = document.getElementById('dashboardLanguageStandard');
  if (select) {
    const options = LANGUAGE_LEVEL_OPTIONS.filter(level => level !== 'Chưa đạt');
    if (!select.options.length) options.forEach(level => select.append(new Option(level, level)));
    select.value = standard;
    select.disabled = AppState.role !== 'admin';
  }
  const caption = document.getElementById('dashboardOverviewScope');
  if (caption) caption.textContent = `${scope ? 'Lớp ' + scope : 'Toàn Đại đội 460 · 5 lớp'} · Chuẩn hiện tại: ${standard} · Tỷ lệ tính trên quân số từng lớp.`;
  const percent = value => `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`;
  tbody.replaceChildren(...rows.map(item => {
    const row = document.createElement('tr');
    [item.className, item.total, item.passed, percent(item.passedRate), item.notPassed, percent(item.notPassedRate)].forEach((value, index) => {
      const cell = document.createElement(index === 0 ? 'th' : 'td');
      if (index === 0) cell.scope = 'row';
      if (index === 2 || index === 3) cell.className = 'language-summary-pass';
      if (index === 4 || index === 5) cell.className = 'language-summary-fail';
      cell.textContent = value; row.append(cell);
    });
    return row;
  }));
}

export function exportDashboardLanguageExcel() {
  if (!['admin', 'company_officer'].includes(AppState.role) && !AppState.role?.startsWith('class_leader_')) { showToast('Tài khoản không có quyền xuất thống kê đơn vị.', 'error'); return; }
  const { rows, roster, standard, scope } = getDashboardLanguageData();
  const preamble = [['ĐẠI ĐỘI 460'], ['THỐNG KÊ ĐẠT CHUẨN NGOẠI NGỮ'], [`Chuẩn ngoại ngữ hiện tại: ${standard}`], [`Phạm vi: ${scope || 'Toàn Đại đội 460'}`]];
  const summary = XLSX.utils.aoa_to_sheet([...preamble,
    ['Lớp', 'Quân số', 'Số lượng đạt', 'Tỷ lệ đạt (%)', 'Số lượng chưa đạt', 'Tỷ lệ chưa đạt (%)'],
    ...rows.map(item => [item.className, item.total, item.passed, Number(item.passedRate.toFixed(1)), item.notPassed, Number(item.notPassedRate.toFixed(1))])
  ]);
  const list = XLSX.utils.aoa_to_sheet([...preamble,
    ['Mã học viên', 'Họ và tên', 'Ngày sinh', 'Lớp', 'Trình độ hiện tại', 'Trạng thái'],
    ...roster.map(({ student, level, passed }) => [student.code, student.name, normalizeDateVN(student.dob, ''), student.class, level.replaceAll('.', ''), passed ? 'Đạt' : 'Chưa đạt'])
  ]);
  summary['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 22 }];
  list['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 18 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, summary, 'Thong_Ke_Theo_Lop');
  XLSX.utils.book_append_sheet(workbook, list, 'Danh_Sach_Hoc_Vien');
  writeReportWorkbook(workbook, `Thong_Ke_Ngoai_Ngu_${scope || 'Dai_Doi_460'}_${standard}.xlsx`);
}

export function exportFailedStudentsExcel() {
  if (!['admin', 'company_officer'].includes(AppState.role) && !AppState.role?.startsWith('class_leader_')) { showToast('Tài khoản không có quyền xuất thống kê đơn vị.', 'error'); return; }
  const scope = getCurrentUserClassScope();
  const selected = scope || (AppState.activeTab === 'tab-reports' ? document.getElementById('reportsClassSelect')?.value : 'all') || 'all';
  const exportScope = scope || (selected !== 'all' ? selected : null);
  const stats = computeReportAcademicStats(getScopedStudents().filter(student => selected === 'all' || student.class === selected));
  const records = failedStudentExportRows(stats.debtCadetsList, getFullSubjectName);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ĐẠI ĐỘI 460'], ['DANH SÁCH HỌC VIÊN RỚT MÔN'], [`Phạm vi: ${exportScope || 'Toàn Đại đội 460'}`], ['Chỉ học phần dưới 4,00; tổng tín chỉ là tổng tín chỉ các học phần rớt.'],
    ['Mã học viên', 'Họ và tên', 'Năm sinh', 'Lớp', 'Môn học rớt (tín chỉ)', 'Tổng số tín chỉ rớt'], ...records
  ]);
  sheet['!cols'] = [{ wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 65 }, { wch: 22 }];
  sheet['!rows'] = Array.from({ length: records.length + 5 }, (_, index) => ({ hpt: index < 5 ? 20 : Math.max(24, String(records[index - 5][4]).split('\n').length * 18) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hoc_Vien_Rot_Mon');
  writeReportWorkbook(workbook, `Hoc_Vien_Rot_Mon_${exportScope || 'Dai_Doi_460'}.xlsx`);
}

export function exportAcademicAchievementsExcel() {
  if (!['admin','company_officer'].includes(AppState.role) && !AppState.role?.startsWith('class_leader_')) return;
  const selected = getCurrentUserClassScope() || document.getElementById('reportsClassSelect')?.value || 'all';
  const students = getScopedStudents().filter(student => selected === 'all' || student.class === selected);
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ĐẠI ĐỘI 460'],['BÁO CÁO THÀNH TÍCH HỌC TẬP'],[`Phạm vi: ${selected}`],[],
    ['Mã học viên','Họ và tên','Ngày sinh','Lớp','Điểm tích lũy hệ 10','Điểm tích lũy hệ 4','Xếp loại','Danh hiệu / Thành tích'],
    ...students.map(student => [student.code,student.name,normalizeDateVN(student.dob,''),student.class,Number(calculateYearGPA(student.id).toFixed(2)),Number(calculateCumulativeGPA4(student.id).toFixed(2)),getClassification(calculateYearGPA(student.id)),formatAchievementsText(student.achievements)])
  ]);
  sheet['!cols'] = [18,30,16,14,22,22,20,60].map(wch=>({wch}));
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book,sheet,'Thanh_Tich_Hoc_Tap');
  writeReportWorkbook(book,`Thanh_Tich_Hoc_Tap_${selected}.xlsx`);
}

export function downloadExcelTemplate() {
  const cls = getCurrentUserClassScope() || AppState.currentSheetClass || 'OTQS1';
  const targetCls = cls === 'all' ? 'OTQS1' : cls;
  const yearNum = parseInt(AppState.currentSheetSemester, 10) || 1;
  const sem1 = 2 * yearNum - 1;
  const sem2 = 2 * yearNum;
  const subs1 = getSubjectsForClass(cls, sem1);
  const subs2 = getSubjectsForClass(cls, sem2);

  const subs1Names = new Set(subs1.map(s => normalizeCourseText(getFullSubjectName(s))));
  const subs2Names = new Set(subs2.map(s => normalizeCourseText(getFullSubjectName(s))));

  const headers = ['Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp'];
  subs1.forEach(s => {
    const fullName = getFullSubjectName(s);
    const isDup = subs2Names.has(normalizeCourseText(fullName));
    headers.push(isDup ? `${fullName} (HK${sem1})` : fullName);
  });
  if (subs1.length > 0 && subs2.length > 0) {
    headers.push('ĐTB HK1');
  }
  subs2.forEach(s => {
    const fullName = getFullSubjectName(s);
    const isDup = subs1Names.has(normalizeCourseText(fullName));
    headers.push(isDup ? `${fullName} (HK${sem2})` : fullName);
  });

  const row1Scores = [
    ...subs1.map(() => '8.5'),
    ...(subs1.length > 0 && subs2.length > 0 ? ['8.50'] : []),
    ...subs2.map(() => '8.0')
  ];
  const row2Scores = [
    ...subs1.map(() => '7.8'),
    ...(subs1.length > 0 && subs2.length > 0 ? ['7.80'] : []),
    ...subs2.map(() => '8.2')
  ];

  const sampleRows = [
    headers,
    ['HV2022-0101', 'Nguyễn Văn Hùng', 'Thượng sĩ', targetCls, ...row1Scores],
    ['HV2022-0102', 'Trần Đức Thắng', 'Thượng sĩ', targetCls, ...row2Scores]
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleRows);
  ws['!cols'] = headers.map(() => ({ wch: 20 }));
  ws['!cols'][1] = { wch: 24 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Nhap_Diem');
  XLSX.writeFile(wb, `Mau_Nhap_Diem_${cls}_Nam_${yearNum}.xlsx`);
}

export let parsedImportData = null;

export function handleExcelFileUpload(file) {
  parsedImportData = null;
  const confirmButton = document.getElementById('btnConfirmImport');
  if (confirmButton) confirmButton.disabled = true;
  if (!file) return;
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

      // Tự động dò tìm gợi ý Năm học / Học kỳ trên các dòng tiêu đề đầu file Excel (nếu có)
      let fileSemesterHint = null;
      let fileYearHint = null;
      let fileClassHint = null;

      for (let i = 0; i < Math.min(jsonRows.length, 6); i++) {
        const lineStr = (Array.isArray(jsonRows[i]) ? jsonRows[i] : []).join(' ').toUpperCase();
        const yMatch = lineStr.match(/NĂM\s*(?:HỌC\s*)?(?:THỨ\s*)?(\d)/i);
        if (yMatch && yMatch[1]) {
          const yVal = parseInt(yMatch[1], 10);
          if (yVal >= 1 && yVal <= 5) fileYearHint = yVal;
        }
        const hkMatches = lineStr.match(/(?:HỌC\s*KỲ|HK)\s*(\d{1,2})/gi);
        if (hkMatches && hkMatches.length === 1) {
          const numM = hkMatches[0].match(/(\d{1,2})/);
          if (numM) {
            const sVal = parseInt(numM[1], 10);
            if (sVal >= 1 && sVal <= 10) fileSemesterHint = sVal;
          }
        }
        for (const cName of DEFAULT_CLASSES) {
          if (lineStr.includes(`LỚP ${cName}`) || lineStr.includes(`_${cName}`)) {
            fileClassHint = cName;
            break;
          }
        }
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
          rowStr.includes('mã quân nhân') ||
          rowStr.includes('họ và tên') ||
          rowStr.includes('họ tên')
        ) {
          headerIdx = i;
          break;
        }
      }
      if (headerIdx === -1) headerIdx = 0;

      const headers = jsonRows[headerIdx].map(h => String(h || '').trim());
      const rows = jsonRows
        .slice(headerIdx + 1)
        .filter(r => Array.isArray(r) && r.some(c => String(c ?? '').trim() !== ''));

      parsedImportData = {
        headers,
        rows,
        fileSemesterHint,
        fileYearHint,
        fileClassHint
      };
      const statusEl = document.getElementById('importFileStatus');
      if (statusEl) {
        statusEl.textContent = `File hợp lệ: Đã đọc được ${rows.length} dòng dữ liệu. Hệ thống sẽ đối chiếu theo khóa kết hợp (Tên môn + Lớp + Học kỳ) để đẩy lên Supabase.`;
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

/**
 * Thực thi Import Điểm từ File Excel lên Supabase:
 * - Cải tiến logic nhận diện môn học bằng Khóa Kết Hợp (course_name + class_code + semester/term).
 * - Xử lý chính xác trường hợp cùng một tên môn học nhưng học ở các lớp khác nhau hoặc học kỳ/năm học khác nhau.
 * - Tự động nhận diện vị trí cột trước/sau "ĐTB HK1" để phân tách môn Học kỳ 1 và Học kỳ 2 của năm học.
 * - Nếu môn học trong cột Excel chưa có trong danh mục của Lớp/Kỳ đó, tự động khởi tạo và lưu lên bảng `subjects`
 *   trước khi lưu `grades` để dữ liệu điểm không bao giờ bị bỏ sót!
 */
export async function executeExcelImport() {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
  if (AppState.role === 'student') {
    showToast('Học viên không có quyền nhập điểm từ file Excel!', 'error');
    return;
  }
  if (!parsedImportData || document.getElementById('btnConfirmImport')?.disabled) return;
  const { headers, rows, fileSemesterHint, fileYearHint, fileClassHint } = parsedImportData;
  const classScope = getCurrentUserClassScope();
  const btnConfirm = document.getElementById('btnConfirmImport');
  const origText = btnConfirm ? btnConfirm.textContent : 'Nhập Dữ Liệu';
  const previousState = structuredClone({ students: AppState.students, subjects: AppState.subjects,
    grades: AppState.grades, languages: AppState.languages });

  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.setAttribute('aria-busy', 'true');
    btnConfirm.textContent = 'Đang xử lý...';
  }

  try {
    let updatedCount = 0;
    let createdStudentsCount = 0;
    const createdStudents = [];
    const newSubjectsMap = new Map();
    const studentsByCode = new Map();
    const indexStudent = student => {
      studentsByCode.set(String(student.code).trim().toUpperCase(), student);
    };
    AppState.students.forEach(indexStudent);

    const activeYearNum = fileYearHint || parseInt(AppState.currentSheetSemester, 10) || 1;
    const sem1OfYear = 2 * activeYearNum - 1;
    const sem2OfYear = 2 * activeYearNum;

    const normHeaders = headers.map(h => String(h || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase());
    const firstColIsStt = normHeaders[0] === 'stt' || normHeaders[0] === 'tt';

    let codeCol = normHeaders.findIndex(h => h.includes('mã hv') || h.includes('mã học viên') || h.includes('mã qn') || h === 'mã');
    if (codeCol === -1) throw new Error('File Excel phải có cột Mã HV (Mã học viên).');

    let nameCol = normHeaders.findIndex(h => (h.includes('họ và tên') || h.includes('họ tên') || h === 'tên') && !h.includes('bố') && !h.includes('mẹ'));


    let rankCol = normHeaders.findIndex(h => h.includes('cấp bậc') || h.includes('quân hàm'));
    let classCol = normHeaders.findIndex(h => h === 'lớp' || h.startsWith('lớp '));
    let dobCol = normHeaders.findIndex(h => h.includes('ngày sinh') || h.includes('năm sinh'));

    // Tìm vị trí cột phân cách ĐTB HK1 (nếu file xuất từ bảng điểm năm học)
    const dtbHk1ColIdx = normHeaders.findIndex(h =>
      (h.includes('đtb') || h.includes('dtb') || h.includes('điểm trung bình')) &&
      (h.includes('hk1') || h.includes('học kỳ 1') || h.includes('kỳ 1'))
    );
    const dtbHk2ColIdx = normHeaders.findIndex(h =>
      (h.includes('đtb') || h.includes('dtb') || h.includes('điểm trung bình')) &&
      (h.includes('hk2') || h.includes('hkii') || h.includes('học kỳ 2') || h.includes('kỳ 2'))
    );

    const reservedCols = new Set([firstColIsStt ? 0 : -1, codeCol, nameCol, rankCol, classCol, dobCol, dtbHk1ColIdx, dtbHk2ColIdx].filter(idx => idx >= 0));

    const subjectColumnDescriptors = [];
    const bulkGradeEntries = [];

    headers.forEach((h, colIdx) => {
      if (!h || reservedCols.has(colIdx)) return;
      const lowerH = String(h).toLowerCase().trim();
      if (
        lowerH === 'stt' ||
        lowerH === 'tt' ||
        lowerH.includes('đtb') ||
        lowerH.includes('dtb') ||
        lowerH.includes('điểm trung bình') ||
        lowerH.includes('xếp loại') ||
        lowerH.includes('tín chỉ tích lũy') ||
        lowerH.includes('học phần rớt') ||
        lowerH.includes('số học phần') ||
        lowerH.includes('ngoại ngữ') ||
        lowerH.includes('cntt') ||
        lowerH.includes('biện pháp') ||
        lowerH.includes('ghi chú') ||
        lowerH.includes('thao tác')
      ) {
        return;
      }

      // Xác định học kỳ gợi ý dựa trên vị trí cột so với cột ĐTB HK1 hoặc gợi ý từ đầu file
      let positionalSemHint = fileSemesterHint || sem1OfYear;
      if (dtbHk1ColIdx !== -1) {
        if (colIdx < dtbHk1ColIdx) {
          positionalSemHint = sem1OfYear;
        } else if (dtbHk2ColIdx === -1 || colIdx < dtbHk2ColIdx) {
          positionalSemHint = sem2OfYear;
        }
      }

      const headerInfo = parseExcelSubjectHeader(h, positionalSemHint);
      if (headerInfo && headerInfo.normTitle) {
        subjectColumnDescriptors.push({
          colIdx,
          rawHeader: h,
          resolvedByClass: new Map(),
          positionalSemHint,
          headerInfo
        });
      }
    });

    rows.forEach((row, rIdx) => {
      if (!row.some(value => String(value ?? '').trim() !== '')) return;
      let studentCode = row[codeCol] !== undefined && row[codeCol] !== null ? String(row[codeCol]).trim().toUpperCase() : '';
      const studentName = row[nameCol] !== undefined && row[nameCol] !== null ? String(row[nameCol]).trim() : '';

      if (
        studentCode === 'STT' ||
        studentCode === 'MÃ HV' ||
        studentCode.startsWith('ĐIỂM TRUNG BÌNH') ||
        studentCode.startsWith('TỔNG')
      ) {
        return;
      }

      let rowCls = classCol >= 0 && row[classCol]
        ? String(row[classCol]).trim().toUpperCase().replace(/^LỚP\s+/i, '')
        : '';
      if (classScope) {
        rowCls = classScope;
      } else if (!DEFAULT_CLASSES.includes(rowCls)) {
        rowCls = fileClassHint || (AppState.currentSheetClass !== 'all' ? AppState.currentSheetClass : '') || 'OTQS1';
      }

      if (!studentCode) {
        throw new Error(`Dòng dữ liệu ${rIdx + 1}: thiếu Mã HV. Không đối chiếu theo họ tên.`);
      }

      let student = studentsByCode.get(studentCode);

      // Nếu học viên trong file Excel chưa có trong danh sách, tự động tạo mới học viên đó
      if (!student) {
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
          dob: (dobCol >= 0 && row[dobCol]) ? normalizeDateVN(row[dobCol], '') : '',
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
          currentLangLevel: 'Chưa đạt',

        };
        AppState.students.push(student);
        indexStudent(student);
        AppState.grades[newId] = {};
        AppState.languages[newId] = {
          lang: 'Tiếng Nga',
          currentLevel: 'Chưa đạt',

          A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT'
        };
        createdStudentsCount++;
        createdStudents.push(student);
      }

      if (classScope && student.class !== classScope) return;

      if (!AppState.grades[student.id]) {
        AppState.grades[student.id] = {};
      }

      // Đối chiếu từng cột điểm theo Khóa Kết Hợp: (course_name + student.class + semester)
      subjectColumnDescriptors.forEach(desc => {
        const rawScore = row[desc.colIdx];
        if (rawScore === undefined || rawScore === null || String(rawScore).trim() === '' || String(rawScore).trim() === '-') {
          return;
        }
        // Hỗ trợ cả định dạng điểm có kèm điểm chữ như "8.5 (A)" hoặc "7,5"
        const cleanScoreToken = String(rawScore).trim().split(/\s*\(/)[0].replace(',', '.');
        const num = Number(cleanScoreToken);
        if (!Number.isFinite(num) || num < 0 || num > 10) {
          throw new Error(`Điểm không hợp lệ tại dòng dữ liệu ${rIdx + 1}, cột ${desc.rawHeader}: ${rawScore}`);
        }

        let targetSubject = desc.resolvedByClass.get(student.class);
        if (!targetSubject) {
          targetSubject = resolveSubjectByCompositeKey({
            headerInfo: desc.headerInfo,
            studentClass: student.class,
            semesterHint: desc.positionalSemHint,
            yearHint: activeYearNum,
            autoCreate: true,
            newSubjectsMap
          });
          if (targetSubject) desc.resolvedByClass.set(student.class, targetSubject);
        }

        if (targetSubject && targetSubject.id) {
          const rounded = Math.round(num * 100) / 100;
          AppState.grades[student.id][targetSubject.id] = rounded;
          bulkGradeEntries.push({
            studentId: student.id,
            subjectId: targetSubject.id,
            score: rounded
          });
          updatedCount++;
        }
      });
    });

    if (bulkGradeEntries.length === 0) {
      throw new Error('Không tìm thấy ô điểm hợp lệ. Kiểm tra tiêu đề cột và dữ liệu Excel.');
    }

    // 1. Lưu học viên trước để đảm bảo khóa ngoại student_id trên bảng grades
    if (createdStudents.length > 0) {
      const originalIds = createdStudents.map(student => student.id);
      const result = await upsertStudentsBulkToSupabase(createdStudents, AppState.languages, { createOnly: true });
      if (result?.error) throw new Error(result.error.message || 'Không thể lưu học viên');
      // A concurrent import may have created the same code with an existing ID.
      const remappedIds = new Map();
      createdStudents.forEach((student, index) => {
        const oldId = originalIds[index];
        if (oldId !== student.id) {
          remappedIds.set(oldId, student.id);
          AppState.grades[student.id] = AppState.grades[oldId] || {};
          delete AppState.grades[oldId];
        }
      });
      bulkGradeEntries.forEach(entry => {
        entry.studentId = remappedIds.get(entry.studentId) || entry.studentId;
      });
    }

    // 2. Lưu các môn học mới được nhận diện tự động theo khóa kết hợp (course_name + class_code + semester)
    if (newSubjectsMap.size > 0) {
      const result = await upsertSubjectsBulkToSupabase(Array.from(newSubjectsMap.values()));
      if (result?.error) throw new Error(result.error.message || 'Không thể lưu môn học');
    }

    // 3. Lưu toàn bộ điểm số lên bảng grades của Supabase
    if (bulkGradeEntries.length > 0) {
      const result = await upsertGradesBulkToSupabase(bulkGradeEntries);
      if (result?.error) throw new Error(result.error.message || 'Không thể lưu điểm');
    }

    logAuditTrail(
      '',
      '',
      'Excel File',
      `${updatedCount} điểm (${createdStudentsCount} HV mới${newSubjectsMap.size > 0 ? `, ${newSubjectsMap.size} môn mới` : ''})`,
      'Nhập dữ liệu điểm từ file Excel theo khóa kết hợp (Tên môn + Lớp + Học kỳ) lên Supabase'
    );
    await persistData(true);
    hideModal('modalImportExcel');
    updateAllViews();
    parsedImportData = null;
    showToast(`Đã lưu thành công ${updatedCount} điểm số lên Supabase!`, 'success');
  } catch (err) {
    Object.assign(AppState, previousState);
    AppState.hasPendingCloudRefresh = true;
    console.error('Lỗi khi nhập Excel điểm lên Supabase:', err);
    showToast('Có lỗi khi lưu điểm từ Excel lên Supabase: ' + (err.message || err), 'error');
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.removeAttribute('aria-busy');
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
  if (s >= 9.0) return { letter: 'A', scale4: 4.0, status: 'Đạt (Giỏi)' };
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

export async function handleInlineCumulativeMetaChange(studentId, field, value, triggerSelectEl = null) {
  if (AppState.role === 'company_officer') { showToast('Tài khoản cán bộ chỉ được xem.', 'error'); return; }
  if (field !== 'currentLangLevel') return;
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

  if (triggerSelectEl) triggerSelectEl.disabled = true;
  try {
    if (!AppState.languages[studentId]) {
      AppState.languages[studentId] = { lang: 'Tiếng Nga', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT' };
    }

    if (field === 'currentLangLevel') {
      s.currentLangLevel = value;
      AppState.languages[studentId].currentLevel = value;
    }

    await upsertStudentToSupabase(s, AppState.languages[studentId]);
    logAuditTrail(studentId, '', 'Ngoại ngữ', value, 'Cập nhật trực tiếp trên bảng');
    updateAllViews();
  } finally {
    if (triggerSelectEl) triggerSelectEl.disabled = false;
  }
}

export function renderCumulativeTable() {
  const tbody = document.getElementById('cumulativeTableBody');
  const footer = document.getElementById('cumulativeTableFooter');
  if (!tbody) return;

  const canConfigStd = AppState.role === 'admin';
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
    const passedTC = calculateCreditsPassed(s.id);
    const totalCourseTC = getTotalCourseCredits(s.class);
    const debts = getDebtSubjects(s.id);
    const rank = getClassification(gpa10);
    const curLang = s.currentLangLevel || AppState.languages[s.id]?.currentLevel || 'Chưa đạt';

    const langEval = evaluateLangLevelStatus(curLang, AppState.requiredLangStandard);
    const canEditMeta = AppState.role === 'admin' ||
      (AppState.role && AppState.role.startsWith('class_leader_') && AppState.role.replace('class_leader_', '') === s.class);

    const langOptionsHtml = LANGUAGE_LEVEL_OPTIONS.map(opt =>
      `<option value="${opt}" ${opt === curLang ? 'selected' : ''}>${opt}</option>`
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
    rowsHtml = `<tr><td colspan="12" class="p-8 text-center text-slate-400">Không tìm thấy quân nhân nào phù hợp với bộ lọc.</td></tr>`;
  }
  tbody.innerHTML = rowsHtml;

  if (footer) {
    footer.innerHTML = `
      <span>Hiển thị <strong>${filtered.length}</strong> / ${scoped.length} quân nhân • Tích lũy toàn khóa</span>
      <span class="text-[11px] text-slate-500">Hỗ trợ chọn trực tiếp Trình độ ngoại ngữ hiện tại (A1.1, A1, A2.1, A2, B1.1, B1...) </span>
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
  document.getElementById('tcRank').textContent = `${student.rank} • Ngoại ngữ: ${student.currentLangLevel || 'Chưa đạt'}`;

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
        <td class="p-2 font-medium text-slate-900">${getFullSubjectName(sub)} ${sub.category === 'specialized' ? `<span class="text-[10px] font-bold text-amber-800">(CN ${sub.targetClass})</span>` : ''}</td>
        <td class="p-2 text-center font-bold text-gold-600">${sub.credits}</td>
        <td class="p-2 text-center font-bold ${isFail ? 'text-rose-700 font-black' : 'text-slate-800'}">${hasScore ? Number(sc10).toFixed(2) : '-'}</td>
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
  if (AppState.role === 'student') return exportStudentPersonalExcel();
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
    'Tín chỉ tích lũy',
    'ĐTB Tích Lũy (Hệ 10)', 'Xếp loại (Hệ 10)', 'Điểm Hệ 4 (/4.0)',
    'Trình độ ngoại ngữ hiện tại', 'Số học phần rớt (< 4.0)'
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
      gpa10.toFixed(2),
      getClassification(gpa10),
      gpa4.toFixed(2),
      s.currentLangLevel || 'Chưa đạt',
      debts.length
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map(() => ({ wch: 16 }));
  ws['!cols'][2] = { wch: 24 };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Diem_Tich_Luy');
  writeReportWorkbook(wb, `Bang_Diem_Tich_Luy_${targetClass !== 'all' ? targetClass : 'Dai_Doi_460'}.xlsx`);
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

  let refreshQueued = false;
  const refreshCloudData = async () => {
    if (CloudSync.isIncomingSync) {
      refreshQueued = true;
      return;
    }
    // Chặn đồng bộ ngược dữ liệu: Khi bất kỳ modal hoặc form chỉnh sửa nào đang mở,
    // tuyệt đối không tải đè dữ liệu từ Supabase hoặc làm mới bảng ở chế độ ngầm.
    if (isAnyEditFormActive()) {
      AppState.hasPendingCloudRefresh = true;
      return;
    }
    CloudSync.isIncomingSync = true;
    try {
      const freshData = await loadAllDataFromSupabase(CloudSync.unitRoomId || 'daidoi460');
      if (freshData && typeof freshData === 'object') {
        // Kiểm tra lại lần 2 sau khi await mạng: nếu người dùng vừa mở form Sửa trong lúc chờ mạng thì hủy ngay
        if (isAnyEditFormActive()) {
          AppState.hasPendingCloudRefresh = true;
          return;
        }
        applyCloudSnapshotToState(freshData);
        AppState.isLoadingCloud = false;
        AppState.hasPendingCloudRefresh = false;
        updateAllViews();
      }
    } catch (err) {
      console.warn('Supabase realtime refresh error:', err);
    } finally {
      CloudSync.isIncomingSync = false;
      if (refreshQueued) {
        refreshQueued = false;
        void refreshCloudData();
      }
    }
  };
  CloudSync.realtimeChannel = subscribeSupabaseRealtime(refreshCloudData);
}

export function pushDataToCloud(immediate = false) {
  if (AppState.role === 'company_officer') return Promise.resolve();
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
