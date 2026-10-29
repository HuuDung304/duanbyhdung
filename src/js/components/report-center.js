import { mountAccountMenu } from './account-menu.js';
import './bento-dashboard.js';
import { AppState, DEFAULT_CLASSES, getCurrentUserClassScope, getLoggedInStudent } from '../grades.js';
const $ = id => document.getElementById(id);
export function syncReportExportScope() {
  if (AppState.activeTab !== 'tab-reports') return;
  const scope = getCurrentUserClassScope();
  const selected = scope || (AppState.role === 'student' ? getLoggedInStudent()?.class : $('reportsClassSelect')?.value) || 'all';
  AppState.currentSheetClass = selected;
}
function renderReportCenter() {
  const select = $('reportsClassSelect'); if (!select) return;
  const student = AppState.role === 'student';
  const scope = getCurrentUserClassScope() || (student ? getLoggedInStudent()?.class : null);
  const old = select.value;
  select.replaceChildren(...(scope ? [scope] : ['', ...DEFAULT_CLASSES]).map(value => new Option(value ? `Lớp ${value}` : 'Chọn lớp để tải', value)));
  select.value = scope || (DEFAULT_CLASSES.includes(old) ? old : ''); select.disabled = Boolean(scope) || student;
  document.querySelectorAll('#tab-reports .export-unit-only').forEach(element => { element.hidden = student || AppState.role === 'guest'; });

}
$('reportsClassSelect')?.addEventListener('change', syncReportExportScope);
$('reportsYearSelect')?.addEventListener('change', syncReportExportScope);
window.addEventListener('report-role-change', renderReportCenter);
renderReportCenter();
let exportDialogPending = false;
export async function requestReportOptions(kind) {
  if (exportDialogPending || !['admin', 'company_officer'].includes(AppState.role) && !AppState.role?.startsWith('class_leader_')) return false;
  if (kind === 'class' && getCurrentUserClassScope()) return true;
  const dialog = $('reportExportDialog');
  if (!dialog) return false;
  exportDialogPending = true;
  const year = kind === 'year';
  $('reportClassOption').hidden = year;
  $('reportYearOption').hidden = !year;
  $('reportsClassSelect').required = !year;
  $('rankingYearSelect').required = year;
  $('reportsClassSelect').disabled = year;
  $('rankingYearSelect').disabled = !year;
  if (year) $('rankingYearSelect').value = '';
  $('reportExportDialogTitle').textContent = year ? 'Tải xếp hạng điểm' : 'Tải bảng điểm lớp';
  $('reportExportDialogDescription').textContent = year ? 'Chọn năm học để xếp hạng và tải file.' : 'Chọn lớp cần tải bảng điểm.';
  return new Promise(resolve => {
    dialog.addEventListener('close', () => { exportDialogPending = false; resolve(dialog.returnValue === 'download'); }, { once: true });
    dialog.returnValue = '';
    dialog.showModal();
    $(year ? 'rankingYearSelect' : 'reportsClassSelect').focus();
  });
}
$('reportExportCancel')?.addEventListener('click', () => $('reportExportDialog').close('cancel'));
$('reportExportForm')?.addEventListener('submit', event => {
  event.preventDefault();
  if ($('reportExportForm').reportValidity()) $('reportExportDialog').close('download');
});
window.addEventListener('report-role-change', () => { if ($('reportExportDialog')?.open) $('reportExportDialog').close('cancel'); });
mountAccountMenu(document.querySelector('.u040-me'), $('btnLogout'));
