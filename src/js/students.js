/**
 * MODULE: src/js/students.js
 * Quản lý Hồ sơ Quân nhân:
 * - Giao diện Hồ sơ Quân nhân riêng cho Học viên: Bỏ bảng (Table), bỏ 4 khối thống kê thừa,
 *   hiển thị toàn bộ thông tin cá nhân trải dài gọn gàng, có nút chuyển đổi [ Chỉnh sửa ] / [ Lưu ] trực tiếp.
 * - Thông tin Thân nhân (Bố & Mẹ): 2 lựa chọn nhập ngày sinh (Chỉ nhập Năm sinh YYYY hoặc Đầy đủ DD/MM/YYYY).
 * - Thành tích / Danh hiệu: Không bắt buộc (optional), lưu trữ nhiều danh hiệu dạng mảng (Array).
 * - Xem chi tiết quân nhân: Nhấp vào Họ và Tên chuyển sang trang chi tiết toàn diện, có nút "Quay lại" (Back).
 * - Loại bỏ hoàn toàn Điểm rèn luyện.
 */

import {
  DEFAULT_CLASSES,
  LANGUAGE_LEVEL_OPTIONS,
  IT_STANDARD_OPTIONS,
  evaluateLangLevelStatus,
  AppState,
  persistData,
  showToast,
  logAuditTrail,
  formatVN,
  normalizeAchievements,
  formatAchievementsText,
  getCurrentUserClassScope,
  getScopedStudents,
  getSubjectsForClass,
  calculateSemesterGPA,
  calculateAcademicYearGPA,
  calculateYearGPA,
  calculateCourseGPA10,
  calculateCumulativeGPA4,
  calculateCreditsPassed,
  getTotalCourseCredits,
  getHighestRussianCertInfo,
  getLoggedInStudent,
  getClassification,
  getClassificationBadge,
  getDebtSubjects,
  formatFailedSubjectItem,
  handleInlineCumulativeMetaChange,
  renderCumulativeTable,
  updateAllViews,
  showModal,
  hideModal
} from './grades.js';

import {
  buildDeterministicStudentId,
  upsertStudentToSupabase,
  upsertStudentsBulkToSupabase,
  deleteStudentFromSupabase,
  deleteAllStudentsFromSupabase
} from './supabase.js';

export const POLITICAL_BADGES = {
  'DANG_VIEN_CHINH_THUC': '<span class="inline-block whitespace-nowrap px-2.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">★ Đảng viên chính thức</span>',
  'DANG_VIEN_DU_BI': '<span class="inline-block whitespace-nowrap px-2.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">✪ Đảng viên dự bị</span>',
  'CAM_TINH_DANG': '<span class="inline-block whitespace-nowrap px-2.5 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-800 border border-cyan-300">✦ Cảm tình Đảng</span>',
  'DOAN_VIEN': '<span class="inline-block whitespace-nowrap px-2.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300">● Đoàn viên</span>'
};

export function validateAndFormatParentDob(rawVal, parentLabel = 'Thân nhân') {
  const s = String(rawVal || '').trim();
  if (!s) return { valid: true, value: '' };

  if (/^\d{4}$/.test(s)) {
    const y = parseInt(s, 10);
    if (y < 1920 || y > 2015) {
      return { valid: false, error: `Năm sinh ${parentLabel} (${s}) không hợp lệ (nhập từ 1920 đến 2015)!` };
    }
    return { valid: true, value: s };
  }

  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const y = parseInt(ymd[1], 10);
    const m = parseInt(ymd[2], 10);
    const d = parseInt(ymd[3], 10);
    if (y >= 1920 && y <= 2015 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return {
        valid: true,
        value: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
      };
    }
  }

  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    const y = parseInt(dmy[3], 10);
    if (y < 1920 || y > 2015 || m < 1 || m > 12 || d < 1 || d > 31) {
      return { valid: false, error: `Ngày tháng năm sinh ${parentLabel} (${s}) không hợp lệ!` };
    }
    return {
      valid: true,
      value: `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`
    };
  }

  return {
    valid: false,
    error: `Ngày sinh ${parentLabel} phải nhập Năm sinh (VD: 1975) hoặc Ngày/Tháng/Năm (VD: 15/05/1975)!`
  };
}

export function detectParentDobMode(val) {
  const s = String(val || '').trim();
  if (/^\d{4}$/.test(s)) return 'year';
  return 'full';
}

export function renderStudentView() {
  let student = null;
  if (AppState.role === 'student') {
    student = getLoggedInStudent();
    if (student) AppState.studentViewingId = student.id;
  } else {
    student = AppState.students.find(s => s.id === AppState.studentViewingId) || AppState.students[0];
  }

  if (!student) return;

  const setElText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setElText('studentCardName', student.name);
  setElText('studentCardCode', student.code);
  setElText('studentCardClass', student.class);
  setElText('studentCardRank', student.rank);
  setElText('studentCardRole', student.position || student.role || 'Học viên');

  const gpa10 = calculateCourseGPA10(student.id);
  const gpa4 = calculateCumulativeGPA4(student.id);
  const rank = getClassification(gpa10);
  const passedTC = calculateCreditsPassed(student.id);
  const totalTC = getTotalCourseCredits(student.class);
  const debts = getDebtSubjects(student.id);
  const certInfo = getHighestRussianCertInfo(student.id);
  const achList = normalizeAchievements(student.achievements);

  setElText('studentMetricHK1', gpa10.toFixed(2));
  setElText('studentMetricCreditsSub', `Tích lũy: ${passedTC}/${totalTC} TC`);
  setElText('studentMetricHK2', `${gpa4.toFixed(2)} / 4.00`);
  setElText('studentMetricGpa4Sub', `Quy đổi Thang điểm 4.00`);
  setElText('studentMetricYear', rank);
  setElText('studentMetricRank', debts.length > 0 ? `Rớt ${debts.length} học phần (< 4.0)` : `Đạt 100% học phần`);
  const langEval = evaluateLangLevelStatus(student.currentLangLevel || 'A2', AppState.requiredLangStandard);
  setElText('studentMetricLang', `${student.currentLangLevel || 'A2'} (${langEval.isPassed ? 'Đạt chuẩn' : 'Chưa đạt'})`);
  setElText('studentMetricLangSub', `Chuẩn yêu cầu hiện tại: ${langEval.requiredStandard} • ${langEval.statusText}`);
  setElText('studentMetricAchievements', achList.length > 0 ? achList.join(' • ') : 'Chưa có danh hiệu');
  setElText('studentMetricAchievementsSub', `${achList.length} danh hiệu lưu trữ`);

  const langSel = document.getElementById('studentSelfLangLevelSelect');
  if (langSel) {
    langSel.innerHTML = LANGUAGE_LEVEL_OPTIONS.map(opt =>
      `<option value="${opt}" ${opt === (student.currentLangLevel || 'A2') ? 'selected' : ''}>${opt}</option>`
    ).join('');
    langSel.disabled = (AppState.role === 'student');
  }
  const itSel = document.getElementById('studentSelfItStandardSelect');
  if (itSel) {
    itSel.innerHTML = IT_STANDARD_OPTIONS.map(opt =>
      `<option value="${opt}" ${opt === (student.itStandard || 'Đạt chuẩn CNTT cơ bản') ? 'selected' : ''}>${opt}</option>`
    ).join('');
  }

  AppState.currentSheetClass = student.class;
  const sheetClassSelect = document.getElementById('sheetClassSelect');
  if (sheetClassSelect) sheetClassSelect.value = student.class;
}

export function populateStudentPicker() {
  const picker = document.getElementById('studentPicker');
  if (!picker) return;
  const scoped = getScopedStudents();
  if (scoped.length === 0) {
    picker.innerHTML = '<option value="">(Chưa có học viên)</option>';
    return;
  }

  if (AppState.role === 'student') {
    const selfStudent = getLoggedInStudent();
    if (selfStudent) {
      AppState.studentViewingId = selfStudent.id;
      picker.innerHTML = `<option value="${selfStudent.id}" selected>${selfStudent.name} (${selfStudent.code} - ${selfStudent.class})</option>`;
      picker.disabled = true;
      return;
    }
  }

  picker.disabled = false;
  picker.innerHTML = scoped.map(s => `
    <option value="${s.id}" ${s.id === AppState.studentViewingId ? 'selected' : ''}>
      ${s.name} (${s.code} - ${s.class})
    </option>
  `).join('');
}

