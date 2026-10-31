import test from 'node:test';
import assert from 'node:assert/strict';
import { saveCadetGrade, canEditCadetGrade, cadetScoreFails } from '../src/js/academic/cadet-results.js';
const subjects=[{id:'math',semester:1,credits:3}];
const setup=()=>({role:'admin',currentUser:{type:'admin'},students:[{id:'s1',class:'OTQS1'}],grades:{s1:{math:8}},locks:{}});
test('profile grade edits enforce scope and year locks without depending on selected sheet filters',()=>{
 const s=setup(),student=s.students[0];
 s.role='class_leader_OTQS1';assert.equal(canEditCadetGrade(s,student,subjects[0]),true);
 s.locks.OTQS1_year_1=true;assert.equal(canEditCadetGrade(s,student,subjects[0]),false);
 s.role='admin';assert.equal(canEditCadetGrade(s,student,subjects[0]),true);
 for(const role of ['company_officer','student','class_leader_TTG2','guest']){s.role=role;assert.equal(canEditCadetGrade(s,student,subjects[0]),false);}
});
test('profile score save handles decimal commas and blank deletion and commits state only after success',async()=>{
 const s=setup();let writes=0;
 const args={state:s,studentId:'s1',subjectId:'math',subjects,upsert:async(a,b,v)=>{writes++;assert.equal(s.grades.s1.math,8);assert.equal(v,3.99);return{error:null};},remove:async()=>{writes++;return{error:null};}};
 await saveCadetGrade({...args,rawValue:'3,99'});assert.equal(s.grades.s1.math,3.99);assert.equal(cadetScoreFails(s.grades.s1.math),true);
 await saveCadetGrade({...args,rawValue:''});assert.equal(Object.hasOwn(s.grades.s1,'math'),false);assert.equal(writes,2);
 for(const value of [null,undefined,'',4,10])assert.equal(cadetScoreFails(value),false);
 assert.equal(cadetScoreFails(0),true);
});
test('profile invalid scores, unauthorized subjects and failed writes never modify stored local values',async()=>{
 const s=setup();let calls=0;const args={state:s,studentId:'s1',subjectId:'math',subjects,upsert:async()=>{calls++;return{error:{message:'Rejected'}};},remove:async()=>({error:null})};
 for(const rawValue of ['abc','11','-1'])await assert.rejects(saveCadetGrade({...args,rawValue}),/0 đến 10/);
 await assert.rejects(saveCadetGrade({...args,rawValue:'3.99',subjectId:'foreign'}),/quyền/);
 assert.equal(calls,0);await assert.rejects(saveCadetGrade({...args,rawValue:'3.99'}),/Rejected/);
 assert.equal(s.grades.s1.math,8);
});
