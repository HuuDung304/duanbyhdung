/**
 * MODULE: src/js/supabase.js
 * Cấu hình kết nối chính thức với Supabase Cloud Database (@supabase/supabase-js v2)
 * cho dự án "Hệ thống Quản lý Điểm và Hồ sơ Quân nhân Đại đội 460".
 *
 * Thông tin kết nối Supabase:
 * - Project Reference : wxiimjbseovuxmvolswh
 * - Supabase URL      : https://wxiimjbseovuxmvolswh.supabase.co
 * - Publishable Key   : sb_publishable_cTXx8S_xLJpKB4YmvRr_Fw_IbhbFxw2
 *
 * Đặc điểm kỹ thuật:
 * 1. Trạng thái ban đầu trống 100% (0 Học viên, 0 Môn học, Không Auto-Seeding).
 * 2. Không sử dụng localStorage để lưu dữ liệu ứng dụng.
 * 3. Mọi thao tác Thêm (INSERT/UPSERT), Sửa (UPDATE), Xóa (DELETE), Nhập nhanh Excel (Bulk Upsert)
 *    đều thực thi trực tiếp trên các bảng Supabase (`students`, `subjects`, `grades`, `languages`, `unit_settings`).
 * 4. Cơ chế chống xung đột Realtime (Write Lock) & Tự động tương thích Schema khi nhập từ Excel.
 */

export const SUPABASE_PROJECT_REF = 'wxiimjbseovuxmvolswh';
export const SUPABASE_URL = 'https://wxiimjbseovuxmvolswh.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_cTXx8S_xLJpKB4YmvRr_Fw_IbhbFxw2';

export const SUPABASE_CONFIG = Object.freeze({
  projectRef: SUPABASE_PROJECT_REF,
  url: SUPABASE_URL,
  publishableKey: SUPABASE_KEY,
  unitId: 'daidoi460'
});

export const TABLES = Object.freeze({
  STUDENTS: 'students',
  SUBJECTS: 'subjects',
  GRADES: 'grades',
  LANGUAGES: 'languages',
  UNIT_SETTINGS: 'unit_settings'
});

// Biến kiểm soát trạng thái ghi dữ liệu để ngăn Realtime tự ghi đè khi đang import Excel hàng loạt
let activeWriteCount = 0;
let lastLocalWriteAt = 0;

export function beginSupabaseWrite() {
  activeWriteCount++;
  lastLocalWriteAt = Date.now();
}

export function endSupabaseWrite() {
  activeWriteCount = Math.max(0, activeWriteCount - 1);
  lastLocalWriteAt = Date.now();
}

export function isSupabaseWriteBusy() {
  return activeWriteCount > 0 || (Date.now() - lastLocalWriteAt < 900);
}

/**
 * Khởi tạo REST Fallback Client trong trường hợp CDN tải chậm
 */
