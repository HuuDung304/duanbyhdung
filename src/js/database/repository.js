import { TABLES, beginSupabaseWrite, endSupabaseWrite, executeWithRetry, getSupabaseClient } from './client.js';
import { assertDatabaseWriteAllowed } from '../profile-rules.js';
import { buildDeterministicStudentId, mapDbRowToLanguage, mapDbRowToStudent, mapDbRowToSubject, mapLanguageToDbRow, mapStudentToDbRow, mapSubjectToDbRow } from './mappers.js';
import { safeUpsertRows, upsertBatches } from './batches.js';

const inFlightLoads = new Map();

// Read every page: Supabase limits the number of rows returned by one request.
// A stable ordering prevents records moving between page boundaries.
async function loadTablePages(client, table, orderColumns, columns = '*') {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = await executeWithRetry(() => {
      let query = client.from(table).select(columns);
      for (const column of orderColumns) query = query.order(column, { ascending: true });
      return query.range(offset, offset + pageSize - 1);
    });
    if (result.error) throw new Error(`Không thể tải bảng ${table}`, { cause: result.error });
    if (!Array.isArray(result.data)) throw new Error(`Dữ liệu bảng ${table} không hợp lệ`);
    rows.push(...result.data);
    if (result.data.length < pageSize) return { data: rows, error: null };
  }
}

/**
 * 1. Tải toàn bộ dữ liệu thực tế từ 5 bảng trên Supabase.
 *    - Dùng `.maybeSingle()` cho bảng cấu hình đơn vị (`unit_settings`).
 *    - Sử dụng Single-flight Promise để tránh gửi lặp truy vấn khi khởi tạo.
 *    - Nếu bảng trống, trả về mảng rỗng `[]` và object rỗng `{}` (Tuyệt đối không Auto-Seed).
 */
export async function loadAllDataFromSupabase(unitId = 'daidoi460') {
  if (inFlightLoads.has(unitId)) {
    return inFlightLoads.get(unitId);
  }

  const loadPromise = (async () => {
    const client = getSupabaseClient();
    const [studentsRes, subjectsRes, gradesRes, languagesRes, settingsRes] = await Promise.all([
      loadTablePages(client, TABLES.STUDENTS, ['code']),
      loadTablePages(client, TABLES.SUBJECTS, ['semester', 'id']),
      loadTablePages(client, TABLES.GRADES, ['student_id', 'subject_id'], 'student_id,subject_id,score'),
      loadTablePages(client, TABLES.LANGUAGES, ['student_id']),
      executeWithRetry(() => client.from(TABLES.UNIT_SETTINGS).select('unit_id,required_lang_standard,locks,audit_logs').eq('unit_id', unitId).maybeSingle())
    ]);

    if (settingsRes.error) {
      throw new Error('Không thể tải cấu hình đơn vị', { cause: settingsRes.error });
    }

    let students = Array.isArray(studentsRes.data)
      ? studentsRes.data.map(mapDbRowToStudent).filter(Boolean)
      : [];

    let subjects = Array.isArray(subjectsRes.data)
      ? subjectsRes.data.map(mapDbRowToSubject).filter(Boolean)
      : [];

    let grades = {};
    if (Array.isArray(gradesRes.data)) {
      gradesRes.data.forEach(r => {
        if (!r || !r.student_id || !r.subject_id) return;
        if (!grades[r.student_id]) grades[r.student_id] = {};
        if (r.score !== null && r.score !== undefined && !isNaN(r.score)) {
          grades[r.student_id][r.subject_id] = Number(r.score);
        }
      });
    }

    let languages = {};
    if (Array.isArray(languagesRes.data)) {
      languagesRes.data.forEach(r => {
        if (!r || !r.student_id) return;
        languages[r.student_id] = mapDbRowToLanguage(r);
      });
    }

    const settingsData = settingsRes && settingsRes.data ? settingsRes.data : null;
    const rawLocks = (settingsData && settingsData.locks && typeof settingsData.locks === 'object')
      ? { ...settingsData.locks }
      : {};

    delete rawLocks.__dd460_cloud_snapshot;

    return {
      students,
      subjects,
      grades,
      languages,
      locks: rawLocks,
      requiredLangStandard: (settingsData && settingsData.required_lang_standard) ? settingsData.required_lang_standard : 'A2',
      auditLogs: (settingsData && Array.isArray(settingsData.audit_logs)) ? settingsData.audit_logs : []
    };
  })();

  inFlightLoads.set(unitId, loadPromise);
  try {
    return await loadPromise;
  } finally {
    inFlightLoads.delete(unitId);
  }
}

