import { databaseFixtureSource } from './module-source-helper.js';
import { calendarDate, parentBirthYear, politicalDates } from '../src/js/profile-rules.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const variants = ['src/js/supabase.js'];
function supabase(file, handler = () => new Response('[]')) {
  let source = file.endsWith('supabase.js') ? databaseFixtureSource() : readFileSync(file, 'utf8');
  source = source.replace(/^import .*?;\n/gm, '');
  const rules = readFileSync('src/js/profile-rules.js', 'utf8').replace(/^export /gm, '');
  source = rules + '\n' + source;
  source = source.replace(/^export default .*;$/gm, '').replace(/^export /gm, '');
  const timers = new Set();
  const requests = [];
  const context = vm.createContext({ trackImportRead() {}, sanitizeHTML: value => String(value), escapeHTML: value => String(value),
    console: { warn() {}, error() {} }, URL, Date, TextEncoder,
    fetch: async (url, options) => {
      const request = { url: new URL(url), options };
      requests.push(request);
      return handler(request);
    },
    setTimeout(fn, ms) { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; },
    clearTimeout(id) { timers.delete(id); clearTimeout(id); },
  });
  vm.runInContext(source + '\nglobalThis.api = { executeWithRetry, loadAllDataFromSupabase, upsertStudentsBulkToSupabase, upsertSubjectsBulkToSupabase, upsertGradesBulkToSupabase, subscribeSupabaseRealtime, beginSupabaseWrite, endSupabaseWrite, initSupabaseClient };', context);
  return { api: context.api, context, requests, timers };
}
const ok = data => new Response(JSON.stringify(data));
const failure = (message = 'permission denied') => new Response(JSON.stringify({ message, code: '42501' }), { status: 400 });

for (const variant of variants) {
  test(`${variant}: clears successful request timeouts and retries SDK HTTP status`, async () => {
    const { api, timers } = supabase(variant);
    let attempts = 0;
    const result = await api.executeWithRetry(() => ++attempts === 1
      ? { status: 503, error: { message: 'unavailable' } }
      : { data: 'ok', error: null }, { baseDelayMs: 0 });
    assert.equal(result.data, 'ok');
    assert.equal(attempts, 2);
    assert.equal(timers.size, 0);
    const timeout = await api.executeWithRetry(() => new Promise(() => {}), { maxAttempts: 1, timeoutMs: 2 });
    assert.equal(timeout.error.message, 'SUPABASE_REQUEST_TIMEOUT');
    assert.equal(timers.size, 0);
  });

  test(`${variant}: loads more than 1,000 grades and shares simultaneous reads`, async () => {
    const allGrades = Array.from({ length: 1001 }, (_, i) => ({ student_id: 'hv_one', subject_id: `subject_${i}`, score: 8 }));
    const { api, requests } = supabase(variant, ({ url }) => {
      if (url.pathname.endsWith('/grades')) {
        const offset = Number(url.searchParams.get('offset'));
        assert.equal(url.searchParams.get('order'), 'student_id.asc,subject_id.asc');
        return ok(allGrades.slice(offset, offset + Number(url.searchParams.get('limit'))));
      }
      return ok([]);
    });
    const [a, b] = await Promise.all([api.loadAllDataFromSupabase(), api.loadAllDataFromSupabase()]);
    assert.equal(a, b);
    assert.equal(Object.keys(a.grades.hv_one).length, 1001);
    assert.equal(requests.filter(r => r.url.pathname.endsWith('/grades')).length, 2);
  });

  test(`${variant}: rejects partial reads and allows a fresh retry`, async () => {
    let denied = true;
    const { api } = supabase(variant, ({ url }) => denied && url.pathname.endsWith('/grades') ? failure() : ok([]));
    await assert.rejects(api.loadAllDataFromSupabase(), /Không thể tải bảng grades/);
    denied = false;
    assert.equal((await api.loadAllDataFromSupabase()).students.length, 0);
  });

  test(`${variant}: does not drop missing schema columns or hide a failed grade batch`, async () => {
    let writes = 0;
    const { api } = supabase(variant, ({ options }) => {
      if (options.method === 'POST') {
        writes++;
        return failure("Could not find the 'score' column");
      }
      return ok([]);
    });
    const result = await api.upsertGradesBulkToSupabase(Array.from({ length: 501 }, (_, i) => ({ studentId: 'hv_one', subjectId: `s${i}`, score: 7 })));
    assert.match(result.error.message, /thiếu cột score/);
    assert.equal(writes, 1);
  });

  test(`${variant}: looks up only imported codes and propagates language write failures`, async () => {
    const { api, requests } = supabase(variant, ({ url, options }) => {
      if (options.method === 'GET') return ok([]);
      if (url.pathname.endsWith('/languages')) return failure();
      return ok([]);
    });
    const rows = [{ code: 'HV01', name: 'Một', class: 'OTQS1' }];
    const result = await api.upsertStudentsBulkToSupabase(rows);
    assert.ok(result.error);
    assert.equal(rows[0].id, 'hv_hv01');
    assert.match(requests[0].url.searchParams.get('code'), /HV01/);
    assert.equal(requests.filter(r => r.options.method === 'GET').length, 1);
  });
}