export function openCadetDetailPage(studentId) {
  const student = AppState.students.find(s => s.id === studentId);
  if (!student) {
    showToast('Không tìm thấy thông tin quân nhân!', 'error');
    return;
  }

  const classScope = getCurrentUserClassScope();
  if (AppState.role === 'student') {
    const self = getLoggedInStudent();
    if (!self || self.id !== student.id) {
      showToast('Bảo mật: Bạn không có quyền xem thông tin của quân nhân khác!', 'error');
      return;
    }
  } else if (classScope && student.class !== classScope) {
    showToast(`Bảo mật: Tài khoản Lớp ${classScope} không được truy cập thông tin lớp khác!`, 'error');
    return;
  }

  AppState.viewingDetailStudentId = student.id;
  if (AppState.activeTab) {
    AppState.previousTabBeforeDetail = AppState.activeTab;
  }

  document.querySelectorAll('.tab-content').forEach(sec => {
    sec.classList.add('hidden');
    sec.classList.remove('active');
    sec.style.display = 'none';
  });

  const detailSection = document.getElementById('cadetDetailViewSection');
  if (!detailSection) return;
  detailSection.classList.remove('hidden');
  detailSection.style.display = 'block';

  const gpa10 = calculateYearGPA(student.id);
  const gpa4 = calculateCumulativeGPA4(student.id);
  const rank = getClassification(gpa10);
  const passedTC = calculateCreditsPassed(student.id);
  const totalTC = getTotalCourseCredits(student.class);
  const achArr = normalizeAchievements(student.achievements);
  const l = AppState.languages[student.id] || { lang: 'Tiếng Nga', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT' };

  let yearRowsHtml = '';
  for (let y = 1; y <= 5; y++) {
    const sem1 = 2 * y - 1;
    const sem2 = 2 * y;
    const g1 = calculateSemesterGPA(student.id, sem1);
    const g2 = calculateSemesterGPA(student.id, sem2);
    const gy = calculateAcademicYearGPA(student.id, y);
    const yrRank = getClassification(gy);
    const yDebts = getDebtSubjects(student.id, null, y);

    yearRowsHtml += `
      <tr class="hover:bg-slate-50">
        <td class="py-2.5 px-3 font-bold text-army-900">Năm học thứ ${y} (Kỳ ${sem1} & Kỳ ${sem2})</td>
        <td class="py-2.5 px-3 text-center font-semibold text-slate-800">${g1.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center font-semibold text-slate-800">${g2.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center font-black text-army-900 bg-gold-50">${gy.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center">${getClassificationBadge(yrRank)}</td>
        <td class="py-2.5 px-3 text-left">
          ${yDebts.length > 0
            ? yDebts.map(d => `<span class="inline-block px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[11px] mr-1">${formatFailedSubjectItem(d.subject)} (${d.score.toFixed(1)})</span>`).join('')
            : '<span class="text-emerald-700 font-semibold text-xs">✅ Đạt 100%</span>'
          }
        </td>
      </tr>
    `;
  }

  detailSection.innerHTML = `
    <div class="space-y-5">
      <div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <button type="button" id="btnBackFromCadetDetail" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-army-800 hover:bg-army-900 text-gold-300 font-extrabold text-xs shadow-sm transition cursor-pointer">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            <span>Quay lại trang trước</span>
          </button>
          <div>
            <div class="text-[11px] font-bold text-slate-400 uppercase">Hồ Sơ & Kết Quả Học Tập Chi Tiết Quân Nhân</div>
            <h3 class="text-base font-black text-slate-900 uppercase">${student.name} (${student.code})</h3>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button type="button" id="btnEditFromCadetDetail" class="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-gold-500 hover:bg-gold-600 text-slate-950 font-bold text-xs shadow-sm transition">
            ✏️ Chỉnh Sửa Hồ Sơ
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-200 pb-3">
            <h4 class="text-sm font-extrabold text-army-900 uppercase">1. Lý Lịch Quân Nhân & Chính Trị</h4>
            ${POLITICAL_BADGES[student.politicalStatus] || student.politicalStatus}
          </div>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
            <div><span class="text-slate-400 block">Họ và tên:</span><strong class="text-slate-900 text-sm">${student.name}</strong></div>
            <div><span class="text-slate-400 block">Mã học viên:</span><strong class="font-mono text-army-800 text-sm">${student.code}</strong></div>
            <div><span class="text-slate-400 block">Đơn vị Lớp:</span><strong class="text-army-800 text-sm">Lớp ${student.class}</strong></div>
            <div><span class="text-slate-400 block">Cấp bậc:</span><strong class="text-slate-800">${student.rank}</strong></div>
            <div><span class="text-slate-400 block">Chức vụ:</span><strong class="text-slate-800">${student.position || student.role || 'Học viên'}</strong></div>
            <div><span class="text-slate-400 block">Ngày sinh:</span><strong class="text-slate-800">${formatVN(student.dob)}</strong></div>
            <div><span class="text-slate-400 block">Nhập ngũ:</span><strong class="text-slate-800">${student.enlistmentDate || '02/2022'}</strong></div>
            <div><span class="text-slate-400 block">Số điện thoại:</span><strong class="font-mono text-slate-800">${student.phone || 'Chưa cập nhật'}</strong></div>
            <div><span class="text-slate-400 block">Vào Đảng (Dự bị):</span><strong class="text-rose-800">${formatVN(student.party_joined_date)}</strong></div>
            <div><span class="text-slate-400 block">Đảng chính thức:</span><strong class="text-rose-800">${formatVN(student.official_party_date)}</strong></div>
            <div class="col-span-2"><span class="text-slate-400 block">Quê quán:</span><strong class="text-slate-800">${student.hometown || '-'}</strong></div>
            <div class="col-span-3"><span class="text-slate-400 block">Hộ khẩu thường trú:</span><strong class="text-slate-800">${student.permanentAddress || '-'}</strong></div>
            <div class="col-span-3"><span class="text-slate-400 block">Nơi ở hiện nay:</span><strong class="text-slate-800">${student.currentAddress || '-'}</strong></div>
          </div>

          <div class="pt-3 border-t border-slate-100">
            <div class="text-xs font-bold text-slate-500 uppercase mb-2">Thành tích / Danh hiệu đạt được (${achArr.length}):</div>
            <div class="flex flex-wrap gap-1.5">
              ${achArr.length > 0
                ? achArr.map(a => `<span class="px-3 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 font-bold text-xs">🏅 ${a}</span>`).join('')
                : '<span class="text-xs text-slate-400 italic">Không có (Để trống)</span>'
              }
            </div>
          </div>
        </div>

        <div class="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-4 text-xs">
          <h4 class="text-sm font-extrabold text-army-900 uppercase border-b border-slate-200 pb-3">2. Thông Tin Thân Nhân (Bố & Mẹ)</h4>
          <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <div class="font-bold text-army-800 uppercase">Thông tin Bố:</div>
            <div>Họ và tên: <strong>${student.father_name || '-'}</strong></div>
            <div>Ngày / Năm sinh: <strong>${formatVN(student.father_birth_date)}</strong></div>
            <div>Nghề nghiệp: <strong>${student.father_job || '-'}</strong></div>
            <div>Quê quán: <strong>${student.father_hometown || '-'}</strong></div>
          </div>
          <div class="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
            <div class="font-bold text-army-800 uppercase">Thông tin Mẹ:</div>
            <div>Họ và tên: <strong>${student.mother_name || '-'}</strong></div>
            <div>Ngày / Năm sinh: <strong>${formatVN(student.mother_birth_date)}</strong></div>
            <div>Nghề nghiệp: <strong>${student.mother_job || '-'}</strong></div>
            <div>Quê quán: <strong>${student.mother_hometown || '-'}</strong></div>
          </div>
          <div class="p-3 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1.5">
            <div class="font-bold text-emerald-900 uppercase">Chuẩn Đầu Ra Hiện Tại:</div>
            <div class="flex items-center justify-between gap-2">
              <span>Trình độ ngoại ngữ (${l.lang}): <strong class="text-army-900">${student.currentLangLevel || 'A2'}</strong></span>
              ${evaluateLangLevelStatus(student.currentLangLevel || 'A2', AppState.requiredLangStandard).badgeHtml}
            </div>
            <div>Chuẩn CNTT: <strong class="text-army-900">${student.itStandard || 'Đạt chuẩn CNTT cơ bản'}</strong></div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div class="bg-army-900 text-white px-5 py-3 flex flex-wrap items-center justify-between gap-2">
          <h4 class="text-xs sm:text-sm font-black uppercase text-gold-300">3. Kết Quả Học Tập & Điểm Tích Lũy Cá Nhân (Năm 1 &rarr; Năm 5)</h4>
          <div class="flex flex-wrap items-center gap-3 text-xs">
            <span>Tín chỉ tích lũy: <strong class="text-gold-300">${passedTC}/${totalTC} TC</strong></span>
            <span>|</span>
            <span>ĐTB Tích lũy Hệ 10: <strong class="text-gold-300 text-sm">${gpa10.toFixed(2)}</strong> (${rank})</span>
            <span>|</span>
            <span>Hệ 4: <strong class="text-emerald-300">${gpa4.toFixed(2)}/4.00</strong></span>
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-xs text-left border-collapse">
            <thead class="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <tr>
                <th class="py-2.5 px-3">Năm Học</th>
                <th class="py-2.5 px-3 text-center">DTB HK1 (10)</th>
                <th class="py-2.5 px-3 text-center">DTB HKII (10)</th>
                <th class="py-2.5 px-3 text-center bg-gold-100 text-army-950">Điểm TB 1 Năm Học</th>
                <th class="py-2.5 px-3 text-center">Xếp Loại Năm Đấy</th>
                <th class="py-2.5 px-3">Các Học Phần Bị Rớt (&lt; 4.0)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-200">
              ${yearRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btnBackFromCadetDetail')?.addEventListener('click', () => {
    closeCadetDetailPage();
  });

  document.getElementById('btnEditFromCadetDetail')?.addEventListener('click', () => {
    openStudentProfileModal(student.id);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function closeCadetDetailPage(silent = false) {
  const detailSection = document.getElementById('cadetDetailViewSection');
  if (detailSection) {
    detailSection.classList.add('hidden');
    detailSection.style.display = 'none';
  }
  AppState.viewingDetailStudentId = null;

  if (!silent) {
    const targetTab = AppState.previousTabBeforeDetail || AppState.activeTab || 'tab-sheet';
    const targetEl = document.getElementById(targetTab);
    if (targetEl) {
      targetEl.classList.remove('hidden');
      targetEl.classList.add('active');
      targetEl.style.display = 'block';
    }
  }
}

export function renderStudentInlineProfile() {
  const container = document.getElementById('studentInlineProfileContainer');
  if (!container) return;

  const student = getLoggedInStudent() || AppState.students.find(s => s.id === AppState.studentViewingId) || AppState.students[0];
  if (!student) {
    container.innerHTML = `<div class="p-8 text-center text-slate-400">Không tìm thấy hồ sơ quân nhân.</div>`;
    return;
  }

  const isEditing = !!AppState.studentProfileEditMode;
  const disAttr = isEditing ? '' : 'disabled';
  const inputBg = isEditing ? 'bg-white border-army-600 focus:ring-2 focus:ring-army-600' : 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed';

  const fMode = detectParentDobMode(student.father_birth_date);
  const mMode = detectParentDobMode(student.mother_birth_date);
  const achList = normalizeAchievements(student.achievements);

  container.innerHTML = `
    <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div class="bg-gradient-to-r from-army-900 via-army-800 to-army-900 text-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-gold-500">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-xl bg-gold-500/20 border-2 border-gold-400 flex items-center justify-center font-black text-gold-300 text-base">
            HS
          </div>
          <div>
            <div class="text-[11px] uppercase tracking-wider text-gold-300 font-bold">Hồ Sơ Lý Lịch Cá Nhân Quân Nhân</div>
            <h3 class="text-lg font-black text-white">${student.name} <span class="text-sm font-mono text-gold-300">(${student.code})</span></h3>
            <div class="text-xs text-slate-300 mt-0.5">Lớp ${student.class} • Cấp bậc: ${student.rank} • Chức vụ: ${student.position || student.role || 'Học viên'}</div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="px-3 py-1.5 rounded-lg text-xs font-bold ${isEditing ? 'bg-amber-500/20 text-amber-300 border border-amber-400' : 'bg-slate-800 text-slate-300 border border-slate-700'}">
            ${isEditing ? '🔓 Đang mở khóa chỉnh sửa' : '🔒 Chế độ xem (Đã khóa ô nhập)'}
          </span>
          <button type="button" id="btnToggleStudentDirectEdit" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md transition cursor-pointer ${
            isEditing
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-300'
              : 'bg-gold-500 hover:bg-gold-600 text-slate-950'
          }">
            ${isEditing ? '💾 [ Lưu ]' : '✏️ [ Chỉnh sửa ]'}
          </button>
        </div>
      </div>

      <div class="p-6 space-y-6 text-xs">
        <div class="space-y-3">
          <h4 class="text-sm font-extrabold text-army-900 uppercase border-b border-slate-200 pb-2">I. Thông Tin Quân Tịch & Liên Hệ Cá Nhân</h4>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label class="block font-bold text-slate-600 mb-1">Mã Học Viên (Cố định):</label>
              <input type="text" value="${student.code}" disabled class="w-full border border-slate-200 rounded-lg p-2.5 font-mono font-bold bg-slate-100 text-slate-500 cursor-not-allowed">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Họ và Tên:</label>
              <input type="text" id="inlineProfName" value="${student.name}" ${disAttr} class="w-full border rounded-lg p-2.5 font-bold ${inputBg}">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Cấp bậc:</label>
              <select id="inlineProfRank" ${disAttr} class="w-full border rounded-lg p-2.5 font-semibold ${inputBg}">
                ${['Thượng sĩ', 'Trung sĩ', 'Hạ sĩ', 'Binh nhất'].map(r => `<option value="${r}" ${student.rank === r ? 'selected' : ''}>${r}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Lớp biên chế:</label>
              <input type="text" value="${student.class}" disabled class="w-full border border-slate-200 rounded-lg p-2.5 font-bold bg-slate-100 text-army-800 cursor-not-allowed">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Chức vụ:</label>
              <input type="text" id="inlineProfPosition" value="${student.position || student.role || 'Học viên'}" ${disAttr} class="w-full border rounded-lg p-2.5 font-semibold ${inputBg}">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Ngày sinh:</label>
              <input type="date" id="inlineProfDob" value="${student.dob || '2003-01-01'}" ${disAttr} class="w-full border rounded-lg p-2.5 ${inputBg}">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Tháng/Năm Nhập ngũ:</label>
              <input type="text" id="inlineProfEnlistment" value="${student.enlistmentDate || '02/2022'}" placeholder="02/2022" ${disAttr} class="w-full border rounded-lg p-2.5 ${inputBg}">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Số điện thoại:</label>
              <input type="text" id="inlineProfPhone" value="${student.phone || ''}" placeholder="0987..." ${disAttr} class="w-full border rounded-lg p-2.5 font-mono ${inputBg}">
            </div>
            <div class="sm:col-span-2">
              <label class="block font-bold text-slate-600 mb-1">Quê quán (2 cấp: Huyện/Quận, Tỉnh/TP):</label>
              <input type="text" id="inlineProfHometown" value="${student.hometown || ''}" placeholder="VD: Quảng Xương, Thanh Hóa" autocomplete="off" ${disAttr} class="w-full border rounded-lg p-2.5 ${inputBg}">
            </div>
            <div class="sm:col-span-2">
              <label class="block font-bold text-slate-600 mb-1">Hộ khẩu thường trú (2 cấp):</label>
              <input type="text" id="inlineProfPermAddr" value="${student.permanentAddress || ''}" placeholder="VD: Quảng Xương, Thanh Hóa" autocomplete="off" ${disAttr} class="w-full border rounded-lg p-2.5 ${inputBg}">
            </div>
            <div class="sm:col-span-2">
              <label class="block font-bold text-slate-600 mb-1">Nơi ở hiện nay (2 cấp: Huyện/Quận, Tỉnh/TP):</label>
              <input type="text" id="inlineProfCurrAddr" value="${student.currentAddress || ''}" placeholder="VD: Quảng Xương, Thanh Hóa" autocomplete="off" ${disAttr} class="w-full border rounded-lg p-2.5 ${inputBg}">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1 flex items-center justify-between">
                <span>Trình độ ngoại ngữ thực tế:</span>
                ${evaluateLangLevelStatus(student.currentLangLevel || 'A2', AppState.requiredLangStandard).badgeHtml}
              </label>
              <select id="inlineProfLangLevel" ${AppState.role === 'student' ? 'disabled' : disAttr} class="w-full border rounded-lg p-2.5 font-bold ${AppState.role === 'student' ? 'bg-slate-100 border-slate-200 text-slate-700 cursor-not-allowed' : inputBg}">
                ${LANGUAGE_LEVEL_OPTIONS.map(opt => `<option value="${opt}" ${opt === (student.currentLangLevel || 'A2') ? 'selected' : ''}>${opt}</option>`).join('')}
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Chuẩn CNTT:</label>
              <select id="inlineProfItStandard" ${disAttr} class="w-full border rounded-lg p-2.5 font-semibold ${inputBg}">
                ${IT_STANDARD_OPTIONS.map(opt => `<option value="${opt}" ${opt === (student.itStandard || 'Đạt chuẩn CNTT cơ bản') ? 'selected' : ''}>${opt}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <h4 class="text-sm font-extrabold text-army-900 uppercase border-b border-slate-200 pb-2">II. Thông Tin Chính Trị (Đoàn - Đảng)</h4>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label class="block font-bold text-slate-600 mb-1">Diện Chính Trị:</label>
              <select id="inlineProfPolitical" ${disAttr} class="w-full border rounded-lg p-2.5 font-bold ${inputBg}">
                <option value="DOAN_VIEN" ${student.politicalStatus === 'DOAN_VIEN' ? 'selected' : ''}>● Đoàn viên TNCS Hồ Chí Minh</option>
                <option value="CAM_TINH_DANG" ${student.politicalStatus === 'CAM_TINH_DANG' ? 'selected' : ''}>✦ Cảm tình Đảng</option>
                <option value="DANG_VIEN_DU_BI" ${student.politicalStatus === 'DANG_VIEN_DU_BI' ? 'selected' : ''}>✪ Đảng viên dự bị</option>
                <option value="DANG_VIEN_CHINH_THUC" ${student.politicalStatus === 'DANG_VIEN_CHINH_THUC' ? 'selected' : ''}>★ Đảng viên chính thức</option>
              </select>
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Ngày vào Đảng (Dự bị):</label>
              <input type="date" id="inlineProfPartyJoined" value="${student.party_joined_date || ''}" ${disAttr} class="w-full border rounded-lg p-2.5 ${inputBg}">
            </div>
            <div>
              <label class="block font-bold text-slate-600 mb-1">Ngày vào Đảng chính thức:</label>
              <input type="date" id="inlineProfPartyOfficial" value="${student.official_party_date || ''}" ${disAttr} class="w-full border rounded-lg p-2.5 ${inputBg}">
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <h4 class="text-sm font-extrabold text-army-900 uppercase border-b border-slate-200 pb-2">III. Thông Tin Thân Nhân (Bố & Mẹ) — Hỗ Trợ 2 Định Dạng Ngày Sinh</h4>
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div class="font-extrabold text-army-800 uppercase text-xs">1. Thông Tin Thân Nhân Bố</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-slate-600 mb-1">Họ và tên Bố:</label>
                  <input type="text" id="inlineFatherName" value="${student.father_name || ''}" ${disAttr} class="w-full border rounded-lg p-2 ${inputBg}">
                </div>
                <div>
                  <label class="block font-semibold text-slate-600 mb-1">Hình thức nhập ngày sinh Bố:</label>
                  <select id="inlineFatherDobMode" ${disAttr} class="w-full border rounded-lg p-2 font-semibold ${inputBg}">
                    <option value="year" ${fMode === 'year' ? 'selected' : ''}>1. Chỉ nhập Năm sinh (VD: 1975)</option>
                    <option value="full" ${fMode === 'full' ? 'selected' : ''}>2. Nhập đầy đủ Ngày/Tháng/Năm (DD/MM/YYYY)</option>
                  </select>
                </div>
                <div>
                  <label class="block font-semibold text-slate-600 mb-1">Năm sinh / Ngày sinh Bố:</label>
                  <input type="text" id="inlineFatherDob" value="${formatVN(student.father_birth_date) === '-' ? '' : formatVN(student.father_birth_date)}"
                    placeholder="${fMode === 'year' ? 'VD: 1975' : 'VD: 15/05/1975'}" ${disAttr} class="w-full border rounded-lg p-2 font-mono font-bold ${inputBg}">
                </div>
                <div>
                  <label class="block font-semibold text-slate-600 mb-1">Nghề nghiệp Bố:</label>
                  <input type="text" id="inlineFatherJob" value="${student.father_job || ''}" ${disAttr} class="w-full border rounded-lg p-2 ${inputBg}">
                </div>
                <div class="sm:col-span-2">
                  <label class="block font-semibold text-slate-600 mb-1">Quê quán Bố (2 cấp):</label>
                  <input type="text" id="inlineFatherHometown" value="${student.father_hometown || ''}" placeholder="VD: Quảng Xương, Thanh Hóa" autocomplete="off" ${disAttr} class="w-full border rounded-lg p-2 ${inputBg}">
                </div>
              </div>
            </div>

            <div class="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div class="font-extrabold text-army-800 uppercase text-xs">2. Thông Tin Thân Nhân Mẹ</div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block font-semibold text-slate-600 mb-1">Họ và tên Mẹ:</label>
                  <input type="text" id="inlineMotherName" value="${student.mother_name || ''}" ${disAttr} class="w-full border rounded-lg p-2 ${inputBg}">
                </div>
                <div>
                  <label class="block font-semibold text-slate-600 mb-1">Hình thức nhập ngày sinh Mẹ:</label>
                  <select id="inlineMotherDobMode" ${disAttr} class="w-full border rounded-lg p-2 font-semibold ${inputBg}">
                    <option value="year" ${mMode === 'year' ? 'selected' : ''}>1. Chỉ nhập Năm sinh (VD: 1975)</option>
                    <option value="full" ${mMode === 'full' ? 'selected' : ''}>2. Nhập đầy đủ Ngày/Tháng/Năm (DD/MM/YYYY)</option>
                  </select>
                </div>
                <div>
                  <label class="block font-semibold text-slate-600 mb-1">Năm sinh / Ngày sinh Mẹ:</label>
                  <input type="text" id="inlineMotherDob" value="${formatVN(student.mother_birth_date) === '-' ? '' : formatVN(student.mother_birth_date)}"
                    placeholder="${mMode === 'year' ? 'VD: 1978' : 'VD: 20/10/1978'}" ${disAttr} class="w-full border rounded-lg p-2 font-mono font-bold ${inputBg}">
                </div>
                <div>
                  <label class="block font-semibold text-slate-600 mb-1">Nghề nghiệp Mẹ:</label>
                  <input type="text" id="inlineMotherJob" value="${student.mother_job || ''}" ${disAttr} class="w-full border rounded-lg p-2 ${inputBg}">
                </div>
                <div class="sm:col-span-2">
                  <label class="block font-semibold text-slate-600 mb-1">Quê quán Mẹ (2 cấp):</label>
                  <input type="text" id="inlineMotherHometown" value="${student.mother_hometown || ''}" placeholder="VD: Quảng Xương, Thanh Hóa" autocomplete="off" ${disAttr} class="w-full border rounded-lg p-2 ${inputBg}">
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="space-y-3">
          <div class="flex items-center justify-between border-b border-slate-200 pb-2">
            <h4 class="text-sm font-extrabold text-army-900 uppercase">IV. Thành Tích / Danh Hiệu Đạt Được (Không bắt buộc - Lưu dạng mảng)</h4>
            <span class="text-[11px] text-slate-500">Có thể để trống nếu không có, hoặc nhập nhiều danh hiệu cách nhau bằng dấu phẩy (,)</span>
          </div>
          <div>
            <input type="text" id="inlineProfAchievements" value="${achList.join(', ')}"
              placeholder="Để trống nếu chưa có, hoặc nhập nhiều danh hiệu cách nhau bởi dấu phẩy (VD: Chiến sĩ Thi đua, Học viên Giỏi)"
              ${disAttr} class="w-full border rounded-lg p-3 font-semibold ${inputBg}">
            <div class="flex flex-wrap gap-1.5 mt-2">
              ${achList.length > 0
                ? achList.map(item => `<span class="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold text-xs">🏅 ${item}</span>`).join('')
                : '<span class="text-xs text-slate-400 italic">Hiện chưa kê khai danh hiệu nào (Tùy chọn không bắt buộc).</span>'
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('inlineFatherDobMode')?.addEventListener('change', function() {
    const inp = document.getElementById('inlineFatherDob');
    if (inp) inp.placeholder = this.value === 'year' ? 'VD: 1975' : 'VD: 15/05/1975';
  });
  document.getElementById('inlineMotherDobMode')?.addEventListener('change', function() {
    const inp = document.getElementById('inlineMotherDob');
    if (inp) inp.placeholder = this.value === 'year' ? 'VD: 1978' : 'VD: 20/10/1978';
  });

  document.getElementById('btnToggleStudentDirectEdit')?.addEventListener('click', () => {
    if (!AppState.studentProfileEditMode) {
      AppState.studentProfileEditMode = true;
      renderStudentInlineProfile();
      return;
    }

    const fDobRaw = document.getElementById('inlineFatherDob')?.value || '';
    const mDobRaw = document.getElementById('inlineMotherDob')?.value || '';

    const fCheck = validateAndFormatParentDob(fDobRaw, 'Bố');
    if (!fCheck.valid) {
      showToast(fCheck.error, 'error');
      return;
    }

    const mCheck = validateAndFormatParentDob(mDobRaw, 'Mẹ');
    if (!mCheck.valid) {
      showToast(mCheck.error, 'error');
      return;
    }

    const newName = (document.getElementById('inlineProfName')?.value || '').trim();
    if (!newName) {
      showToast('Họ và tên học viên không được để trống!', 'error');
      return;
    }

    student.name = newName;
    student.rank = document.getElementById('inlineProfRank')?.value || student.rank;
    student.position = (document.getElementById('inlineProfPosition')?.value || 'Học viên').trim();
    student.role = student.position;
    student.dob = document.getElementById('inlineProfDob')?.value || student.dob;
    student.enlistmentDate = (document.getElementById('inlineProfEnlistment')?.value || '').trim();
    student.phone = (document.getElementById('inlineProfPhone')?.value || '').trim();
    student.hometown = (document.getElementById('inlineProfHometown')?.value || '').trim();
    student.permanentAddress = (document.getElementById('inlineProfPermAddr')?.value || '').trim();
    student.currentAddress = (document.getElementById('inlineProfCurrAddr')?.value || '').trim();
    student.currentLangLevel = document.getElementById('inlineProfLangLevel')?.value || 'A2';
    student.itStandard = document.getElementById('inlineProfItStandard')?.value || 'Đạt chuẩn CNTT cơ bản';

    student.politicalStatus = document.getElementById('inlineProfPolitical')?.value || 'DOAN_VIEN';
    student.party_joined_date = document.getElementById('inlineProfPartyJoined')?.value || null;
    student.official_party_date = document.getElementById('inlineProfPartyOfficial')?.value || null;

    student.father_name = (document.getElementById('inlineFatherName')?.value || '').trim();
    student.father_birth_date = fCheck.value;
    student.father_job = (document.getElementById('inlineFatherJob')?.value || '').trim();
    student.father_hometown = (document.getElementById('inlineFatherHometown')?.value || '').trim();

    student.mother_name = (document.getElementById('inlineMotherName')?.value || '').trim();
    student.mother_birth_date = mCheck.value;
    student.mother_job = (document.getElementById('inlineMotherJob')?.value || '').trim();
    student.mother_hometown = (document.getElementById('inlineMotherHometown')?.value || '').trim();

    const achRaw = document.getElementById('inlineProfAchievements')?.value || '';
    student.achievements = normalizeAchievements(achRaw);

    if (!AppState.languages[student.id]) {
      AppState.languages[student.id] = { lang: 'Tiếng Nga', A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT' };
    }
    AppState.languages[student.id].currentLevel = student.currentLangLevel;
    AppState.languages[student.id].itStandard = student.itStandard;

    upsertStudentToSupabase(student, AppState.languages[student.id]);
    logAuditTrail(student.id, '', '', '', `Học viên ${student.name} (${student.code}) cập nhật trực tiếp Hồ sơ Quân nhân.`);
    AppState.studentProfileEditMode = false;
    persistData();
    renderStudentView();
    renderStudentInlineProfile();
  });
}

export function canDeleteStudent(student) {
  if (!student) return false;
  if (AppState.role === 'admin' || AppState.role === 'company_officer') return true;
  if (AppState.role.startsWith('class_leader_')) {
    const leaderClass = AppState.role.replace('class_leader_', '');
    return student.class === leaderClass;
  }
  return false;
}

export function openConfirmDeleteModal(studentId) {
  const student = AppState.students.find(s => s.id === studentId);
  if (!student) {
    showToast('Không tìm thấy dữ liệu quân nhân để xóa!', 'error');
    return;
  }
  if (!canDeleteStudent(student)) {
    showToast('Bạn không có quyền xóa quân nhân này!', 'error');
    return;
  }

  document.getElementById('deleteCadetTargetId').value = student.id;
  document.getElementById('deleteCadetName').textContent = student.name;
  document.getElementById('deleteCadetCode').textContent = student.code;
  document.getElementById('deleteCadetClass').textContent = 'Lớp ' + student.class;
  document.getElementById('deleteCadetRank').textContent = student.rank;
  document.getElementById('deleteCadetPos').textContent = student.position || student.role || 'Học viên';

  showModal('modalConfirmDeleteCadet');
}

export function executeCascadeDeleteCadet(studentId) {
  const student = AppState.students.find(s => s.id === studentId);
  if (!student || !canDeleteStudent(student)) {
    showToast('Bạn không có quyền xóa quân nhân này!', 'error');
    return;
  }

  const sName = student.name;
  const sCode = student.code;
  const sClass = student.class;

  if (AppState.grades && AppState.grades[studentId]) delete AppState.grades[studentId];
  if (AppState.languages && AppState.languages[studentId]) delete AppState.languages[studentId];
  AppState.students = AppState.students.filter(s => s.id !== studentId);

  // Thực thi lệnh DELETE vĩnh viễn trực tiếp trên Supabase (bảng students, grades, languages)
  deleteStudentFromSupabase(studentId);

  logAuditTrail(studentId, '', '', '', `[SUPABASE DELETE] Xóa vĩnh viễn quân nhân ${sName} (${sCode} - Lớp ${sClass})`);
  hideModal('modalConfirmDeleteCadet');

  persistData(true);
  populateStudentPicker();
  updateAllViews();
}

/**
 * Xóa vĩnh viễn toàn bộ học viên & điểm số trực tiếp trên Supabase
 * để đưa hệ thống về bản trống 100% (0 bản ghi) trên mọi thiết bị.
 */
export function executeClearAllStudents() {
  if (AppState.role !== 'admin' && AppState.role !== 'company_officer') {
    showToast('Chỉ Admin hoặc Cán bộ Đại đội mới có quyền xóa toàn bộ danh sách học viên!', 'error');
    return;
  }

  AppState.students = [];
  AppState.grades = {};
  AppState.languages = {};

  deleteAllStudentsFromSupabase();

  logAuditTrail('', '', 'Xóa toàn bộ', '0 học viên', 'Làm trống vĩnh viễn toàn bộ danh sách học viên & điểm số trên Supabase');
  persistData(true);
  populateStudentPicker();
  updateAllViews();
}

export const QUICK_IMPORT_COLUMNS = [
  { key: 'code',               header: 'Mã học viên (student_id)',                  wch: 18 },
  { key: 'name',               header: 'Họ và tên (full_name)',                     wch: 24 },
  { key: 'class',              header: 'Lớp (class_name)',                          wch: 12 },
  { key: 'rank',               header: 'Cấp bậc (rank)',                            wch: 14 },
  { key: 'position',           header: 'Chức vụ (position)',                        wch: 18 },
  { key: 'dob',                header: 'Ngày sinh (birth_date)',                    wch: 15 },
  { key: 'enlistmentDate',     header: 'Nhập ngũ (enlistment_date)',                wch: 14 },
  { key: 'phone',              header: 'Số điện thoại (phone)',                     wch: 16 },
  { key: 'hometown',           header: 'Quê quán (hometown)',                       wch: 26 },
  { key: 'permanentAddress',   header: 'Hộ khẩu thường trú (permanent_address)',    wch: 28 },
  { key: 'currentAddress',     header: 'Nơi ở hiện nay (current_address)',          wch: 28 },
  { key: 'politicalStatus',    header: 'Diện chính trị (political_status)',         wch: 22 },
  { key: 'party_joined_date',  header: 'Ngày vào Đảng dự bị (party_joined_date)',   wch: 18 },
  { key: 'official_party_date',header: 'Ngày vào Đảng chính thức (official_party_date)', wch: 20 },
  { key: 'father_name',        header: 'Họ tên Bố (father_name)',                   wch: 22 },
  { key: 'father_birth_date',  header: 'Ngày/Năm sinh Bố (father_birth_date)',      wch: 18 },
  { key: 'father_hometown',    header: 'Quê quán Bố (father_hometown)',             wch: 24 },
  { key: 'father_job',         header: 'Nghề nghiệp Bố (father_job)',               wch: 20 },
  { key: 'mother_name',        header: 'Họ tên Mẹ (mother_name)',                   wch: 22 },
  { key: 'mother_birth_date',  header: 'Ngày/Năm sinh Mẹ (mother_birth_date)',      wch: 18 },
  { key: 'mother_hometown',    header: 'Quê quán Mẹ (mother_hometown)',             wch: 24 },
  { key: 'mother_job',         header: 'Nghề nghiệp Mẹ (mother_job)',               wch: 20 },
  { key: 'achievements',       header: 'Danh hiệu đạt được (achievements)',         wch: 28 }
];

export function normalizePoliticalStatus(rawVal) {
  if (!rawVal) return 'DOAN_VIEN';
  const s = String(rawVal).trim().toUpperCase();
  if (s.includes('CHÍNH THỨC') || s.includes('CHINH THUC') || s === 'DANG_VIEN_CHINH_THUC') return 'DANG_VIEN_CHINH_THUC';
  if (s.includes('DỰ BỊ') || s.includes('DU BI') || s === 'DANG_VIEN_DU_BI') return 'DANG_VIEN_DU_BI';
  if (s.includes('CẢM TÌNH') || s.includes('CAM TINH') || s === 'CAM_TINH_DANG') return 'CAM_TINH_DANG';
  return 'DOAN_VIEN';
}

export function downloadQuickImportTemplate() {
  const cls = getCurrentUserClassScope() || 'OTQS1';
  const headers = QUICK_IMPORT_COLUMNS.map(col => col.header);
  const sampleRows = [
    headers,
    [
      'HV2022-0138', 'Nguyễn Văn Minh', cls, 'Thượng sĩ', 'Học viên',
      '15/01/2003', '02/2022', '0987654321',
      'Quảng Xương, Thanh Hóa', 'Quảng Xương, Thanh Hóa', 'Bắc Từ Liêm, Hà Nội',
      'Đảng viên chính thức', '19/05/2023', '19/05/2024',
      'Nguyễn Văn Hòa', '1975', 'Quảng Xương, Thanh Hóa', 'Sĩ quan Quân đội',
      'Trần Thị Lan', '20/10/1978', 'Quảng Xương, Thanh Hóa', 'Giáo viên',
      'Chiến sĩ Thi đua cơ sở, Học viên Giỏi'
    ]
  ];
  const ws = XLSX.utils.aoa_to_sheet(sampleRows);
  ws['!cols'] = QUICK_IMPORT_COLUMNS.map(col => ({ wch: col.wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Mau_Ho_So_Day_Du');
  XLSX.writeFile(wb, 'Mau_Nhap_Nhanh_Ho_So_Quan_Nhan.xlsx');
}

export function parseExcelDate(val, fallback = '2003-01-01') {
  if (val === undefined || val === null || String(val).trim() === '') return fallback;
  const s = String(val).trim();
  if (/^\d{4}$/.test(s)) return s;

  if (typeof val === 'number' && val > 2500) {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const dmyMatch = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const d = String(dmyMatch[1]).padStart(2, '0');
    const m = String(dmyMatch[2]).padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }
  return s;
}

let quickImportParsedRows = [];

export function detectExcelColumnMapping(headerRow = []) {
  const norm = headerRow.map(h => String(h || '').trim().toLowerCase());
  const firstColIsStt = norm[0] === 'stt' || norm[0] === 'tt' || norm[0].startsWith('số tt');
  const offset = firstColIsStt ? 1 : 0;

  const findCol = (predicate, fallbackIdx) => {
    const idx = norm.findIndex((h, i) => h && predicate(h, i));
    if (idx !== -1) return idx;
    return fallbackIdx !== null && fallbackIdx !== undefined ? fallbackIdx + offset : -1;
  };

  return {
    firstColIsStt,
    code: findCol(h => h.includes('mã hv') || h.includes('mã học viên') || h.includes('mã qn') || h.includes('student_id') || h === 'mã' || h.includes('mã số'), firstColIsStt ? -1 : 0),
    name: findCol(h => (h.includes('họ và tên') || h.includes('họ tên') || h.includes('full_name') || h === 'tên') && !h.includes('bố') && !h.includes('mẹ') && !h.includes('cha'), 1),
    class: findCol(h => h === 'lớp' || h.includes('class_name') || h.startsWith('lớp ') || h.includes('(class'), 2),
    rank: findCol(h => h.includes('cấp bậc') || h.includes('quân hàm') || h.includes('(rank)'), 3),
    position: findCol(h => h.includes('chức vụ') || h.includes('position'), 4),
    dob: findCol(h => (h.includes('ngày sinh') || h.includes('birth_date') || h.includes('năm sinh')) && !h.includes('bố') && !h.includes('mẹ') && !h.includes('cha'), 5),
    enlistmentDate: findCol(h => h.includes('nhập ngũ') || h.includes('enlistment'), 6),
    phone: findCol(h => h.includes('điện thoại') || h.includes('sđt') || h.includes('phone'), 7),
    hometown: findCol(h => (h.includes('quê quán') || h.includes('nguyên quán') || h.includes('hometown')) && !h.includes('bố') && !h.includes('mẹ') && !h.includes('cha'), 8),
    permanentAddress: findCol(h => h.includes('thường trú') || h.includes('hktt') || h.includes('permanent_address'), 9),
    currentAddress: findCol(h => h.includes('nơi ở') || h.includes('chỗ ở') || h.includes('current_address'), 10),
    politicalStatus: findCol(h => h.includes('chính trị') || h.includes('political_status') || (h.includes('đảng') && !h.includes('ngày')), 11),
    party_joined_date: findCol(h => h.includes('vào đảng') || h.includes('dự bị') || h.includes('party_joined'), 12),
    official_party_date: findCol(h => h.includes('chính thức') || h.includes('official_party'), 13),
    father_name: findCol(h => (h.includes('họ tên bố') || h.includes('tên bố') || h.includes('father_name') || h.includes('họ tên cha')), 14),
    father_birth_date: findCol(h => (h.includes('sinh bố') || h.includes('father_birth') || h.includes('sinh cha')), 15),
    father_hometown: findCol(h => (h.includes('quê quán bố') || h.includes('father_hometown') || h.includes('quê bố')), 16),
    father_job: findCol(h => (h.includes('nghề nghiệp bố') || h.includes('father_job') || h.includes('nghề bố')), 17),
    mother_name: findCol(h => (h.includes('họ tên mẹ') || h.includes('tên mẹ') || h.includes('mother_name')), 18),
    mother_birth_date: findCol(h => (h.includes('sinh mẹ') || h.includes('mother_birth')), 19),
    mother_hometown: findCol(h => (h.includes('quê quán mẹ') || h.includes('mother_hometown') || h.includes('quê mẹ')), 20),
    mother_job: findCol(h => (h.includes('nghề nghiệp mẹ') || h.includes('mother_job') || h.includes('nghề mẹ')), 21),
    achievements: findCol(h => h.includes('thành tích') || h.includes('danh hiệu') || h.includes('khen thưởng') || h.includes('achievements'), 22)
  };
}

export function handleQuickImportFileUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

      if (!jsonRows || jsonRows.length < 2) {
        showToast('File Excel không có dữ liệu!', 'error');
        return;
      }

      const classScope = getCurrentUserClassScope();

      // Tìm đúng dòng tiêu đề cột (bỏ qua các dòng tiêu đề Quốc hiệu / Tên đơn vị chỉ có 1-2 ô)
      let headerIdx = 0;
      for (let i = 0; i < Math.min(jsonRows.length, 15); i++) {
        const rowArr = Array.isArray(jsonRows[i]) ? jsonRows[i] : [];
        const nonEmptyCells = rowArr.filter(c => String(c || '').trim() !== '');
        if (nonEmptyCells.length < 2) continue;
        const rowStr = nonEmptyCells.map(c => String(c).toLowerCase()).join(' | ');
        if (
          rowStr.includes('mã hv') ||
          rowStr.includes('mã học viên') ||
          rowStr.includes('student_id') ||
          rowStr.includes('họ và tên') ||
          rowStr.includes('họ tên') ||
          rowStr.includes('full_name') ||
          (rowStr.includes('stt') && (rowStr.includes('tên') || rowStr.includes('lớp') || rowStr.includes('cấp bậc')))
        ) {
          headerIdx = i;
          break;
        }
      }

      const colMap = detectExcelColumnMapping(jsonRows[headerIdx] || []);
      const getVal = (row, colIndex) => {
        if (colIndex === undefined || colIndex === null || colIndex < 0) return '';
        return row[colIndex] !== undefined && row[colIndex] !== null ? row[colIndex] : '';
      };

      quickImportParsedRows = [];
      let newCount = 0;
      let updateCount = 0;
      const seenCodesInFile = new Set();

      jsonRows.slice(headerIdx + 1).forEach((r, rowIdx) => {
        if (!Array.isArray(r)) return;
        const nonEmpty = r.filter(cell => String(cell ?? '').trim() !== '');
        if (nonEmpty.length === 0) return;

        let rawCode = String(getVal(r, colMap.code)).trim().toUpperCase();
        let rawName = String(getVal(r, colMap.name)).trim();

        // Bỏ qua dòng lặp lại tiêu đề hoặc dòng tổng cộng
        if (rawCode === 'STT' || rawCode === 'MÃ HV' || rawCode.includes('MÃ HỌC VIÊN') || rawName.toLowerCase().includes('họ và tên')) {
          return;
        }
        if (!rawCode && !rawName) return;

        // Nếu cột Mã HV bị bỏ trống hoặc người dùng để số thứ tự (1, 2, 3...) nhưng có Họ và tên:
        if ((!rawCode || /^\d{1,3}$/.test(rawCode)) && rawName) {
          const matchedByName = AppState.students.find(s => s.name.toLowerCase() === rawName.toLowerCase());
          if (matchedByName) {
            rawCode = matchedByName.code.toUpperCase();
          } else {
            const seqNum = /^\d{1,3}$/.test(rawCode) ? rawCode.padStart(3, '0') : String(rowIdx + 1).padStart(3, '0');
            const defaultCls = (classScope || String(getVal(r, colMap.class) || AppState.currentSheetClass || 'OTQS1').trim().toUpperCase());
            rawCode = `HV${defaultCls}-${seqNum}`;
          }
        }

        if (!rawCode) return;
        const code = rawCode;
        const name = rawName || ('Quân nhân ' + code);

        let cls = String(getVal(r, colMap.class) || '').trim().toUpperCase().replace(/^LỚP\s+/i, '');
        if (classScope) cls = classScope;
        else if (!DEFAULT_CLASSES.includes(cls)) cls = AppState.currentSheetClass || 'OTQS1';

        const existing = AppState.students.find(s => s.code.toUpperCase() === code);
        const isUpdate = !!existing || seenCodesInFile.has(code);
        seenCodesInFile.add(code);
        if (isUpdate) updateCount++; else newCount++;

        const rawPartyJoined = getVal(r, colMap.party_joined_date);
        const rawOfficialParty = getVal(r, colMap.official_party_date);
        const rawAchievements = getVal(r, colMap.achievements);

        quickImportParsedRows.push({
          code,
          name,
          class: cls,
          rank: String(getVal(r, colMap.rank) || existing?.rank || 'Thượng sĩ').trim(),
          position: String(getVal(r, colMap.position) || existing?.position || 'Học viên').trim(),
          dob: parseExcelDate(getVal(r, colMap.dob), existing?.dob || '2003-01-01'),
          enlistmentDate: String(getVal(r, colMap.enlistmentDate) || existing?.enlistmentDate || '02/2022').trim(),
          phone: String(getVal(r, colMap.phone) || existing?.phone || '').trim(),
          hometown: String(getVal(r, colMap.hometown) || existing?.hometown || '').trim(),
          permanentAddress: String(getVal(r, colMap.permanentAddress) || existing?.permanentAddress || '').trim(),
          currentAddress: String(getVal(r, colMap.currentAddress) || existing?.currentAddress || '').trim(),
          politicalStatus: normalizePoliticalStatus(getVal(r, colMap.politicalStatus) || existing?.politicalStatus),
          party_joined_date: rawPartyJoined ? parseExcelDate(rawPartyJoined, '') : (existing?.party_joined_date || null),
          official_party_date: rawOfficialParty ? parseExcelDate(rawOfficialParty, '') : (existing?.official_party_date || null),
          father_name: String(getVal(r, colMap.father_name) || existing?.father_name || '').trim(),
          father_birth_date: String(getVal(r, colMap.father_birth_date) || existing?.father_birth_date || '').trim(),
          father_hometown: String(getVal(r, colMap.father_hometown) || existing?.father_hometown || '').trim(),
          father_job: String(getVal(r, colMap.father_job) || existing?.father_job || '').trim(),
          mother_name: String(getVal(r, colMap.mother_name) || existing?.mother_name || '').trim(),
          mother_birth_date: String(getVal(r, colMap.mother_birth_date) || existing?.mother_birth_date || '').trim(),
          mother_hometown: String(getVal(r, colMap.mother_hometown) || existing?.mother_hometown || '').trim(),
          mother_job: String(getVal(r, colMap.mother_job) || existing?.mother_job || '').trim(),
          achievements: normalizeAchievements(rawAchievements !== '' ? rawAchievements : existing?.achievements),
          isUpdate
        });
      });

      if (quickImportParsedRows.length === 0) {
        showToast('Không tìm thấy dòng dữ liệu học viên hợp lệ trong file Excel!', 'error');
        return;
      }

      const tbody = document.getElementById('quickImportPreviewTbody');
      if (tbody) {
        tbody.innerHTML = quickImportParsedRows.map((r, i) => `
          <tr>
            <td class="py-2 px-2 text-center">${i + 1}</td>
            <td class="py-2 px-3 font-mono font-bold">${r.code}</td>
            <td class="py-2 px-3 font-bold">${r.name}</td>
            <td class="py-2 px-2 text-center font-bold">${r.class}</td>
            <td class="py-2 px-2 text-center">${r.rank}</td>
            <td class="py-2 px-2 text-center">${r.position}</td>
            <td class="py-2 px-2 text-center">${formatVN(r.dob)}</td>
            <td class="py-2 px-2 text-center">${r.enlistmentDate}</td>
            <td class="py-2 px-2 text-center">${r.phone || '-'}</td>
            <td class="py-2 px-3">${r.hometown || '-'}</td>
            <td class="py-2 px-2 text-center">${POLITICAL_BADGES[r.politicalStatus] || r.politicalStatus}</td>
            <td class="py-2 px-3">${r.father_name || '-'} (${formatVN(r.father_birth_date)})</td>
            <td class="py-2 px-3">${r.mother_name || '-'} (${formatVN(r.mother_birth_date)})</td>
            <td class="py-2 px-3 text-center">${r.isUpdate ? 'Cập nhật' : 'Thêm mới'}</td>
          </tr>
        `).join('');
      }

      document.getElementById('quickImportBadgeTotal').textContent = `${quickImportParsedRows.length} dòng`;
      document.getElementById('quickImportBadgeNew').textContent = `${newCount} thêm mới`;
      document.getElementById('quickImportBadgeUpdate').textContent = `${updateCount} cập nhật`;
      document.getElementById('quickImportPreviewHeader')?.classList.remove('hidden');
      document.getElementById('quickImportPreviewContainer')?.classList.remove('hidden');
      const btnExec = document.getElementById('btnExecuteQuickImport');
      if (btnExec) {
        btnExec.disabled = false;
        btnExec.textContent = 'Xác nhận Nhập Dữ liệu';
      }
    } catch (err) {
      showToast('Lỗi khi đọc file Excel: ' + err.message, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

export async function executeQuickImport() {
  if (AppState.role === 'student') {
    showToast('Học viên không có quyền nhập danh sách quân số từ Excel!', 'error');
    return;
  }
  if (!quickImportParsedRows || quickImportParsedRows.length === 0) return;
  const classScope = getCurrentUserClassScope();
  const btnExec = document.getElementById('btnExecuteQuickImport');
  const originalBtnText = btnExec ? btnExec.textContent : 'Xác nhận Nhập Dữ liệu';

  if (btnExec) {
    btnExec.disabled = true;
    btnExec.textContent = '⏳ Đang đồng bộ lên Supabase...';
  }

  try {
    const importedCount = quickImportParsedRows.length;

    quickImportParsedRows.forEach(item => {
      if (classScope) item.class = classScope;
      const cleanCode = String(item.code || '').trim().toUpperCase();
      const existing = AppState.students.find(x => x.code.toUpperCase() === cleanCode);
      const { isUpdate, ...cleanItem } = item;

      if (existing) {
        Object.assign(existing, cleanItem, {
          code: cleanCode,
          role: cleanItem.position || existing.role || 'Học viên'
        });
        if (!AppState.languages[existing.id]) {
          AppState.languages[existing.id] = {
            lang: 'Tiếng Nga',
            currentLevel: existing.currentLangLevel || 'A2',
            itStandard: existing.itStandard || 'Đạt chuẩn CNTT cơ bản',
            A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT'
          };
        }
      } else {
        const newId = buildDeterministicStudentId(cleanCode);
        AppState.students.push({
          id: newId,
          ...cleanItem,
          code: cleanCode,
          role: cleanItem.position || 'Học viên',
          currentLangLevel: 'A2',
          itStandard: 'Đạt chuẩn CNTT cơ bản'
        });
        if (!AppState.grades[newId]) AppState.grades[newId] = {};
        if (!AppState.languages[newId]) {
          AppState.languages[newId] = {
            lang: 'Tiếng Nga',
            currentLevel: 'A2',
            itStandard: 'Đạt chuẩn CNTT cơ bản',
            A1: 'Đ', A21: 'Đ', A22: 'Đ', B11: 'CT', B12: 'CT'
          };
        }
      }
    });

    // Chờ lưu toàn bộ học viên & ngoại ngữ lên bảng students + languages của Supabase hoàn tất
    const bulkRes = await upsertStudentsBulkToSupabase(AppState.students, AppState.languages);
    logAuditTrail('', '', 'Excel Nhập Nhanh', `${importedCount} học viên`, 'Nhập nhanh danh sách hồ sơ học viên từ Excel lên Supabase');
    await persistData(true);

    populateStudentPicker();
    updateAllViews();
    hideModal('modalQuickImportExcel');
    quickImportParsedRows = [];

    if (bulkRes && bulkRes.error) {
      showToast(`Đã lưu ${importedCount} học viên lên Cloud (chế độ tương thích bảng).`, 'info');
    } else {
      showToast(`Đã nhập và lưu thành công ${importedCount} học viên lên cơ sở dữ liệu Supabase!`, 'success');
    }
  } catch (err) {
    console.error('Lỗi khi lưu dữ liệu Excel lên Supabase:', err);
    showToast('Có lỗi khi đồng bộ Excel lên Supabase: ' + (err.message || err), 'error');
  } finally {
    if (btnExec) {
      btnExec.disabled = false;
      btnExec.textContent = originalBtnText;
    }
  }
}

export function setProfileFormReadOnly(isReadOnly) {
  const inputs = document.querySelectorAll('#formStudentProfile input, #formStudentProfile select, #formStudentProfile textarea');
  inputs.forEach(el => {
    if (el.id === 'profFormId') return;
    el.disabled = isReadOnly;
  });
}

export function renderProfilesTable() {
  const isStudent = AppState.role === 'student';
  const statsGrid = document.getElementById('profileStatsCardsGrid');
  const adminToolbar = document.getElementById('adminProfilesToolbar');
  const adminTableCard = document.getElementById('adminProfilesTableCard');
  const studentInlineBox = document.getElementById('studentInlineProfileContainer');

  if (isStudent) {
    if (statsGrid) statsGrid.classList.add('hidden');
    if (adminToolbar) adminToolbar.classList.add('hidden');
    if (adminTableCard) adminTableCard.classList.add('hidden');
    if (studentInlineBox) {
      studentInlineBox.classList.remove('hidden');
      renderStudentInlineProfile();
    }
    return;
  }

  if (statsGrid) statsGrid.classList.remove('hidden');
  if (adminToolbar) adminToolbar.classList.remove('hidden');
  if (adminTableCard) adminTableCard.classList.remove('hidden');
  if (studentInlineBox) studentInlineBox.classList.add('hidden');

  const tbody = document.getElementById('profilesTableBody');
  const footer = document.getElementById('profilesTableFooter');
  if (!tbody) return;

  const classScope = getCurrentUserClassScope();
  const profClassSelect = document.getElementById('profileFilterClass');
  if (profClassSelect) {
    if (classScope) {
      profClassSelect.innerHTML = `<option value="${classScope}">Lớp ${classScope}</option>`;
      profClassSelect.value = classScope;
      profClassSelect.disabled = true;
    } else {
      profClassSelect.disabled = false;
    }
  }

  const filterClass = classScope || profClassSelect?.value || 'all';
  const filterPolitical = document.getElementById('profileFilterPolitical')?.value || 'all';
  const filterPos = document.getElementById('profileFilterPosition')?.value || 'all';
  const searchKeyword = (document.getElementById('profileSearchInput')?.value || '').toLowerCase().trim();

  const scopedStudents = getScopedStudents();

  let officialCount = 0;
  let probationaryCount = 0;
  let candidateCount = 0;
  let youthCount = 0;

  scopedStudents.forEach(s => {
    if (s.politicalStatus === 'DANG_VIEN_CHINH_THUC') officialCount++;
    else if (s.politicalStatus === 'DANG_VIEN_DU_BI') probationaryCount++;
    else if (s.politicalStatus === 'CAM_TINH_DANG') candidateCount++;
    else youthCount++;
  });

  const elTotal = document.getElementById('statProfTotal');
  if (elTotal) elTotal.textContent = scopedStudents.length;
  const elOff = document.getElementById('statProfOfficial');
  if (elOff) elOff.textContent = officialCount;
  const elProb = document.getElementById('statProfProbationary');
  if (elProb) elProb.textContent = probationaryCount;
  const elYouth = document.getElementById('statProfYouth');
  if (elYouth) elYouth.textContent = youthCount + candidateCount;
  const elCand = document.getElementById('statProfCandidateRate');
  if (elCand) elCand.textContent = `${candidateCount} Cảm tình Đảng`;

  let filtered = [...scopedStudents];
  if (filterClass !== 'all') {
    filtered = filtered.filter(s => s.class === filterClass);
  }
  if (filterPolitical !== 'all') {
    filtered = filtered.filter(s => s.politicalStatus === filterPolitical);
  }
  if (filterPos !== 'all') {
    filtered = filtered.filter(s => (s.position || s.role || 'Học viên') === filterPos);
  }
  if (searchKeyword) {
    filtered = filtered.filter(s =>
      s.name.toLowerCase().includes(searchKeyword) ||
      s.code.toLowerCase().includes(searchKeyword) ||
      (s.hometown && s.hometown.toLowerCase().includes(searchKeyword))
    );
  }

  filtered.sort((a, b) => a.class.localeCompare(b.class) || a.code.localeCompare(b.code));

  let rowsHtml = '';
  filtered.forEach((s, idx) => {
    const yearGpa = calculateYearGPA(s.id);
    const badge = POLITICAL_BADGES[s.politicalStatus] || s.politicalStatus;
    const pos = s.position || s.role || 'Học viên';
    const canDelete = canDeleteStudent(s);

    rowsHtml += `
      <tr class="hover:bg-slate-50 transition" data-student-id="${s.id}">
        <td class="py-2.5 px-2 text-center w-12 text-slate-500 font-medium">${idx + 1}</td>
        <td class="py-2.5 px-3 text-center font-mono font-bold">
          <button type="button" class="btn-view-cadet-detail text-army-800 hover:text-gold-600 hover:underline font-bold" data-id="${s.id}">
            ${s.code}
          </button>
        </td>
        <td class="py-2.5 px-4 text-left font-bold text-slate-900">
          <button type="button" class="btn-view-cadet-detail hover:text-army-800 hover:underline text-left font-bold" data-id="${s.id}" title="Nhấp vào Họ và Tên để xem trang chi tiết quân nhân">
            ${s.name}
          </button>
        </td>
        <td class="py-2.5 px-2 text-center text-slate-600">${s.rank}</td>
        <td class="py-2.5 px-2 text-center font-bold text-army-800">${s.class}</td>
        <td class="py-2.5 px-3 text-center">
          <span class="inline-block px-2.5 py-0.5 rounded font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
            ${pos}
          </span>
        </td>
        <td class="py-2.5 px-2 text-center text-slate-500 text-[11px]">${formatVN(s.dob)}</td>
        <td class="py-2.5 px-2 text-center text-slate-600 font-mono text-[11px]">${s.enlistmentDate || '02/2022'}</td>
        <td class="py-2.5 px-3 text-left text-slate-700">${s.hometown || '-'}</td>
        <td class="py-2.5 px-3 text-center">${badge}</td>
        <td class="py-2.5 px-3 text-center font-mono font-semibold text-rose-800">${formatVN(s.party_joined_date)}</td>
        <td class="py-2.5 px-3 text-center font-mono font-semibold text-rose-800">${formatVN(s.official_party_date)}</td>
        <td class="py-2.5 px-3 text-left text-[11px] text-slate-700">
          <span class="font-bold text-slate-900">${s.father_name || '-'}</span> (${formatVN(s.father_birth_date)}) &bull; <span class="text-slate-500">${s.father_job || ''}</span>
        </td>
        <td class="py-2.5 px-3 text-left text-[11px] text-slate-700">
          <span class="font-bold text-slate-900">${s.mother_name || '-'}</span> (${formatVN(s.mother_birth_date)}) &bull; <span class="text-slate-500">${s.mother_job || ''}</span>
        </td>
        <td class="py-2.5 px-2 text-center font-extrabold text-army-800 bg-gold-50/50">${yearGpa.toFixed(2)}</td>
        <td class="py-2.5 px-3 text-center">
          <div class="inline-flex items-center gap-1.5">
            <button type="button" class="btn-view-cadet-detail px-2.5 py-1 rounded bg-army-50 hover:bg-army-100 text-army-800 border border-army-200 font-bold text-[11px] transition" data-id="${s.id}">
              Chi tiết
            </button>
            <button type="button" class="btn-open-profile px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[11px] transition" data-id="${s.id}">
              Sửa
            </button>
            ${canDelete ? `
              <button type="button" class="btn-trigger-delete px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-semibold text-[11px] transition" data-id="${s.id}">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  });

  if (filtered.length === 0) {
    rowsHtml = `<tr><td colspan="16" class="p-8 text-center text-slate-400 font-medium">Không tìm thấy quân nhân nào phù hợp với bộ lọc.</td></tr>`;
  }
  tbody.innerHTML = rowsHtml;

  if (footer) {
    footer.innerHTML = `
      <span>Hiển thị <strong>${filtered.length}</strong> / ${scopedStudents.length} quân nhân</span>
      <span class="text-[11px] text-slate-500">Nhấp trực tiếp vào Họ và Tên để mở trang Xem chi tiết quân nhân</span>
    `;
  }

  // Event Delegation xử lý .btn-open-profile, .btn-trigger-delete & .btn-view-cadet-detail tại document
}

export function switchProfileSubtab(subtabId) {
  document.querySelectorAll('.profile-subtab').forEach(b => {
    if (b.dataset.subtab === subtabId) {
      b.classList.add('active', 'border-army-700', 'text-army-800');
      b.classList.remove('border-transparent', 'text-slate-500');
    } else {
      b.classList.remove('active', 'border-army-700', 'text-army-800');
      b.classList.add('border-transparent', 'text-slate-500');
    }
  });
  document.querySelectorAll('.profile-subtab-content').forEach(c => {
    if (c.id === subtabId) c.classList.remove('hidden');
    else c.classList.add('hidden');
  });
}

export function openStudentProfileModal(studentId) {
  const isCreate = !studentId;
  if (isCreate && AppState.role === 'student') {
    showToast('Học viên không có quyền tạo mới hồ sơ quân nhân!', 'error');
    return;
  }

  const student = isCreate ? null : AppState.students.find(s => s.id === studentId);
  const classScope = getCurrentUserClassScope();

  if (!isCreate && student) {
    if (AppState.role === 'student') {
      const self = getLoggedInStudent();
      if (!self || self.id !== student.id) {
        showToast('Bảo mật: Bạn chỉ được chỉnh sửa hồ sơ của chính mình!', 'error');
        return;
      }
    } else if (classScope && student.class !== classScope) {
      showToast(`Tài khoản Lớp ${classScope} không được sửa hồ sơ của lớp khác!`, 'error');
      return;
    }
  }

  document.getElementById('profFormId').value = student ? student.id : '';

  const fModeEl = document.getElementById('profFormFatherDobMode');
  const mModeEl = document.getElementById('profFormMotherDobMode');
  const fDobEl = document.getElementById('profFormFatherBirthDate');
  const mDobEl = document.getElementById('profFormMotherBirthDate');

  if (isCreate) {
    document.getElementById('profileModalTitle').textContent = 'Thêm Mới Hồ Sơ Quân Nhân';
    const defaultClass = classScope || (AppState.currentSheetClass !== 'all' ? AppState.currentSheetClass : 'OTQS1') || 'OTQS1';
    document.getElementById('profFormCode').value = '';
    document.getElementById('profFormCode').disabled = false;
    document.getElementById('profFormName').value = '';
    document.getElementById('profFormRank').value = 'Thượng sĩ';
    document.getElementById('profFormClass').value = defaultClass;
    document.getElementById('profFormPosition').value = 'Học viên';
    document.getElementById('profFormDob').value = '2003-01-01';
    document.getElementById('profFormEnlistment').value = '02/2022';
    document.getElementById('profFormPhone').value = '';
    document.getElementById('profFormHometown').value = '';
    document.getElementById('profFormPermAddress').value = '';
    document.getElementById('profFormCurrAddress').value = '';

    const achInput = document.getElementById('profFormAchievements');
    if (achInput) achInput.value = '';

    const politicalSelect = document.getElementById('profFormPoliticalStatus');
    if (politicalSelect) politicalSelect.value = 'DOAN_VIEN';
    document.getElementById('profFormPartyJoinedDate').value = '';
    document.getElementById('profFormOfficialPartyDate').value = '';
    updatePartyDatesDisplay('DOAN_VIEN');

    document.getElementById('profFormFatherName').value = '';
    if (fModeEl) fModeEl.value = 'year';
    if (fDobEl) { fDobEl.value = ''; fDobEl.placeholder = 'VD: 1975'; }
    document.getElementById('profFormFatherHometown').value = '';
    document.getElementById('profFormFatherJob').value = '';

    document.getElementById('profFormMotherName').value = '';
    if (mModeEl) mModeEl.value = 'year';
    if (mDobEl) { mDobEl.value = ''; mDobEl.placeholder = 'VD: 1978'; }
    document.getElementById('profFormMotherHometown').value = '';
    document.getElementById('profFormMotherJob').value = '';

    document.getElementById('profAcademicSummaryBox').innerHTML = '<div class="p-4 text-center text-slate-500 italic">Quân nhân mới thêm.</div>';
  } else {
    const pos = student.position || student.role || 'Học viên';
    document.getElementById('profileModalTitle').textContent = `Hồ Sơ Quân Nhân: ${student.name} (${student.code})`;
    document.getElementById('profFormCode').value = student.code;
    document.getElementById('profFormCode').disabled = (AppState.role === 'student');
    document.getElementById('profFormName').value = student.name;
    document.getElementById('profFormRank').value = student.rank;
    document.getElementById('profFormClass').value = student.class;
    document.getElementById('profFormPosition').value = pos;
    document.getElementById('profFormDob').value = student.dob;
    document.getElementById('profFormEnlistment').value = student.enlistmentDate || '02/2022';
    document.getElementById('profFormPhone').value = student.phone || '';
    document.getElementById('profFormHometown').value = student.hometown || '';
    document.getElementById('profFormPermAddress').value = student.permanentAddress || '';
    document.getElementById('profFormCurrAddress').value = student.currentAddress || '';

    const achInput = document.getElementById('profFormAchievements');
    if (achInput) achInput.value = normalizeAchievements(student.achievements).join(', ');

    const politicalSelect = document.getElementById('profFormPoliticalStatus');
    if (politicalSelect) politicalSelect.value = student.politicalStatus || 'DOAN_VIEN';
    document.getElementById('profFormPartyJoinedDate').value = student.party_joined_date || '';
    document.getElementById('profFormOfficialPartyDate').value = student.official_party_date || '';
    updatePartyDatesDisplay(student.politicalStatus || 'DOAN_VIEN');

    const fVal = formatVN(student.father_birth_date) === '-' ? '' : formatVN(student.father_birth_date);
    const fMode = detectParentDobMode(fVal);
    document.getElementById('profFormFatherName').value = student.father_name || '';
    if (fModeEl) fModeEl.value = fMode;
    if (fDobEl) {
      fDobEl.value = fVal;
      fDobEl.placeholder = fMode === 'year' ? 'VD: 1975' : 'VD: 15/05/1975';
    }
    document.getElementById('profFormFatherHometown').value = student.father_hometown || '';
    document.getElementById('profFormFatherJob').value = student.father_job || '';

    const mVal = formatVN(student.mother_birth_date) === '-' ? '' : formatVN(student.mother_birth_date);
    const mMode = detectParentDobMode(mVal);
    document.getElementById('profFormMotherName').value = student.mother_name || '';
    if (mModeEl) mModeEl.value = mMode;
    if (mDobEl) {
      mDobEl.value = mVal;
      mDobEl.placeholder = mMode === 'year' ? 'VD: 1978' : 'VD: 20/10/1978';
    }
    document.getElementById('profFormMotherHometown').value = student.mother_hometown || '';
    document.getElementById('profFormMotherJob').value = student.mother_job || '';

    const gpa1 = calculateSemesterGPA(student.id, 1);
    const gpa2 = calculateSemesterGPA(student.id, 2);
    const yearGpa = calculateYearGPA(student.id);
    const debts = getDebtSubjects(student.id);

    document.getElementById('profAcademicSummaryBox').innerHTML = `
      <div class="grid grid-cols-3 gap-3 text-center mb-3">
        <div class="bg-white p-2.5 rounded-lg border border-slate-200">
          <div class="text-[10px] text-slate-500 uppercase">DTB HK1 (10)</div>
          <div class="text-lg font-extrabold text-army-800">${gpa1.toFixed(2)}</div>
        </div>
        <div class="bg-white p-2.5 rounded-lg border border-slate-200">
          <div class="text-[10px] text-slate-500 uppercase">DTB HKII (10)</div>
          <div class="text-lg font-extrabold text-army-800">${gpa2.toFixed(2)}</div>
        </div>
        <div class="bg-white p-2.5 rounded-lg border border-slate-200">
          <div class="text-[10px] text-slate-500 uppercase">ĐTB Tích Lũy</div>
          <div class="text-lg font-black text-gold-600">${yearGpa.toFixed(2)}</div>
          <div class="text-[10px] font-bold text-emerald-700">${getClassification(yearGpa)}</div>
        </div>
      </div>
      <div class="text-xs space-y-1.5 text-slate-700">
        <div>Chức vụ hiện tại: <strong class="text-army-800">${pos}</strong></div>
        <div>Thành tích / Danh hiệu: <strong class="text-purple-800">${formatAchievementsText(student.achievements)}</strong></div>
        <div>Trình độ ngoại ngữ: <strong>${student.currentLangLevel || 'A2'}</strong> • Chuẩn CNTT: <strong>${student.itStandard || 'Đạt chuẩn CNTT cơ bản'}</strong></div>
        <div>Học phần rớt (&lt; 4.0): ${debts.length > 0 ? `<span class="text-rose-600 font-bold">⚠️ ${debts.map(d => formatFailedSubjectItem(d.subject)).join(', ')}</span>` : '<span class="text-emerald-600 font-bold">✅ Đạt 100% học phần</span>'}</div>
      </div>
    `;
  }

  switchProfileSubtab('subtab-personal');
  showModal('modalStudentProfile');
}

export function updatePartyDatesDisplay(status) {
  const partyJoinedInput = document.getElementById('profFormPartyJoinedDate');
  const officialPartyInput = document.getElementById('profFormOfficialPartyDate');
  if (!partyJoinedInput || !officialPartyInput) return;

  if (status === 'DOAN_VIEN' || status === 'CAM_TINH_DANG') {
    partyJoinedInput.disabled = true;
    partyJoinedInput.value = '';
    officialPartyInput.disabled = true;
    officialPartyInput.value = '';
  } else if (status === 'DANG_VIEN_DU_BI') {
    partyJoinedInput.disabled = false;
    officialPartyInput.disabled = true;
    officialPartyInput.value = '';
  } else if (status === 'DANG_VIEN_CHINH_THUC') {
    partyJoinedInput.disabled = false;
    officialPartyInput.disabled = false;
  }
}

export function exportStudentProfiles(className, filterStatus, position) {
  const classScope = getCurrentUserClassScope();
  const targetClass = classScope || className || document.getElementById('profileFilterClass')?.value || 'all';
  const targetPolitical = filterStatus || document.getElementById('profileFilterPolitical')?.value || 'all';
  const targetPos = position || document.getElementById('profileFilterPosition')?.value || 'all';

  let studentsToExport = getScopedStudents();
  if (targetClass !== 'all') {
    studentsToExport = studentsToExport.filter(s => s.class === targetClass);
  }
  if (targetPolitical !== 'all') {
    studentsToExport = studentsToExport.filter(s => s.politicalStatus === targetPolitical);
  }
  if (targetPos !== 'all') {
    studentsToExport = studentsToExport.filter(s => (s.position || s.role || 'Học viên') === targetPos);
  }

  const politicalLabels = {
    'DANG_VIEN_CHINH_THUC': 'Đảng viên chính thức',
    'DANG_VIEN_DU_BI': 'Đảng viên dự bị',
    'CAM_TINH_DANG': 'Cảm tình Đảng',
    'DOAN_VIEN': 'Đoàn viên'
  };

  const headers = [
    'STT', 'Mã HV', 'Họ và Tên', 'Cấp bậc', 'Lớp', 'Chức vụ',
    'Ngày sinh', 'Nhập ngũ', 'Quê quán', 'Diện Chính Trị',
    'Ngày vào Đảng (Dự bị)', 'Ngày chính thức',
    'Họ tên Bố', 'Ngày/Năm sinh Bố', 'Quê quán Bố', 'Nghề nghiệp Bố',
    'Họ tên Mẹ', 'Ngày/Năm sinh Mẹ', 'Quê quán Mẹ', 'Nghề nghiệp Mẹ',
    'Thành tích / Danh hiệu', 'ĐTB Tích Lũy'
  ];

  const rows = [
    ['BỘ QUỐC PHÒNG - HỌC VIỆN KỸ THUẬT QUÂN SỰ'],
    ['TIỂU ĐOÀN 4 - ĐẠI ĐỘI 460'],
    [targetClass !== 'all' ? `DANH SÁCH HỒ SƠ QUÂN NHÂN - LỚP ${targetClass}` : 'DANH SÁCH HỒ SƠ QUÂN NHÂN TOÀN ĐẠI ĐỘI 460'],
    [],
    headers
  ];

  studentsToExport.forEach((s, idx) => {
    const yearGpa = calculateYearGPA(s.id);
    rows.push([
      idx + 1,
      s.code,
      s.name,
      s.rank,
      s.class,
      s.position || s.role || 'Học viên',
      formatVN(s.dob),
      s.enlistmentDate || '02/2022',
      s.hometown || '',
      politicalLabels[s.politicalStatus] || s.politicalStatus,
      formatVN(s.party_joined_date),
      formatVN(s.official_party_date),
      s.father_name || '',
      formatVN(s.father_birth_date),
      s.father_hometown || '',
      s.father_job || '',
      s.mother_name || '',
      formatVN(s.mother_birth_date),
      s.mother_hometown || '',
      s.mother_job || '',
      formatAchievementsText(s.achievements),
      yearGpa.toFixed(2)
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = headers.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Ho_So_Quan_Nhan');
  XLSX.writeFile(wb, `Ho_So_Quan_Nhan_${targetClass !== 'all' ? targetClass : 'Dai_Doi_460'}.xlsx`);
}

export function resetQuickImportModalState() {
  quickImportParsedRows = [];
  document.getElementById('quickImportPreviewHeader')?.classList.add('hidden');
  document.getElementById('quickImportPreviewContainer')?.classList.add('hidden');
  document.getElementById('btnExecuteQuickImport')?.setAttribute('disabled', 'true');
  const fileInput = document.getElementById('quickImportFileInput');
  if (fileInput) fileInput.value = '';
}