// Shared validation for forms, Excel and database payloads.
export function calendarDate(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  let text = String(value).trim();
  if (/^\d{5}(?:\.\d+)?$/.test(text)) {
    const date = new Date(Math.floor(Number(text) - 25569) * 86400000);
    text = date.toISOString().slice(0, 10);
  }
  let year, month, day;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  const vn = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (iso) [, year, month, day] = iso.map(Number);
  else if (vn) [, day, month, year] = vn.map(Number);
  else throw new Error(`Ngày không hợp lệ: ${text}. Nhập DD/MM/YYYY.`);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`Ngày không hợp lệ: ${text}.`);
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parentBirthYear(value) {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const text = String(value).trim();
  let year;
  try { year = /^\d{4}$/.test(text) ? text : calendarDate(value)?.slice(0, 4); }
  catch { throw new Error('Năm sinh bố/mẹ không hợp lệ; nhập YYYY (VD: 1975).'); }
  if (!year || Number(year) < 1900 || Number(year) > new Date().getFullYear()) throw new Error('Năm sinh bố/mẹ không hợp lệ.');
  return year;
}

export function politicalDates(status, joined, official) {
  const politicalStatus = ['CAM_TINH_DANG', 'DANG_VIEN_DU_BI', 'DANG_VIEN_CHINH_THUC'].includes(status) ? status : 'DOAN_VIEN';
  if (!politicalStatus.startsWith('DANG_VIEN_')) return { politicalStatus, party_joined_date: null, official_party_date: null };
  const party_joined_date = calendarDate(joined);
  if (!party_joined_date) throw new Error('Đảng viên phải nhập ngày vào Đảng (DD/MM/YYYY).');
  const official_party_date = politicalStatus === 'DANG_VIEN_CHINH_THUC' ? calendarDate(official) : null;
  if (politicalStatus === 'DANG_VIEN_CHINH_THUC' && !official_party_date) throw new Error('Đảng viên chính thức phải nhập ngày chính thức.');
  if (official_party_date && official_party_date < party_joined_date) throw new Error('Ngày chính thức không được trước ngày vào Đảng.');
  return { politicalStatus, party_joined_date, official_party_date };
}

export function assertDatabaseWriteAllowed() {
  if (globalThis.AppState?.role === 'company_officer') throw new Error('Tài khoản cán bộ chỉ được xem, không được chỉnh sửa dữ liệu đơn vị.');
}

// Legacy malformed values must not prevent loading the whole unit; validate on save.
export function readParentYear(value) {
  try { return parentBirthYear(value); }
  catch { return String(value ?? '').trim(); }
}

export function displayParentYear(value) {
  try { return parentBirthYear(value); }
  catch { return 'Cần sửa năm sinh'; }
}
