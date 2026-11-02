import { TABLES, getSupabaseClient, executeWithRetry } from './client.js';
import { safeUpsertRows } from './batches.js';
import { assertDatabaseWriteAllowed } from '../profile-rules.js';

// Independent rows prevent concurrent accounts from replacing one shared log array.
const prefix = unitId => `${unitId}:audit:`;
export function mergeAuditLogs(...groups) {
  const unique = new Map();
  for (const log of groups.flat()) {
    if (log && typeof log === 'object') unique.set(log.id || JSON.stringify(log), log);
  }
  return [...unique.values()].sort((a, b) => String(b.createdAt || b.timestamp).localeCompare(String(a.createdAt || a.timestamp))).slice(0, 200);
}

export async function appendAuditLog(log, unitId = 'daidoi460') {
  assertDatabaseWriteAllowed();
  if (!log.id) throw new Error('Nhật ký thiếu mã sự kiện.');
  await safeUpsertRows(getSupabaseClient(), TABLES.UNIT_SETTINGS, [{
    unit_id: prefix(unitId) + log.id, audit_logs: [log], updated_at: log.createdAt
  }], 'unit_id');
}

export async function loadAuditLogs(unitId = 'daidoi460', legacyLogs) {
  const client = getSupabaseClient();
  const events = await executeWithRetry(() => client.from(TABLES.UNIT_SETTINGS)
    .select('unit_id,audit_logs').ilike('unit_id', prefix(unitId) + '%')
    .order('updated_at', { ascending: false }).order('unit_id', { ascending: false }).range(0, 199));
  if (events.error) throw new Error('Không thể tải nhật ký tài khoản.', { cause: events.error });
  if (legacyLogs === undefined) {
    const settings = await executeWithRetry(() => client.from(TABLES.UNIT_SETTINGS)
      .select('audit_logs').eq('unit_id', unitId).maybeSingle());
    if (settings.error) throw new Error('Không thể tải nhật ký cũ.', { cause: settings.error });
    legacyLogs = settings.data?.audit_logs || [];
  }
  return mergeAuditLogs(legacyLogs, ...(events.data || []).map(row => row.audit_logs || []));
}

export async function clearAuditLogs(unitId = 'daidoi460') {
  if (globalThis.AppState?.role !== 'admin') throw new Error('Chỉ Admin được xóa nhật ký.');
  const client = getSupabaseClient();
  const result = await executeWithRetry(() => client.from(TABLES.UNIT_SETTINGS).delete().ilike('unit_id', prefix(unitId) + '%'));
  if (result.error) throw new Error('Không thể xóa nhật ký.', { cause: result.error });
  await safeUpsertRows(client, TABLES.UNIT_SETTINGS, [{ unit_id: unitId, audit_logs: [] }], 'unit_id');
}