function importContext(file = 'src/js/grades.js', overrides = {}) {
  const source = readFileSync(file, 'utf8');
  const start = source.indexOf('async function executeExcelImport()');
  const end = source.indexOf('// --- 16. ĐIỂM TÍCH LŨY', start);
  const button = { disabled: false, textContent: 'Nhập', attributes: {}, setAttribute(key,value) { this.attributes[key]=value; }, removeAttribute(key) { delete this.attributes[key]; } };
  const messages = [];
  const writes = [];
  const context = vm.createContext({ trackImportRead() {}, sanitizeHTML: value => String(value), escapeHTML: value => String(value),
    structuredClone, console: { error() {} },
    document: { getElementById: () => button },
    AppState: { role: 'admin', currentSheetClass: 'OTQS1', currentSheetSemester: 1, students: [], subjects: [], grades: {}, languages: {} },
    parsedImportData: { headers: ['Mã HV', 'Họ và Tên', 'Lớp', 'Toán'], rows: [['HV01', 'Một', 'OTQS1', '7,5']] },
    DEFAULT_CLASSES: ['OTQS1'], getCurrentUserClassScope: () => null,
    parseExcelSubjectHeader: () => ({ normTitle: 'toan' }),
    resolveSubjectByCompositeKey: () => ({ id: 'toan' }),
    buildDeterministicStudentId: code => `hv_${code.toLowerCase()}`,
    normalizeDateVN: () => '', logAuditTrail() {}, persistData: async () => {}, updateAllViews() {}, hideModal() {},
    reviewImport: async options => { if (!options.confirm) messages.push({ message: [options.details, ...(options.rows || [])].join('\n'), type: options.title.includes('Kết quả') ? 'success' : 'error' }); return true; },
    importExcelTransaction: async () => ({ unavailable: true }),
    showToast: (message, type) => messages.push({ message, type }),
    upsertStudentsBulkToSupabase: async rows => { writes.push(rows); return { error: null }; },
    upsertSubjectsBulkToSupabase: async () => ({ error: null }),
    upsertGradesBulkToSupabase: async rows => { writes.push(rows); return { error: null }; },
    ...overrides,
  });
  vm.runInContext(source.slice(start, end), context);
  return { context, messages, writes, button };
}

for (const variant of ['src/js/grades.js']) {
  test(`${variant}: imports comma decimals, writes only imported students, prevents double submit`, async () => {
    const { context, messages, writes } = importContext(variant);
    context.AppState.students.push({ id: 'unrelated', code: 'OTHER', name: 'Khác', class: 'OTQS1' });
    await Promise.all([context.executeExcelImport(), context.executeExcelImport()]);
    assert.equal(writes.length, 2);
    assert.equal(writes[0].length, 1);
    assert.equal(writes[1][0].score, 7.5);
    assert.equal(messages.filter(m => m.type === 'success').length, 1);
  });

  test(`${variant}: failed imports retain file and restore local state for retry`, async () => {
    const { context, messages, button } = importContext(variant, { upsertGradesBulkToSupabase: async () => ({ error: { message: 'write failed' } }) });
    await context.executeExcelImport();
    assert.equal(context.AppState.students.length, 0);
    assert.ok(context.parsedImportData);
    assert.equal(button.disabled, false);
    assert.equal(messages.at(-1).type, 'error');
    context.upsertGradesBulkToSupabase = async () => ({ error: null });
    await context.executeExcelImport();
    assert.equal(context.AppState.students.length, 1);
    assert.equal(messages.at(-1).type, 'success');
  });

  test(`${variant}: invalid scores report an error instead of a partial successful import`, async () => {
    const { context, messages, writes } = importContext(variant);
    context.parsedImportData.rows[0][3] = '8oops';
    await context.executeExcelImport();
    assert.equal(writes.length, 0);
    assert.equal(messages.at(-1).type, 'error');
  });
}

