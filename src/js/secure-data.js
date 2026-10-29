import { authenticatedIdentity, authenticationGeneration } from './auth-session.js';
let clientProvider;
let seenGeneration = -1;
const versions = new Map();
let settings = null;
export function configureSecureData(getClient) { clientProvider = getClient; }
function resetForSession() {
  const current = authenticationGeneration();
  if (current !== seenGeneration) { versions.clear(); settings = null; seenGeneration = current; }
}
const recordKey = (table, row) => `${table}:${table === 'grades' ? `${row.student_id}__${row.subject_id}` : table === 'languages' ? row.student_id : row.id}`;
export function rememberServerRows(table, rows) {
  resetForSession();
  for (const row of rows || []) versions.set(recordKey(table, row), Number(row.revision) || 0);
}
export function rememberSettings(row) { resetForSession(); settings = structuredClone(row); }
function expectedRows(table, rows) {
  return rows.map(row => ({ ...row, _expected_revision: versions.get(recordKey(table, row)) || 0 }));
}
export async function secureRpc(name, args = {}) {
  resetForSession();
  if (!authenticatedIdentity()) throw new Error('Bạn cần đăng nhập trước khi truy cập dữ liệu.');
  const started = authenticationGeneration();
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await clientProvider().rpc(name, args);
    if (started !== authenticationGeneration()) throw new Error('Phiên đăng nhập đã thay đổi.');
    if (!result.error) return result.data;
    const error = result.error;
    const transient = [429,502,503,504].includes(error.status) || ['AbortError','TypeError'].includes(error.name);
    if (!transient || attempt === 2) {
      throw Object.assign(new Error(error.code === '40001' ? 'Dữ liệu đã được cập nhật từ thiết bị khác. Hãy tải lại rồi lưu.' : error.message || 'Không lưu được dữ liệu.'), { code: error.code, status: error.status });
    }
    await new Promise(resolve => setTimeout(resolve, 250 * 2 ** attempt));
  }
}
export async function writeAcademicTransaction({ students = [], subjects = [], grades = [], languages = [] } = {}) {
  resetForSession();
  const result = await secureRpc('dd460_apply_import', {
    p_students: expectedRows('students', students), p_subjects: expectedRows('subjects', subjects),
    p_grades: expectedRows('grades', grades), p_languages: expectedRows('languages', languages), p_operation_id: crypto.randomUUID()
  });
  for (const change of result?.changes || []) rememberServerRows(change.table, [change.row]);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('dd460-database-written'));
  return { data: result, error: null };
}
export async function deleteAcademicRecord(kind, id = null) {
  resetForSession();
  const table = kind === 'student' ? 'students' : 'subjects';
  const result = await secureRpc('dd460_delete', { p_kind: kind, p_id: id, p_expected: id ? versions.get(`${table}:${id}`) || 0 : null, p_operation_id: crypto.randomUUID() });
  if (id) versions.delete(`${table}:${id}`);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('dd460-database-written'));
  return { data: result, error: null };
}
export async function writeUnitSettings(state) {
  resetForSession();
  if (authenticatedIdentity()?.type !== 'admin') return { data: null, error: null };
  if (!settings) throw new Error('Chưa tải cấu hình đơn vị. Hãy tải lại trước khi lưu.');
  const changes = {}, expected = {};
  for (const [key,value] of Object.entries(state.locks || {})) {
    if (!/^(OTQS1|OTQS2|TTG1|TTG2|XMCB)(_year_[1-5]|_([1-9]|10))$/.test(key)) continue;
    if (value !== settings.locks?.[key]) { changes[key] = value; if (settings.locks?.[key] !== undefined) expected[key] = settings.locks[key]; }
  }
  const standard = state.requiredLangStandard !== settings.required_lang_standard ? state.requiredLangStandard : null;
  if (!Object.keys(changes).length && !standard) return { data: null, error: null };
  const result = await secureRpc('dd460_update_settings', { p_changes: changes, p_expected: expected, p_standard: standard, p_expected_standard: settings.required_lang_standard, p_operation_id: crypto.randomUUID() });
  rememberSettings(result);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('dd460-database-written'));
  return { data: result, error: null };
}
