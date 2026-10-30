import { renderSubjectCatalog } from './subjects/catalog-view.js';
import { subjectHasGrades, stableOfferingId } from './subjects/offerings.js';
import { trackImportRead } from './components/upload-state.js';
import { createGradeCalculations } from './academic/calculations.js';
import { createTranscript } from './academic/transcript.js';
import { createReportStatistics } from './reports/statistics.js';
import { createDashboardReports } from './reports/dashboard.js';
import { createReportExports } from './reports/exports.js';
import { reviewImport } from './components/import-review.js';
import { sanitizeHTML, escapeHTML } from './safe-html.js';
import { RANKING_HEADERS, rankingTableRows } from './academic-ranking.js';
import { buildClassTranscript } from './class-transcript.js';
import { collectLanguageStatistics, failedStudentExportRows } from './dashboard-statistics.js';
import { writeReportWorkbook } from './report-workbook.js';
import { requestDestructiveConfirmation } from './components/destructive-confirm.js';
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
  importExcelTransaction,
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

// Live dependency adapters keep feature modules independent of this application shell.
const moduleContext = {
  get AppState() { return AppState; },
  get DEFAULT_CLASSES() { return DEFAULT_CLASSES; },
  get ExternalHooks() { return ExternalHooks; },
  get LANGUAGE_LEVEL_OPTIONS() { return LANGUAGE_LEVEL_OPTIONS; },
  get RANKING_HEADERS() { return RANKING_HEADERS; },
  get RANK_LEVELS() { return RANK_LEVELS; },
  get REPORT_RANK_LEVELS() { return REPORT_RANK_LEVELS; },
  get REPORT_RANK_META() { return REPORT_RANK_META; },
  get buildClassTranscript() { return buildClassTranscript; },
  get buildReportYearsBreakdownStats() { return buildReportYearsBreakdownStats; },
  get calculateAcademicYearGPA() { return calculateAcademicYearGPA; },
  get calculateCreditsPassed() { return calculateCreditsPassed; },
  get calculateCumulativeGPA4() { return calculateCumulativeGPA4; },
  get calculateSemesterGPA() { return calculateSemesterGPA; },
  get calculateYearGPA() { return calculateYearGPA; },
  get collectLanguageStatistics() { return collectLanguageStatistics; },
  get computeReportAcademicStats() { return computeReportAcademicStats; },
  get escapeHTML() { return escapeHTML; },
  get evaluateLangLevelStatus() { return evaluateLangLevelStatus; },
  get failedStudentExportRows() { return failedStudentExportRows; },
  get formatAchievementsText() { return formatAchievementsText; },
  get formatFailedSubjectItem() { return formatFailedSubjectItem; },
  get formatVN() { return formatVN; },
  get getClassification() { return getClassification; },
  get getCurrentUserClassScope() { return getCurrentUserClassScope; },
  get getDebtSubjects() { return getDebtSubjects; },
  get getFullSubjectName() { return getFullSubjectName; },
  get getGradeLetterAndScale4() { return getGradeLetterAndScale4; },
  get getLoggedInStudent() { return getLoggedInStudent; },
  get getScopedStudents() { return getScopedStudents; },
  get getSubjectsForClass() { return getSubjectsForClass; },
  get getTotalCourseCredits() { return getTotalCourseCredits; },
  get normalizeDateVN() { return normalizeDateVN; },
  get rankingTableRows() { return rankingTableRows; },
  get renderDashboardLanguageSummary() { return renderDashboardLanguageSummary; },
  get sanitizeHTML() { return sanitizeHTML; },
  get showModal() { return showModal; },
  get showToast() { return showToast; },
  get writeReportWorkbook() { return writeReportWorkbook; }
};

export const {
  calculateSemesterGPA,
  calculateSemesterGPA4,
  calculateAcademicYearGPA,
  calculateAcademicYearGPA4,
  calculateYearGPA,
  calculateCourseGPA10,
  getScale3FromScore10,
  calculateCourseGPA3,
  getSemesterCredits,
  getTotalCourseCredits,
  RANK_LEVELS,
  getClassification,
  getClassificationBadge,
  getDebtSubjects,
  formatFailedSubjectItem,
  getGradeLetterAndScale4,
  calculateCumulativeGPA4,
  calculateCreditsPassed
} = createGradeCalculations(moduleContext);

export const {
  openTranscriptModal
} = createTranscript(moduleContext);