function createRestFallbackClient(baseUrl, apiKey) {
  const cleanUrl = String(baseUrl || SUPABASE_URL).replace(/\/+$/, '');
  const headers = {
    apikey: apiKey || SUPABASE_KEY,
    Authorization: `Bearer ${apiKey || SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  class QueryBuilder {
    constructor(table) {
      this.table = table;
      this.method = 'GET';
      this.queryParams = [];
      this.bodyData = null;
      this.preferHeaders = ['return=representation'];
      this.isSingle = false;
      this.isMaybeSingle = false;
    }
    select(cols = '*') {
      if (this.method === 'GET') {
        this.queryParams.push(`select=${encodeURIComponent(cols)}`);
      }
      return this;
    }
    insert(payload) {
      this.method = 'POST';
      this.bodyData = payload;
      return this;
    }
    upsert(payload, opts = {}) {
      this.method = 'POST';
      this.bodyData = payload;
      this.preferHeaders.push('resolution=merge-duplicates');
      if (opts && opts.onConflict) {
        this.queryParams.push(`on_conflict=${encodeURIComponent(opts.onConflict)}`);
      }
      return this;
    }
    update(payload) {
      this.method = 'PATCH';
      this.bodyData = payload;
      return this;
    }
    delete() {
      this.method = 'DELETE';
      return this;
    }
    eq(col, val) {
      this.queryParams.push(`${encodeURIComponent(col)}=eq.${encodeURIComponent(val)}`);
      return this;
    }
    neq(col, val) {
      this.queryParams.push(`${encodeURIComponent(col)}=neq.${encodeURIComponent(val)}`);
      return this;
    }
    ilike(col, val) {
      this.queryParams.push(`${encodeURIComponent(col)}=ilike.${encodeURIComponent(val)}`);
      return this;
    }
    in(col, vals = []) {
      const list = Array.isArray(vals) ? vals.map(v => `"${String(v).replace(/"/g, '\\"')}"`).join(',') : '';
      this.queryParams.push(`${encodeURIComponent(col)}=in.(${encodeURIComponent(list)})`);
      return this;
    }
    order(col, { ascending = true } = {}) {
      this.queryParams.push(`order=${encodeURIComponent(col)}.${ascending ? 'asc' : 'desc'}`);
      return this;
    }
    limit(n) {
      this.queryParams.push(`limit=${Number(n) || 1}`);
      return this;
    }
    maybeSingle() {
      this.isMaybeSingle = true;
      this.queryParams.push('limit=1');
      return this;
    }
    single() {
      this.isSingle = true;
      this.queryParams.push('limit=1');
      return this;
    }
    async _exec() {
      if (typeof fetch !== 'function') {
        return { data: this.isMaybeSingle || this.isSingle ? null : [], error: null };
      }
      const qs = this.queryParams.length > 0 ? `?${this.queryParams.join('&')}` : '';
      const url = `${cleanUrl}/rest/v1/${this.table}${qs}`;
      try {
        const res = await fetch(url, {
          method: this.method,
          headers: {
            ...headers,
            Prefer: this.preferHeaders.join(',')
          },
          body: this.bodyData !== null ? JSON.stringify(this.bodyData) : undefined
        });
        if (!res.ok) {
          const errText = await res.text();
          let parsedErr = { message: errText, status: res.status };
          try {
            const j = JSON.parse(errText);
            parsedErr = { ...j, message: j.message || j.details || errText, status: res.status };
          } catch (_) {}
          return { data: null, error: parsedErr };
        }
        const text = await res.text();
        const parsed = text ? JSON.parse(text) : [];
        if (this.isMaybeSingle || this.isSingle) {
          const item = Array.isArray(parsed) ? (parsed[0] || null) : parsed;
          return { data: item, error: null };
        }
        return { data: parsed, error: null };
      } catch (err) {
        return { data: null, error: err };
      }
    }
    then(onFulfilled, onRejected) {
      return this._exec().then(onFulfilled, onRejected);
    }
  }

  return {
    from(table) {
      return new QueryBuilder(table);
    },
    channel() {
      return {
        on() { return this; },
        subscribe() { return this; },
        unsubscribe() {}
      };
    },
    removeChannel() {}
  };
}

let supabaseClientInstance = null;

export function initSupabaseClient(customUrl = SUPABASE_URL, customKey = SUPABASE_KEY) {
  const targetUrl = (customUrl || SUPABASE_URL).trim();
  const targetKey = (customKey || SUPABASE_KEY).trim();

  if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClientInstance = window.supabase.createClient(targetUrl, targetKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    return supabaseClientInstance;
  }

  if (!supabaseClientInstance) {
    supabaseClientInstance = createRestFallbackClient(targetUrl, targetKey);
  }
  return supabaseClientInstance;
}

export const supabase = initSupabaseClient(SUPABASE_URL, SUPABASE_KEY);