for (const variant of ['src/js/students.js']) {
  test(`${variant}: absent optional columns do not read other fields`, () => {
    const source = readFileSync(variant, 'utf8');
    const start = source.indexOf('function detectExcelColumnMapping(');
    const end = source.indexOf('function handleQuickImportFileUpload(', start);
    const code = source.slice(start, end).replace(/export\s*$/, '');
    const context = vm.createContext({ trackImportRead() {}, sanitizeHTML: value => String(value), escapeHTML: value => String(value),});
    vm.runInContext(code, context);
    const map = context.detectExcelColumnMapping(['Mã HV', 'Họ và Tên', 'SĐT']);
    assert.equal(map.phone, 2);
    assert.equal(map.class, -1);
    assert.equal(map.rank, -1);
    assert.equal(map.father_name, -1);
    assert.equal(context.detectExcelColumnMapping([]).code, -1);
  });
}

for (const variant of variants) {
  test(`${variant}: grade imports preserve an existing roster and language record`, async () => {
    const { api, requests } = supabase(variant, ({ options }) => options.method === 'GET'
      ? ok([{ id: 'legacy-id', code: 'HV01' }]) : ok([]));
    const rows = [{ code: 'HV01', name: 'Old cached name' }];
    const result = await api.upsertStudentsBulkToSupabase(rows, {}, { createOnly: true });
    assert.equal(result.error, null);
    assert.equal(rows[0].id, 'legacy-id');
    assert.equal(requests.filter(r => r.options.method === 'POST').length, 0);
  });

  test(`${variant}: concurrent new students use insert-on-conflict-ignore`, async () => {
    const { api, requests } = supabase(variant, () => ok([]));
    await api.upsertStudentsBulkToSupabase([{ code: 'HV01', name: 'Một' }], {}, { createOnly: true });
    const posts = requests.filter(r => r.options.method === 'POST');
    assert.equal(posts.length, 2);
    for (const request of posts) assert.match(request.options.headers.Prefer, /resolution=ignore-duplicates/);
  });

  test(`${variant}: changes received during a local write are eventually delivered`, () => {
    const { api, context } = supabase(variant);
    let now = 1000;
    context.Date = { now: () => now };
    const queue = new Map();
    let nextId = 0;
    context.setTimeout = fn => { queue.set(++nextId, fn); return nextId; };
    context.clearTimeout = id => queue.delete(id);
    const events = [];
    const channel = { on(type, filter, callback) { events.push(callback); return this; }, subscribe() { return this; } };
    context.window = { supabase: { createClient: () => ({ channel: () => channel, removeChannel() {} }) } };
    api.initSupabaseClient();
    let notifications = 0;
    api.subscribeSupabaseRealtime(() => notifications++);
    const tick = () => { const [id, fn] = queue.entries().next().value; queue.delete(id); fn(); };
    api.beginSupabaseWrite();
    events[0]({ eventType: 'UPDATE' });
    tick();
    assert.equal(notifications, 0);
    api.endSupabaseWrite();
    now += 1000;
    tick();
    assert.equal(notifications, 1);
    assert.equal(queue.size, 0);
  });
}

