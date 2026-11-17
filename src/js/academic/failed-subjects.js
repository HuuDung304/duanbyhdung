import { offeringClasses } from '../subjects/offerings.js';
import { getSupabaseClient, executeWithRetry } from '../database/client.js';

const PREFIX = 'failed-subject:';
export const hasScore = value => value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
export const isFailedSubject = (state, studentId, subjectId) => Boolean(state.failedSubjectMarks?.[studentId]?.[subjectId]) || (hasScore(state.grades?.[studentId]?.[subjectId]) && Number(state.grades[studentId][subjectId]) < 4);
export function failedSubjectSummary(state, student, subjects) {
  const failed = subjects.filter(subject => isFailedSubject(state, student.id, subject.id));
  return { count: failed.length, credits: failed.reduce((sum, subject) => sum + (Number(subject.credits) || 0), 0), subjects: failed };
}
export function canMarkFailedSubject(state, student) {
  if (!student || state.role === 'company_officer') return false;
  if (state.role === 'admin') return true;
  if (state.role === 'class_leader_' + student.class) return true;
  return Boolean(state.role === 'student' && (state.currentUser?.studentId === student.id || (state.currentUser?.code && state.currentUser.code.toUpperCase() === student.code?.toUpperCase())));
}
export async function loadFailedSubjectMarks() {
  const marks = {};
  for (let offset = 0; ; offset += 500) {
    const result = await executeWithRetry(() => getSupabaseClient().from('unit_settings').select('unit_id,locks').ilike('unit_id', PREFIX + '%').order('unit_id').range(offset, offset + 499));
    if (result.error || !Array.isArray(result.data)) throw new Error('Không tải được lịch sử rớt môn.');
    for (const row of result.data) {
      const mark = row.locks?.failed_subject;
      if (row.unit_id?.startsWith(PREFIX) && mark?.active === true && typeof mark.studentId === 'string' && typeof mark.subjectId === 'string') {
        (marks[mark.studentId] ||= {})[mark.subjectId] = true;
      }
    }
    if (result.data.length < 500) return marks;
  }
}
export async function saveFailedSubjectMark(state, studentId, subjectId, active) {
  const student = state.students.find(item => item.id === studentId);
  const subject = state.subjects.find(item => item.id === subjectId);
  if (!subject || !canMarkFailedSubject(state, student) || !state.subjects.some(item => item.id === subjectId && offeringClasses(item).includes(student.class))) throw new Error('Không có quyền đánh dấu môn này.');
  const unit_id = PREFIX + encodeURIComponent(studentId) + ':' + encodeURIComponent(subjectId);
  const row = { unit_id, locks: { failed_subject: { studentId, subjectId, active: Boolean(active) } }, updated_at: new Date().toISOString() };
  const result = await getSupabaseClient().from('unit_settings').upsert(row, { onConflict: 'unit_id' }).select('unit_id');
  if (result.error || !Array.isArray(result.data) || result.data.length !== 1) throw new Error('Chưa lưu được dấu rớt môn. Kiểm tra kết nối rồi thử lại.');
  (state.failedSubjectMarks[studentId] ||= {})[subjectId] = Boolean(active);
}
