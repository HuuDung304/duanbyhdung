// Supabase Auth session. UI roles are presentation only; database policies use auth.uid().
const STORAGE_KEY = 'dd460_supabase_auth_v1';
let backend = null, session = null, identity = null, refreshTask = null;
let generation = 0;
const listeners = new Set();
export function configureAuthentication(url, key) { backend = { url: String(url).replace(/\/+$/, ''), key }; }
export function authenticatedIdentity() { return identity ? { ...identity } : null; }
export function authenticationGeneration() { return generation; }
export function onSessionExpired(callback) { listeners.add(callback); return () => listeners.delete(callback); }
function persist() {
  try { if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session)); else sessionStorage.removeItem(STORAGE_KEY); } catch { /* In-memory sessions still work when storage is unavailable. */ }
}
function expire() {
  generation++; session = null; identity = null; persist();
  for (const callback of listeners) callback();
}
async function request(path, { body, token, method = body ? 'POST' : 'GET' } = {}) {
  if (!backend) throw new Error('Chưa cấu hình Supabase.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${backend.url}${path}`, { method, signal: controller.signal,
      headers: { apikey: backend.key, Authorization: `Bearer ${token || backend.key}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) throw Object.assign(new Error('Không thể xác thực phiên đăng nhập.'), { status: response.status });
    const text = await response.text(); return text ? JSON.parse(text) : null;
  } finally { clearTimeout(timer); }
}
export async function accessToken() {
  if (!session?.access_token) throw new Error('Bạn cần đăng nhập lại.');
  if (session.expires_at > Date.now() + 60000) return session.access_token;
  if (!refreshTask) {
    const started = generation;
    const refreshToken = session.refresh_token;
    refreshTask = (async () => {
      try {
        const data = await request('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: refreshToken } });
        if (generation !== started) throw new Error('Phiên đăng nhập đã thay đổi.');
        session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
        persist(); return session.access_token;
      } catch (error) { if (generation === started && [400,401,403].includes(error.status)) expire(); throw error; }
    })().finally(() => { refreshTask = null; });
  }
  return refreshTask;
}
async function verifyIdentity() {
  const started = generation;
  const token = await accessToken();
  const user = await request('/auth/v1/user', { token });
  const rows = await request(`/rest/v1/account_profiles?select=id,username,role,class_code,student_id,display_name,active&id=eq.${encodeURIComponent(user.id)}`, { token });
  const profile = rows?.[0];
  if (!profile?.active || !['admin','company_officer','class_account','student'].includes(profile.role)) throw new Error('Tài khoản chưa được cấp quyền hoặc đã bị khóa.');
  const result = { id: user.id, type: profile.role, username: profile.username, class: profile.class_code, studentId: profile.student_id, displayName: profile.display_name || profile.username };
  if (profile.role === 'student') {
    const students = await request(`/rest/v1/students?select=id,code,name,class,rank,position&id=eq.${encodeURIComponent(profile.student_id)}`, { token });
    const student = students?.[0];
    if (!student) throw new Error('Tài khoản chưa được liên kết với hồ sơ học viên.');
    Object.assign(result, { studentId: student.id, code: student.code, name: student.name, class: student.class, rank: student.rank, position: student.position, displayName: `${student.name} (${student.code})` });
  }
  if (started !== generation) throw new Error('Phiên đăng nhập đã thay đổi.');
  identity = result; return { ...result };
}
export async function signInAccount(username, password) {
  if (!String(username || '').trim() || !password) throw new Error('Nhập tài khoản và mật khẩu.');
  const email = String(username).trim().toLowerCase();
  generation++; identity = null; session = null; persist();
  const started = generation;
  const data = await request('/auth/v1/token?grant_type=password', { body: { email: email.includes('@') ? email : `${email}@dd460.invalid`, password } });
  if (generation !== started) throw new Error('Yêu cầu đăng nhập đã bị hủy.');
  session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
  try { const user = await verifyIdentity(); persist(); return user; }
  catch (error) { expire(); throw error; }
}
export async function restoreAuthenticatedSession() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved?.access_token || !saved?.refresh_token || !Number.isFinite(saved.expires_at)) return null;
    session = saved; return await verifyIdentity();
  } catch { expire(); return null; }
}
export async function signOutAccount() {
  const token = session?.access_token;
  expire();
  if (token) { try { await request('/auth/v1/logout?scope=local', { token, method: 'POST' }); } catch { /* Locally cleared even offline. */ } }
}
export async function authenticatedFetch(input, options = {}) {
  const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  if (!backend || !url.startsWith(`${backend.url}/`)) throw new Error('Không gửi phiên đăng nhập đến máy chủ khác.');
  const token = await accessToken();
  const headers = new Headers(options.headers || (input instanceof Request ? input.headers : undefined));
  headers.set('Authorization', `Bearer ${token}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(input, { ...options, headers, signal: options.signal || controller.signal });
    if (response.status === 401) expire();
    return response;
  } finally { clearTimeout(timer); }
}