export const {
  RANK_META,
  REPORT_RANK_META,
  REPORT_RANK_LEVELS,
  getReportClassification,
  computeTimeframeAcademicStats,
  buildAllYearsBreakdownStats,
  computeReportAcademicStats,
  buildReportYearsBreakdownStats
} = createReportStatistics(moduleContext);

export const {
  renderDashboard,
  renderDebtCadetsSection
} = createDashboardReports(moduleContext);

export const {
  exportReportExcel,
  exportStudentPersonalExcel,
  exportClassExcel,
  exportMasterExcel,
  exportAcademicRanking,
  exportLanguageExcel,
  getDashboardLanguageData,
  renderDashboardLanguageSummary,
  exportDashboardLanguageExcel,
  exportFailedStudentsExcel,
  exportAcademicAchievementsExcel,
  exportCumulativeExcel
} = createReportExports(moduleContext);







/**
 * MODULE: src/js/grades.js
 * Quản lý Kho dữ liệu (AppState & localStorage), Phân loại Môn học (Môn chung & Môn chuyên ngành),
 * Bảng điểm Lớp theo Năm học (Năm 1 -> Năm 5), Bảng điểm cuộn dọc cho Học viên,
 * Điểm tích lũy (DTB HK1 (10), DTB HKII (10), Ngoại ngữ hiện tại),
 * Tổng hợp Toàn Đại đội (Lọc theo kỳ), Báo cáo giao ban (Rớt < 4.0 định dạng [Tên môn] ([Số tín chỉ] TC)).
 */

export const ExternalHooks = {
  renderBentoDashboard: null,
  renderResearch: null,
  renderProfilesTable: null,
  renderStudentView: null,
  handleRoleChange: null,
  openStudentProfileModal: null,
  openCadetDetailPage: null
};

export function registerExternalHooks(hooks = {}) {
  Object.assign(ExternalHooks, hooks);
}



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
  if (document.querySelector('#researchEditor[open], #researchImportDialog[open], #researchUploadDialog[open]')) return true;

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

export const LANGUAGE_LEVEL_OPTIONS = ['Chưa đạt', 'A1', 'A21', 'A2', 'B11', 'B1'];

export const LANGUAGE_LEVEL_RANK = { 'Chưa đạt': 0, A1: 1, A21: 2, A2: 3, B11: 4, B1: 5 };