export function getSupabaseClient() {
  if (
    typeof window !== 'undefined' &&
    window.supabase &&
    typeof window.supabase.createClient === 'function' &&
    (!supabaseClientInstance || !supabaseClientInstance.realtime)
  ) {
    supabaseClientInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabaseClientInstance || supabase;
}

// ============================================================================
// HÀM CHUYỂN ĐỔI DỮ LIỆU GIỮA DATABASE (SNAKE_CASE) VÀ WEB APP (CAMELCASE)
// ============================================================================

export function buildDeterministicStudentId(code, existingId = '') {
  if (existingId && String(existingId).trim()) return String(existingId).trim();
  const cleanCode = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (cleanCode) return `hv_${cleanCode}`;
  return 'hv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

export function mapStudentToDbRow(s) {
  if (!s || typeof s !== 'object') return null;
  const cleanCode = String(s.code || '').trim().toUpperCase();
  if (!cleanCode) return null;
  const id = buildDeterministicStudentId(cleanCode, s.id);
  return {
    id,
    code: cleanCode,
    name: String(s.name || ('Quân nhân ' + cleanCode)).trim(),
    rank: String(s.rank || 'Hạ sĩ').trim(),
    class: String(s.class || 'OTQS1').trim().toUpperCase(),
    position: String(s.position || s.role || 'Học viên').trim(),
    role: String(s.role || s.position || 'Học viên').trim(),
    dob: String(s.dob || '').trim(),
    enlistment_date: String(s.enlistmentDate ?? s.enlistment_date ?? '').trim(),
    phone: String(s.phone || '').trim(),
    hometown: String(s.hometown || '').trim(),
    permanent_address: String(s.permanentAddress ?? s.permanent_address ?? '').trim(),
    current_address: String(s.currentAddress ?? s.current_address ?? '').trim(),
    political_status: String(s.politicalStatus ?? s.political_status ?? 'DOAN_VIEN').trim(),
    party_joined_date: s.party_joined_date ? String(s.party_joined_date).trim() : null,
    official_party_date: s.official_party_date ? String(s.official_party_date).trim() : null,
    father_name: String(s.father_name || '').trim(),
    father_birth_date: String(s.father_birth_date || '').trim(),
    father_hometown: String(s.father_hometown || '').trim(),
    father_job: String(s.father_job || '').trim(),
    mother_name: String(s.mother_name || '').trim(),
    mother_birth_date: String(s.mother_birth_date || '').trim(),
    mother_hometown: String(s.mother_hometown || '').trim(),
    mother_job: String(s.mother_job || '').trim(),
    achievements: Array.isArray(s.achievements) ? s.achievements : [],
    current_lang_level: String(s.currentLangLevel ?? s.current_lang_level ?? 'A2').trim(),
    it_standard: String(s.itStandard ?? s.it_standard ?? 'Đạt chuẩn CNTT cơ bản').trim(),
    updated_at: new Date().toISOString()
  };
}

export function mapDbRowToStudent(row) {
  if (!row || typeof row !== 'object') return null;
  const cleanCode = String(row.code || '').trim().toUpperCase();
  return {
    id: String(row.id || buildDeterministicStudentId(cleanCode)),
    code: cleanCode,
    name: String(row.name || '').trim(),
    rank: row.rank || 'Hạ sĩ',
    class: String(row.class || 'OTQS1').trim().toUpperCase(),
    position: row.position || row.role || 'Học viên',
    role: row.role || row.position || 'Học viên',
    dob: row.dob || '',
    enlistmentDate: row.enlistment_date ?? row.enlistmentDate ?? '',
    phone: row.phone || '',
    hometown: row.hometown || '',
    permanentAddress: row.permanent_address ?? row.permanentAddress ?? '',
    currentAddress: row.current_address ?? row.currentAddress ?? '',
    politicalStatus: row.political_status ?? row.politicalStatus ?? 'DOAN_VIEN',
    party_joined_date: row.party_joined_date || null,
    official_party_date: row.official_party_date || null,
    father_name: row.father_name || '',
    father_birth_date: row.father_birth_date || '',
    father_hometown: row.father_hometown || '',
    father_job: row.father_job || '',
    mother_name: row.mother_name || '',
    mother_birth_date: row.mother_birth_date || '',
    mother_hometown: row.mother_hometown || '',
    mother_job: row.mother_job || '',
    achievements: Array.isArray(row.achievements) ? row.achievements : [],
    currentLangLevel: row.current_lang_level ?? row.currentLangLevel ?? 'A2',
    itStandard: row.it_standard ?? row.itStandard ?? 'Đạt chuẩn CNTT cơ bản'
  };
}

export function mapSubjectToDbRow(sub) {
  if (!sub || typeof sub !== 'object') return null;
  const isSpec = sub.category === 'specialized';
  const targetClasses = isSpec && Array.isArray(sub.targetClasses)
    ? sub.targetClasses.map(c => String(c || '').trim().toUpperCase()).filter(Boolean)
    : [];
  return {
    id: String(sub.id || ('sub_' + Date.now())),
    code: String(sub.code || '').trim().toUpperCase(),
    name: String(sub.name || '').trim(),
    semester: Number(sub.semester) || 1,
    credits: Number(sub.credits) || 3,
    category: isSpec ? 'specialized' : 'common',
    target_classes: isSpec ? targetClasses : [],
    target_class: isSpec ? (targetClasses.join(', ') || sub.targetClass || 'OTQS1') : 'all',
    updated_at: new Date().toISOString()
  };
}

export function mapDbRowToSubject(row) {
  if (!row || typeof row !== 'object') return null;
  const isSpec = row.category === 'specialized';
  const targetClasses = Array.isArray(row.target_classes)
    ? row.target_classes
    : (Array.isArray(row.targetClasses) ? row.targetClasses : []);
  return {
    id: String(row.id),
    code: String(row.code || '').trim().toUpperCase(),
    name: String(row.name || '').trim(),
    semester: Number(row.semester) || 1,
    credits: Number(row.credits) || 3,
    category: isSpec ? 'specialized' : 'common',
    targetClasses: isSpec ? targetClasses : [],
    targetClass: isSpec ? (row.target_class || targetClasses.join(', ') || 'OTQS1') : 'all'
  };
}

export function mapLanguageToDbRow(studentId, langObj = {}) {
  return {
    student_id: String(studentId),
    lang: String(langObj.lang || 'Tiếng Nga'),
    current_level: String(langObj.currentLevel ?? langObj.current_level ?? 'A2'),
    it_standard: String(langObj.itStandard ?? langObj.it_standard ?? 'Đạt chuẩn CNTT cơ bản'),
    a1: String(langObj.A1 ?? langObj.a1 ?? 'Đ'),
    a21: String(langObj.A21 ?? langObj.a21 ?? 'Đ'),
    a22: String(langObj.A22 ?? langObj.a22 ?? 'Đ'),
    b11: String(langObj.B11 ?? langObj.b11 ?? 'CT'),
    b12: String(langObj.B12 ?? langObj.b12 ?? 'CT'),
    extra_cert: String(langObj.extraCert ?? langObj.extra_cert ?? ''),
    updated_at: new Date().toISOString()
  };
}

export function mapDbRowToLanguage(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    lang: row.lang || 'Tiếng Nga',
    currentLevel: row.current_level || 'A2',
    itStandard: row.it_standard || 'Đạt chuẩn CNTT cơ bản',
    A1: row.a1 || 'Đ',
    A21: row.a21 || 'Đ',
    A22: row.a22 || 'Đ',
    B11: row.b11 || 'CT',
    B12: row.b12 || 'CT',
    extraCert: row.extra_cert || ''
  };
}

/**
 * Hàm Upsert thông minh có khả năng tự động thích ứng Schema:
 * - Nếu bảng trên Supabase thiếu một số cột mở rộng (lỗi PGRST204 / 42703),
 *   hàm tự động loại bỏ cột thiếu đó và thử lại ngay lập tức để dữ liệu luôn vào được bảng.
 * - Nếu xung đột khóa UNIQUE (ví dụ cột `code` đã tồn tại với `id` khác), tự động chuyển sang
 *   upsert theo `onConflict: 'code'` hoặc cập nhật từng bản ghi.
 */
async function safeUpsertRows(client, tableName, rowsInput, primaryConflictCol = 'id', fallbackConflictCol = null) {
  if (!rowsInput) return { data: [], error: null };
  const rowsArray = Array.isArray(rowsInput) ? rowsInput : [rowsInput];
  if (rowsArray.length === 0) return { data: [], error: null };

  let workingRows = rowsArray.map(r => ({ ...r }));
  let conflictCol = primaryConflictCol;

  for (let attempt = 0; attempt < 18; attempt++) {
    const res = await client.from(tableName).upsert(workingRows, { onConflict: conflictCol });
    if (!res || !res.error) {
      return res;
    }

    const errMsg = String(res.error.message || res.error.details || JSON.stringify(res.error));

    // 1. Kiểm tra nếu lỗi do thiếu cột trên bảng Supabase (PGRST204 hoặc 42703)
    const missingColMatch =
      errMsg.match(/Could not find the '([^']+)' column/i) ||
      errMsg.match(/column "([^"]+)" of relation/i) ||
      errMsg.match(/column "([^"]+)" does not exist/i);

    if (missingColMatch && missingColMatch[1]) {
      const missingCol = missingColMatch[1];
      console.warn(`[Supabase Auto-Adapt] Bảng ${tableName} chưa có cột '${missingCol}', tự động bỏ qua cột này khi ghi.`);
      workingRows = workingRows.map(r => {
        const copy = { ...r };
        delete copy[missingCol];
        return copy;
      });
      continue;
    }

    // 2. Kiểm tra nếu lỗi xung đột khóa UNIQUE (23505) trên cột `code` khi đang upsert theo `id`
    if (
      fallbackConflictCol &&
      conflictCol !== fallbackConflictCol &&
      (errMsg.includes('23505') || errMsg.toLowerCase().includes('duplicate key') || errMsg.toLowerCase().includes('unique constraint'))
    ) {
      conflictCol = fallbackConflictCol;
      continue;
    }

    return res;
  }

  return { data: null, error: { message: `Không thể ghi vào bảng ${tableName} sau nhiều lần thử.` } };
}

