/** Bento dashboard: presentation only. All academic rules and persistence stay in grades.js. */
import './expanding-rail.js';
import {
  AppState, registerExternalHooks, computeReportAcademicStats, calculateSemesterGPA,
  calculateCourseGPA10, calculateCumulativeGPA4, getSubjectsForClass, getFullSubjectName,
  getGradeLetterAndScale4, getCurrentUserClassScope, isAnyEditFormActive
} from '../grades.js';

const $ = id => document.getElementById(id);
const text = (id, value) => { if ($(id)) $(id).textContent = value; };
const number = value => Number(value).toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function node(tag, className, content) {
  const el = document.createElement(tag); el.className = className;
  if (content !== undefined) el.textContent = content;
  return el;
}
function scopedStudents() {
  if (AppState.role === 'guest') return [];
  if (AppState.role === 'student') return AppState.students.filter(s => s.id === AppState.currentUser?.studentId || s.code === AppState.currentUser?.code);
  const scope = getCurrentUserClassScope();
  const selected = scope || $('dashboardClassFilter')?.value || 'all';
  return AppState.students.filter(s => selected === 'all' || s.class === selected);
}
function allowedTab(tab) {
  return [...document.querySelectorAll('.nav-tab')].find(button => button.dataset.tab === tab && !button.classList.contains('hidden') && button.style.display !== 'none');
}
function go(tab) { allowedTab(tab)?.click(); }
const grid = document.querySelector('.bento-grid');
if (grid) {
  const left = node('div', 'bento-column');
  const right = node('aside', 'bento-column');
  right.setAttribute('aria-label', 'Học phần và hoạt động gần đây');
  left.append(grid.querySelector('.bento-overview'), grid.querySelector('.bento-analytics'));
  right.append(grid.querySelector('.bento-subjects'), grid.querySelector('.bento-activity'));
  grid.append(left, right);
}
const arrowSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
document.querySelectorAll('.bento-text-button,.bento-outline-button,.bento-round-icon').forEach(element => {
  element.textContent = element.textContent.replace('↗', '').trim();
  element.insertAdjacentHTML('beforeend', arrowSvg);
});
const metrics = document.querySelectorAll('.bento-metric-icon');
if (metrics[0]) metrics[0].innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3M18 4a3 3 0 0 1 0 6"/></svg>';
if (metrics[1]) metrics[1].innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h16M7 16v-4m5 4V8m5 8V4"/></svg>';
const root = document.querySelector('.u040');
if (root) {
  root.classList.add('bento-shell');
  root.classList.toggle('is-wide', innerWidth > 1000);
  const toggle = root.querySelector('.u040-tog');
  toggle?.setAttribute('aria-expanded', String(innerWidth > 1000));
  toggle?.setAttribute('aria-label', innerWidth > 1000 ? 'Thu gọn menu' : 'Mở rộng menu');
  const nav = root.querySelector('.u040-nav');
  const overview = nav?.querySelector('[data-tab="tab-dashboard"]');
  if (overview) nav.insertBefore(overview.parentElement, nav.querySelector('.u040-it')?.parentElement);
  root.querySelector('.u040-top')?.remove();
  const footer = node('details', 'bento-help');
  const help = node('summary', '', 'ⓘ Thông tin hệ thống');
  footer.append(help, node('p', '', 'Quản lý điểm & hồ sơ quân nhân. Dữ liệu được đồng bộ qua Supabase. Phiên bản 2.1.0.'));
  footer.append(node('p', '', `Mã bản: ${document.querySelector('meta[name="app-release"]')?.content || 'local'} • Xếp loại 7 mức, Xuất sắc từ 9,00.`));
  root.querySelector('nav')?.append(footer);
  const heading = root.querySelector('.u040-page-heading');
  const toolbar = node('div', 'bento-toolbar');
  toolbar.innerHTML = '<div class="bento-search-wrap"><label class="bento-search"><span aria-hidden="true">⌕</span><input id="bentoSearch" type="search" placeholder="Tìm quân nhân, mã HV, môn học…" autocomplete="off" aria-label="Tìm kiếm quân nhân, mã học viên, môn học" aria-controls="bentoSearchResults" aria-expanded="false"></label><div id="bentoSearchResults" class="bento-search-results" hidden></div></div><details class="bento-quick"><summary>＋ Thao tác nhanh</summary><div id="bentoQuickMenu"></div></details><button type="button" class="bento-icon-button" data-bento-tab="tab-audit" aria-label="Xem nhật ký hoạt động" title="Nhật ký hoạt động"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button>';
  heading?.append(toolbar);
  const auth = $('authStatusPill')?.parentElement;
  if (auth) { auth.classList.add('bento-account'); toolbar.append(auth); }
  const period = $('bentoPeriod');
  for (let year = 1; year <= 5; year++) period?.append(new Option(`Năm học ${year}`, `year:${year}`));
  for (let semester = 1; semester <= 10; semester++) period?.append(new Option(`Học kỳ ${semester}`, `semester:${semester}`));
  // Keep the report scope control in the report toolbar, outside optional Bento cards.
}

