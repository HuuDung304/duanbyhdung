import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendAuditLog, loadAuditLogs, clearAuditLogs } from '../src/js/database/audit.js';
import { saveUnitSettingsToSupabase } from '../src/js/database/repository.js';

test('concurrent account logs survive settings writes, reload on Admin and clear without deleting settings', async () => {
  const originalFetch = globalThis.fetch, originalState = globalThis.AppState;
  const legacy = { timestamp: '2026-11-01 09:00:00', actor: 'Admin', reason: 'Cũ' };
  const rows = new Map([['daidoi460', { unit_id: 'daidoi460', required_lang_standard: 'B1', audit_logs: [legacy] }]]);
  globalThis.AppState = { role: 'class_leader_TTG2' };
  globalThis.fetch = async (url, options = {}) => {
    const query = new URL(url).searchParams;
    if (options.method === 'POST') {
      for (const row of JSON.parse(options.body)) rows.set(row.unit_id, { ...rows.get(row.unit_id), ...row });
      return new Response('');
    }
    const filter = query.get('unit_id');
    const matching = [...rows.values()].filter(row => filter.startsWith('eq.')
      ? row.unit_id === filter.slice(3) : row.unit_id.startsWith(filter.slice(6, -1)));
    if (options.method === 'DELETE') {
      for (const row of matching) rows.delete(row.unit_id);
      return new Response('');
    }
    return new Response(JSON.stringify(matching));
  };
  try {
    const a = { id: 'a', createdAt: '2026-11-02T09:00:00Z', actor: 'Tài khoản Lớp TTG2', class: 'TTG2', oldVal: 0, newVal: 8 };
    const b = { id: 'b', createdAt: '2026-11-02T09:01:00Z', actor: 'Học viên', class: 'OTQS1', reason: 'Sửa hồ sơ' };
    await Promise.all([appendAuditLog(a), appendAuditLog(b)]);
    await saveUnitSettingsToSupabase({ auditLogs: [], locks: {} });
    assert.deepEqual((await loadAuditLogs()).map(log => log.id || 'legacy'), ['b', 'a', 'legacy']);
    assert.equal(rows.get('daidoi460').required_lang_standard, 'B1');
    await appendAuditLog(a); // Retries keep the same event identity.
    assert.equal((await loadAuditLogs()).length, 3);
    await assert.rejects(clearAuditLogs(), /Chỉ Admin/);
    globalThis.AppState.role = 'company_officer';
    await assert.rejects(appendAuditLog(a), /cán bộ chỉ được xem/);
    globalThis.AppState.role = 'admin';
    await clearAuditLogs();
    assert.deepEqual(await loadAuditLogs(), []);
    assert.equal(rows.size, 1);
    assert.equal(rows.get('daidoi460').required_lang_standard, 'B1');
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.AppState = originalState;
  }
});
