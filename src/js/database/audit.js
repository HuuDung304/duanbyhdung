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
  const result = await safeUpsertRows(getSupabaseClient(), TABLES.UNIT_SETTINGS, [{
    unit_id: prefix(unitId) + log.id, audit_logs: [log], updated_at: log.createdAt
  }], 'unit_id');
  if (result?.error) throw new Error(`Không gửi được nhật ký: ${result.error.message || result.error.code || 'Lỗi database'}`, { cause: result.error });
}

const pendingAudit = new Map();
const pendingPrefix = 'dd460_pending_audit:';
let flushing = null;
const storage = () => { try { return globalThis.localStorage; } catch { return null; } };
export async function queueAuditLog(log, unitId = 'daidoi460') {
  const entry = { log, unitId };
  pendingAudit.set(log.id, entry);
  // One key per event: different browser tabs cannot overwrite each other's queue.
  try { storage()?.setItem(pendingPrefix + log.id, JSON.stringify(entry)); } catch { /* Retain in memory if storage is full. */ }
  return flushPendingAuditLogs();
}
export function flushPendingAuditLogs() {
  if (flushing) return flushing.then(() => pendingAudit.size ? flushPendingAuditLogs() : 0);
  flushing = (async () => {
    const saved = storage();
    if (saved) for (let i = 0; i < saved.length; i++) {
      const key = saved.key(i);
      if (!key?.startsWith(pendingPrefix)) continue;
      try {
        const entry = JSON.parse(saved.getItem(key));
        if (entry?.log?.id && entry.unitId) pendingAudit.set(entry.log.id, entry);
      } catch { /* Ignore unrelated malformed entries. */ }
    }
    while (pendingAudit.size) {
      const batch = [...pendingAudit].slice(0, 100);
      assertDatabaseWriteAllowed();
      const result = await safeUpsertRows(getSupabaseClient(), TABLES.UNIT_SETTINGS, batch.map(([, entry]) => ({
        unit_id: prefix(entry.unitId) + entry.log.id, audit_logs: [entry.log], updated_at: entry.log.createdAt
      })), 'unit_id');
      if (result?.error) throw new Error(`Không gửi được nhật ký: ${result.error.message || result.error.code || 'Lỗi database'}`, { cause: result.error });
      for (const [id] of batch) {
        pendingAudit.delete(id);
        try { saved?.removeItem(pendingPrefix + id); } catch { /* An idempotent retry remains safe. */ }
      }
    }
    return pendingAudit.size;
  })().finally(() => { flushing = null; });
  return flushing;
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
  const saved = await safeUpsertRows(client, TABLES.UNIT_SETTINGS, [{ unit_id: unitId, audit_logs: [] }], 'unit_id');
  if (saved?.error) throw new Error('Không thể xóa nhật ký cũ.', { cause: saved.error });
}
