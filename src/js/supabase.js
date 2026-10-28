import { calendarDate, parentBirthYear, readParentYear, politicalDates, assertDatabaseWriteAllowed } from './profile-rules.js';

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
 * Đặc điểm kỹ thuật & Tối ưu hóa Đa người dùng (70-80 người cùng lúc):
 * 1. Singleton Supabase Client duy nhất: Tái sử dụng kết nối, không gọi createClient nhiều lần.
 * 2. Chống nghẽn mạng / Timeout (Auto-Retry + Exponential Backoff + Random Jitter) khi 70-80 người
 *    cùng đăng nhập hoặc gửi truy vấn đồng thời.
 * 3. Sử dụng `.maybeSingle()` an toàn cho toàn bộ truy vấn bản ghi đơn lẻ, không văng lỗi PGRST116.
 * 4. Tận dụng ràng buộc UNIQUE (`students.code`, `grades(student_id, subject_id)`) & Upsert nguyên tử
 *    theo từng dòng (Row-level Atomic Upsert) để triệt tiêu hoàn toàn Race Conditions.
 * 5. Đồng bộ Realtime thông minh theo từng bản ghi (Delta Realtime Sync) + Chống Double Submit.
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

// ============================================================================
// TIỆN ÍCH CHỐNG DOUBLE SUBMIT & KHÓA NÚT BẤM ĐỒNG BỘ ("Đang xử lý..." / "Đang xác thực...")
// ============================================================================
const activeButtonLocks = new WeakSet();

/**
 * Vô hiệu hóa nút bấm ngay lập tức (`disabled = true`), hiển thị trạng thái chờ
 * ("⏳ Đang xử lý..." hoặc "⏳ Đang xác thực...") và chỉ mở lại sau khi Supabase phản hồi.
 */
export async function withButtonLock(btnOrId, loadingText = '⏳ Đang xử lý...', asyncTask) {
  const btn = typeof btnOrId === 'string'
    ? document.getElementById(btnOrId)
    : btnOrId;

  if (btn && activeButtonLocks.has(btn)) {
    return null;
  }

  let originalHtml = '';
  let wasDisabled = false;

  if (btn) {
    activeButtonLocks.add(btn);
    wasDisabled = !!btn.disabled;
    originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
    btn.classList.add('opacity-70', 'cursor-not-allowed');
    btn.textContent = loadingText;
  }

  try {
    return await asyncTask();
  } finally {
    if (btn) {
      activeButtonLocks.delete(btn);
      btn.disabled = wasDisabled;
      btn.removeAttribute('aria-busy');
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
      btn.innerHTML = originalHtml;
    }
  }
}

// Biến kiểm soát trạng thái ghi dữ liệu để ngăn Realtime tự dội ngược khi đang ghi / import Excel
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
  return activeWriteCount > 0 || (Date.now() - lastLocalWriteAt < 650);
}

/**
 * Hàm thực thi truy vấn Supabase kèm Timeout & Retry tự động (Exponential Backoff + Random Jitter)
 * Giúp xử lý êm ái khi 70-80 người dùng cùng bấm Đăng nhập hoặc Lưu dữ liệu trong cùng 1 giây.
 */