// ============================================================================
// CÁC HÀM TRUY VẤN TRỰC TIẾP TRÊN SUPABASE (SELECT, INSERT, UPDATE, DELETE)
// ============================================================================

/**
 * 1. Tải toàn bộ dữ liệu thực tế từ 5 bảng trên Supabase khi khởi động hoặc khi có thay đổi.
 *    Nếu bảng trống, trả về mảng rỗng `[]` và object rỗng `{}` (Tuyệt đối không Auto-Seed).
 */
export async function loadAllDataFromSupabase(unitId = 'daidoi460') {
  const client = getSupabaseClient();
  const [studentsRes, subjectsRes, gradesRes, languagesRes, settingsRes] = await Promise.all([
    client.from(TABLES.STUDENTS).select('*').order('code', { ascending: true }),
    client.from(TABLES.SUBJECTS).select('*').order('semester', { ascending: true }),
    client.from(TABLES.GRADES).select('*'),
    client.from(TABLES.LANGUAGES).select('*'),
    client.from(TABLES.UNIT_SETTINGS).select('*').eq('unit_id', unitId).maybeSingle()
  ]);

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

  // Đồng bộ bổ trợ từ bản gương đám mây (__dd460_cloud_snapshot) trong unit_settings
  // giúp bảo toàn 100% dữ liệu nhập từ Excel ngay cả khi bảng phụ chưa kịp migrate đủ cột
  const cloudSnapshot = rawLocks.__dd460_cloud_snapshot || null;
  delete rawLocks.__dd460_cloud_snapshot;

  if (cloudSnapshot && typeof cloudSnapshot === 'object') {
    if (students.length === 0 && Array.isArray(cloudSnapshot.students) && cloudSnapshot.students.length > 0) {
      students = cloudSnapshot.students.map(mapDbRowToStudent).filter(Boolean);
    } else if (students.length > 0 && Array.isArray(cloudSnapshot.students) && cloudSnapshot.students.length > 0) {
      const snapByCode = new Map();
      cloudSnapshot.students.forEach(cs => {
        if (cs && cs.code) snapByCode.set(String(cs.code).trim().toUpperCase(), cs);
      });
      students = students.map(s => {
        const extra = snapByCode.get(s.code);
        return extra ? { ...extra, ...s, id: s.id } : s;
      });
    }

    if (subjects.length === 0 && Array.isArray(cloudSnapshot.subjects) && cloudSnapshot.subjects.length > 0) {
      subjects = cloudSnapshot.subjects.map(mapDbRowToSubject).filter(Boolean);
    }

    if (Object.keys(grades).length === 0 && cloudSnapshot.grades && typeof cloudSnapshot.grades === 'object') {
      grades = cloudSnapshot.grades;
    }

    if (Object.keys(languages).length === 0 && cloudSnapshot.languages && typeof cloudSnapshot.languages === 'object') {
      languages = cloudSnapshot.languages;
    }
  }

  return {
    students,
    subjects,
    grades,
    languages,
    locks: rawLocks,
    requiredLangStandard: (settingsData && settingsData.required_lang_standard) ? settingsData.required_lang_standard : 'A2',
    auditLogs: (settingsData && Array.isArray(settingsData.audit_logs)) ? settingsData.audit_logs : []
  };
}

