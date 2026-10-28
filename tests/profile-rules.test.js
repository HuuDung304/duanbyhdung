import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { calendarDate, parentBirthYear, politicalDates } from '../src/js/profile-rules.js';

function declaration(source, name) {
  const start = source.search(new RegExp(`^export (?:const|(?:async )?function) ${name}\\b`, 'm'));
  assert.ok(start >= 0, name);
  const next = source.indexOf('\nexport ', start + 1);
  return source.slice(start, next < 0 ? undefined : next).replace(/^export /gm, '');
}

test('dates accept padded Vietnamese, ISO and Excel dates but reject impossible calendar days', () => {
  assert.equal(calendarDate('1/2/2024'), '2024-02-01');
  assert.equal(calendarDate('2024-02-29'), '2024-02-29');
  assert.equal(calendarDate(45292), '2024-01-01');
  assert.equal(calendarDate('45292'), '2024-01-01');
  assert.equal(calendarDate(''), null);
  for (const value of ['31/2/2024', '29/2/2023', '32/1/2025', '1/13/2025']) assert.throws(() => calendarDate(value));
});

test('parent years remain years in the database, including conversion of legacy full dates', () => {
  assert.equal(parentBirthYear('1975'), '1975');
  assert.equal(parentBirthYear('20/10/1978'), '1978');
  assert.equal(parentBirthYear('1978-10-20'), '1978');
  assert.equal(parentBirthYear(''), '');
  assert.throws(() => parentBirthYear('9999'));
  const source = readFileSync('src/js/students.js', 'utf8');
  const context = vm.createContext({ parentBirthYear });
  vm.runInContext(declaration(source, 'validateAndFormatParentDob'), context);
  assert.equal(context.validateAndFormatParentDob('1975', 'Bố').valid, true);
  assert.equal(context.validateAndFormatParentDob('20/10/1978', 'Mẹ').valid, false);
});

test('political status defaults and clears irrelevant dates; membership requires valid ordered dates', () => {
  assert.deepEqual(politicalDates('', 'invalid', 'invalid'), { politicalStatus: 'DOAN_VIEN', party_joined_date: null, official_party_date: null });
  assert.equal(politicalDates('CAM_TINH_DANG', '1/1/2020', '1/1/2021').party_joined_date, null);
  assert.deepEqual(politicalDates('DANG_VIEN_DU_BI', '1/2/2024', '1/3/2025'), { politicalStatus: 'DANG_VIEN_DU_BI', party_joined_date: '2024-02-01', official_party_date: null });
  assert.equal(politicalDates('DANG_VIEN_CHINH_THUC', '1/2/2024', '3/4/2025').official_party_date, '2025-04-03');
  assert.throws(() => politicalDates('DANG_VIEN_DU_BI', '', ''), /ngày vào Đảng/);
  assert.throws(() => politicalDates('DANG_VIEN_CHINH_THUC', '1/2/2024', ''), /ngày chính thức/);
  assert.throws(() => politicalDates('DANG_VIEN_CHINH_THUC', '1/2/2024', '1/1/2024'), /không được trước/);
});

