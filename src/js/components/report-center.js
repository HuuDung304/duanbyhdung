import './bento-dashboard.js';
import { AppState, DEFAULT_CLASSES, getCurrentUserClassScope, getLoggedInStudent } from '../grades.js';
const $ = id => document.getElementById(id);
export function syncReportExportScope() {
  if (AppState.activeTab !== 'tab-reports') return;
  const scope = getCurrentUserClassScope();
  const selected = scope || (AppState.role === 'student' ? getLoggedInStudent()?.class : $('reportsClassSelect')?.value) || 'all';
  const year = Number($('reportsYearSelect')?.value) || 1;
  AppState.currentSheetClass = selected; AppState.currentSheetSemester = String(year); AppState.cumulativeSelectedYear = String(year);
  AppState.dashboardFilters ||= {}; AppState.dashboardFilters.class = selected;
  AppState.masterFilters ||= {}; AppState.masterFilters.class = selected;
  for (const id of ['sheetClassSelect','profileFilterClass','cumulFilterClass','dashboardClassFilter']) if ($(id)) $(id).value = selected;
  if ($('cumulFilterRank')) $('cumulFilterRank').value = 'all';
  if ($('profileFilterPolitical')) $('profileFilterPolitical').value = 'all';
  if ($('profileFilterPosition')) $('profileFilterPosition').value = 'all';
  if ($('cumulFilterYear')) $('cumulFilterYear').value = String(year);
}
function renderReportCenter() {
  const select = $('reportsClassSelect'); if (!select) return;
  const student = AppState.role === 'student';
  const scope = getCurrentUserClassScope() || (student ? getLoggedInStudent()?.class : null);
  const old = select.value;
  select.replaceChildren(...(scope ? [scope] : ['all', ...DEFAULT_CLASSES]).map(value => new Option(value === 'all' ? 'Toàn Đại đội 460' : `Lớp ${value}`, value)));
  select.value = scope || (['all',...DEFAULT_CLASSES].includes(old) ? old : 'all'); select.disabled = Boolean(scope) || student;
  document.querySelectorAll('#tab-reports .export-unit-only').forEach(element => { element.hidden = student || AppState.role === 'guest'; });
  const button = $('btnExportClassExcel'); if (button && student) button.querySelector('span')?.replaceChildren(document.createTextNode('Xuất bảng điểm cá nhân & tích lũy (.xlsx)'));
}
$('reportsClassSelect')?.addEventListener('change', syncReportExportScope);
$('reportsYearSelect')?.addEventListener('change', syncReportExportScope);
window.addEventListener('report-role-change', renderReportCenter);
renderReportCenter();
// Reuse the real logout button/handler inside an accessible account popover.
const profile = document.querySelector('.u040-me');
if (profile) {
  const trigger = document.createElement('button'); trigger.type = 'button'; trigger.className = 'sidebar-account-trigger';
  trigger.setAttribute('aria-label','Mở menu tài khoản'); trigger.setAttribute('aria-expanded','false'); trigger.setAttribute('aria-controls','sidebarAccountMenu');
  trigger.append(...profile.childNodes);
  const menu = document.createElement('div'); menu.id = 'sidebarAccountMenu'; menu.hidden = true;
  const logout = $('btnLogout'); if (logout) menu.append(logout);
  profile.append(trigger, menu);
  const close = () => { menu.hidden = true; trigger.setAttribute('aria-expanded','false'); };
  trigger.addEventListener('click', () => {
    menu.hidden = !menu.hidden; trigger.setAttribute('aria-expanded', String(!menu.hidden));
    if (!menu.hidden) {
      const bounds = trigger.getBoundingClientRect();
      menu.style.position = 'fixed'; menu.style.left = `${Math.min(bounds.left, innerWidth - 180)}px`;
      menu.style.bottom = `${innerHeight - bounds.top + 10}px`; menu.style.width = `${Math.max(160, Math.min(220, bounds.width))}px`;
    }
  });
  window.addEventListener('resize', close);
  document.addEventListener('click', event => { if (!profile.contains(event.target)) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { close(); trigger.focus(); } });
  logout?.addEventListener('click', close);
  window.addEventListener('report-role-change', close);
}
