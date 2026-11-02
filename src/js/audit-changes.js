export const AUDIT_FIELDS = {
  code: 'Mã học viên', name: 'Họ và tên', class: 'Lớp', rank: 'Cấp bậc', position: 'Chức vụ',
  dob: 'Ngày sinh', enlistmentDate: 'Ngày nhập ngũ', phone: 'Số điện thoại', hometown: 'Quê quán',
  permanentAddress: 'Địa chỉ thường trú', currentAddress: 'Nơi ở hiện nay', politicalStatus: 'Diện chính trị',
  party_joined_date: 'Ngày vào Đảng', official_party_date: 'Ngày chính thức',
  father_name: 'Họ tên bố', father_birth_date: 'Năm sinh bố', father_job: 'Nghề nghiệp bố', father_hometown: 'Quê quán bố',
  mother_name: 'Họ tên mẹ', mother_birth_date: 'Năm sinh mẹ', mother_job: 'Nghề nghiệp mẹ', mother_hometown: 'Quê quán mẹ',
  achievements: 'Thành tích', currentLangLevel: 'Trình độ ngoại ngữ',
  lang: 'Ngoại ngữ', currentLevel: 'Trình độ ngoại ngữ', A1: 'Chứng chỉ A1', A21: 'Chứng chỉ A2.1',
  A22: 'Chứng chỉ A2.2', B11: 'Chứng chỉ B1.1', B12: 'Chứng chỉ B1.2', extraCert: 'Chứng chỉ bổ sung'
};
export function auditValue(value) {
  if (value === null || value === undefined || value === '') return 'Chưa có';
  if (Array.isArray(value)) return value.length ? value.map(auditValue).join('; ') : 'Chưa có';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
export function auditChanges(before, after, fields = AUDIT_FIELDS) {
  return Object.entries(fields).flatMap(([key, field]) => {
    const oldVal = auditValue(before?.[key]), newVal = auditValue(after?.[key]);
    return oldVal === newVal ? [] : [{ field, oldVal, newVal }];
  });
}
export const SUBJECT_AUDIT_FIELDS = { code: 'Mã môn', name: 'Tên môn', semester: 'Học kỳ', credits: 'Tín chỉ', targetClass: 'Lớp áp dụng', category: 'Loại môn' };
export const RESEARCH_AUDIT_FIELDS = { title: 'Tên đề tài', year: 'Năm học', leaderId: 'Chủ đề tài', participants: 'Thành viên', advisors: 'Cán bộ hướng dẫn', awards: 'Giải thưởng', information: 'Thông tin nghiên cứu', objective: 'Mục tiêu', content: 'Nội dung nghiên cứu', product: 'Sản phẩm', projectCode: 'Mã đề tài', notes: 'Ghi chú' };