/**
 * 2. Tra cứu trực tiếp Học viên theo Mã học viên (`code`) trên bảng `students` của Supabase
 *    Phục vụ cổng Đăng nhập Học viên bằng Mã học viên.
 */
export async function findStudentByCodeOnSupabase(studentCode, fallbackStudents = []) {
  const cleanCode = String(studentCode || '').trim().toUpperCase();
  if (!cleanCode) return null;

  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from(TABLES.STUDENTS)
      .select('*')
      .ilike('code', cleanCode)
      .maybeSingle();

    if (!error && data) {
      return mapDbRowToStudent(data);
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
 */
export async function upsertStudentToSupabase(student, langObj = null) {
  const row = mapStudentToDbRow(student);
  if (!row) return { error: 'Invalid student' };
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    // Kiểm tra xem mã học viên đã tồn tại trên DB chưa để đồng bộ đúng ID
    const existingRes = await client
      .from(TABLES.STUDENTS)
      .select('id, code')
      .ilike('code', row.code)
      .maybeSingle();

    if (existingRes && existingRes.data && existingRes.data.id) {
      row.id = existingRes.data.id;
      student.id = existingRes.data.id;
    }

    const res = await safeUpsertRows(client, TABLES.STUDENTS, [row], 'id', 'code');

    if (langObj && typeof langObj === 'object') {
      const langRow = mapLanguageToDbRow(row.id, langObj);
      await safeUpsertRows(client, TABLES.LANGUAGES, [langRow], 'student_id');
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
 *    - Chia batch 50 bản ghi/lần và tự động tương thích Schema nếu bảng thiếu cột
 */
export async function upsertStudentsBulkToSupabase(studentsList = [], languagesMap = {}) {
  if (!Array.isArray(studentsList) || studentsList.length === 0) return { data: [], error: null };
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    // Bước 1: Lấy danh sách (id, code) đang có trên Supabase để khớp ID chuẩn xác
    const existingCodeToId = new Map();
    try {
      const { data: existingRows } = await client.from(TABLES.STUDENTS).select('id, code');
      if (Array.isArray(existingRows)) {
        existingRows.forEach(er => {
          if (er && er.code && er.id) {
            existingCodeToId.set(String(er.code).trim().toUpperCase(), String(er.id));
          }
        });
      }
    } catch (e) {
      console.warn('Không thể tải danh sách mã HV hiện có, dùng ID xác định:', e);
    }

    // Bước 2: Khử trùng lặp theo `code` và chuẩn hóa ID
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

      const dbRow = mapStudentToDbRow(s);
      if (dbRow) {
        dbRow.id = matchedDbId;
        dedupedByCode.set(cleanCode, dbRow);
      }
    });

    const studentRows = Array.from(dedupedByCode.values());
    if (studentRows.length === 0) return { data: [], error: null };

    // Bước 3: Chia thành từng lô (batch 50 dòng) và Upsert lên bảng `students`
    const BATCH_SIZE = 50;
    let lastError = null;
    for (let i = 0; i < studentRows.length; i += BATCH_SIZE) {
      const chunk = studentRows.slice(i, i + BATCH_SIZE);
      const res = await safeUpsertRows(client, TABLES.STUDENTS, chunk, 'id', 'code');
      if (res && res.error) {
        lastError = res.error;
        console.warn('Supabase bulk students upsert chunk warning:', res.error);
      }
    }

    // Bước 4: Đồng bộ bảng `languages` cho toàn bộ học viên vừa nhập
    const langRows = studentRows.map(sr => {
      const l = (languagesMap && languagesMap[sr.id]) || {
        lang: 'Tiếng Nga',
        currentLevel: sr.current_lang_level || 'A2',
        itStandard: sr.it_standard || 'Đạt chuẩn CNTT cơ bản',
        A1: 'Đ',
        A21: 'Đ',
        A22: 'Đ',
        B11: 'CT',
        B12: 'CT'
      };
      return mapLanguageToDbRow(sr.id, l);
    });

    for (let i = 0; i < langRows.length; i += BATCH_SIZE) {
      const chunk = langRows.slice(i, i + BATCH_SIZE);
      await safeUpsertRows(client, TABLES.LANGUAGES, chunk, 'student_id');
    }

    return { data: studentRows, error: lastError };
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 5. Xóa vĩnh viễn 1 Học viên trên Supabase (Xóa cả điểm và chứng chỉ ngoại ngữ liên quan)
 */
export async function deleteStudentFromSupabase(studentId) {
  if (!studentId) return;
  const client = getSupabaseClient();
  const sid = String(studentId);
  beginSupabaseWrite();
  try {
    await Promise.all([
      client.from(TABLES.GRADES).delete().eq('student_id', sid),
      client.from(TABLES.LANGUAGES).delete().eq('student_id', sid)
    ]);
    return await client.from(TABLES.STUDENTS).delete().eq('id', sid);
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 6. Xóa vĩnh viễn TẤT CẢ Học viên trên Supabase (Làm trống 100% danh sách học viên, điểm số, ngoại ngữ)
 */
export async function deleteAllStudentsFromSupabase() {
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    await Promise.all([
      client.from(TABLES.GRADES).delete().neq('id', '__none__'),
      client.from(TABLES.LANGUAGES).delete().neq('student_id', '__none__')
    ]);
    return await client.from(TABLES.STUDENTS).delete().neq('id', '__none__');
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 7. Thêm mới hoặc Cập nhật 1 Môn học trên bảng `subjects` của Supabase
 */
export async function upsertSubjectToSupabase(subject) {
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
 * 8. Xóa vĩnh viễn 1 Môn học trên bảng `subjects` của Supabase (Xóa kèm điểm số của môn đó)
 */
export async function deleteSubjectFromSupabase(subjectId) {
  if (!subjectId) return;
  const client = getSupabaseClient();
  const subId = String(subjectId);
  beginSupabaseWrite();
  try {
    await client.from(TABLES.GRADES).delete().eq('subject_id', subId);
    return await client.from(TABLES.SUBJECTS).delete().eq('id', subId);
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 9. Xóa vĩnh viễn tất cả các môn học trong một Học kỳ cụ thể trên Supabase
 */
export async function deleteSubjectsByIdsFromSupabase(subjectIds = []) {
  if (!Array.isArray(subjectIds) || subjectIds.length === 0) return;
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    await client.from(TABLES.GRADES).delete().in('subject_id', subjectIds);
    return await client.from(TABLES.SUBJECTS).delete().in('id', subjectIds);
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 10. Xóa vĩnh viễn TẤT CẢ Môn học của toàn khóa (10 Học kỳ) trên Supabase
 */
export async function deleteAllSubjectsFromSupabase() {
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    await client.from(TABLES.GRADES).delete().neq('id', '__none__');
    return await client.from(TABLES.SUBJECTS).delete().neq('id', '__none__');
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 11. Lưu / Cập nhật 1 ô Điểm số trực tiếp lên bảng `grades` của Supabase
 */
export async function upsertGradeToSupabase(studentId, subjectId, score) {
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
    return await safeUpsertRows(client, TABLES.GRADES, [row], 'id');
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 12. Xóa vĩnh viễn 1 ô Điểm số khi người dùng xóa trắng ô điểm trên bảng
 */
export async function deleteGradeFromSupabase(studentId, subjectId) {
  if (!studentId || !subjectId) return;
  const client = getSupabaseClient();
  beginSupabaseWrite();
  try {
    return await client
      .from(TABLES.GRADES)
      .delete()
      .eq('student_id', String(studentId))
      .eq('subject_id', String(subjectId));
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 13. Lưu hàng loạt Điểm số (Khi nhập điểm từ file Excel)
 */
export async function upsertGradesBulkToSupabase(gradeEntries = []) {
  if (!Array.isArray(gradeEntries) || gradeEntries.length === 0) return { data: [], error: null };
  const client = getSupabaseClient();
  const nowIso = new Date().toISOString();

  // Khử trùng lặp theo khóa (studentId__subjectId)
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
    const BATCH_SIZE = 100;
    let lastRes = { data: [], error: null };
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const chunk = rows.slice(i, i + BATCH_SIZE);
      lastRes = await safeUpsertRows(client, TABLES.GRADES, chunk, 'id');
    }
    return lastRes;
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 14. Lưu / Cập nhật Chứng chỉ ngoại ngữ & Chuẩn CNTT của 1 Học viên trên bảng `languages`
 */
export async function upsertLanguageToSupabase(studentId, langObj) {
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
 * 15. Lưu cấu hình đơn vị (Khóa sổ điểm, Chuẩn ngoại ngữ yêu cầu, Nhật ký hệ thống + Bản đồng bộ dự phòng)
 *     lên bảng `unit_settings`
 */
export async function saveUnitSettingsToSupabase(appState, unitId = 'daidoi460') {
  if (!appState) return;
  const client = getSupabaseClient();
  const cleanLocks = { ...(appState.locks || {}) };
  cleanLocks.__dd460_cloud_snapshot = {
    updatedAt: new Date().toISOString(),
    students: Array.isArray(appState.students) ? appState.students : [],
    subjects: Array.isArray(appState.subjects) ? appState.subjects : [],
    grades: (appState.grades && typeof appState.grades === 'object') ? appState.grades : {},
    languages: (appState.languages && typeof appState.languages === 'object') ? appState.languages : {}
  };

  const row = {
    unit_id: unitId || 'daidoi460',
    required_lang_standard: appState.requiredLangStandard || 'A2',
    locks: cleanLocks,
    audit_logs: Array.isArray(appState.auditLogs) ? appState.auditLogs.slice(0, 100) : [],
    updated_at: new Date().toISOString()
  };

  beginSupabaseWrite();
  try {
    return await safeUpsertRows(client, TABLES.UNIT_SETTINGS, [row], 'unit_id');
  } finally {
    endSupabaseWrite();
  }
}

/**
 * 16. Đăng ký lắng nghe thay đổi thời gian thực (Realtime Postgres Changes) trên tất cả các bảng Supabase.
 *     Tự động bỏ qua các sự kiện dội ngược khi máy hiện tại đang trong quá trình ghi / import Excel.
 */
let realtimeChannelInstance = null;
let realtimeDebounceTimer = null;

export function subscribeSupabaseRealtime(onDatabaseChanged) {
  const client = getSupabaseClient();
  if (!client || typeof client.channel !== 'function') return null;

  try {
    if (realtimeChannelInstance && typeof client.removeChannel === 'function') {
      client.removeChannel(realtimeChannelInstance);
    }

    const triggerChange = (tableName) => {
      if (isSupabaseWriteBusy()) return;
      clearTimeout(realtimeDebounceTimer);
      realtimeDebounceTimer = setTimeout(() => {
        if (!isSupabaseWriteBusy() && typeof onDatabaseChanged === 'function') {
          onDatabaseChanged(tableName);
        }
      }, 350);
    };

    realtimeChannelInstance = client
      .channel('dd460-supabase-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.STUDENTS }, () => triggerChange('students'))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.SUBJECTS }, () => triggerChange('subjects'))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.GRADES }, () => triggerChange('grades'))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.LANGUAGES }, () => triggerChange('languages'))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.UNIT_SETTINGS }, () => triggerChange('unit_settings'))
      .subscribe();

    return realtimeChannelInstance;
  } catch (err) {
    console.warn('Không thể đăng ký kênh Realtime Supabase:', err);
    return null;
  }
}

export default supabase;