let chart;
let searchIdentity;
function timeframe() {
  const [mode, value] = ($('bentoPeriod')?.value || 'course').split(':');
  return { mode, semester: mode === 'semester' ? Number(value) : 1, year: mode === 'year' ? Number(value) : 1 };
}
function semesterData(students) {
  return Array.from({ length: 10 }, (_, i) => {
    const semester = i + 1;
    const graded = students.filter(student => getSubjectsForClass(student.class, semester).some(subject => {
      const score = AppState.grades[student.id]?.[subject.id];
      return score !== '' && score != null && Number.isFinite(Number(score));
    }));
    return graded.length ? graded.reduce((sum, s) => sum + calculateSemesterGPA(s.id, semester), 0) / graded.length : null;
  });
}
function timeframeGpa4(students, frame) {
  if (!students.length) return null;
  return students.reduce((sum, student) => {
    if (frame.mode === 'course') return sum + calculateCumulativeGPA4(student.id);
    const subjects = getSubjectsForClass(student.class).filter(subject => frame.mode === 'semester' ? Number(subject.semester) === frame.semester : Math.ceil(Number(subject.semester) / 2) === frame.year);
    let points = 0, credits = 0;
    subjects.forEach(subject => {
      const score = AppState.grades[student.id]?.[subject.id];
      if (score === '' || score == null || !Number.isFinite(Number(score))) return;
      const weight = Number(subject.credits) || 0;
      points += getGradeLetterAndScale4(score).scale4 * weight; credits += weight;
    });
    return sum + (credits ? points / credits : 0);
  }, 0) / students.length;
}
function quickMenu() {
  const menu = $('bentoQuickMenu'); if (!menu) return;
  const actions = [['Bảng điểm lớp', 'tab-sheet'], ['Hồ sơ quân nhân', 'tab-profiles'], ['Xuất báo cáo', 'tab-reports']];
  menu.replaceChildren();
  for (const [label, tab] of actions) {
    if (!allowedTab(tab === 'export' ? 'tab-dashboard' : tab)) continue;
    const button = node('button', '', label); button.type = 'button';
    button.addEventListener('click', () => { if (tab === 'export') $('btnExportReportExcel')?.click(); else go(tab); menu.closest('details').open = false; });
    menu.append(button);
  }
  if (AppState.role === 'admin' || AppState.role?.startsWith('class_leader_')) {
    for (const [label, target] of [['Nhập Excel hồ sơ', 'btnImportProfileExcel'], ['Nhập Excel bảng điểm', 'btnImportExcel']]) {
      const button = node('button', '', label); button.type = 'button';
      button.addEventListener('click', () => { $(target)?.click(); menu.closest('details').open = false; });
      menu.append(button);
    }
  }
  document.querySelectorAll('[data-bento-tab]').forEach(button => { button.hidden = !allowedTab(button.dataset.bentoTab); });
}
export function renderBentoDashboard() {
  if (!$('bentoDashboard') || isAnyEditFormActive()) return;
  quickMenu();
  const identity = `${AppState.role}:${AppState.currentUser?.studentId || AppState.currentUser?.code || ''}`;
  if (identity !== searchIdentity) {
    searchIdentity = identity;
    if ($('bentoSearchResults')) $('bentoSearchResults').hidden = true;
    if ($('bentoSearch')) { $('bentoSearch').value = ''; $('bentoSearch').setAttribute('aria-expanded', 'false'); }
  }
  const unitOverview = ['admin', 'company_officer'].includes(AppState.role);
  const cards = document.querySelector('.bento-grid');
  if (cards) cards.hidden = unitOverview;
  if (unitOverview) {
    if (chart) { chart.destroy(); chart = null; }
    return;
  }
  const students = scopedStudents();
  const frame = timeframe();
  const stats = computeReportAcademicStats(students, frame.mode, frame.semester, frame.year);
  const hasGrades = stats.totalGradedCourseInstances > 0;
  text('bentoCount', students.length.toLocaleString('vi-VN'));
  text('bentoAverage', hasGrades ? number(stats.avgGpa) : '—');
  text('bentoGood', hasGrades ? `${stats.khaGioiXsRate}% xếp loại Khá trở lên` : 'Chưa có điểm để xếp loại');
  text('bentoScale4', hasGrades ? `Hệ 4: ${number(timeframeGpa4(students, frame))} / 4,00` : 'Điểm sẽ hiện sau khi nhập dữ liệu');
  const ranked = students.filter(student => Object.values(AppState.grades[student.id] || {}).some(score => score !== '' && score != null && Number.isFinite(Number(score)))).map(student => ({ student, gpa: calculateCourseGPA10(student.id) })).sort((a, b) => b.gpa - a.gpa).slice(0, 5);
  text('bentoHighlightNote', ranked.length ? 'Theo điểm tích lũy toàn khóa trong phạm vi đang chọn.' : 'Chưa có kết quả học tập trong phạm vi này.');
  $('bentoPeople').replaceChildren(...ranked.map(({ student, gpa }, i) => {
    const person = node('div', 'bento-person');
    person.append(node('span', `bento-avatar bento-avatar-${i % 3}`, student.name.split(/\s+/).slice(-2).map(v => v[0]).join('').toUpperCase()), node('strong', '', student.name), node('small', '', `${student.class} · ${number(gpa)}`));
    return person;
  }));
  const debts = new Map();
  stats.failedCourseDetailsList.forEach(item => {
    const row = debts.get(item.subject.id) || { name: item.courseName, credits: item.credits, count: 0, total: 0 };
    row.count++; row.total += item.score; debts.set(item.subject.id, row);
  });
  const courses = [...debts.values()].sort((a, b) => b.count - a.count).slice(0, 4);
  $('bentoSubjects').replaceChildren(...courses.map(course => {
    const row = node('div', 'bento-course'); const info = node('div', 'bento-course-info');
    info.append(node('strong', '', course.name), node('small', '', `${course.credits} tín chỉ · ${course.count} lượt cần bồi dưỡng`));
    const result = node('div', 'bento-course-result'); result.append(node('strong', '', number(course.total / course.count)), node('span', 'bento-badge bento-badge-rose', 'Thi lại / Rớt'));
    row.append(node('span', 'bento-course-icon', '▦'), info, result); return row;
  }));
  if (!courses.length) $('bentoSubjects').append(node('div', 'bento-empty', hasGrades ? 'Không có học phần dưới 4,00 trong khoảng thời gian này.' : 'Chưa có điểm học phần để đánh giá.'));
  const logs = (AppState.auditLogs || []).filter(log => {
    const scope = getCurrentUserClassScope();
    if (scope && log.class !== scope) return false;
    const selected = $('dashboardClassFilter')?.value || 'all';
    return selected === 'all' || log.class === selected;
  }).slice(0, 4);
  $('bentoActivity').replaceChildren(...logs.map(log => {
    const row = node('div', 'bento-log'); const info = node('div', '');
    info.append(node('strong', '', log.actor || 'Người dùng hệ thống'), node('p', '', `${log.student || ''} · ${log.subject || log.reason || 'Cập nhật dữ liệu'}`), node('small', '', `${log.timestamp || ''} · ${log.oldVal ?? ''} → ${log.newVal ?? ''}`));
    const mark = node('span', 'bento-log-dot'); mark.innerHTML = arrowSvg; row.append(mark, info); return row;
  }));
  if (!logs.length) $('bentoActivity').append(node('div', 'bento-empty', 'Chưa có hoạt động được ghi nhận trong phạm vi này.'));
  const values = semesterData(students);
  const best = values.every(value => value === null) ? -1 : values.indexOf(Math.max(...values.filter(value => value !== null)));
  const bars = $('bentoBars');
  bars.replaceChildren(...values.map((value, i) => {
    const column = node('div', `bento-bar-column${i === best ? ' is-best' : ''}`);
    column.setAttribute('aria-label', `Học kỳ ${i + 1}: ${value === null ? 'chưa có điểm' : number(value)}`);
    const bar = node('div', 'bento-bar'); bar.style.setProperty('--bar-height', `${value === null ? 0 : value * 10}%`);
    bar.title = value === null ? 'Chưa có điểm' : number(value);
    column.append(node('small', '', value === null ? '—' : number(value)), bar, node('span', '', `HK${i + 1}`)); return column;
  }));
  text('bentoChartSummary', best < 0 ? 'Biểu đồ sẽ xuất hiện khi có điểm học kỳ.' : `Học kỳ ${best + 1} có điểm trung bình cao nhất: ${number(values[best])} / 10`);
  const canvas = $('bentoSemesterChart');
  if (typeof window.Chart === 'function') {
    canvas.hidden = false; bars.classList.add('bento-chart-data');
    const colors = values.map((_, i) => i === best ? '#4f46e5' : '#dbeafe');
    if (!chart) chart = new window.Chart(canvas, {
      type: 'bar', data: { labels: values.map((_, i) => `HK${i + 1}`), datasets: [{ label: 'Điểm trung bình', data: values, backgroundColor: colors, borderRadius: 8, borderSkipped: false, maxBarThickness: 38 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 450 }, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1e1b4b', padding: 12 } }, scales: { y: { min: 0, max: 10, border: { display: false }, ticks: { stepSize: 2 }, grid: { color: '#f0f2f4' } }, x: { border: { display: false }, grid: { display: false } } } }
    });
    else { chart.data.datasets[0].data = values; chart.data.datasets[0].backgroundColor = colors; chart.update('none'); }
  }
}
registerExternalHooks({ renderBentoDashboard });
renderBentoDashboard();
// Dashboard-only interaction; existing document delegation remains responsible for all business actions.
document.addEventListener('click', event => {
  const button = event.target.closest('[data-bento-tab]');
  if (button) go(button.dataset.bentoTab);
  if (!event.target.closest('.bento-search-wrap')) { if ($('bentoSearchResults')) $('bentoSearchResults').hidden = true; $('bentoSearch')?.setAttribute('aria-expanded', 'false'); }
});
$('bentoPeriod')?.addEventListener('change', renderBentoDashboard);
$('dashboardClassFilter')?.addEventListener('change', renderBentoDashboard);
$('bentoSearch')?.addEventListener('input', event => {
  const query = event.target.value.trim().toLocaleLowerCase('vi');
  const results = $('bentoSearchResults'); results.replaceChildren();
  if (query.length < 2) { results.hidden = true; event.target.setAttribute('aria-expanded', 'false'); return; }
  const scope = getCurrentUserClassScope();
  const students = AppState.students.filter(s => AppState.role === 'student' ? (s.id === AppState.currentUser?.studentId || s.code === AppState.currentUser?.code) : AppState.role !== 'guest' && (!scope || s.class === scope));
  const items = students.filter(s => `${s.name} ${s.code}`.toLocaleLowerCase('vi').includes(query)).slice(0, 6).map(s => ({ label: `${s.name} · ${s.code} · ${s.class}`, tab: 'tab-profiles', query: s.code }));
  if (allowedTab('tab-settings')) getSubjectsForClass(scope).filter(s => `${getFullSubjectName(s)} ${s.code}`.toLocaleLowerCase('vi').includes(query)).slice(0, 4).forEach(s => items.push({ label: `${getFullSubjectName(s)} · ${s.credits} tín chỉ`, tab: 'tab-settings' }));
  items.forEach(item => {
    const button = node('button', '', item.label); button.type = 'button';
    button.addEventListener('click', () => { go(item.tab); if (item.query && $('profileSearchInput')) { $('profileSearchInput').value = item.query; $('profileSearchInput').dispatchEvent(new Event('input', { bubbles: true })); } results.hidden = true; event.target.setAttribute('aria-expanded', 'false'); }); results.append(button);
  });
  if (!items.length) results.append(node('p', 'bento-muted', 'Không tìm thấy dữ liệu phù hợp.'));
  results.hidden = false; event.target.setAttribute('aria-expanded', 'true');
});
$('bentoSearch')?.addEventListener('keydown', event => {
  if (event.key === 'Escape') { $('bentoSearchResults').hidden = true; event.target.setAttribute('aria-expanded', 'false'); }
  if (event.key === 'ArrowDown') { event.preventDefault(); $('bentoSearchResults').querySelector('button')?.focus(); }
});
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { if (chart) { chart.options.animation = event.matches ? false : { duration: 450 }; chart.update('none'); } });
