import { sanitizeHTML } from '../safe-html.js';

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
    btn.textContent = String(loadingText).replace(/^\s*⏳\s*/u, '');
  }

  try {
    return await asyncTask();
  } finally {
    if (btn) {
      activeButtonLocks.delete(btn);
      btn.disabled = wasDisabled;
      btn.removeAttribute('aria-busy');
      btn.classList.remove('opacity-70', 'cursor-not-allowed');
      btn.innerHTML = sanitizeHTML(originalHtml);
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
export let currentClientConfigKey = '';

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


export function getSupabaseConnectionConfig() { const [url, key] = currentClientConfigKey.split('::'); return {url, key}; }
