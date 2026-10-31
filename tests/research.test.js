import test from 'node:test';
import assert from 'node:assert/strict';
import { canView, canEdit, canAward, normalizeProject, researchStats, scopedProjects, parseResearchRows, EXCEL_HEADERS, AWARDS, yearGPA } from '../src/js/research/model.js';
const students = [{ id: 'a', code: '001', name: 'An', class: 'OTQS1' }, { id: 'b', code: '002', name: 'Bình', class: 'TTG2' }, { id: 'c', code: '003', name: 'Chi', class: 'XMCB' }];
const state = (role = 'admin', id = 'a') => ({ role, currentUser: { studentId: id, code: students.find(s => s.id === id)?.code }, students, grades: {} });
const input = { id: 'r1', title: 'Nghiên cứu', year: 1, leaderId: 'a', memberIds: ['a', 'b'], awards: [], advisors: [] };
const project = normalizeProject(input, state());
test('research scopes by owner class for officers but membership for class accounts and students', () => {
  assert.equal(scopedProjects([project], state('company_officer'), 'OTQS1').length, 1);
  assert.equal(scopedProjects([project], state('company_officer'), 'TTG2').length, 0);
  assert.equal(scopedProjects([project], state('class_leader_TTG2'), 'OTQS1').length, 1);
  assert.equal(canView(project, state('student', 'b')), true);
  assert.equal(canView(project, state('student', 'c')), false);
  assert.equal(canView(project, state('guest')), false);
  assert.deepEqual(researchStats([project, { ...project, id: 'r2' }]), { projects: 2, students: 2 });
});
test('only a student owner can edit information; awards stay reserved for admin and class accounts', () => {
  assert.equal(canEdit(project, state('student', 'a')), true);
  assert.equal(canEdit(project, state('student', 'b')), false);
  assert.equal(canEdit(project, state('company_officer')), false);
  assert.equal(canAward(project, state('student', 'a')), false);
  assert.equal(canAward(project, state('class_leader_TTG2')), true);
  assert.equal(canAward(project, state('class_leader_XMCB')), false);
  assert.throws(() => normalizeProject({ ...input, awards: ['Bằng Khen'] }, state('student', 'a'), project), /giải thưởng/);
  assert.throws(() => normalizeProject({ ...input, leaderId: 'b' }, state('student', 'a'), project), /chuyển quyền/);
  const awardOnly = normalizeProject({ ...input, title: 'Tampered', memberIds: ['a'], awards: ['Giấy Khen'] }, state('class_leader_TTG2'), project);
  assert.equal(awardOnly.title, project.title);
  assert.deepEqual(awardOnly.participants, project.participants);
  assert.deepEqual(awardOnly.awards, ['Giấy khen']);
});
test('research rejects missing owners, foreign class ownership, invalid awards and invalid years', () => {
  assert.throws(() => normalizeProject({ ...input, memberIds: ['b'] }, state()), /Chủ đề tài/);
  assert.throws(() => normalizeProject(input, state('class_leader_TTG2')), /lớp/);
  assert.throws(() => normalizeProject({ ...input, year: 0 }, state()), /năm học/);
  assert.deepEqual(normalizeProject({ ...input, awards: AWARDS }, state()).awards, AWARDS);
  assert.throws(() => normalizeProject({ ...input, awards: ['Không hợp lệ'] }, state()), /năm mục/);
  assert.throws(() => normalizeProject(input, state('company_officer')), /quyền/);
});
test('research Excel resolves actual student codes and validates every row before returning a plan', () => {
  const legacyHeaders = ['Mã đề tài', 'Tên đề tài', 'Mục tiêu', 'Nội dung nghiên cứu', 'Sản phẩm dự kiến', 'Mã HV chủ đề tài', 'Mã HV tham gia (cách nhau bằng ;)', 'Cán bộ hướng dẫn (mỗi dòng: Họ tên | Đơn vị)', 'Năm học', 'Giải thưởng (cách nhau bằng ;)'];
  const row = ['', 'Đề tài Excel', 'Mục tiêu', 'Nội dung', 'Sản phẩm', '001', '002; 001', 'Cô A | K13', 2, 'Giấy Khen; Loại Giỏi'];
  const parsed = parseResearchRows([legacyHeaders, row], state(), [], () => 'new');
  assert.deepEqual(parsed[0].project.participants.map(p => p.studentId), ['a', 'b']);
  assert.equal(parsed[0].project.advisors[0].unit, 'K13');
  assert.throws(() => parseResearchRows([legacyHeaders, row, [...row.slice(0, 5), '999', ...row.slice(6)]], state(), [], () => 'new'), /Dòng 3.*không tồn tại/);
  assert.throws(() => parseResearchRows([legacyHeaders, ['r1', ...row.slice(1)], ['r1', ...row.slice(1)]], state(), [project], () => 'new'), /bị lặp/);
  assert.throws(() => parseResearchRows([legacyHeaders, row], state('student', 'a'), [], () => 'new'), /giải thưởng/);
});
test('TBNH weights only the chosen two semesters, preserving zero and excluding missing scores', () => {
  const s = state(); s.grades.a = { m1: 8, m2: 0, m3: 10, m4: '' };
  const subjects = [{ id: 'm1', semester: 1, credits: 3 }, { id: 'm2', semester: 2, credits: 1 }, { id: 'm3', semester: 3, credits: 4 }, { id: 'm4', semester: 2, credits: 20 }];
  assert.equal(yearGPA(students[0], s, 1, subjects), 6);
  assert.equal(yearGPA(students[0], s, 2, subjects), 10);
  assert.equal(yearGPA(students[0], s, 3, subjects), null);
});

test('screenshot Excel template accepts custom topic codes, STT and semicolon-separated supervisors', () => {
  const row = [1, 'DT-2026-01', 'Đề tài theo mẫu', '001', '002;001', 'Cô A | K13; Thầy B | K14'];
  const [draft] = parseResearchRows([EXCEL_HEADERS, row], state(), [], () => 'new');
  assert.equal(draft.project.projectCode, 'DT-2026-01');
  assert.equal(draft.project.year, 1);
  assert.deepEqual(draft.project.advisors, [{name:'Cô A',unit:'K13'}, {name:'Thầy B',unit:'K14'}]);
  const existing = {...draft.project, year: 3, objective:'Giữ nguyên', notes:'Ghi chú cũ', awards:['Loại Giỏi']};
  const [update] = parseResearchRows([EXCEL_HEADERS, [...row.slice(0, 2), 'Tên cập nhật', ...row.slice(3)]], state(), [existing], () => 'other');
  assert.equal(update.project.id, existing.id);
  assert.equal(update.project.year, 3);
  assert.equal(update.project.objective, 'Giữ nguyên');
  assert.equal(update.project.notes, 'Ghi chú cũ');
  assert.deepEqual(update.project.awards, ['Giỏi']);
  assert.throws(() => parseResearchRows([EXCEL_HEADERS,row,row],state(),[],()=> 'new'), /bị lặp/);
});