/**
 * 2. Tra cứu trực tiếp Học viên theo Mã học viên (`code`) trên bảng `students` của Supabase
 *    - Tối ưu hóa cho 70-80 học viên đăng nhập đồng thời:
 *      + Kiểm tra nhanh trong bộ nhớ nếu dữ liệu đã tải sẵn.
 *      + Dùng `.eq('code', cleanCode).maybeSingle()` tận dụng trực tiếp B-Tree UNIQUE Index trên cột `code`,
 *        và fallback sang `.ilike('code', cleanCode).maybeSingle()` nếu cần.
 *      + Bọc trong `executeWithRetry` để tự động chống timeout / nghẽn mạng.
 */
export async function findStudentByCodeOnSupabase(studentCode, fallbackStudents = []) {
  const cleanCode = String(studentCode || '').trim().toUpperCase();
  if (!cleanCode) return null;

  // Ưu tiên 1: Nếu bộ nhớ cục bộ đã đồng bộ danh sách học viên từ Supabase thì khớp nhanh tức thì
  if (Array.isArray(fallbackStudents) && fallbackStudents.length > 0) {
    const cached = fallbackStudents.find(s => s && String(s.code || '').trim().toUpperCase() === cleanCode);
    if (cached) return cached;
  }

  try {
    const client = getSupabaseClient();

    // Ưu tiên 2: Truy vấn chính xác theo UNIQUE Index cột `code` với `.maybeSingle()`
    const exactRes = await executeWithRetry(
      () => client.from(TABLES.STUDENTS).select('*').eq('code', cleanCode).maybeSingle(),
      { maxAttempts: 3, baseDelayMs: 120, timeoutMs: 7500 }
    );

    if (exactRes && !exactRes.error && exactRes.data) {
      return mapDbRowToStudent(exactRes.data);
    }

    // Ưu tiên 3: Fallback tìm kiếm không phân biệt hoa thường bằng `.ilike().maybeSingle()`
    const ilikeRes = await executeWithRetry(
      () => client.from(TABLES.STUDENTS).select('*').ilike('code', cleanCode).maybeSingle(),
      { maxAttempts: 2, baseDelayMs: 150, timeoutMs: 7500 }
    );

    if (ilikeRes && !ilikeRes.error && ilikeRes.data) {
      return mapDbRowToStudent(ilikeRes.data);
    }
  } catch (err) {
    console.warn('Supabase findStudentByCode error:', err);
  }

  if (Array.isArray(fallbackStudents) && fallbackStudents.length > 0) {
    return fallbackStudents.find(s => s && String(s.code || '').trim().toUpperCase() === cleanCode) || null;
  }
  return null;
}

/**
 * 3. Thêm mới hoặc Cập nhật 1 Học viên trực tiếp trên bảng `students` (và bảng `languages` đi kèm)
 *    - Dùng `.maybeSingle()` để kiểm tra ID hiện có theo mã `code`, chống xung đột Race Condition.
 */