export async function executeWithRetry(queryFn, { maxAttempts = 3, baseDelayMs = 150, timeoutMs = 9000 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let timeoutId;
      let result;
      try {
        result = await Promise.race([
          Promise.resolve().then(() => queryFn()),
          new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('SUPABASE_REQUEST_TIMEOUT')), timeoutMs);
          })
        ]);
      } finally {
        clearTimeout(timeoutId);
      }

      if (result && result.error) {
        const status = Number(result.status || result.error.status || result.error.code || 0);
        const msg = String(result.error.message || '').toLowerCase();
        const isTransient =
          status === 408 ||
          status === 429 ||
          status >= 500 ||
          msg.includes('timeout') ||
          msg.includes('fetch') ||
          msg.includes('network') ||
          msg.includes('rate limit') ||
          msg.includes('connection');

        if (isTransient && attempt < maxAttempts) {
          lastError = result.error;
          const jitter = Math.floor(Math.random() * 220);
          await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1) + jitter));
          continue;
        }
      }
      return result;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const jitter = Math.floor(Math.random() * 220);
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1) + jitter));
        continue;
      }
    }
  }
  return { data: null, error: lastError || { message: 'Truy vấn tạm thời gián đoạn do nghẽn mạng' } };
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
      this.preferHeaders[0] = 'return=minimal';
      this.method = 'POST';
      this.bodyData = payload;
      this.preferHeaders.push(opts.ignoreDuplicates ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates');
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
      const clause = `${encodeURIComponent(col)}.${ascending ? 'asc' : 'desc'}`;
      const index = this.queryParams.findIndex(value => value.startsWith('order='));
      if (index === -1) this.queryParams.push(`order=${clause}`);
      else this.queryParams[index] += `,${clause}`;
      return this;
    }
    limit(n) {
      this.queryParams.push(`limit=${Number(n) || 1}`);
      return this;
    }
    range(from, to) {
      this.queryParams.push(`offset=${from}`, `limit=${to - from + 1}`);
      return this;
    }
    maybeSingle() {
      this.isMaybeSingle = true;
      this.queryParams.push('limit=1');
      return this;
    }
    single() {
      this.isMaybeSingle = true;
      this.queryParams.push('limit=1');
      return this;
    }
    async _exec() {
      if (typeof fetch !== 'function') {
        return { data: null, error: new Error('FETCH_UNAVAILABLE') };
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
        const parsed = text ? JSON.parse(text) : (this.method === 'GET' ? [] : null);
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
    _isFallback: true,
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

// ============================================================================
// QUẢN LÝ SINGLETON SUPABASE CLIENT DUY NHẤT TOÀN DỰ ÁN
// ============================================================================
let supabaseClientInstance = null;
let currentClientConfigKey = '';

export function initSupabaseClient(customUrl = SUPABASE_URL, customKey = SUPABASE_KEY) {
  const targetUrl = String(customUrl || SUPABASE_URL).trim();
  const targetKey = String(customKey || SUPABASE_KEY).trim();
  const configSignature = `${targetUrl}::${targetKey}`;

  const globalRef = typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : {});

  // Tái sử dụng đúng 1 instance Singleton nếu đã khởi tạo chính thức với cùng cấu hình
  if (
    supabaseClientInstance &&
    !supabaseClientInstance._isFallback &&
    currentClientConfigKey === configSignature
  ) {
    return supabaseClientInstance;
  }

  if (
    globalRef.__dd460SupabaseSingleton &&
    !globalRef.__dd460SupabaseSingleton._isFallback &&
    globalRef.__dd460SupabaseConfigKey === configSignature
  ) {
    supabaseClientInstance = globalRef.__dd460SupabaseSingleton;
    currentClientConfigKey = configSignature;
    return supabaseClientInstance;
  }

  if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    supabaseClientInstance = window.supabase.createClient(targetUrl, targetKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      realtime: {
        params: {
          eventsPerSecond: 10
        }
      }
    });
    currentClientConfigKey = configSignature;
    globalRef.__dd460SupabaseSingleton = supabaseClientInstance;
    globalRef.__dd460SupabaseConfigKey = configSignature;
    return supabaseClientInstance;
  }

  if (!supabaseClientInstance) {
    supabaseClientInstance = createRestFallbackClient(targetUrl, targetKey);
    currentClientConfigKey = configSignature;
  }
  return supabaseClientInstance;
}

export const supabaseSingleton = initSupabaseClient(SUPABASE_URL, SUPABASE_KEY);

export function getSupabaseClient() {
  if (!supabaseClientInstance || supabaseClientInstance._isFallback) {
    return initSupabaseClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return supabaseClientInstance;
}

// ============================================================================
// HÀM CHUYỂN ĐỔI DỮ LIỆU GIỮA DATABASE (SNAKE_CASE) VÀ WEB APP (CAMELCASE)
// ============================================================================

function normalizeDateFieldToVN(rawVal) {
  if (rawVal === undefined || rawVal === null) return '';
  const s = String(rawVal).trim();
  if (!s || s === '-') return '';
  if (/^\d{4}$/.test(s)) return s;
  const ymd = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (ymd) {
    return `${String(ymd[3]).padStart(2, '0')}/${String(ymd[2]).padStart(2, '0')}/${ymd[1]}`;
  }
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) {
    return `${String(dmy[1]).padStart(2, '0')}/${String(dmy[2]).padStart(2, '0')}/${dmy[3]}`;
  }
  const dmyCompact = s.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (dmyCompact) {
    return `${dmyCompact[1]}/${dmyCompact[2]}/${dmyCompact[3]}`;
  }
  return s;
}

