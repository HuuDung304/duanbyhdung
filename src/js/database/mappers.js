import { calendarDate, parentBirthYear, politicalDates, readParentYear } from '../profile-rules.js';

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