function database(role = 'admin') {
  const rules = readFileSync('src/js/profile-rules.js', 'utf8').replace(/^export /gm, '');
  const source = readFileSync('src/js/supabase.js', 'utf8').replace(/^import .*?;\n/gm, '').replace(/^export default.*$/gm, '').replace(/^export /gm, '');
  const requests = [];
  const context = vm.createContext({ AppState: { role }, TextEncoder, Date, setTimeout, clearTimeout,
    fetch: async (url, options) => { requests.push({ url, options }); return new Response(null, { status: 204 }); },
  });
  const writes = [...readFileSync('src/js/supabase.js', 'utf8').matchAll(/^export async function ((?:upsert|delete)\w+|saveUnitSettingsToSupabase)\(/gm)].map(match => match[1]);
  vm.runInContext(rules + '\n' + source + `\nglobalThis.api={mapStudentToDbRow,mapDbRowToStudent,mapLanguageToDbRow,${writes.join(',')}};`, context);
  return { context, requests, api: context.api, writes };
}

test('all database mutation entry points reject the officer role before sending any request', async () => {
  const { api, writes, requests } = database('company_officer');
  assert.ok(writes.length >= 14);
  for (const name of writes) await assert.rejects(api[name](), /cán bộ chỉ được xem/);
  assert.equal(requests.length, 0);
});

test('database mapping omits IT fields and stores dates in ISO and parent years verbatim', () => {
  const { api } = database();
  const row = api.mapStudentToDbRow({ code: 'HV01', dob: '5/6/2003', politicalStatus: 'DANG_VIEN_CHINH_THUC', party_joined_date: '1/2/2024', official_party_date: '3/4/2025', father_birth_date: '1975', mother_birth_date: '1978', itStandard: 'legacy' });
  assert.equal(row.dob, '2003-06-05');
  assert.equal(row.party_joined_date, '2024-02-01');
  assert.equal(row.official_party_date, '2025-04-03');
  assert.equal(row.father_birth_date, '1975');
  assert.equal(row.mother_birth_date, '1978');
  assert.equal(Object.hasOwn(row, 'it_standard'), false);
  assert.equal(Object.hasOwn(api.mapLanguageToDbRow('hv01', { itStandard: 'legacy' }), 'it_standard'), false);
});

test('only the admin settings payload includes the required language standard', async () => {
  const { api, context, requests } = database('class_leader_OTQS1');
  await api.saveUnitSettingsToSupabase({ requiredLangStandard: 'B2' });
  assert.equal(Object.hasOwn(JSON.parse(requests[0].options.body)[0], 'required_lang_standard'), false);
  context.AppState.role = 'admin';
  await api.saveUnitSettingsToSupabase({ requiredLangStandard: 'B2' });
  assert.equal(JSON.parse(requests[1].options.body)[0].required_lang_standard, 'B2');
});

test('language warnings follow the admin threshold and include its level under a red badge', () => {
  const source = readFileSync('src/js/grades.js', 'utf8');
  const context = vm.createContext({ AppState: { requiredLangStandard: 'B1' } });
  vm.runInContext(declaration(source, 'LANGUAGE_LEVEL_RANK') + '\n' + declaration(source, 'evaluateLangLevelStatus'), context);
  const below = context.evaluateLangLevelStatus('A2');
  assert.equal(below.isPassed, false);
  assert.equal(below.statusText, 'Chưa đạt (B1)');
  assert.match(below.badgeHtml, /text-rose/);
  assert.match(below.badgeHtml, /Chưa đạt \(B1\)/);
  assert.equal(context.evaluateLangLevelStatus('B1').isPassed, true);
  context.AppState.requiredLangStandard = 'B2';
  assert.equal(context.evaluateLangLevelStatus('B1').isPassed, false);
});

test('party date fields are enabled, required and visible only for the selected status', () => {
  const source = readFileSync('src/js/students.js', 'utf8');
  const fields = { profFormPartyJoinedDate: { parentElement: {} }, profFormOfficialPartyDate: { parentElement: {} } };
  const context = vm.createContext({ AppState: { role: 'admin' }, document: { getElementById: id => fields[id] } });
  vm.runInContext(declaration(source, 'updatePartyDatesDisplay'), context);
  context.updatePartyDatesDisplay('DOAN_VIEN');
  assert.equal(fields.profFormPartyJoinedDate.parentElement.hidden, true);
  context.updatePartyDatesDisplay('DANG_VIEN_DU_BI');
  assert.equal(fields.profFormPartyJoinedDate.required, true);
  assert.equal(fields.profFormPartyJoinedDate.disabled, false);
  assert.equal(fields.profFormOfficialPartyDate.parentElement.hidden, true);
  context.updatePartyDatesDisplay('DANG_VIEN_CHINH_THUC');
  assert.equal(fields.profFormOfficialPartyDate.required, true);
  assert.equal(fields.profFormOfficialPartyDate.disabled, false);
});

test('a certificate write failure is propagated instead of reporting a fully saved student', async () => {
  const { api, context, requests } = database();
  context.fetch = async (url, options) => {
    requests.push({ url, options });
    if (options.method === 'GET') return new Response('[]');
    if (url.includes('/languages?')) return new Response(JSON.stringify({ message: 'language save rejected' }), { status: 400 });
    return new Response(null, { status: 204 });
  };
  const result = await api.upsertStudentToSupabase({ code: 'HV01' }, { currentLevel: 'B1' });
  assert.equal(result.error.message, 'language save rejected');
});


test('malformed legacy parent dates do not prevent loading cadets, but still fail write validation', () => {
  const { api } = database();
  const row = api.mapDbRowToStudent({ code: 'HV01', father_birth_date: 'legacy-invalid' });
  assert.equal(row.father_birth_date, 'legacy-invalid');
  assert.throws(() => api.mapStudentToDbRow(row));
});