export function evaluateLangLevelStatus(actualLevel, requiredStandard = null) {
  const normalize = value => String(value || '').trim().toUpperCase().replace(/^A2[.,]1$/, 'A21').replace(/^B1[.,]1$/, 'B11');
  const requested = normalize(requiredStandard || AppState.requiredLangStandard || 'A2');
  const std = LANGUAGE_LEVEL_RANK[requested] !== undefined ? requested : 'A2';
  const candidate = normalize(actualLevel);
  const cur = LANGUAGE_LEVEL_RANK[candidate] !== undefined ? candidate : 'Chưa đạt';
  const curRank = LANGUAGE_LEVEL_RANK[cur] !== undefined ? LANGUAGE_LEVEL_RANK[cur] : 0;
  const reqRank = LANGUAGE_LEVEL_RANK[std] !== undefined ? LANGUAGE_LEVEL_RANK[std] : 3;
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
 * Từ điển đối chiếu tên/mã từ các file cũ; không tự thay tên hiển thị hoặc tên xuất file.
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
 * Giữ nguyên tên trong danh mục/thời khóa biểu; chỉ dùng mã khi bản ghi không có tên.
 */
export function getFullSubjectName(sub) {
  if (!sub) return 'Môn học';
  if (typeof sub === 'string') return sub.trim() || 'Môn học';
  return String(sub.name || sub.course_name || sub.code || 'Môn học').trim();
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
export function buildDeterministicSubjectId(options) {
  return stableOfferingId(options);
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
    if (parts.length >= 2 && /^[A-Z0-9_]{2,12}$/.test(parts[0]) && (ABBREVIATION_TO_FULL_COURSE_NAME[parts[0]] || AppState.subjects.some(subject => normalizeCourseText(subject.code) === parts[0]))) {
      codeCandidate = parts[0].toUpperCase();
      nameCandidate = parts.slice(1).join(' - ');
    }
  }

  const fullExpandedCourseName = cleanTitle;
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
    classHint,
    metadataDetected: Boolean(semMatch || credMatch || /[\[(]\s*CN\s/i.test(original))
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

  // A configured timetable name is literal, including parentheses that look like import metadata.
  const literalSemester = Number(semesterHint) || effectiveSem;
  const literal = AppState.subjects.filter(sub => doesSubjectApplyToClass(sub,targetCls) && Number(sub.semester) === literalSemester && normalizeCourseText(getFullSubjectName(sub)) === normalizeCourseText(headerInfo.original));
  if (literal.length > 1) throw new Error(`Môn "${headerInfo.original}" trùng tên trong lớp và học kỳ. Dùng mã môn để phân biệt.`);
  if (literal.length === 1) return literal[0];
  const applicable = AppState.subjects.filter(sub => doesSubjectApplyToClass(sub, targetCls) && Number(sub.semester) === effectiveSem);
  const findCode = key => {
    const exact = applicable.filter(sub => normalizeCourseText(sub.code) === key);
    return exact.length ? exact : applicable.filter(sub => normalizeCourseText(sub.code).replace(/_(OTQS1|OTQS2|TTG1|TTG2|XMCB)$/, '') === key);
  };
  const codeKey = headerInfo.normCode || '';
  let matches = codeKey ? findCode(codeKey) : [];
  if (!matches.length) matches = applicable.filter(sub => [headerInfo.normCourseName, headerInfo.normTitle].includes(normalizeCourseText(getFullSubjectName(sub))));
  if (!matches.length) matches = findCode(headerInfo.normTitle);
  if (!matches.length) matches = applicable.filter(sub => normalizeCourseText(expandCourseAbbreviation(sub.name,sub.code)) === headerInfo.normCourseName);
  if (matches.length > 1) throw new Error(`Môn "${headerInfo.cleanTitle}" trùng tên tại lớp ${targetCls}, HK${effectiveSem}. Dùng mã môn trong tiêu đề Excel để phân biệt.`);
  if (matches.length === 1) {
    if (headerInfo.creditsHint && Number(matches[0].credits) !== Number(headerInfo.creditsHint)) throw new Error('Tín chỉ trong Excel khác danh mục. Hãy kiểm tra môn trước khi nhập điểm.');
    return matches[0];
  }
  if (!autoCreate) return null;
  if (headerInfo.metadataDetected) throw new Error(`Chưa xác định được tên gốc của môn "${headerInfo.original}". Hãy thêm đúng tên và tín chỉ trong Môn học cho lớp ${targetCls}, HK${effectiveSem} trước khi nhập điểm.`);

  // Tự động khởi tạo môn học mới theo Khóa kết hợp (course_name + class_code + effectiveSem)
  // nếu trong DB chưa có môn đó cho lớp & kỳ tương ứng để không bị rớt dữ liệu điểm khi đẩy Excel lên!
  const courseName = headerInfo.original || headerInfo.courseName || headerInfo.cleanTitle;
  const generatedCode = headerInfo.codeCandidate ||
    slugifyCourseText(courseName)
      .split('_')
      .filter(Boolean)
      .map(w => w[0] ? w[0].toUpperCase() : '')
      .join('')
      .slice(0, 8) ||
    'MH';

  // An Excel row never assigns a new subject to other classes implicitly.
  const category = 'specialized';
  const targetClasses = [targetCls];
  const targetClass = targetCls;
  const credits = headerInfo.creditsHint || 3;
  const code = `${generatedCode}_${targetCls}`;

  const newSubId = buildDeterministicSubjectId({
    code,
    name: courseName,
    category,
    targetClasses,
    semester: effectiveSem
  });

  const existingById = AppState.subjects.find(s => s.id === newSubId);
  if (existingById) throw new Error('Mã định danh môn đã tồn tại với dữ liệu khác. Hãy kiểm tra danh mục trước khi nhập.');

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
  const currentLvl = evaluateLangLevelStatus(st?.currentLangLevel || l.currentLevel).actualLevel;

  const russianLevelsOrder = [
    { key: 'B12', label: 'B1', desc: 'Chuẩn Đầu ra Tốt nghiệp' },
    { key: 'B11', label: 'B11', desc: 'Chuẩn Năm thứ 4' },
    { key: 'A22', label: 'A2', desc: 'Chuẩn Năm thứ 3' },
    { key: 'A21', label: 'A21', desc: 'Chuẩn Năm thứ 2' },
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
  toast.innerHTML = sanitizeHTML(`
    <svg class="w-4 h-4 flex-shrink-0 text-rose-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
    <span></span>
  `);
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
export function filterSheetStudents() {
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().trim().replace(/\s+/g, ' ');
  const query = normalize(document.getElementById('sheetSearchInput')?.value);
  const students = new Map(AppState.students.map(student => [String(student.id), student]));
  const rows = document.querySelectorAll('#spreadsheetTbody tr[data-student-id]');
  let visible = 0;
  rows.forEach(row => {
    const student = students.get(row.dataset.studentId);
    const matches = !query || (student && normalize(`${student.name} ${student.code}`).includes(query));
    row.hidden = !matches;
    row.querySelectorAll('.grid-cell-input').forEach(input => { input.dataset.row = matches ? String(visible) : ''; });
    if (matches) visible++;
  });
  const status = document.getElementById('sheetSearchStatus');
  if (status) status.textContent = query ? `Tìm thấy ${visible}/${rows.length} học viên` : `${rows.length} học viên`;
}

export function renderSpreadsheet() {
  const isStudent = AppState.role === 'student';
  const classWrapper = document.getElementById('classSpreadsheetWrapper');
  const studentVerticalWrapper = document.getElementById('studentVerticalGradesWrapper');
  const instructionBanner = document.getElementById('sheetInstructionBanner');

  const btnImport = document.getElementById('btnImportExcel');
  const btnAddCadet = document.getElementById('btnAddCadetModalBtn');
  const btnAddSubj = document.getElementById('btnAddSubjectFromSheetBtn');
  document.getElementById('sheetSearchBox')?.classList.toggle('hidden', isStudent);
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
  if (studentVerticalWrapper) studentVerticalWrapper.classList.add('hidden');
  if (classWrapper) classWrapper.classList.remove('hidden');

  const thead = document.getElementById('spreadsheetThead');
  const tbody = document.getElementById('spreadsheetTbody');
  if (!thead || !tbody) return;

  const classScope = getCurrentUserClassScope();
  if (classScope) {
    AppState.currentSheetClass = classScope;
  }
  const selectedClass = AppState.currentSheetClass || 'OTQS1';

  const sheetClassSelect = document.getElementById('sheetClassSelect');
  if (sheetClassSelect) {
    if (classScope) {
      sheetClassSelect.innerHTML = sanitizeHTML(`<option value="${classScope}">Lớp ${classScope}</option>`);
      sheetClassSelect.value = classScope;
      sheetClassSelect.disabled = true;
    } else {
      sheetClassSelect.disabled = false;
      sheetClassSelect.innerHTML =
        sanitizeHTML(`<option value="all" ${selectedClass === 'all' ? 'selected' : ''}>🏢 Toàn bộ Đại đội 460 (Tất cả 5 Lớp)</option>` +
        DEFAULT_CLASSES.map(c => `<option value="${c}" ${c === selectedClass ? 'selected' : ''}>Lớp ${c}</option>`).join(''));
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

  const canEdit = canUserEditCurrentSheet();
  const isLocked = isCurrentSheetLocked();

  const lockBadge = document.getElementById('sheetLockBadge');
  const btnToggleLock = document.getElementById('btnToggleLock');
  if (lockBadge && btnToggleLock) {
    if (isLocked) {
      lockBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300';
      lockBadge.innerHTML = sanitizeHTML(`🔒 Sổ điểm Năm ${yearNum}: ĐÃ KHÓA`);
      btnToggleLock.textContent = 'Mở Khóa Sổ';
      btnToggleLock.className = 'text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-medium py-1.5 px-3 rounded-lg transition';
    } else {
      lockBadge.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300';
      lockBadge.innerHTML = sanitizeHTML(`🔓 Sổ điểm Năm ${yearNum}: Mở`);
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
          ${isSpec ? `<span class="px-1 py-0.2 rounded text-[9px] font-black bg-amber-200 text-amber-900 shrink-0">Lớp</span>` : ''}
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
  thead.innerHTML = sanitizeHTML(theadHtml);

  let tbodyHtml = '';
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
          <td class="py-2 px-3 font-mono font-semibold text-slate-700">${escapeHTML(student.code)}</td>
          <td class="py-2 px-4 font-semibold text-slate-900 flex items-center justify-between gap-2">
            <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline font-bold text-left" data-id="${student.id}" title="Nhấp để xem trang chi tiết quân nhân">${escapeHTML(student.name)}</button>
            <span class="text-[10px] text-slate-400 font-normal whitespace-nowrap">${selectedClass === 'all' ? `<strong class="text-army-700">[${escapeHTML(student.class)}]</strong> ` : ''}${escapeHTML(student.rank)}</span>
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

  tbody.innerHTML = sanitizeHTML(tbodyHtml);
  filterSheetStudents();

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
    container.innerHTML = sanitizeHTML(`<div class="p-8 text-center text-slate-400">Không tìm thấy thông tin bảng điểm học viên.</div>`);
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
        <div class="student-course-card p-3 rounded-lg border ${isFail ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200'} shadow-sm flex items-center justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="font-mono font-bold text-[11px] text-army-800">${escapeHTML(s.code)}</span>
              <span class="px-1.5 py-0.2 rounded text-[9px] font-bold ${isSpec ? 'bg-amber-100 text-amber-800 border border-amber-300' : 'bg-slate-100 text-slate-600'}">
                ${isSpec ? 'Chuyên ngành ' + student.class : 'Môn chung'}
              </span>
              <span class="text-[10px] text-slate-400 font-semibold">(${s.credits} TC)</span>
            </div>
            <div class="student-course-title text-xs font-bold text-slate-900 truncate mt-0.5" title="${escapeHTML(getFullSubjectName(s))}">${escapeHTML(getFullSubjectName(s))}</div>
          </div>
          <div class="text-right shrink-0">
            <div class="student-course-score text-sm font-black ${isFail ? 'text-rose-700' : isScale4 ? 'text-blue-800' : 'text-army-900'}">${dispScore}</div>
            <div class="text-[10px] font-semibold ${isFail ? 'text-rose-600' : 'text-emerald-600'}">${!hasScore ? 'Chưa có' : isFail ? 'Rớt (< 4.0)' : 'Đạt'}</div>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="p-4 bg-slate-50/70 border-b border-slate-200 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="student-semester-label px-2.5 py-1 rounded-md bg-army-800 text-gold-300 font-extrabold text-xs uppercase">${termLabel} (Học kỳ ${semNumber})</span>
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
        <div class="readable-section-header student-year-header bg-gradient-to-r from-army-900 to-army-800 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b-2 border-gold-500">
          <div class="flex items-center gap-2.5">
            <span class="w-7 h-7 rounded-lg bg-gold-500 text-slate-950 font-black text-xs flex items-center justify-center">N${y}</span>
            <div>
              <h4 class="text-sm font-black uppercase tracking-wide text-gold-300">${yearNames[y]}</h4>
              <p class="text-[11px] text-slate-300">Lớp ${escapeHTML(student.class)} • Gồm Học kỳ 1 (Kỳ ${sem1}) & Học kỳ 2 (Kỳ ${sem2})</p>
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
        <div class="student-year-summary p-4 bg-amber-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="student-year-summary-label px-2.5 py-1 rounded-md bg-gold-500 text-slate-950 font-black text-xs uppercase">Hàng 3 — Điểm Tổng Kết Năm Thứ ${y}</span>
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

  container.innerHTML = sanitizeHTML(`<div class="space-y-6">${blocksHtml}</div>`);
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
      masterClassSelect.innerHTML = sanitizeHTML(`<option value="${classScope}">Lớp ${classScope}</option>`);
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
          <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline" data-id="${student.id}">${escapeHTML(student.code)}</button>
        </td>
        <td class="py-2.5 px-4 font-bold text-slate-900">
          <button type="button" class="btn-view-cadet-detail hover:text-army-800 hover:underline text-left font-bold" data-id="${student.id}">${escapeHTML(student.name)}</button>
        </td>
        <td class="py-2.5 px-2 text-center text-slate-600">${escapeHTML(student.rank)}</td>
        <td class="py-2.5 px-3 text-center font-bold text-army-800">${escapeHTML(student.class)}</td>
        <td class="py-2.5 px-3 text-center text-slate-500 text-[11px]">${formatVN(student.dob)}</td>
        <td class="py-2.5 px-3 text-center font-semibold text-slate-700 bg-slate-50">${gpa1.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center font-semibold text-slate-700 bg-slate-50">${gpa2.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center font-black text-army-800 bg-gold-50">${targetGpa.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center">${getClassificationBadge(rank)}</td>
      </tr>
    `;
  });

  if (filtered.length === 0) {
    html = `<tr><td colspan="10" class="py-8 text-center text-slate-400">Không tìm thấy học viên nào phù hợp với bộ lọc hiện tại.</td></tr>`;
  }
  tbody.innerHTML = sanitizeHTML(html);

  if (footer) {
    const scopeTotal = getScopedStudents().length;
    const semLabel = `Năm ${year} (Học kỳ ${sem1} & ${sem2})`;
    footer.innerHTML = sanitizeHTML(`
      <span>Hiển thị <strong>${filtered.length}</strong> / ${scopeTotal} học viên • Năm học: <strong>${semLabel}</strong></span>
      <span class="text-[11px] text-slate-500">Đại đội 460 • Tiểu đoàn 4</span>
    `);
  }
}

// --- 6. BÁO CÁO GIAO BAN (3 BẢNG CHUẨN): BẢNG 1 (TỶ LỆ TÍCH LŨY) • BẢNG 2 (TỶ LỆ TỪNG NĂM & TỪNG HỌC KỲ) • BẢNG 3 (DANH SÁCH HỌC VIÊN RỚT MÔN CẦN BỒI DƯỠNG) ---

// --- 7. CHỨNG CHỈ NGOẠI NGỮ ---
export function renderLanguages() {
  const summaryContainer = document.getElementById('languageClassSummary');
  if (!summaryContainer) return;

  const canConfigStd = AppState.role === 'admin';
  const reqStd = evaluateLangLevelStatus('Chưa đạt').requiredStandard;
  document.querySelectorAll('.required-lang-standard-select').forEach(sel => {
    sel.value = reqStd;
    sel.disabled = !canConfigStd;
  });
  document.querySelectorAll('.required-lang-standard-badge').forEach(b => {
    b.textContent = reqStd;
  });

  const classScope = getCurrentUserClassScope();
  const langClassSelect = document.getElementById('cumulFilterClass');
  if (langClassSelect) {
    if (classScope) {
      langClassSelect.innerHTML = sanitizeHTML(`<option value="${classScope}">Lớp ${classScope}</option>`);
      langClassSelect.value = classScope;
      langClassSelect.disabled = true;
    } else {
      langClassSelect.disabled = false;
    }
  }
  const selectedLangClass = classScope || langClassSelect?.value || 'all';
  const visibleClasses = selectedLangClass !== 'all' ? [selectedLangClass] : DEFAULT_CLASSES;

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
  summaryContainer.innerHTML = sanitizeHTML(summaryHtml);

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
    sel.innerHTML = sanitizeHTML(scoped.map(s => `<option value="${s.id}" ${s.id === activeId ? 'selected' : ''}>${escapeHTML(s.name)} (${escapeHTML(s.code)} - ${escapeHTML(s.class)})</option>`).join(''));
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
    actualLevel.innerHTML = sanitizeHTML(LANGUAGE_LEVEL_OPTIONS.map(level => `<option value="${level}">${level}</option>`).join(''));
    actualLevel.value = evaluateLangLevelStatus(student.currentLangLevel || l.currentLevel).actualLevel;
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
    tbody.innerHTML = sanitizeHTML(`<tr><td colspan="8" class="p-6 text-center text-slate-400">Chưa có bản ghi lịch sử chỉnh sửa nào.</td></tr>`);
    return;
  }

  tbody.innerHTML = sanitizeHTML(logs.map(log => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-2 px-3 font-mono text-[11px] text-slate-500">${escapeHTML(log.timestamp)}</td>
      <td class="py-2 px-3 font-semibold text-slate-800">${escapeHTML(log.actor)}</td>
      <td class="py-2 px-3 font-medium text-slate-900">${escapeHTML(log.student)}</td>
      <td class="py-2 px-3 text-slate-600 font-semibold">${escapeHTML(log.class)}</td>
      <td class="py-2 px-3 text-army-800 font-bold">${escapeHTML(log.subject)}</td>
      <td class="py-2 px-3 text-center text-slate-500">${escapeHTML(log.oldVal)}</td>
      <td class="py-2 px-3 text-center font-bold text-emerald-700">${escapeHTML(log.newVal)}</td>
      <td class="py-2 px-3 text-slate-600 italic text-[11px]">${escapeHTML(log.reason)}</td>
    </tr>
  `).join(''));
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
  renderSubjectCatalog({state:AppState,scope:getCurrentUserClassScope(),classes:DEFAULT_CLASSES,getSubjects:getSubjectsForClass,getName:getFullSubjectName,getClasses:getSubjectTargetClasses,hasGrades:subjectHasGrades,refresh:renderSubjectsSettings});
}

export function updateAllViews(options = {}) {
  const force = Boolean(options && options.force);
  // Cô lập Form Chỉnh Sửa: Khi modal hoặc form chỉnh sửa đang mở,
  // tuyệt đối không gọi các hàm làm mới dữ liệu toàn cục ở chế độ ngầm.
  if (!force && isAnyEditFormActive()) {
    return;
  }
  if (typeof ExternalHooks.renderResearch === 'function') ExternalHooks.renderResearch();
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
  const status = document.getElementById('importFileStatus');
  if (status) { status.textContent = ''; status.classList.add('hidden'); }
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
  trackImportRead(reader, file, 'excelFileInput', 'btnConfirmImport');
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

  let databaseCommitted = false;
  let transactionStarted = false;
  let legacyStarted = false;
  let importRowCount = 0;
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
      const languageLike = lowerH.includes('ngoại ngữ') || lowerH.includes('cntt');
      const candidateTitle = languageLike ? (parseExcelSubjectHeader(h)?.cleanTitle || h) : '';
      const configuredSubject = languageLike && AppState.subjects.some(subject => [h,candidateTitle].some(title => String(subject.name || subject.course_name || subject.code || '').normalize('NFC').trim().toLowerCase() === String(title).normalize('NFC').trim().toLowerCase()));
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
        (languageLike && !configuredSubject) ||
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

    const seenImportCodes = new Set();
    const reviewRows = [];
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

      if (seenImportCodes.has(studentCode)) throw new Error(`Mã HV ${studentCode} bị lặp trong file.`);
      seenImportCodes.add(studentCode);
      const beforePoints = updatedCount;
      const rowScores = [];
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

      if (classScope && student.class !== classScope) throw new Error(`Mã HV ${studentCode} thuộc lớp khác.`);

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
          rowScores.push(`${targetSubject.name || desc.rawHeader}: ${rounded}`);
          updatedCount++;
        }
      });
      if (updatedCount > beforePoints) {
        importRowCount++;
        reviewRows.push(`${rIdx + 1}. ${studentCode} — ${student.name} — ${student.class}: ${updatedCount - beforePoints} ô điểm\n   ${rowScores.join('; ')}`);
      }
    });

    if (bulkGradeEntries.length === 0) {
      throw new Error('Không tìm thấy ô điểm hợp lệ. Kiểm tra tiêu đề cột và dữ liệu Excel.');
    }

    const stagedState = structuredClone({ students: AppState.students, subjects: AppState.subjects, grades: AppState.grades, languages: AppState.languages });
    Object.assign(AppState, structuredClone(previousState));
    const accepted = await reviewImport({ title: 'Xem trước nhập bảng điểm', confirm: true,
      details: `${importRowCount}/${rows.length} dòng có điểm; ${updatedCount} ô điểm; ${createdStudentsCount} học viên mới; ${newSubjectsMap.size} môn mới. Dòng không có điểm được bỏ qua. Nếu chưa cài SQL giao dịch, hệ thống sẽ hỏi trước khi dùng cách lưu cũ.`, rows: reviewRows });
    if (!accepted) return;
    if (JSON.stringify({ students: AppState.students, subjects: AppState.subjects, grades: AppState.grades, languages: AppState.languages }) !== JSON.stringify(previousState)) throw new Error('Dữ liệu đã thay đổi trong lúc xem trước. Hãy đọc lại file.');
    Object.assign(AppState, stagedState);
    transactionStarted = true;
    const atomicResult = await importExcelTransaction({ students: createdStudents, subjects: Array.from(newSubjectsMap.values()), grades: bulkGradeEntries, createOnly: true });
    transactionStarted = !atomicResult.unavailable;
    if (atomicResult.unavailable) {
      Object.assign(AppState, structuredClone(previousState));
      const useLegacy = await reviewImport({ title: 'Chưa cài giao dịch Supabase', confirm: true,
        details: 'Cách lưu hiện tại gửi nhiều yêu cầu và có thể lưu một phần nếu lỗi. Chọn Hủy nhập để cài SQL trước hoặc xác nhận để tiếp tục theo cách cũ.' });
      if (!useLegacy) return;
      Object.assign(AppState, stagedState);
      legacyStarted = true;
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

    }
    databaseCommitted = true;
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
    await reviewImport({ title: 'Kết quả nhập điểm', details: `${importRowCount} dòng thành công; 0 thất bại; ${rows.length - importRowCount} dòng bỏ qua. ${transactionStarted ? 'Đã lưu bằng giao dịch.' : 'Đã lưu theo từng đợt.'}` });
  } catch (err) {
    if (!databaseCommitted) Object.assign(AppState, previousState);
    AppState.hasPendingCloudRefresh = true;
    console.error('Lỗi khi nhập Excel điểm lên Supabase:', err);
    await reviewImport({ title: 'Nhập điểm chưa hoàn tất', details: databaseCommitted ? `${importRowCount} dòng đã lưu; lỗi ở bước cập nhật giao diện/nhật ký. Không nhập lại file.` : err.confirmedRollback ? `0 dòng thành công; ${importRowCount} dòng thất bại, toàn bộ giao dịch đã hoàn tác.` : !transactionStarted && !legacyStarted ? '0 dòng thành công; bản nhập đã bị chặn trước khi ghi database. Sửa lỗi bên dưới rồi thử lại.' : legacyStarted ? 'Chưa xác định số dòng đã lưu do lỗi giữa các đợt. Một phần có thể đã lên database; cần tải lại trước khi thử lại.' : 'Chưa xác nhận thành công. Lỗi SQL sẽ hoàn tác giao dịch; nếu mất kết nối, cần tải lại dữ liệu để kiểm tra kết quả.', rows: [String(err.message || err)] });
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.removeAttribute('aria-busy');
      btnConfirm.textContent = origText;
    }
  }
}

// --- 16. ĐIỂM TÍCH LŨY ---
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
  renderLanguages();
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
      cumulClassSelect.innerHTML = sanitizeHTML(`<option value="${classScope}">Lớp ${classScope}</option>`);
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
    const curLang = evaluateLangLevelStatus(s.currentLangLevel || AppState.languages[s.id]?.currentLevel).actualLevel;

    const langEval = evaluateLangLevelStatus(curLang, AppState.requiredLangStandard);
    const canEditMeta = AppState.role === 'admin' ||
      (AppState.role && AppState.role.startsWith('class_leader_') && AppState.role.replace('class_leader_', '') === s.class);

    const langOptionsHtml = LANGUAGE_LEVEL_OPTIONS.filter(level => level !== 'Chưa đạt').map(opt =>
      `<option value="${opt}" ${opt === curLang ? 'selected' : ''}>${opt}</option>`
    ).join('');


    rowsHtml += `
      <tr class="hover:bg-slate-50 transition" data-student-id="${s.id}">
        <td class="py-2.5 px-2 text-center text-slate-500 font-medium">${idx + 1}</td>
        <td class="py-2.5 px-3 font-mono font-bold">
          <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline" data-id="${s.id}">
            ${escapeHTML(s.code)}
          </button>
        </td>
        <td class="py-2.5 px-4 font-bold text-slate-900">
          <button type="button" class="btn-view-cadet-detail hover:text-army-800 hover:underline text-left font-bold" data-id="${s.id}" title="Nhấp để xem chi tiết quân nhân">
            ${escapeHTML(s.name)}
          </button>
        </td>
        <td class="py-2.5 px-2 text-center text-slate-600">${escapeHTML(s.rank)}</td>
        <td class="py-2.5 px-2 text-center font-bold text-army-800">${escapeHTML(s.class)}</td>
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
          <button type="button" class="btn-open-transcript px-2.5 py-1 rounded bg-army-700 hover:bg-army-800 text-white font-semibold text-[11px] shadow-sm transition" data-id="${s.id}">
            Phiếu Điểm
          </button>
        </td>
      </tr>
    `;
  });

  if (filtered.length === 0) {
    rowsHtml = `<tr><td colspan="11" class="p-8 text-center text-slate-400">Không tìm thấy quân nhân nào phù hợp với bộ lọc.</td></tr>`;
  }
  tbody.innerHTML = sanitizeHTML(rowsHtml);
  // Leave missing proficiency unselected; never imply that an unrecorded level is A1.
  tbody.querySelectorAll('.select-cumul-lang').forEach(select => {
    if (!select.querySelector('option[selected]')) select.selectedIndex = -1;
  });

  if (footer) {
    footer.innerHTML = sanitizeHTML(`
      <span>Hiển thị <strong>${filtered.length}</strong> / ${scoped.length} quân nhân • Tích lũy toàn khóa</span>
      <span class="text-[11px] text-slate-500">Hỗ trợ chọn trực tiếp Trình độ ngoại ngữ hiện tại (A1, A21, A2, B11, B1) </span>
    `);
  }

  // Event Delegation xử lý .btn-open-transcript, .select-cumul-lang, .select-cumul-it tại document
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
