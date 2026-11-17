import test from 'node:test';
import assert from 'node:assert/strict';
import { isFailedSubject, failedSubjectSummary, canMarkFailedSubject } from '../src/js/academic/failed-subjects.js';

const student = { id: 's1', code: 'HV001', class: 'OTQS1' };
const subjects = [{ id: 'm1', credits: 3 }, { id: 'm2', credits: 2 }, { id: 'm3', credits: 0 }];
test('counts current and historical failures once, including zero-credit courses', () => {
  const state = { grades: { s1: { m1: 3.5, m2: 8, m3: 0 } }, failedSubjectMarks: { s1: { m1: true, m2: true } } };
  assert.deepEqual(failedSubjectSummary(state, student, subjects), { count: 3, credits: 5, subjects });
  assert.equal(isFailedSubject(state, 's1', 'm2'), true);
  state.failedSubjectMarks.s1.m2 = false;
  assert.equal(isFailedSubject(state, 's1', 'm2'), false);
});
test('officer cannot mark; student is limited to own record', () => {
  assert.equal(canMarkFailedSubject({ role: 'company_officer' }, student), false);
  assert.equal(canMarkFailedSubject({ role: 'student', currentUser: { studentId: 's1' } }, student), true);
  assert.equal(canMarkFailedSubject({ role: 'student', currentUser: { studentId: 's2' } }, student), false);
});