export function buildDeterministicStudentId(code, existingId = '') {
  const cleanCode = String(code || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (cleanCode) return `hv_${cleanCode}`;
  if (existingId && String(existingId).trim()) return String(existingId).trim();
  return 'hv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

export function mapStudentToDbRow(s) {
  if (!s || typeof s !== 'object') return null;
  const cleanCode = String(s.code || '').trim().toUpperCase();
  if (!cleanCode) return null;
  const id = (s.id && String(s.id).trim().startsWith('hv_'))
    ? String(s.id).trim()
    : buildDeterministicStudentId(cleanCode, s.id);
  const politics = politicalDates(s.politicalStatus ?? s.political_status, s.party_joined_date, s.official_party_date);
  return {
    id,
    code: cleanCode,
    name: String(s.name || ('Quân nhân ' + cleanCode)).trim(),
    rank: String(s.rank || 'Hạ sĩ').trim(),
    class: String(s.class || 'OTQS1').trim().toUpperCase(),
    position: String(s.position || s.role || 'Học viên').trim(),
    role: String(s.role || s.position || 'Học viên').trim(),
    dob: calendarDate(s.dob),
    enlistment_date: String(s.enlistmentDate ?? s.enlistment_date ?? '').trim(),
    phone: String(s.phone || '').trim(),
    hometown: String(s.hometown || '').trim(),
    permanent_address: String(s.permanentAddress ?? s.permanent_address ?? '').trim(),
    current_address: String(s.currentAddress ?? s.current_address ?? '').trim(),
    political_status: politics.politicalStatus,
    party_joined_date: politics.party_joined_date,
    official_party_date: politics.official_party_date,
    father_name: String(s.father_name || '').trim(),
    father_birth_date: parentBirthYear(s.father_birth_date),
    father_hometown: String(s.father_hometown || '').trim(),
    father_job: String(s.father_job || '').trim(),
    mother_name: String(s.mother_name || '').trim(),
    mother_birth_date: parentBirthYear(s.mother_birth_date),
    mother_hometown: String(s.mother_hometown || '').trim(),
    mother_job: String(s.mother_job || '').trim(),
    achievements: Array.isArray(s.achievements) ? s.achievements : [],
    current_lang_level: String(s.currentLangLevel ?? s.current_lang_level ?? 'Chưa đạt').trim(),

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
    dob: normalizeDateFieldToVN(row.dob),
    enlistmentDate: row.enlistment_date ?? row.enlistmentDate ?? '',
    phone: row.phone || '',
    hometown: row.hometown || '',
    permanentAddress: row.permanent_address ?? row.permanentAddress ?? '',
    currentAddress: row.current_address ?? row.currentAddress ?? '',
    politicalStatus: row.political_status ?? row.politicalStatus ?? 'DOAN_VIEN',
    party_joined_date: row.party_joined_date ? normalizeDateFieldToVN(row.party_joined_date) : null,
    official_party_date: row.official_party_date ? normalizeDateFieldToVN(row.official_party_date) : null,
    father_name: row.father_name || '',
    father_birth_date: readParentYear(row.father_birth_date),
    father_hometown: row.father_hometown || '',
    father_job: row.father_job || '',
    mother_name: row.mother_name || '',
    mother_birth_date: readParentYear(row.mother_birth_date),
    mother_hometown: row.mother_hometown || '',
    mother_job: row.mother_job || '',
    achievements: Array.isArray(row.achievements) ? row.achievements : [],
    currentLangLevel: row.current_lang_level ?? row.currentLangLevel ?? 'Chưa đạt',

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
    current_level: String(langObj.currentLevel ?? langObj.current_level ?? 'Chưa đạt'),

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
    currentLevel: row.current_level || 'Chưa đạt',

    A1: row.a1 || 'Đ',
    A21: row.a21 || 'Đ',
    A22: row.a22 || 'Đ',
    B11: row.b11 || 'CT',
    B12: row.b12 || 'CT',
    extraCert: row.extra_cert || ''
  };
}

/**
 * Hàm Upsert dùng khóa UNIQUE và báo rõ lỗi schema:
 * - Tận dụng ràng buộc UNIQUE trên database (`id`, `code`, `student_id,subject_id`) để gộp an toàn
 *   khi 70-80 người cùng thao tác đồng thời.
 * - Dừng khi thiếu cột (PGRST204 / 42703), không bỏ dữ liệu để tiếp tục.
 * - Kết hợp `executeWithRetry` để tự động thử lại nếu mạng chập chờn khi tải cao.
 */
async function safeUpsertRows(client, tableName, rowsInput, primaryConflictCol = 'id', fallbackConflictCol = null, ignoreDuplicates = false) {
  assertDatabaseWriteAllowed();
  if (!rowsInput) return { data: [], error: null };
  const rowsArray = Array.isArray(rowsInput) ? rowsInput : [rowsInput];
  if (rowsArray.length === 0) return { data: [], error: null };

  let workingRows = rowsArray.map(r => ({ ...r }));
  let conflictCol = primaryConflictCol;

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await executeWithRetry(
      () => client.from(tableName).upsert(workingRows, { onConflict: conflictCol, ignoreDuplicates }),
      { maxAttempts: 3, baseDelayMs: 140 }
    );
    if (!res || !res.error) {
      return res;
    }

    const errMsg = String(res.error.message || res.error.details || JSON.stringify(res.error));

    // 1. Dừng và báo rõ nếu schema thiếu cột (PGRST204 hoặc 42703)
    const missingColMatch =
      errMsg.match(/Could not find the '([^']+)' column/i) ||
      errMsg.match(/column "([^"]+)" of relation/i) ||
      errMsg.match(/column "([^"]+)" does not exist/i);

    if (missingColMatch && missingColMatch[1]) {
      const missingCol = missingColMatch[1];
      console.warn(`[Supabase Auto-Adapt] Bảng ${tableName} chưa có cột '${missingCol}', dừng ghi để tránh mất dữ liệu.`);
      // Never silently discard Excel columns and report a successful import.
      return { data: null, error: { ...res.error,
        message: `Bảng ${tableName} thiếu cột ${missingCol}. Cần cập nhật schema trước khi nhập dữ liệu.`
      } };
    }

    // 2. Kiểm tra nếu lỗi xung đột khóa UNIQUE (23505) khi nhiều người ghi đồng thời
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