for (const variant of ['src/js/grades.js']) {
  test(`${variant}: closes the import dialog before rendering the saved rows`, async () => {
    const order = [];
    const { context } = importContext(variant, {
      hideModal: () => order.push('close'), updateAllViews: () => order.push('render'),
    });
    await context.executeExcelImport();
    assert.deepEqual(order, ['close', 'render']);
  });

  test(`${variant}: queues changes received during an in-flight realtime refresh`, async () => {
    const source = readFileSync(variant, 'utf8');
    const start = source.indexOf('function connectFirebaseRealtime()');
    const end = source.indexOf('function pushDataToCloud(', start);
    const code = source.slice(start, end).replace(/export\s*$/, '');
    let callback;
    let finishRead;
    let reads = 0;
    const applied = [];
    const context = vm.createContext({ trackImportRead() {}, sanitizeHTML: value => String(value), escapeHTML: value => String(value),
      document: { getElementById: () => null },
      console, CloudSync: {}, AppState: {},
      SUPABASE_URL: 'fixture', SUPABASE_KEY: 'fixture', initSupabaseClient() {},
      subscribeSupabaseRealtime: cb => { callback = cb; },
      isAnyEditFormActive: () => false,
      loadAllDataFromSupabase: () => ++reads === 1 ? new Promise(resolve => { finishRead = resolve; }) : Promise.resolve({ revision: 2 }),
      applyCloudSnapshotToState: data => applied.push(data.revision), updateAllViews() {},
    });
    vm.runInContext(code, context);
    context.connectFirebaseRealtime();
    const firstRefresh = callback();
    await callback();
    finishRead({ revision: 1 });
    await firstRefresh;
    await Promise.resolve();
    assert.equal(reads, 2);
    assert.deepEqual(applied, [1, 2]);
  });
}

for (const variant of ['src/js/grades.js']) {
  test(`${variant}: Excel validation errors are displayed as text, not HTML`, () => {
    const source = readFileSync(variant, 'utf8');
    const start = source.indexOf('function showToast(');
    const end = source.indexOf('// --- 4.', start);
    const span = {};
    const toast = { querySelector: () => span };
    const context = vm.createContext({ trackImportRead() {}, sanitizeHTML: value => String(value), escapeHTML: value => String(value),
      document: { getElementById: () => ({ appendChild() {} }), createElement: () => toast },
      setTimeout() {},
    });
    vm.runInContext(source.slice(start, end).replace(/export\s*$/, ''), context);
    const maliciousCell = '<img src=x onerror=alert(1)>';
    context.showToast(maliciousCell, 'error');
    assert.equal(span.textContent, maliciousCell);
    assert.ok(!toast.innerHTML.includes(maliciousCell));
  });
}

test('10,000 grade rows use 20 bounded requests, preserve scores and request minimal responses', async () => {
  let active = 0;
  let peak = 0;
  const { api, requests } = supabase('src/js/supabase.js', async ({ options }) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    assert.match(options.headers.Prefer, /return=minimal/);
    return new Response(null, { status: 204 });
  });
  const rows = Array.from({ length: 10000 }, (_, i) => ({ studentId: 'hv_one', subjectId: `s${i}`, score: i % 11 }));
  const result = await api.upsertGradesBulkToSupabase(rows);
  assert.equal(result.error, null);
  assert.equal(result.processedCount, 10000);
  assert.equal(requests.length, 20);
  assert.equal(peak, 1);
  const written = requests.flatMap(request => JSON.parse(request.options.body));
  assert.equal(written.length, 10000);
  assert.equal(written.at(-1).score, rows.at(-1).score);
  for (const request of requests) assert.ok(Buffer.byteLength(request.options.body) <= 256 * 1024);
});

test('UTF-8 profile payloads are split by bytes and retain every imported student', async () => {
  const { api, requests } = supabase('src/js/supabase.js', () => ok([]));
  const rows = Array.from({ length: 70 }, (_, i) => ({ code: `HV${i}`, name: 'Đ'.repeat(4000), class: 'OTQS1' }));
  const result = await api.upsertStudentsBulkToSupabase(rows);
  assert.equal(result.error, null);
  const writes = requests.filter(request => request.options.method === 'POST' && request.url.pathname.endsWith('/students'));
  assert.ok(writes.length > 1);
  assert.equal(writes.flatMap(request => JSON.parse(request.options.body)).length, 70);
  for (const request of writes) assert.ok(Buffer.byteLength(request.options.body) <= 256 * 1024);
});

