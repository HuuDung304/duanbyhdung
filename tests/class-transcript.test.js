import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClassTranscript } from '../src/js/class-transcript.js';
const students = [{ id: 's1', code: '001', name: 'Nguyễn A', class: 'TTG1', dob: '2004-02-03' }, { id: 's2', code: '002', name: 'Nguyễn B', class: 'TTG1' }];
const semesters = [1,2,3,4].map(semester => ({ semester, subjects: [{ id: `m${semester}`, name: `Tên môn học kỳ ${semester}`, credits: 3 }] }));
const build = grades => buildClassTranscript(students, semesters, grades, (id, sem) => sem + 5.123, (id, year) => year + 6.456, subject => subject.name, dob => dob ? 2004 : '');
test('class transcript follows the sample column order across completed semesters, with annual GPA after both semesters', () => {
 const result = build({s1:{m1:0,m2:3.99,m3:8,m4:9},s2:{m1:5,m2:6,m3:7,m4:8}});
 assert.equal(result.headers.length,14);
 assert.deepEqual(result.headers.slice(0,9),['MÃ HỌC VIÊN','HỌ VÀ TÊN','LỚP','NĂM SINH','ĐIỂM CÁC MÔN KỲ 1','ĐIỂM TB KỲ 1','ĐIỂM CÁC MÔN KỲ 2','ĐIỂM TB KỲ 2','ĐIỂM TB NĂM 1']);
 assert.equal(result.rows[0][0],'001'); assert.equal(result.rows[0][3],2004); assert.equal(result.rows[1][3],'');
 assert.match(result.rows[0][4],/Tên môn học kỳ 1 \(3 TC\): 0.00/);
 assert.match(result.rows[0][6],/3.99/);
 assert.equal(result.rows[0][8],7.46);
 assert.equal(result.rows[0].length,result.headers.length);
});
test('unfinished semesters, empty semesters and missing scores are excluded without treating zero as missing', () => {
 for (const missing of ['',null,undefined,NaN,11,-1]) {
  const result = build({s1:{m1:0,m2:8},s2:{m1:5,m2:missing}});
  assert.deepEqual(result.completed.map(item=>item.semester),[1]);
  assert.equal(result.headers.length,6); assert.ok(!result.headers.includes('ĐIỂM TB NĂM 1'));
 }
 assert.equal(build({}).completed.length,0);
});
