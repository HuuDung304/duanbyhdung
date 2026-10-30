import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchStore } from '../src/js/research/store.js';
const student = { id: 'a', code: '001', name: 'An', class: 'OTQS1' };
const state = { role: 'admin', students: [student], currentUser: { type: 'admin' } };
const project = { id: 'r1', title: 'Đề tài', year: 1, leaderId: 'a', participants: [{ studentId: 'a', code: '001', name: 'An', class: 'OTQS1' }], objective: '', content: '', product: '', advisors: [], awards: [] };
const row = { unit_id: 'research-project:r1', locks: { research_project: project, revision: 'original' } };
function fixture({ race = false, failure = false } = {}) {
  const calls = [];
  let stored = structuredClone(row);
  const client = { from(table) {
    const call = { table, method: 'GET', filters: [] }; calls.push(call);
    const query = {
      select() { return query; }, eq(key, value) { call.filters.push([key, value]); return query; },
      ilike() { return query; }, order() { return query; }, range() { return query; },
      maybeSingle() { call.single = true; return query; },
      update(body) { call.method = 'PATCH'; call.body = body; return query; },
      insert(body) { call.method = 'POST'; call.body = body; return query; },
      then(resolve, reject) {
        if (call.method === 'GET') return Promise.resolve({ data: call.single ? structuredClone(stored) : [structuredClone(stored)], error: null }).then(resolve, reject);
        if (failure) return Promise.resolve({ data: null, error: { message: 'Write failed' } }).then(resolve, reject);
        if (race) stored.locks.revision = 'concurrent';
        if (call.method === 'PATCH' && call.filters.find(([key]) => key === 'locks->>revision')?.[1] !== stored.locks.revision) return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        stored = { ...stored, ...call.body };
        return Promise.resolve({ data: [structuredClone(stored)], error: null }).then(resolve, reject);
      }
    }; return query;
  } };
  return { client, calls, current: () => stored };
}
test('research save detects a race after the preflight read and never overwrites the concurrent revision', async () => {
  const f = fixture({ race: true }), store = createResearchStore(() => state, () => f.client, () => 'new-revision');
  await assert.rejects(store.save({ ...project, title: 'Không được ghi đè' }, { ...project, revision: 'original' }), /phiên khác/);
  assert.equal(f.current().locks.research_project.title, 'Đề tài');
  assert.equal(f.current().locks.revision, 'concurrent');
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1);
});
test('research persistence modifies only its project record and preserves the unit configuration namespace', async () => {
  const f = fixture(), store = createResearchStore(() => state, () => f.client, () => 'new-revision');
  const saved = await store.save({ ...project, title: 'Đã sửa' }, { ...project, revision: 'original' });
  assert.equal(saved.title, 'Đã sửa'); assert.equal(saved.revision, 'new-revision');
  const write = f.calls.find(c => c.method === 'PATCH');
  assert.deepEqual(write.filters.find(([k]) => k === 'unit_id'), ['unit_id', 'research-project:r1']);
  assert.equal(Object.hasOwn(write.body, 'audit_logs'), false);
  assert.equal(Object.hasOwn(write.body, 'required_lang_standard'), false);
});
test('research never retries ambiguous writes, and read-only roles cannot initiate a mutation', async () => {
  const f = fixture({ failure: true }), store = createResearchStore(() => state, () => f.client, () => 'new-revision');
  await assert.rejects(store.save({ ...project }, { ...project, revision: 'original' }), /Chưa xác nhận/);
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1);
  const readonly = createResearchStore(() => ({ ...state, role: 'company_officer' }), () => f.client);
  await assert.rejects(readonly.save({ ...project }, { ...project, revision: 'original' }), /quyền/);
  assert.equal(f.calls.filter(c => c.method === 'PATCH').length, 1);
});
