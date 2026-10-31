export const AWARDS = ['Bằng khen', 'Giấy khen', 'Xuất sắc', 'Giỏi', 'Khá'];
export function normalizeAwards(values = []) {
  return [...new Set(values.map(value => {
    const key = String(value).normalize('NFC').trim().replace(/^Loại\s+/i, '').toLocaleLowerCase('vi');
    return AWARDS.find(a => a.toLocaleLowerCase('vi') === key) || String(value).trim();
  }))];
}
export const RESEARCH_PREFIX = 'research-project:';
const text = value => String(value ?? '').normalize('NFC').trim();
export const codeKey = value => text(value).toUpperCase();
export function actor(state) {
  const role = state.role;
  const student = state.students.find(s => s.id === state.currentUser?.studentId || codeKey(s.code) === codeKey(state.currentUser?.code) && codeKey(s.code));
  return { role, studentId: student?.id, className: role?.startsWith('class_leader_') ? role.slice(13) : null };
}
export function participants(project, students) {
  return (project.participants || []).map(saved => ({ ...saved, ...(students.find(s => s.id === saved.studentId) || {}), studentId: saved.studentId }));
}
export function leaderClass(project, students) {
  return participants(project, students).find(s => s.studentId === project.leaderId)?.class || '';
}
export function canView(project, state) {
  const user = actor(state), members = participants(project, state.students);
  if (['admin', 'company_officer'].includes(user.role)) return true;
  if (user.className) return members.some(s => s.class === user.className);
  return user.role === 'student' && !!user.studentId && members.some(s => s.studentId === user.studentId);
}
export function canEdit(project, state) {
  const user = actor(state);
  return user.role === 'admin' || !!user.className && leaderClass(project, state.students) === user.className
    || user.role === 'student' && !!user.studentId && project.leaderId === user.studentId;
}
export function canAward(project, state) {
  const user = actor(state);
  return user.role === 'admin' || !!user.className && canView(project, state);
}
export function canCreate(state) {
  const user = actor(state);
  return user.role === 'admin' || !!user.className || user.role === 'student' && !!user.studentId;
}
export function scopedProjects(projects, state, classFilter = 'all') {
  const global = ['admin', 'company_officer'].includes(state.role);
  return projects.filter(p => canView(p, state) && (!global || classFilter === 'all' || leaderClass(p, state.students) === classFilter)).sort((a, b) => leaderClass(a, state.students).localeCompare(leaderClass(b, state.students), 'vi', { numeric: true }) || a.title.localeCompare(b.title, 'vi'));
}
export function researchStats(projects) {
  return { projects: projects.length, students: new Set(projects.flatMap(p => p.participants.map(s => s.studentId))).size };
}
export function yearGPA(student, state, year, applicableSubjects) {
  if (!student?.id) return null;
  const scores = state.grades[student.id] || {};
  let points = 0, credits = 0;
  for (const subject of applicableSubjects) {
    if (Math.ceil(Number(subject.semester) / 2) !== Number(year)) continue;
    const score = scores[subject.id], weight = Number(subject.credits);
    if (score === '' || score === null || score === undefined || !Number.isFinite(Number(score)) || !Number.isFinite(weight) || weight <= 0) continue;
    points += Number(score) * weight; credits += weight;
  }
  return credits ? points / credits : null;
}
export function latestYearGPA(student, state, applicableSubjects) {
  if (!student?.id) return { year: null, gpa: null };
  const scores = state.grades[student.id] || {};
  const years = applicableSubjects.filter(subject => {
    const semester = Number(subject.semester), score = scores[subject.id];
    return Number.isInteger(semester) && semester >= 1 && semester <= 10 && Number.isFinite(Number(subject.credits)) && Number(subject.credits) > 0
      && score !== '' && score !== null && score !== undefined && Number.isFinite(Number(score));
  }).map(subject => Math.ceil(Number(subject.semester) / 2));
  if (!years.length) return { year: null, gpa: null };
  const year = Math.max(...years);
  return { year, gpa: yearGPA(student, state, year, applicableSubjects) };
}