test('a failed second grade batch reports acknowledged inputs and stops further writes', async () => {
  let writes = 0;
  const { api } = supabase('src/js/supabase.js', () => ++writes === 2 ? failure() : ok([]));
  const result = await api.upsertGradesBulkToSupabase(Array.from({ length: 1200 }, (_, i) => ({ studentId: 'hv', subjectId: `s${i}`, score: 8 })));
  assert.ok(result.error);
  assert.equal(result.processedCount, 500);
  assert.equal(result.failedBatch, 2);
  assert.equal(writes, 2);
});

test('downloads project only grade fields used by reports while preserving pagination', async () => {
  const { api, requests } = supabase('src/js/supabase.js');
  await api.loadAllDataFromSupabase();
  const grades = requests.find(request => request.url.pathname.endsWith('/grades'));
  assert.equal(grades.url.searchParams.get('select'), 'student_id,subject_id,score');
});

test('import resolves a subject once per column/class rather than once per score cell', async () => {
  let resolutions = 0;
  const { context, writes } = importContext('src/js/grades.js', {
    resolveSubjectByCompositeKey: () => { resolutions++; return { id: 'math' }; },
  });
  context.AppState.students = Array.from({ length: 1000 }, (_, i) => ({ id: `hv_${i}`, code: `HV${i}`, name: `Học viên ${i}`, class: 'OTQS1' }));
  context.parsedImportData.rows = context.AppState.students.map(student => [student.code, student.name, student.class, '7,5']);
  await context.executeExcelImport();
  assert.equal(resolutions, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].length, 1000);
  assert.equal(writes[0].at(-1).score, 7.5);
});

test('oversized individual profiles fail before any write instead of exceeding the payload limit', async () => {
  const { api, requests } = supabase('src/js/supabase.js', () => ok([]));
  await assert.rejects(api.upsertStudentsBulkToSupabase([{ code: 'HV01', name: 'Đ'.repeat(150000) }]), /vượt giới hạn 256 KiB/);
  assert.equal(requests.filter(request => request.options.method === 'POST').length, 0);
});


test('Excel import retains 3.99 as a failing score, without rounding to 4.0', async () => {
  const { context, writes } = importContext();
  context.parsedImportData.rows[0][3] = '3,99';
  await context.executeExcelImport();
  assert.equal(writes.at(-1)[0].score, 3.99);
});

test('grade Excel import never matches a missing student code to a same-name cadet', async () => {
  const { context, writes, messages } = importContext();
  context.AppState.students = [{ id: 'hv_old', code: 'HVOLD', name: 'Một', class: 'OTQS1' }];
  context.parsedImportData.rows[0][0] = '';
  await context.executeExcelImport();
  assert.equal(writes.length, 0);
  assert.match(messages.at(-1).message, /thiếu Mã HV/);
});

test('grade import requires an explicit code column and keeps same-name students separate', async () => {
  const { context, writes } = importContext();
  context.AppState.students = [
    { id: 'hv_a', code: 'HV01', name: 'Trùng tên', class: 'OTQS1' },
    { id: 'hv_b', code: 'HV02', name: 'Trùng tên', class: 'OTQS1' },
  ];
  context.parsedImportData.rows = [[' hv02 ', 'Trùng tên', 'OTQS1', 8]];
  await context.executeExcelImport();
  assert.equal(writes[0][0].studentId, 'hv_b');
  assert.equal(context.AppState.grades.hv_a, undefined);
  const invalid = importContext();
  invalid.context.parsedImportData.headers = ['Họ và Tên', 'Lớp', 'Toán'];
  await invalid.context.executeExcelImport();
  assert.equal(invalid.writes.length, 0);
  assert.match(invalid.messages.at(-1).message, /phải có cột Mã HV/);
});

