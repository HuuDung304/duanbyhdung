// Profile and read-only-role workflow against an in-memory database. No live writes.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const tables = {
    students: [{ id: 'hv_test', code: 'HVTEST', name: 'Học viên kiểm thử', class: 'OTQS1', dob: '2003-06-05', political_status: 'DOAN_VIEN', father_birth_date: '1975', mother_birth_date: '1978', current_lang_level: 'A2', it_standard: 'legacy-preserve' }],
    subjects: [{ id: 'math', code: 'MATH', name: 'Toán', semester: 1, credits: 3, category: 'common' }],
    grades: [{ student_id: 'hv_test', subject_id: 'math', score: 8 }],
    languages: [{ student_id: 'hv_test', current_level: 'A2' }],
    unit_settings: [{ unit_id: 'daidoi460', required_lang_standard: 'B1', locks: {}, audit_logs: [] }],
  };
  const writes = [];
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 } });
  await context.addInitScript(() => sessionStorage.setItem('dd460_auth_session', JSON.stringify({ type: 'admin', displayName: 'Admin kiểm thử' })));
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'text/javascript', body: 'window.tailwind={};' });
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/xlsx@')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js')) });
    if (url.hostname.endsWith('.supabase.co')) {
      const table = url.pathname.split('/').pop(); const rows = tables[table] || [];
      if (request.method() === 'POST') {
        const body = request.postDataJSON(); const incoming = Array.isArray(body) ? body : [body];
        writes.push({ table, rows: incoming });
        const keys = (url.searchParams.get('on_conflict') || 'id').split(',');
        for (const row of incoming) { const existing = rows.find(candidate => keys.every(key => candidate[key] === row[key])); if (existing) Object.assign(existing, row); else rows.push(row); }
        return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
      }
      return route.fulfill({ json: rows, headers: { 'access-control-allow-origin': '*' } });
    }
    return route.fulfill({ contentType: url.hostname === 'cdn.jsdelivr.net' ? 'text/javascript' : 'text/css', body: '' });
  });
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3000', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.AppState?.students.length === 1);
  assert.doesNotMatch(await page.locator('body').innerText(), /CNTT/);
  assert.equal(await page.locator('#studentSelfItStandardSelect,#inlineProfItStandard,#profFormFatherDobMode,#profFormMotherDobMode').count(), 0);
  await page.evaluate(() => window.switchTab('tab-languages'));
  assert.match(await page.locator('#languageTableBody').innerText(), /Chưa đạt \(B1\)/);
  const standard = page.locator('#tab-languages .required-lang-standard-select');
  await standard.selectOption('B2');
  await page.waitForFunction(() => window.AppState.requiredLangStandard === 'B2');
  await page.waitForFunction(() => document.getElementById('languageTableBody').textContent.includes('Chưa đạt (B2)'));
  const actualLevel = page.locator('#languageTableBody .select-lang-tab-level');
  await actualLevel.selectOption('B2');
  await page.waitForFunction(() => document.getElementById('languageTableBody').textContent.includes('Đạt (B2)'));
  await page.locator('#languageTableBody .btn-edit-lang').first().dispatchEvent('click');
  await page.locator('#langActualLevel').selectOption('B1');
  await page.locator('#formUpdateLang').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => document.getElementById('modalUpdateLang').getAttribute('aria-hidden') === 'true');
  assert.match(await page.locator('#languageTableBody').innerText(), /Chưa đạt \(B2\)/);
  await actualLevel.selectOption('B2');
  await page.waitForFunction(() => document.getElementById('languageTableBody').textContent.includes('Đạt (B2)'));


  await page.evaluate(() => window.openStudentProfileModal('hv_test'));
  await page.locator('.profile-subtab[data-subtab="subtab-political"]').dispatchEvent('click');
  const political = page.locator('#profFormPoliticalStatus');
  assert.equal(await page.locator('#profFormPartyJoinedDate').evaluate(element => element.parentElement.hidden), true);
  await political.selectOption('CAM_TINH_DANG');
  assert.equal(await page.locator('#profFormOfficialPartyDate').isDisabled(), true);
  await political.selectOption('DANG_VIEN_DU_BI');
  assert.equal(await page.locator('#profFormPartyJoinedDate').getAttribute('required'), '');
  assert.equal(await page.locator('#profFormOfficialPartyDate').isDisabled(), true);
  await page.locator('#profFormPartyJoinedDate').fill('1/2/2024');
  await political.selectOption('DANG_VIEN_CHINH_THUC');
  assert.equal(await page.locator('#profFormOfficialPartyDate').isDisabled(), false);
  await page.locator('#profFormOfficialPartyDate').fill('3/4/2025');
  await page.locator('.profile-subtab[data-subtab="subtab-parents"]').dispatchEvent('click');
  await page.locator('#profFormFatherBirthDate').fill('1975');
  await page.locator('#profFormMotherBirthDate').fill('1978');
  await page.locator('#formStudentProfile').evaluate(form => form.requestSubmit());
  await page.waitForFunction(() => document.getElementById('modalStudentProfile').getAttribute('aria-hidden') === 'true');
  const student = tables.students[0];
  assert.equal(student.political_status, 'DANG_VIEN_CHINH_THUC');
  assert.equal(student.party_joined_date, '2024-02-01');
  assert.equal(student.official_party_date, '2025-04-03');
  assert.equal(student.father_birth_date, '1975');
  assert.equal(student.mother_birth_date, '1978');
  assert.equal(student.it_standard, 'legacy-preserve');
  const recordedPartyDates = [student.party_joined_date, student.official_party_date];
  for (const write of writes) for (const row of write.rows) assert.equal(Object.hasOwn(row, 'it_standard'), false);

  await page.evaluate(() => window.openStudentProfileModal('hv_test'));
  await page.evaluate(() => { window.AuthState.setUser({ type: 'company_officer', displayName: 'Cán bộ kiểm thử' }); window.switchTab('tab-languages'); });
  assert.equal(await page.locator('body').getAttribute('data-unit-readonly'), '');
  assert.equal(await page.locator('#modalStudentProfile').isVisible(), false);
  assert.equal(await standard.isDisabled(), true);
  assert.equal(await page.locator('#languageTableBody .select-lang-tab-level').count(), 0);
  assert.match(await page.locator('#languageTableBody').innerText(), /Chỉ xem/);
  await page.evaluate(() => window.switchTab('tab-profiles'));
  assert.equal(await page.locator('#btnQuickImportExcel').isVisible(), false);
  assert.equal(await page.locator('.btn-open-profile').first().isVisible(), false);
  assert.equal(await page.locator('#btnExportProfileExcel').isVisible(), true);
  const before = writes.length;
  await page.locator('#btnQuickImportExcel').dispatchEvent('click');
  assert.equal(await page.locator('#modalQuickImportExcel').isVisible(), false);
  const blocked = await page.evaluate(async () => {
    const db = await import('/src/js/supabase.js');
    try { await db.upsertGradeToSupabase('hv_test', 'math', 10); return false; } catch (error) { return error.message.includes('chỉ được xem'); }
  });
  assert.equal(blocked, true);
  const download = page.waitForEvent('download');
  await page.locator('#btnExportProfileExcel').dispatchEvent('click');
  const exported = await download;
  const XLSX = require('xlsx');
  const exportedBook = XLSX.readFile(await exported.path());
  const exportedRows = XLSX.utils.sheet_to_json(exportedBook.Sheets[exportedBook.SheetNames[0]], { header: 1 });
  const exportedHeader = exportedRows.find(row => row.includes('Năm sinh Bố'));
  assert.ok(exportedHeader);
  assert.doesNotMatch(JSON.stringify(exportedRows), /CNTT/);
  const exportedCadet = exportedRows.find(row => row.includes('HVTEST'));
  assert.equal(String(exportedCadet[exportedHeader.indexOf('Năm sinh Bố')]), '1975');
  assert.equal(writes.length, before);
  const officerWrites = writes.length - before;
  // The cadet's own form has year-only parents and the same status-dependent dates.
  await page.evaluate(() => { window.AuthState.setUser({ type: 'student', code: 'HVTEST', studentId: 'hv_test', class: 'OTQS1' }); window.switchTab('tab-profiles'); });
  assert.equal(await page.locator('#inlineFatherDob').inputValue(), '1975');
  assert.equal(await page.locator('#inlineProfPartyJoined').isDisabled(), true);
  assert.equal(await page.locator('#inlineProfItStandard,#inlineFatherDobMode,#inlineMotherDobMode').count(), 0);
  await page.locator('#btnToggleStudentDirectEdit').dispatchEvent('click');
  assert.equal(await page.locator('#inlineProfPartyJoined').isDisabled(), false);
  await page.locator('#inlineProfPolitical').selectOption('CAM_TINH_DANG');
  assert.equal(await page.locator('#inlineProfPartyJoined').isDisabled(), true);
  await page.locator('#btnToggleStudentDirectEdit').dispatchEvent('click');
  await page.waitForFunction(() => !window.AppState.studentProfileEditMode);
  assert.equal(student.party_joined_date, null);
  assert.equal(student.official_party_date, null);
  assert.equal(student.father_birth_date, '1975');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ result: 'PASS', languageThreshold: 'admin-only B2', parentYears: [student.father_birth_date, student.mother_birth_date], partyDates: recordedPartyDates, candidateDatesCleared: student.party_joined_date === null && student.official_party_date === null, officerWrites, officerExport: 'PASS', browserErrors: errors }, null, 2));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
