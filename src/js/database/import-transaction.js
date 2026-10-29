import { SUPABASE_KEY, SUPABASE_URL, beginSupabaseWrite, endSupabaseWrite, getSupabaseClient, getSupabaseConnectionConfig } from './client.js';
import { assertDatabaseWriteAllowed } from '../profile-rules.js';
import { mapStudentToDbRow, mapSubjectToDbRow } from './mappers.js';

export async function importExcelTransaction({ students = [], subjects = [], grades = [], createOnly = false }) {
  assertDatabaseWriteAllowed();
  const payload = {
    students: students.map(mapStudentToDbRow),
    subjects: subjects.map(mapSubjectToDbRow),
    grades: grades.map(g => ({ id: `${g.studentId}__${g.subjectId}`, student_id: String(g.studentId), subject_id: String(g.subjectId), score: Number(g.score), updated_at: new Date().toISOString() })),
    languages: [], // Profile imports never change existing certificates.
    create_only: createOnly
  };
  getSupabaseClient();
  const { url, key } = getSupabaseConnectionConfig();
  const config = { url: url || SUPABASE_URL, key: key || SUPABASE_KEY };
  beginSupabaseWrite();
  try {
    const response = await fetch(`${config.url.replace(/\/+$/, '')}/rest/v1/rpc/dd460_import_excel`, {
      method: 'POST', headers: { apikey: config.key, Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload }), signal: AbortSignal.timeout(45000)
    });
    const result = await response.json();
    if (response.status === 404 && result.code === 'PGRST202') return { unavailable: true };
    if (!response.ok) {
      const error = new Error(result.message || 'Giao dịch nhập Excel thất bại');
      error.confirmedRollback = /^[0-9A-Z]{5}$/.test(String(result.code || '')) || /^PGRST/.test(String(result.code || ''));
      throw error;
    }
    return { atomic: true, data: result };
  } finally { endSupabaseWrite(); }
}
