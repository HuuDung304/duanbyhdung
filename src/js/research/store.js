import { getSupabaseClient, executeWithRetry } from '../database/client.js';
import { RESEARCH_PREFIX, canView, normalizeProject } from './model.js';

// Separate records prevent project updates overwriting unit locks or other projects.
// Existing unit_settings JSONB storage requires no schema changes.
export function createResearchStore(getState, getClient = getSupabaseClient, createId = () => crypto.randomUUID()) {
  function decode(row) {
    const project = row?.locks?.research_project;
    if (!row?.unit_id?.startsWith(RESEARCH_PREFIX) || !project || row.unit_id !== RESEARCH_PREFIX + project.id || typeof project.title !== 'string' || !Number.isInteger(project.year) || project.year < 1 || project.year > 5 || !Array.isArray(project.advisors) || !Array.isArray(project.awards) || typeof row.locks.revision !== 'string' || !Array.isArray(project.participants) || !project.participants.every(p => p && typeof p.studentId === 'string') || !project.participants.some(p => p.studentId === project.leaderId)) throw new Error('Dữ liệu đề tài không hợp lệ.');
    return { ...project, revision: row.locks.revision };
  }
  return {
    async load() {
      if (!['admin', 'company_officer', 'student'].includes(getState().role) && !getState().role?.startsWith('class_leader_')) return [];
      const records = [];
      for (let offset = 0; ; offset += 500) {
        const result = await executeWithRetry(() => getClient().from('unit_settings').select('unit_id,locks').ilike('unit_id', RESEARCH_PREFIX + '%').order('unit_id').range(offset, offset + 499));
        if (result.error) throw new Error('Không tải được đề tài. Kiểm tra kết nối rồi bấm Tải lại.');
        if (!Array.isArray(result.data)) throw new Error('Phản hồi danh sách đề tài không hợp lệ.');
        records.push(...result.data.filter(row => row.unit_id?.startsWith(RESEARCH_PREFIX)).map(decode));
        if (result.data.length < 500) break;
      }
      return records;
    },
    async save(input, existing = null) {
      const state = getState();
      let current = null;
      if (existing) {
        const result = await getClient().from('unit_settings').select('unit_id,locks').eq('unit_id', RESEARCH_PREFIX + existing.id).maybeSingle();
        if (result.error || !result.data) throw new Error('Đề tài không còn tồn tại hoặc không tải được. Hãy tải lại.');
        current = decode(result.data);
        if (!canView(current, state)) throw new Error('Bạn không có quyền sửa đề tài này.');
        if (current.revision !== existing.revision) throw new Error('Đề tài vừa được người khác sửa. Hãy tải lại trước khi lưu; nội dung đang nhập vẫn được giữ.');
      }
      const project = normalizeProject({ ...input, memberIds: input.memberIds || input.participants?.map(p => p.studentId) }, state, current);
      if (!project.id) throw new Error('Thiếu mã đề tài.');
      const revision = createId();
      const row = { unit_id: RESEARCH_PREFIX + project.id, locks: { research_project: project, revision }, updated_at: new Date().toISOString() };
      let query = getClient().from('unit_settings');
      query = current ? query.update({ locks: row.locks, updated_at: row.updated_at }).eq('unit_id', row.unit_id).eq('locks->>revision', current.revision) : query.insert(row);
      // Do not retry mutations: a lost response can follow a committed insert/update.
      const result = await query.select('unit_id,locks');
      if (result.error) throw new Error('Chưa xác nhận lưu đề tài. Bấm Tải lại để kiểm tra trước khi thử lại.');
      if (!Array.isArray(result.data) || result.data.length !== 1) throw new Error('Đề tài vừa thay đổi ở phiên khác. Hãy tải lại trước khi lưu.');
      return decode(result.data[0]);
    }
  };
}
