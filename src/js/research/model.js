export const AWARDS = ['Bằng Khen', 'Giấy Khen', 'Loại Xuất sắc', 'Loại Giỏi', 'Loại Khá'];
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
    objective: text(input.objective), content: text(input.content), product: text(input.product),
    advisors: (input.advisors || []).map(a => ({ name: text(a.name), unit: text(a.unit) })).filter(a => a.name),
    awards: Array.isArray(input.awards) ? [...new Set(input.awards)] : [] };
  for (const key of ['objective', 'content', 'product']) if (project[key].length > 20000) throw new Error('Thông tin đề tài quá dài (tối đa 20.000 ký tự mỗi mục).');
  if (project.awards.some(a => !AWARDS.includes(a)) || project.awards.filter(a => a.startsWith('Loại ')).length > 1) throw new Error('Chọn giải thưởng hợp lệ và tối đa một loại xếp loại.');
  if (existing) {
    if (!canView(existing, state)) throw new Error('Bạn không có quyền xem đề tài này.');
    if (!canEdit(existing, state)) {
      if (!canAward(existing, state)) throw new Error('Bạn không có quyền sửa đề tài này.');
      // Award-only editors cannot change the topic, owner or participant list.
      return { ...existing, awards: project.awards };
    }
    if (!canAward(existing, state)) {
      if (JSON.stringify(project.awards) !== JSON.stringify(existing.awards || [])) throw new Error('Chỉ Admin và tài khoản lớp được sửa giải thưởng.');
      project.awards = [...(existing.awards || [])];
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
export const EXCEL_HEADERS = ['Mã đề tài', 'Tên đề tài', 'Mục tiêu', 'Nội dung nghiên cứu', 'Sản phẩm dự kiến', 'Mã HV chủ đề tài', 'Mã HV tham gia (cách nhau bằng ;)', 'Cán bộ hướng dẫn (mỗi dòng: Họ tên | Đơn vị)', 'Năm học', 'Giải thưởng (cách nhau bằng ;)'];
export function parseResearchRows(rows, state, existingProjects, createId) {
  if (!rows.length || !rows[0].includes('Tên đề tài') || !rows[0].includes('Mã HV chủ đề tài')) throw new Error('Dùng file Excel mẫu Nghiên cứu khoa học, giữ nguyên tiêu đề cột.');
  const headers = rows[0], seen = new Set();
  const drafts = [];
  for (const [index, row] of rows.slice(1).entries()) {
    if (!row.some(v => text(v))) continue;
    const get = name => row[headers.indexOf(name)] ?? '';
    try {
      const id = text(get(EXCEL_HEADERS[0]));
      if (id && seen.has(id)) throw new Error('Mã đề tài bị lặp trong file.');
      if (id) seen.add(id);
      const existing = id ? existingProjects.find(p => p.id === id) : null;
      if (id && !existing) throw new Error('Không tìm thấy Mã đề tài. Để trống mã khi thêm mới.');
      if (existing && !canEdit(existing, state)) throw new Error('Không có quyền sửa thông tin đề tài này.');
      const findStudent = code => {
        const student = state.students.find(s => codeKey(s.code) === codeKey(code));
        if (!student) throw new Error('Mã học viên không tồn tại: ' + text(code));
        return student.id;
      };
      const leaderId = findStudent(get(EXCEL_HEADERS[5]));
      const codes = text(get(EXCEL_HEADERS[6])).split(/[;,\n]+/).filter(v => text(v));
      const awards = text(get(EXCEL_HEADERS[9])).split(';').map(text).filter(Boolean);
      const input = { id: existing?.id || createId(), title: get(EXCEL_HEADERS[1]), objective: get(EXCEL_HEADERS[2]), content: get(EXCEL_HEADERS[3]), product: get(EXCEL_HEADERS[4]), leaderId,
        memberIds: [leaderId, ...codes.map(findStudent)], advisors: text(get(EXCEL_HEADERS[7])).split('\n').filter(Boolean).map(line => { const [name, ...unit] = line.split('|'); return { name, unit: unit.join('|') }; }), year: get(EXCEL_HEADERS[8]), awards };
      drafts.push({ project: normalizeProject(input, state, existing), existing });
    } catch (error) { throw new Error(`Dòng ${index + 2}: ${error.message}`); }
  }
  if (!drafts.length) throw new Error('File không có đề tài để nhập.');
  if (drafts.length > 200) throw new Error('Mỗi lần nhập tối đa 200 đề tài.');
  return drafts;
}