export async function upsertStudentToSupabase(student, langObj = null) {
  assertDatabaseWriteAllowed();
  const row = mapStudentToDbRow(student);
  if (!row) return { error: 'Invalid student' };
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    const existingRes = await executeWithRetry(
      () => client.from(TABLES.STUDENTS).select('id, code').eq('code', row.code).maybeSingle(),
      { maxAttempts: 2, baseDelayMs: 120 }
    );

    if (existingRes && existingRes.data && existingRes.data.id) {
      row.id = existingRes.data.id;
      student.id = existingRes.data.id;
    }

    const res = await safeUpsertRows(client, TABLES.STUDENTS, [row], 'code', 'id');
    if (res?.error) return res;

    if (langObj && typeof langObj === 'object') {
      const langRow = mapLanguageToDbRow(row.id, langObj);
      const languageResult = await safeUpsertRows(client, TABLES.LANGUAGES, [langRow], 'student_id');
      if (languageResult?.error) return languageResult;
    }
    return res;
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 4. Thêm/Cập nhật hàng loạt Học viên (Khi nhập nhanh từ file Excel)
 *    - Khử trùng lặp theo `code` trong cùng 1 file Excel
 *    - Tự động đối chiếu `id` hiện có trên bảng `students` để không bao giờ bị lỗi trùng `code` (23505)
 *    - Chia lô tối đa 200 học viên/256 KiB; báo lỗi nếu schema thiếu cột
 */
export async function upsertStudentsBulkToSupabase(studentsList = [], languagesMap = {}, { createOnly = false } = {}) {
  assertDatabaseWriteAllowed();
  if (!Array.isArray(studentsList) || studentsList.length === 0) return { data: [], error: null };
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    const existingCodeToId = new Map();
    const codes = [...new Set(studentsList.filter(s => s && s.code)
      .map(s => String(s.code).trim().toUpperCase()))];
    // Only look up students in this import, avoiding full-roster reads per upload.
    for (let offset = 0; offset < codes.length; offset += 100) {
      const result = await executeWithRetry(() => client.from(TABLES.STUDENTS)
        .select('id, code').in('code', codes.slice(offset, offset + 100)));
      if (result.error) return result;
      for (const row of result.data || []) {
        existingCodeToId.set(String(row.code).trim().toUpperCase(), String(row.id));
      }
    }

    const dedupedByCode = new Map();
    studentsList.forEach(s => {
      if (!s || !s.code) return;
      const cleanCode = String(s.code).trim().toUpperCase();
      if (!cleanCode) return;

      const matchedDbId = existingCodeToId.get(cleanCode) || buildDeterministicStudentId(cleanCode, s.id);
      const oldId = s.id;
      s.id = matchedDbId;
      s.code = cleanCode;

      if (oldId && oldId !== matchedDbId && languagesMap && languagesMap[oldId] && !languagesMap[matchedDbId]) {
        languagesMap[matchedDbId] = languagesMap[oldId];
      }

      // Grade uploads must not overwrite a roster row created by another user.
      if (createOnly && existingCodeToId.has(cleanCode)) return;
      const dbRow = mapStudentToDbRow(s);
      if (dbRow) {
        dbRow.id = matchedDbId;
        dedupedByCode.set(cleanCode, dbRow);
      }
    });

    const studentRows = Array.from(dedupedByCode.values());
    if (studentRows.length === 0) return { data: [], error: null };

    const studentsResult = await upsertBatches(client, TABLES.STUDENTS, studentRows,
      'code', createOnly ? null : 'id', createOnly, 200);
    if (studentsResult.error) return studentsResult;

    // Profile Excel files contain no language columns; preserve existing certificates.
    const langRows = studentRows.filter(sr => !existingCodeToId.has(sr.code)).map(sr => {
      const l = (languagesMap && languagesMap[sr.id]) || {
        lang: 'Tiếng Nga',
        currentLevel: sr.current_lang_level || 'Chưa đạt',

        A1: 'Đ',
        A21: 'Đ',
        A22: 'Đ',
        B11: 'CT',
        B12: 'CT'
      };
      return mapLanguageToDbRow(sr.id, l);
    });

    const languagesResult = await upsertBatches(client, TABLES.LANGUAGES, langRows,
      'student_id', null, true, 250);
    if (languagesResult.error) return languagesResult;

    return { data: studentRows, error: null };
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 5. Xóa vĩnh viễn 1 Học viên trên Supabase (Xóa cả điểm và chứng chỉ ngoại ngữ liên quan)
 */
export async function deleteStudentFromSupabase(studentId) {
  assertDatabaseWriteAllowed();
  if (!studentId) return;
  const client = getSupabaseClient();
  const sid = String(studentId);
  beginSupabaseWrite();
  try {
    await Promise.all([
      executeWithRetry(() => client.from(TABLES.GRADES).delete().eq('student_id', sid)),
      executeWithRetry(() => client.from(TABLES.LANGUAGES).delete().eq('student_id', sid))
    ]);
    return await executeWithRetry(() => client.from(TABLES.STUDENTS).delete().eq('id', sid));
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 6. Xóa vĩnh viễn TẤT CẢ Học viên trên Supabase (Làm trống 100% danh sách học viên, điểm số, ngoại ngữ)
 */
export async function deleteAllStudentsFromSupabase() {
  assertDatabaseWriteAllowed();
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    await Promise.all([
      executeWithRetry(() => client.from(TABLES.GRADES).delete().neq('id', '__none__')),
      executeWithRetry(() => client.from(TABLES.LANGUAGES).delete().neq('student_id', '__none__'))
    ]);
    return await executeWithRetry(() => client.from(TABLES.STUDENTS).delete().neq('id', '__none__'));
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 7. Thêm mới hoặc Cập nhật 1 Môn học trên bảng `subjects` của Supabase
 */
export async function upsertSubjectToSupabase(subject) {
  assertDatabaseWriteAllowed();
  const row = mapSubjectToDbRow(subject);
  if (!row) return { error: 'Invalid subject' };
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    return await safeUpsertRows(client, TABLES.SUBJECTS, [row], 'id');
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 7b. Thêm mới hoặc Cập nhật hàng loạt Môn học trên bảng `subjects` của Supabase
 *     Hỗ trợ khi import bảng điểm từ Excel có các môn học mới theo khóa kết hợp (course_name + class_code + semester).
 */
export async function upsertSubjectsBulkToSupabase(subjectsList = []) {
  assertDatabaseWriteAllowed();
  if (!Array.isArray(subjectsList) || subjectsList.length === 0) return { data: [], error: null };
  const rows = subjectsList.map(mapSubjectToDbRow).filter(Boolean);
  if (rows.length === 0) return { data: [], error: null };
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    return await upsertBatches(client, TABLES.SUBJECTS, rows, 'id', null, false, 250);
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 8. Xóa vĩnh viễn 1 Môn học trên bảng `subjects` của Supabase (Xóa kèm điểm số của môn đó)
 */
export async function deleteSubjectFromSupabase(subjectId) {
  assertDatabaseWriteAllowed();
  if (!subjectId) return;
  const client = getSupabaseClient();
  const subId = String(subjectId);
  beginSupabaseWrite();
  try {
    await executeWithRetry(() => client.from(TABLES.GRADES).delete().eq('subject_id', subId));
    return await executeWithRetry(() => client.from(TABLES.SUBJECTS).delete().eq('id', subId));
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 9. Xóa vĩnh viễn tất cả các môn học trong một Học kỳ cụ thể trên Supabase
 */
export async function deleteSubjectsByIdsFromSupabase(subjectIds = []) {
  assertDatabaseWriteAllowed();
  if (!Array.isArray(subjectIds) || subjectIds.length === 0) return;
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    await executeWithRetry(() => client.from(TABLES.GRADES).delete().in('subject_id', subjectIds));
    return await executeWithRetry(() => client.from(TABLES.SUBJECTS).delete().in('id', subjectIds));
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 10. Xóa vĩnh viễn TẤT CẢ Môn học của toàn khóa (10 Học kỳ) trên Supabase
 */
export async function deleteAllSubjectsFromSupabase() {
  assertDatabaseWriteAllowed();
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    await executeWithRetry(() => client.from(TABLES.GRADES).delete().neq('id', '__none__'));
    return await executeWithRetry(() => client.from(TABLES.SUBJECTS).delete().neq('id', '__none__'));
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 11. Lưu / Cập nhật 1 ô Điểm số trực tiếp lên bảng `grades` của Supabase
 *     Tận dụng khóa UNIQUE (student_id, subject_id) để chống Race Condition khi nhiều lớp nhập điểm cùng lúc.
 */
export async function upsertGradeToSupabase(studentId, subjectId, score) {
  assertDatabaseWriteAllowed();
  if (!studentId || !subjectId) return;
  const client = getSupabaseClient();
  const row = {
    id: `${studentId}__${subjectId}`,
    student_id: String(studentId),
    subject_id: String(subjectId),
    score: Number(score),
    updated_at: new Date().toISOString()
  };
  beginSupabaseWrite();
  try {
    return await safeUpsertRows(client, TABLES.GRADES, [row], 'student_id,subject_id', 'id');
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 12. Xóa vĩnh viễn 1 ô Điểm số khi người dùng xóa trắng ô điểm trên bảng
 */
export async function deleteGradeFromSupabase(studentId, subjectId) {
  assertDatabaseWriteAllowed();
  if (!studentId || !subjectId) return;
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    return await executeWithRetry(() =>
      client
        .from(TABLES.GRADES)
        .delete()
        .eq('student_id', String(studentId))
        .eq('subject_id', String(subjectId))
    );
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 13. Lưu hàng loạt Điểm số (Khi nhập điểm từ file Excel)
 */
export async function upsertGradesBulkToSupabase(gradeEntries = []) {
  assertDatabaseWriteAllowed();
  if (!Array.isArray(gradeEntries) || gradeEntries.length === 0) return { data: [], error: null };
  const client = getSupabaseClient();
  const nowIso = new Date().toISOString();

  const deduped = new Map();
  gradeEntries.forEach(item => {
    if (!item || !item.studentId || !item.subjectId) return;
    const key = `${item.studentId}__${item.subjectId}`;
    deduped.set(key, {
      id: key,
      student_id: String(item.studentId),
      subject_id: String(item.subjectId),
      score: Number(item.score),
      updated_at: nowIso
    });
  });

  const rows = Array.from(deduped.values());
  if (rows.length === 0) return { data: [], error: null };

  beginSupabaseWrite();
  try {
    return await upsertBatches(client, TABLES.GRADES, rows, 'student_id,subject_id', 'id');
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 14. Lưu / Cập nhật Chứng chỉ ngoại ngữ của 1 Học viên trên bảng `languages`
 */
export async function upsertLanguageToSupabase(studentId, langObj) {
  assertDatabaseWriteAllowed();
  if (!studentId || !langObj) return;
  const client = getSupabaseClient();
  const row = mapLanguageToDbRow(studentId, langObj);
  beginSupabaseWrite();
  try {
    return await safeUpsertRows(client, TABLES.LANGUAGES, [row], 'student_id');
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 15. Lưu cấu hình đơn vị (Khóa sổ điểm, Chuẩn ngoại ngữ yêu cầu, Nhật ký hệ thống) lên bảng `unit_settings`.
 *     Không ghi đè toàn bộ danh sách học viên/điểm số vào `unit_settings` để tránh xung đột Race Condition
 *     khi 70-80 người cùng thao tác đồng thời.
 */
export async function saveUnitSettingsToSupabase(appState, unitId = 'daidoi460') {
  assertDatabaseWriteAllowed();
  if (!appState) return;
  const client = getSupabaseClient();
  const cleanLocks = { ...(appState.locks || {}) };
  delete cleanLocks.__dd460_cloud_snapshot;

  const row = {
    unit_id: unitId || 'daidoi460',
    required_lang_standard: appState.requiredLangStandard || 'A2',
    locks: cleanLocks,
    audit_logs: Array.isArray(appState.auditLogs) ? appState.auditLogs.slice(0, 100) : [],
    updated_at: new Date().toISOString()
  };

  if (globalThis.AppState?.role && globalThis.AppState.role !== 'admin') delete row.required_lang_standard;
  beginSupabaseWrite();
  try {
    return await safeUpsertRows(client, TABLES.UNIT_SETTINGS, [row], 'unit_id');
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 16. Đăng ký lắng nghe thay đổi thời gian thực (Realtime Postgres Changes) trên tất cả các bảng Supabase.
 *     Hỗ trợ Delta Update theo từng dòng thay đổi để không gây nghẽn mạng khi 70-80 người cùng thao tác.
 */
