// Unit write controls are unavailable to the read-only company officer role.
export const UNIT_WRITE_SELECTOR = [
  '#btnToggleLock', '#btnAddSubjectBtn', '#btnAddSubjectFromSheetBtn', '.btn-add-to-sem',
  '.btn-edit-subj', '.btn-del-subj', '.btn-clear-sem-subjects', '.btn-clear-all-subjects',
  '#btnResetDefaultCurriculum', '#btnClearAllSubjectsBtn', '#btnAddCadetModalBtn',
  '#btnAddCadetCumulBtn', '#btnAddCadetMasterBtn', '#btnAddNewProfile', '.btn-open-profile',
  '.btn-trigger-delete', '#btnExecuteDeleteCadet', '.btn-clear-all-students',
  '#btnClearAllStudentsSheet', '#btnClearAllStudentsProfiles', '#btnClearAllStudentsCumul',
  '#btnClearAllStudentsMaster', '#btnStudentSelfEdit', '#btnToggleStudentDirectEdit',
  '#btnAddLangCertBtn', '.btn-edit-lang', '#btnImportExcel', '#btnConfirmImport',
  '#btnQuickImportExcel', '#btnImportProfileExcel', '#btnExecuteQuickImport', '#btnClearLog',
  '#btnSaveCloudConfig', '#btnPushInitialData',
  '#formAddCadet button[type="submit"]', '#formAddSubject button[type="submit"]',
  '#formUpdateLang button[type="submit"]', '#formStudentProfile button[type="submit"]'
].join(',');

export function installOfficerReadOnlyGuard(getRole, notify) {
  if (document.documentElement.dataset.officerGuard) return;
  document.documentElement.dataset.officerGuard = 'true';
  for (const type of ['click', 'submit', 'change']) {
    document.addEventListener(type, event => {
      if (getRole() !== 'company_officer') return;
      const blocked = type === 'click' ? event.target.closest(UNIT_WRITE_SELECTOR)
        : type === 'submit' ? ['formAddCadet', 'formAddSubject', 'formUpdateLang', 'formStudentProfile'].includes(event.target.id)
        : event.target.matches('.required-lang-standard-select,.input-subj-credits,.select-lang-tab-level,.select-cumul-lang,#studentSelfLangLevelSelect');
      if (!blocked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      notify('Tài khoản cán bộ chỉ được xem, không được chỉnh sửa dữ liệu đơn vị.', 'error');
    }, true);
  }
}