export function normalizeProject(input, state, existing = null) {
  const title = text(input.title);
  if (!title || title.length > 500) throw new Error('Tên đề tài bắt buộc, tối đa 500 ký tự.');
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 1 || year > 5) throw new Error('Chọn năm học đề tài từ 1 đến 5.');
  const ids = [...new Set((input.memberIds || []).map(text).filter(Boolean))];
  if (!ids.length || !ids.includes(input.leaderId)) throw new Error('Chủ đề tài phải nằm trong danh sách học viên thực hiện.');
  const members = ids.map(id => {
    const student = state.students.find(s => s.id === id);
    if (!student) throw new Error('Có học viên không còn trong danh sách. Kiểm tra lại thành viên.');
    return { studentId: student.id, code: student.code, name: student.name, class: student.class };
  });
  const project = { id: existing?.id || input.id, title, year, leaderId: input.leaderId, participants: members,
    information: text(input.information ?? existing?.information), objective: text(input.objective), content: text(input.content), product: text(input.product), notes: text(input.notes ?? existing?.notes), projectCode: text(input.projectCode ?? existing?.projectCode),
    advisors: (input.advisors || []).map(a => ({ name: text(a.name), unit: text(a.unit) })).filter(a => a.name),
    awards: Array.isArray(input.awards) ? normalizeAwards(input.awards) : [] };
  for (const key of ['information', 'objective', 'content', 'product', 'notes']) if (project[key].length > (key === 'information' ? 60000 : 20000)) throw new Error('Nội dung quá dài (Thông tin đề tài tối đa 60.000 ký tự, các mục khác 20.000 ký tự).');
  if (project.awards.some(a => !AWARDS.includes(a))) throw new Error('Chọn giải thưởng trong năm mục có sẵn.');
  if (project.projectCode.length > 100) throw new Error('Mã đề tài tối đa 100 ký tự.');
  if (existing) {
    if (!canView(existing, state)) throw new Error('Bạn không có quyền xem đề tài này.');
    if (!canEdit(existing, state)) {
      if (!canAward(existing, state)) throw new Error('Bạn không có quyền sửa đề tài này.');
      // Award-only editors cannot change the topic, owner or participant list.
      return { ...existing, awards: project.awards };
    }
    if (!canAward(existing, state)) {
      if (JSON.stringify(project.awards) !== JSON.stringify(normalizeAwards(existing.awards || []))) throw new Error('Chỉ Admin và tài khoản lớp được sửa giải thưởng.');
      project.awards = normalizeAwards(existing.awards || []);
    }
  } else {
    if (!canCreate(state)) throw new Error('Bạn không có quyền thêm đề tài.');
    if (actor(state).role === 'student' && project.leaderId !== actor(state).studentId) throw new Error('Học viên chỉ được tạo đề tài do mình làm chủ.');
    if (!canEdit(project, state)) throw new Error('Chủ đề tài phải thuộc lớp bạn phụ trách.');
    if (!canAward(project, state) && project.awards.length) throw new Error('Chỉ Admin và tài khoản lớp được sửa giải thưởng.');
  }
  // A student cannot transfer ownership to gain access to another student's topic.
  if (actor(state).role === 'student' && project.leaderId !== actor(state).studentId) throw new Error('Chủ đề tài không được chuyển quyền cho học viên khác.');
  if (actor(state).className && !canEdit(project, state)) throw new Error('Chủ đề tài phải thuộc lớp bạn phụ trách.');
  return project;
}
export const EXCEL_HEADERS = ['STT', 'Mã đề tài', 'Tên đề tài', 'Thông tin đề tài', 'Mã HV / Họ tên chủ đề tài', 'Mã HV / Họ tên tham gia (cách nhau bằng ;)', 'Cán bộ hướng dẫn (Họ tên | Đơn vị) (cách nhau bằng dấu ;)'];
export const EXPORT_HEADERS = [...EXCEL_HEADERS, 'Mục tiêu', 'Nội dung nghiên cứu', 'Sản phẩm dự kiến', 'Năm học', 'Giải thưởng (cách nhau bằng ;)', 'Ghi chú', 'ID bản ghi'];
export const studentNameKey = value => text(value).toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/\s+/g, ' ');
export function researchStudentCandidates(value, students) {
  const code = codeKey(value);
  if (!code) return [];
  const byCode = students.filter(s => codeKey(s.code) === code);
  return byCode.length ? byCode : students.filter(s => studentNameKey(s.name) === studentNameKey(value));
}
export class ResearchStudentChoiceError extends Error {
  constructor(choices) { super('Có học viên trùng tên. Chọn đúng mã học viên và lớp để tiếp tục.'); this.choices = choices; }
}
function researchColumns(rows) {
  const aliases = {
    'mã hv / họ tên chủ đề tài': 'mã hv chủ đề tài', 'họ tên chủ đề tài': 'mã hv chủ đề tài', 'tên chủ đề tài': 'mã hv chủ đề tài',
    'mã hv / họ tên tham gia': 'mã hv tham gia', 'họ tên tham gia': 'mã hv tham gia', 'học viên tham gia': 'mã hv tham gia'
  };
  const headers = (rows[0] || []).map(value => {
    const base = text(value).toLocaleLowerCase('vi').replace(/\s+/g, ' ').replace(/\s*\(/g, ' (').split(' (')[0].replace(/^thông tinh đề tài$/, 'thông tin đề tài');
    return aliases[base] || base;
  });
  return name => headers.indexOf(name);
}
function researchReferences(row, column, rowNumber) {
  const leader = row[column('mã hv chủ đề tài')] ?? '';
  const members = text(row[column('mã hv tham gia')]).split(/[;,\n]+/).filter(v => text(v));
  return [{ key: `row:${rowNumber}:leader`, value: leader, label: 'Chủ đề tài', rowNumber }, ...members.map((value, index) => ({ key: `row:${rowNumber}:member:${index}`, value, label: 'Thành viên', rowNumber }))];
}
export function parseResearchRows(rows, state, existingProjects, createId, selections = {}) {
  const column = researchColumns(rows);
  if (column('tên đề tài') < 0 || column('mã hv chủ đề tài') < 0) throw new Error('File cần cột Tên đề tài và Mã HV / Họ tên chủ đề tài.');
  const choices = [];
  const resolve = ref => {
    const candidates = researchStudentCandidates(ref.value, state.students);
    if (!candidates.length) throw new Error(`Dòng ${ref.rowNumber}: Mã học viên hoặc họ tên không tồn tại: ${text(ref.value)}`);
    if (candidates.length === 1) return candidates[0].id;
    if (candidates.some(s => s.id === selections[ref.key])) return selections[ref.key];
    choices.push({ ...ref, candidates }); return null;
  };
  // Resolve every reference before constructing any project or allowing a save.
  const resolved = new Map();
  for (const [index, row] of rows.slice(1).entries()) {
    if (!row.some(v => text(v))) continue;
    for (const ref of researchReferences(row, column, index + 2)) resolved.set(ref.key, resolve(ref));
  }
  if (choices.length) throw new ResearchStudentChoiceError(choices);
  const seen = new Set(), seenRecords = new Set(), drafts = [];
  for (const [index, row] of rows.slice(1).entries()) {
    if (!row.some(v => text(v))) continue;
    const get = (name, fallback = '') => column(name) < 0 ? fallback : row[column(name)] ?? '';
    try {
      const code = text(get('mã đề tài'));
      if (code && seen.has(codeKey(code))) throw new Error('Mã đề tài bị lặp trong file.');
      if (code) seen.add(codeKey(code));
      const recordId = text(get('id bản ghi'));
      const existing = recordId ? existingProjects.find(p => p.id === recordId) : code ? existingProjects.find(p => p.id === code || p.projectCode && codeKey(p.projectCode) === codeKey(code)) : null;
      if (existing && seenRecords.has(existing.id)) throw new Error('Đề tài bị lặp trong file.');
      if (existing) seenRecords.add(existing.id);
      if (recordId && !existing) throw new Error('Đề tài cần cập nhật không còn tồn tại. Hãy xuất lại danh sách mới.');
      if (existing && !canEdit(existing, state)) throw new Error('Không có quyền sửa thông tin đề tài này.');
      const refs = researchReferences(row, column, index + 2);
      const leaderId = resolved.get(refs[0].key);
      const memberIds = refs.slice(1).map(ref => resolved.get(ref.key));
      const awards = column('giải thưởng') < 0 ? normalizeAwards(existing?.awards || []) : text(get('giải thưởng')).split(';').map(text).filter(Boolean);
      const input = { id: existing?.id || (code ? 'code_' + encodeURIComponent(codeKey(code)) : createId()), projectCode: existing?.projectCode || code,
        title: get('tên đề tài'), information: get('thông tin đề tài', existing?.information), objective: get('mục tiêu', existing?.objective), content: get('nội dung nghiên cứu', existing?.content), product: get('sản phẩm dự kiến', existing?.product), notes: get('ghi chú', existing?.notes), leaderId,
        memberIds: [leaderId, ...memberIds],
        advisors: text(get('cán bộ hướng dẫn')).split(/[;\n]+/).filter(v => text(v)).map(line => { const [name, ...unit] = line.split('|'); return { name, unit: unit.join('|') }; }),
        year: get('năm học', existing?.year || 1), awards };
      drafts.push({ project: normalizeProject(input, state, existing), existing });
    } catch (error) { throw new Error(`Dòng ${index + 2}: ${error.message}`); }
  }
  if (!drafts.length) throw new Error('File không có đề tài để nhập.');
  if (drafts.length > 200) throw new Error('Mỗi lần nhập tối đa 200 đề tài.');
  return drafts;
}
