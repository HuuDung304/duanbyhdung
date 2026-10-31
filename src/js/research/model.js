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
export function normalizeProject(input, state, existing = null) {
  const title = text(input.title);
  if (!title || title.length > 500) throw new Error('Tên đề tài bắt buộc, tối đa 500 ký tự.');
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 1 || year > 5) throw new Error('Chọn năm học từ 1 đến 5 để tính điểm TBNH.');
  const ids = [...new Set((input.memberIds || []).map(text).filter(Boolean))];
  if (!ids.length || !ids.includes(input.leaderId)) throw new Error('Chủ đề tài phải nằm trong danh sách học viên thực hiện.');
  const members = ids.map(id => {
    const student = state.students.find(s => s.id === id);
    if (!student) throw new Error('Có học viên không còn trong danh sách. Kiểm tra lại thành viên.');
    return { studentId: student.id, code: student.code, name: student.name, class: student.class };
  });
  const project = { id: existing?.id || input.id, title, year, leaderId: input.leaderId, participants: members,
    objective: text(input.objective), content: text(input.content), product: text(input.product), notes: text(input.notes ?? existing?.notes), projectCode: text(existing?.projectCode || input.projectCode),
    advisors: (input.advisors || []).map(a => ({ name: text(a.name), unit: text(a.unit) })).filter(a => a.name),
    awards: Array.isArray(input.awards) ? normalizeAwards(input.awards) : [] };
  for (const key of ['objective', 'content', 'product', 'notes']) if (project[key].length > 20000) throw new Error('Thông tin đề tài quá dài (tối đa 20.000 ký tự mỗi mục).');
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
export const EXCEL_HEADERS = ['STT', 'Mã đề tài', 'Tên đề tài', 'Mã HV chủ đề tài', 'Mã HV tham gia (cách nhau bằng ;)', 'Cán bộ hướng dẫn (Họ tên | Đơn vị) (cách nhau bằng dấu ;)'];
export const EXPORT_HEADERS = [...EXCEL_HEADERS, 'Mục tiêu', 'Nội dung nghiên cứu', 'Sản phẩm dự kiến', 'Năm học', 'Giải thưởng (cách nhau bằng ;)', 'Ghi chú'];
export function parseResearchRows(rows, state, existingProjects, createId) {
  const key = value => text(value).toLocaleLowerCase('vi').replace(/\s+/g, ' ');
  const headers = (rows[0] || []).map(key);
  const column = name => headers.findIndex(h => h === name || h.startsWith(name + ' ('));
  if (column('tên đề tài') < 0 || column('mã hv chủ đề tài') < 0) throw new Error('File cần cột Tên đề tài và Mã HV chủ đề tài.');
  const seen = new Set(), drafts = [];
  for (const [index, row] of rows.slice(1).entries()) {
    if (!row.some(v => text(v))) continue;
    const get = (name, fallback = '') => column(name) < 0 ? fallback : row[column(name)] ?? '';
    try {
      const code = text(get('mã đề tài'));
      if (code && seen.has(codeKey(code))) throw new Error('Mã đề tài bị lặp trong file.');
      if (code) seen.add(codeKey(code));
      const existing = code ? existingProjects.find(p => p.id === code || p.projectCode && codeKey(p.projectCode) === codeKey(code)) : null;
      if (existing && !canEdit(existing, state)) throw new Error('Không có quyền sửa thông tin đề tài này.');
      const findStudent = code => {
        const student = state.students.find(s => codeKey(s.code) === codeKey(code));
        if (!student) throw new Error('Mã học viên không tồn tại: ' + text(code));
        return student.id;
      };
      const leaderId = findStudent(get('mã hv chủ đề tài'));
      const codes = text(get('mã hv tham gia')).split(/[;,\n]+/).filter(v => text(v));
      const awards = column('giải thưởng') < 0 ? normalizeAwards(existing?.awards || []) : text(get('giải thưởng')).split(';').map(text).filter(Boolean);
      const input = { id: existing?.id || (code ? 'code_' + encodeURIComponent(codeKey(code)) : createId()), projectCode: existing?.projectCode || code,
        title: get('tên đề tài'), objective: get('mục tiêu', existing?.objective), content: get('nội dung nghiên cứu', existing?.content), product: get('sản phẩm dự kiến', existing?.product), notes: get('ghi chú', existing?.notes), leaderId,
        memberIds: [leaderId, ...codes.map(findStudent)],
        advisors: text(get('cán bộ hướng dẫn')).split(/[;\n]+/).filter(v => text(v)).map(line => { const [name, ...unit] = line.split('|'); return { name, unit: unit.join('|') }; }),
        year: get('năm học', existing?.year || 1), awards };
      drafts.push({ project: normalizeProject(input, state, existing), existing });
    } catch (error) { throw new Error(`Dòng ${index + 2}: ${error.message}`); }
  }
  if (!drafts.length) throw new Error('File không có đề tài để nhập.');
  if (drafts.length > 200) throw new Error('Mỗi lần nhập tối đa 200 đề tài.');
  return drafts;
}
