import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClassTranscript } from '../src/js/class-transcript.js';
const students = [{ id: 's1', code: '001', name: 'Nguyễn A', class: 'TTG1', dob: '2004-02-03' }, { id: 's2', code: '002', name: 'Nguyễn B', class: 'TTG1' }];
const semesters = [1,2,3,4].map(semester => ({ semester, subjects: [{ id: `m${semester}`, name: `Tên môn học kỳ ${semester}`, credits: 3 }] }));
const build = grades => buildClassTranscript(students, semesters, grades, (id, sem) => sem + 5.123, (id, year) => year + 6.456, subject => subject.name, dob => dob ? 2004 : '');
test('class transcript follows the sample column order across completed semesters, with annual GPA after both semesters', () => {
 const result = build({s1:{m1:0,m2:3.99,m3:8,m4:9},s2:{m1:5,m2:6,m3:7,m4:8}});
 assert.equal(result.headers.length,14);
 assert.deepEqual(result.headers.slice(0,9),['MÃ HỌC VIÊN','HỌ VÀ TÊN','LỚP','NĂM SINH','Tên môn học kỳ 1','ĐIỂM TB KỲ 1','Tên môn học kỳ 2','ĐIỂM TB KỲ 2','ĐIỂM TB NĂM 1']);
 assert.equal(result.rows[0][0],'001'); assert.equal(result.rows[0][3],2004); assert.equal(result.rows[1][3],'');
 assert.equal(result.rows[0][4],0);
 assert.equal(result.headerRows[2][4],3);
 assert.equal(result.rows[0][6],3.99);
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

test('each subject occupies its own numeric score column under its semester, with credits and no overlapping merges', () => {
 const result = buildClassTranscript(students,[{semester:1,subjects:[{id:'a',name:'Đại số tuyến tính',credits:3},{id:'b',name:'Vật lý đại cương',credits:2}]}],{s1:{a:8,b:0},s2:{a:7,b:4}},()=>6,()=>6,s=>s.name,()=>2004);
 assert.deepEqual(result.headers.slice(4),['Đại số tuyến tính','Vật lý đại cương','ĐIỂM TB KỲ 1']);
 assert.deepEqual(result.headerRows[2].slice(4),[3,2,'']);
 assert.deepEqual(result.rows[0].slice(4),[8,0,6]);
 assert.equal(result.rows[0].length,7);
 const used=new Set();
 for(const m of result.merges) for(let r=m.s.r;r<=m.e.r;r++) for(let c=m.s.c;c<=m.e.c;c++){assert.ok(!used.has(`${r}:${c}`));used.add(`${r}:${c}`);}
});