function profileContext(rows, setupState) {
  const source = readFileSync('src/js/students.js', 'utf8');
  const elements = new Map();
  const messages = [];
  const writes = [];
  const state = { role: 'admin', currentSheetClass: 'OTQS1', subjects: [], grades: {}, languages: {}, students: [
    { id: 'hv_a', code: 'HV01', name: 'Trùng tên', class: 'OTQS1', phone: 'old1' },
    { id: 'hv_b', code: 'HV02', name: 'Trùng tên', class: 'OTQS2', phone: 'old2' },
  ] };
  if (setupState) setupState(state);
  const context = vm.createContext({ trackImportRead() {}, sanitizeHTML: value => String(value), escapeHTML: value => String(value),
    structuredClone, console, calendarDate, parentBirthYear, politicalDates, AppState: state, DEFAULT_CLASSES: ['OTQS1', 'OTQS2'], POLITICAL_BADGES: {},
    document: { getElementById(id) {
      if (!elements.has(id)) elements.set(id, { disabled: false, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {} });
      return elements.get(id);
    } },
    FileReader: class { readAsArrayBuffer() { this.onload({ target: { result: new ArrayBuffer(0) } }); } },
    XLSX: { read: () => ({ SheetNames: ['data'], Sheets: { data: {} } }), utils: { sheet_to_json: () => rows } },
    getCurrentUserClassScope: () => null, normalizeDateVN: value => value, parseExcelDate: value => value,
    normalizePoliticalStatus: value => value || 'DOAN_VIEN', normalizeAchievements: value => value || [], formatVN: value => value,
    reviewImport: async options => { if (!options.confirm) messages.push({ message: [options.details, ...(options.rows || [])].join('\n'), type: options.title.includes('Kết quả') ? 'success' : 'error' }); return true; },
    importExcelTransaction: async () => ({ unavailable: true }),
    showToast: (message, type) => messages.push({ message, type }),
    upsertStudentsBulkToSupabase: async students => { writes.push(students); return { error: null }; },
    logAuditTrail() {}, persistData: async () => {}, populateStudentPicker() {}, updateAllViews() {}, hideModal() {},
    buildDeterministicStudentId: code => `hv_${code.toLowerCase()}`,
  });
  const from = source.indexOf('export function detectExcelColumnMapping');
  const to = source.indexOf('export function setProfileFormReadOnly', from);
  vm.runInContext('let quickImportParsedRows = [];\n' + source.slice(from, to).replace(/^export /gm, '')
    + '\nglobalThis.parsedRows = () => quickImportParsedRows;', context);
  context.handleQuickImportFileUpload({});
  return { context, messages, writes, state, elements };
}

test('profile Excel updates only the matching code despite identical names and preserves class', async () => {
  const { context, writes, state } = profileContext([['Mã HV', 'Họ và Tên', 'SĐT'], [' hv02 ', 'Trùng tên', 'new2']]);
  assert.equal(context.parsedRows()[0].code, 'HV02');
  await context.executeQuickImport();
  assert.equal(state.students[0].phone, 'old1');
  assert.equal(state.students[1].phone, 'new2');
  assert.equal(state.students[1].class, 'OTQS2');
  assert.equal(writes[0].length, 1);
  assert.equal(writes[0][0].code, 'HV02');
});

for (const [label, rows, message] of [
  ['missing code', [['Mã HV','Họ và Tên'], ['','Trùng tên']], /thiếu Mã HV/],
  ['missing code column', [['Họ và Tên','SĐT'], ['Trùng tên','123']], /phải có cột Mã HV/],
  ['duplicate code', [['Mã HV','Họ và Tên'], ['HV01','Tên A'], [' hv01 ','Tên B']], /bị lặp/],
]) {
  test(`profile Excel rejects ${label} without allowing partial writes`, async () => {
    const { context, writes, messages, elements } = profileContext(rows);
    assert.equal(context.parsedRows().length, 0);
    assert.match(messages.at(-1).message, message);
    assert.equal(elements.get('btnExecuteQuickImport').disabled, true);
    await context.executeQuickImport();
    assert.equal(writes.length, 0);
  });
}

test('a short numeric code is treated as an explicit ID, not a row number or name match', async () => {
  const { context, writes } = importContext();
  context.AppState.students = [{ id: 'existing', code: 'HVOLD', name: 'Một', class: 'OTQS1' }];
  context.parsedImportData.rows[0][0] = '12';
  await context.executeExcelImport();
  assert.equal(writes[0][0].code, '12');
  assert.equal(context.AppState.students.find(student => student.code === 'HVOLD').id, 'existing');
});

test('code-only profile updates preserve the current name when the name column is absent', async () => {
  const { context, state } = profileContext([['Mã HV','SĐT'], ['HV02','new2']]);
  await context.executeQuickImport();
  assert.equal(state.students[1].name, 'Trùng tên');
  assert.equal(state.students[1].phone, 'new2');
  assert.equal(state.students[0].phone, 'old1');
});

