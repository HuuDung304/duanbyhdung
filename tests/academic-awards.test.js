import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildAcademicAwards,academicAwardLabel,studentAwardOutlook} from '../src/js/academic/awards.js';
import {createGradeCalculations} from '../src/js/academic/calculations.js';
import {mapDbRowToSubject,mapSubjectToDbRow} from '../src/js/database/mappers.js';
import {planOffering} from '../src/js/subjects/offerings.js';
import {normalizeSubjectsCatalog} from '../src/js/grades.js';
const {getGradeLetterAndScale4}=createGradeCalculations({});
const subjects=[{id:'old',name:'Cũ',credits:3,semester:1},{id:'a',name:'Toán',credits:3,semester:3},{id:'b',name:'Lý',credits:1,semester:3},{id:'z',name:'Thể thao',credits:0,semester:3},{id:'empty',name:'Chưa thi',credits:2,semester:4}];
const student=(id,level='B1',cls='TTG2')=>({id,code:id,name:id,class:cls,currentLangLevel:level});
function build(students,grades,kind='scholarships',extra={}){
 return buildAcademicAwards({students,grades,subjectsForClass:()=>subjects,languageStatus:s=>({isPassed:s.currentLangLevel==='B1',actualLevel:s.currentLangLevel}),scale4:score=>getGradeLetterAndScale4(score).scale4,kind,...extra});
}
test('award thresholds are inclusive, mutually exclusive and use unrounded averages',()=>{
 for(const [average,honor,scholarship]of [[9,'Học viên xuất sắc','Học bổng Lê Quý Đôn'],[8.999,'Học viên học giỏi','Học bổng loại A'],[8.5,'Học viên học giỏi','Học bổng loại A'],[8.499,'Học viên học giỏi','Học bổng loại B'],[8,'Học viên học giỏi','Học bổng loại B'],[7.999,'Học viên học tốt',''],[7,'Học viên học tốt',''],[6.999,'','']]){
  assert.equal(academicAwardLabel(average,'honors'),honor);assert.equal(academicAwardLabel(average,'scholarships'),scholarship);
 }
});
test('latest scored semester, partial scores, zero-credit pass/fail and weighted averages are enforced',()=>{
 const students=['high','a','b','low','zeroFail','languageFail','onlyOld','onlyZero','missingZero'].map(id=>student(id,id==='languageFail'?'A2':'B1'));
 const grades={high:{old:1,a:9,b:9,z:4},a:{a:8.5},b:{a:8,b:8,z:7},low:{a:9,b:6,z:4},zeroFail:{a:10,z:3.99},languageFail:{a:10},onlyOld:{old:10},onlyZero:{z:10},missingZero:{a:8}};
 const result=build(students,grades);
 assert.equal(result.latestSemester,3);assert.equal(result.year,2);
 assert.deepEqual(result.qualified.map(r=>r.student.id),['high','a','b','missingZero']);
 assert.equal(result.qualified[0].average,9);assert.equal(result.qualified[0].average4,4);
 assert.deepEqual(result.discretionary,[]);
 const honors=build(students,grades,'honors');
 assert.deepEqual(honors.discretionary.map(r=>r.student.id),['low']);
 assert.equal(honors.discretionary[0].average,8.25);
 assert.deepEqual(honors.discretionary[0].belowSeven.map(r=>[r.subject.name,r.score]),[['Lý',6]]);
});
test('honors use both semesters of the latest year; scholarships only the latest semester',()=>{
 const students=[student('s')],grades={s:{old:10,a:7,empty:10}};
 const scholarship=build(students,grades);assert.equal(scholarship.latestSemester,4);assert.equal(scholarship.qualified[0].average,10);
 const honors=build(students,grades,'honors');assert.equal(honors.qualified[0].average,8.2);assert.equal(honors.qualified[0].award,'Học viên học giỏi');
});
test('a low credited subject can be discretionary even if failed, but language and zero-credit failures cannot be waived',()=>{
 const students=[student('ok'),student('zero'),student('lang','A2')],grades={ok:{a:10,b:3,z:4},zero:{a:10,b:3,z:0},lang:{a:10,b:3,z:4}};
 const result=build(students,grades,'honors');assert.deepEqual(result.qualified,[]);assert.deepEqual(result.discretionary.map(r=>r.student.id),['ok']);
});
test('scope and applicable curriculum exclude foreign scores when choosing latest period',()=>{
 const result=build([student('s')],{s:{a:9,foreign:10}},'scholarships');assert.equal(result.latestSemester,3);
 for(const missing of ['',null,undefined,' ',NaN,11,-1])assert.equal(build([student('s')],{s:{a:missing}}).latestSemester,0);
 assert.equal(build([student('s')],{s:{z:0}}).latestSemester,3);
});
test('zero-credit subjects survive mapping, normalization, saving and curriculum planning',()=>{
 const raw={id:'zero',name:'Thể thao',credits:0,semester:3,category:'common'};
 assert.equal(mapDbRowToSubject(raw).credits,0);assert.equal(mapSubjectToDbRow(raw).credits,0);
 assert.equal(normalizeSubjectsCatalog([raw])[0].credits,0);
 assert.equal(planOffering({subjects:[],students:[],grades:{},role:'admin',name:'Thể thao',credits:0,semester:3,classes:['TTG2'],createId:()=> 'zero'}).credits,0);
});

test('personal outlook separates full and provisional results, retains the 7.0 honor and lists blockers',()=>{
 const input={student:student('s'),subjectsForClass:()=>subjects,languageStatus:()=>({isPassed:true,requiredStandard:'B1'}),scale4:score=>getGradeLetterAndScale4(score).scale4};
 const pending=studentAwardOutlook({...input,grades:{s:{a:7,b:7,z:4}},kind:'honors'});
 assert.equal(pending.complete,false);assert.match(pending.label,/Tạm tính: Học viên học tốt/);assert.match(pending.note,/Chờ 1\/4/);
 const full=studentAwardOutlook({...input,grades:{s:{a:7,b:7,z:4,empty:7}},kind:'honors'});
 assert.equal(full.complete,true);assert.match(full.label,/Có khả năng đạt: Học viên học tốt/);
 const failed=studentAwardOutlook({...input,grades:{s:{a:10,z:0}},kind:'scholarships'});
 assert.equal(failed.label,'Chưa đủ điều kiện');assert.match(failed.note,/chưa qua môn 0 tín chỉ/);
 const noData=studentAwardOutlook({...input,grades:{},kind:'honors'});assert.equal(noData.period,'');assert.equal(noData.label,'Chưa có điểm để xét');
});