// Limit both record count and UTF-8 payload size. Keep requests sequential so one
// browser does not multiply concurrent writes when many users import together.
function createWriteBatches(rows, maxRows = 500, maxBytes = 256 * 1024) {
  const encoder = new TextEncoder();
  const batches = [];
  let batch = [];
  let bytes = 2; // JSON array brackets
  for (const row of rows) {
    const rowBytes = encoder.encode(JSON.stringify(row)).byteLength;
    if (rowBytes + 2 > maxBytes) {
      throw new Error(`Một bản ghi vượt giới hạn ${maxBytes / 1024} KiB; hãy rút gọn nội dung trước khi nhập.`);
    }
    if (batch.length && (batch.length >= maxRows || bytes + rowBytes + 1 > maxBytes)) {
      batches.push(batch);
      batch = [];
      bytes = 2;
    }
    batch.push(row);
    bytes += rowBytes + 1;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

async function upsertBatches(client, table, rows, conflict, fallback = null, ignoreDuplicates = false, maxRows = 500) {
  const batches = createWriteBatches(rows, maxRows);
  let processedCount = 0;
  for (let index = 0; index < batches.length; index++) {
    const result = await safeUpsertRows(client, table, batches[index], conflict, fallback, ignoreDuplicates);
    if (result?.error) return { ...result, processedCount, failedBatch: index + 1 };
    processedCount += batches[index].length;
  }
  // processedCount counts acknowledged inputs, including ignored duplicates.
  return { data: null, error: null, processedCount };
}

// Single-flight Promise giúp gom các yêu cầu tải toàn bộ dữ liệu trùng lặp trên cùng 1 máy
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
let realtimeChannelInstance = null;
let realtimeDebounceTimer = null;

export function subscribeSupabaseRealtime(onDatabaseChanged) {
  const client = getSupabaseClient();
  if (!client || typeof client.channel !== 'function') return null;

  try {
    if (realtimeChannelInstance && typeof client.removeChannel === 'function') {
      client.removeChannel(realtimeChannelInstance);
    }

    const triggerChange = (tableName, payload) => {
      clearTimeout(realtimeDebounceTimer);
      const notifyWhenIdle = () => {
        // Queue remote changes received during a local Excel upload instead of dropping them.
        if (isSupabaseWriteBusy()) {
          realtimeDebounceTimer = setTimeout(notifyWhenIdle, 450);
          return;
        }
        if (typeof onDatabaseChanged === 'function') onDatabaseChanged(tableName, payload);
      };
      realtimeDebounceTimer = setTimeout(notifyWhenIdle, 450);
    };

    realtimeChannelInstance = client
      .channel('dd460-supabase-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.STUDENTS }, (payload) => triggerChange('students', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.SUBJECTS }, (payload) => triggerChange('subjects', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.GRADES }, (payload) => triggerChange('grades', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.LANGUAGES }, (payload) => triggerChange('languages', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.UNIT_SETTINGS }, (payload) => triggerChange('unit_settings', payload))
      .subscribe();

    return realtimeChannelInstance;
  } catch (err) {
    console.warn('Không thể đăng ký kênh Realtime Supabase:', err);
    return null;
  }
}

export default supabaseSingleton;