test('officer cannot execute either import or change local cadet data', async () => {
  const grade = importContext();
  grade.context.AppState.role = 'company_officer';
  await grade.context.executeExcelImport();
  assert.equal(grade.writes.length, 0);
  assert.equal(grade.context.AppState.students.length, 0);
  const profile = profileContext([['Mã HV','Họ và Tên','SĐT'], ['HV02','Trùng tên','new2']]);
  profile.state.role = 'company_officer';
  await profile.context.executeQuickImport();
  assert.equal(profile.writes.length, 0);
  assert.equal(profile.state.students[1].phone, 'old2');
});

test('profile import distinguishes official and joined dates even when Excel columns are reordered', () => {
  const { context, messages } = profileContext([
    ['Mã HV','Ngày vào Đảng chính thức','Diện chính trị','Ngày vào Đảng'],
    ['HV02','3/4/2025','DANG_VIEN_CHINH_THUC','1/2/2024'],
  ]);
  assert.equal(messages.length, 0);
  assert.equal(context.parsedRows()[0].party_joined_date, '2024-02-01');
  assert.equal(context.parsedRows()[0].official_party_date, '2025-04-03');
});


test('an explicitly blank political status defaults to union member, while an omitted column preserves it', () => {
  const setup = state => Object.assign(state.students[1], { politicalStatus: 'DANG_VIEN_CHINH_THUC', party_joined_date: '2023-01-01', official_party_date: '2024-01-01' });
  const blank = profileContext([['Mã HV','Diện chính trị'], ['HV02','']], setup).context.parsedRows()[0];
  assert.equal(blank.politicalStatus, 'DOAN_VIEN');
  assert.equal(blank.party_joined_date, null);
  assert.equal(blank.official_party_date, null);
  const omitted = profileContext([['Mã HV','SĐT'], ['HV02','123']], setup).context.parsedRows()[0];
  assert.equal(omitted.politicalStatus, 'DANG_VIEN_CHINH_THUC');
  assert.equal(omitted.party_joined_date, '2023-01-01');
});


test('Excel loading exposes busy state and restores the button after a failed save', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const { context, button } = importContext('src/js/grades.js', { upsertStudentsBulkToSupabase: async () => { await pending; throw new Error('Unavailable'); } });
  const work = context.executeExcelImport();
  assert.equal(button.disabled,true);
  assert.equal(button.attributes['aria-busy'],'true');
  assert.equal(button.textContent,'Đang xử lý...');
  release(); await work;
  assert.equal(button.disabled,false);
  assert.equal(button.attributes['aria-busy'],undefined);
  assert.equal(button.textContent,'Nhập');
});

test('grade preview cancellation sends no writes and restores staged state', async () => {
  const { context, writes } = importContext('src/js/grades.js', { reviewImport: async () => false });
  await context.executeExcelImport();
  assert.equal(writes.length, 0);
  assert.equal(context.AppState.students.length, 0);
  assert.ok(context.parsedImportData);
});

test('atomic grade import uses one transaction and never falls back after transaction errors', async () => {
  let calls = 0;
  const { context, writes, messages } = importContext('src/js/grades.js', {
    importExcelTransaction: async payload => { calls++; assert.equal(payload.grades[0].score, 7.5); throw Object.assign(new Error('SQL rejected'), {confirmedRollback:true}); },
  });
  await context.executeExcelImport();
  assert.equal(calls, 1);
  assert.equal(writes.length, 0);
  assert.equal(context.AppState.students.length, 0);
  assert.match(messages.at(-1).message, /0 dòng thành công; 1 dòng thất bại/);
});

test('a configured subject named Ngoại ngữ is imported as a course, not discarded as certificate metadata', async () => {
  const { context, writes } = importContext('src/js/grades.js', {
    resolveSubjectByCompositeKey: () => ({id:'nn'}),
  });
  context.AppState.subjects.push({id:'nn',name:'Ngoại ngữ cơ bản 1',semester:1,credits:3,category:'common'});
  context.parsedImportData.headers[3]='Ngoại ngữ cơ bản 1';
  await context.executeExcelImport();
  assert.equal(writes.at(-1)[0].subjectId,'nn');
  assert.equal(writes.at(-1)[0].score,7.5);
});
