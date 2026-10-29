import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planOffering,offeringClasses,subjectHasGrades,stableOfferingId,SUBJECT_CLASSES} from '../src/js/subjects/offerings.js';
import {AppState,getFullSubjectName,normalizeSubjectsCatalog,parseExcelSubjectHeader,resolveSubjectByCompositeKey} from '../src/js/grades.js';
const base={subjects:[],students:[],grades:{},role:'admin',name:'Môn A',semester:1,credits:3,classes:SUBJECT_CLASSES,createId:()=> 'unique'};
test('TH1 assigns one offering to all five classes; TH2 keeps disjoint class offerings separate',()=>{
 const shared=planOffering(base);assert.deepEqual(offeringClasses(shared),SUBJECT_CLASSES);assert.equal(shared.category,'common');
 const a=planOffering({...base,classes:['OTQS1'],createId:()=> 'a'});
 const b=planOffering({...base,subjects:[a],name:'Môn B',classes:['TTG1'],createId:()=> 'b'});
 assert.deepEqual(offeringClasses(a),['OTQS1']);assert.deepEqual(offeringClasses(b),['TTG1']);assert.notEqual(a.id,b.id);
});
test('the same literal course name and code in different semesters never shares an ID',()=>{
 const a=planOffering({...base,code:'A',classes:['OTQS1']});
 const b=planOffering({...base,subjects:[a],code:'A',semester:2,classes:['TTG1'],createId:()=> 'later'});
 assert.notEqual(a.id,b.id);assert.equal(a.semester,1);assert.equal(b.semester,2);assert.equal(a.name,b.name);
});
test('editing exact timetable names preserves existing IDs and every grade; zero is an existing grade',()=>{
 const original=Object.freeze({id:'legacy-id',name:'TTQS',code:'TTQS',credits:1,semester:1,category:'common',targetClass:'all'});
 const grades=Object.freeze({s1:Object.freeze({'legacy-id':0})});
 const planned=planOffering({...base,subjects:[original],students:[{id:'s1',class:'OTQS1'}],grades,editId:original.id,code:'TTQS',name:'THỂ THAO QUÂN SỰ - thực hành (1)',credits:1});
 assert.equal(planned.id,'legacy-id');assert.equal(planned.name,'THỂ THAO QUÂN SỰ - thực hành (1)');assert.equal(original.name,'TTQS');assert.equal(grades.s1['legacy-id'],0);
 assert.equal(subjectHasGrades(grades,original.id),true);assert.equal(getFullSubjectName({name:'TTQS',course_name:'Tên cũ',code:'TTQS'}),'TTQS');
 assert.equal(normalizeSubjectsCatalog([original])[0].id,'legacy-id');assert.equal(normalizeSubjectsCatalog([original])[0].name,'TTQS');
});
test('a graded offering cannot move semester or drop a class with points; unused classes can be removed',()=>{
 const old={id:'old',name:'Môn A',code:'A',semester:1,credits:3,category:'common',targetClass:'all'};
 const data={...base,subjects:[old],students:[{id:'s',class:'OTQS1'}],grades:{s:{old:0}},editId:'old',code:'A'};
 assert.throws(()=>planOffering({...data,semester:2}),/không chuyển học kỳ/);
 assert.throws(()=>planOffering({...data,classes:['TTG1']}),/bỏ lớp đang có điểm/);
 const narrowed=planOffering({...data,classes:['OTQS1']});assert.equal(narrowed.id,'old');assert.deepEqual(offeringClasses(narrowed),['OTQS1']);
 assert.equal(data.grades.s.old,0);assert.equal(old.targetClass,'all');
});
test('duplicates never auto-merge; same-semester homonyms require distinct explicit codes',()=>{
 const a=planOffering({...base,code:'A1',classes:['OTQS1']});
 assert.throws(()=>planOffering({...base,subjects:[a],classes:['OTQS1']}),/đã có/);
 const b=planOffering({...base,subjects:[a],code:'A2',classes:['OTQS1'],createId:()=> 'b'});assert.notEqual(a.id,b.id);
 assert.throws(()=>planOffering({...base,subjects:[a],code:'A1',name:'Other',classes:['OTQS1']}),/đã có/);
});
test('officer and student cannot write; class accounts cannot modify shared subjects',()=>{
 assert.throws(()=>planOffering({...base,role:'company_officer'}),/không có quyền/);
 assert.throws(()=>planOffering({...base,role:'student'}),/không có quyền/);
 assert.throws(()=>planOffering({...base,role:'class_leader_OTQS1',classScope:'TTG1'}),/lớp khác/);
 const shared=planOffering(base);
 assert.throws(()=>planOffering({...base,role:'class_leader_OTQS1',classScope:'OTQS1',subjects:[shared],editId:shared.id}),/Admin/);
 const own=planOffering({...base,role:'class_leader_OTQS1',classScope:'OTQS1'});assert.deepEqual(offeringClasses(own),['OTQS1']);
});
test('deterministic Excel IDs include full punctuation, accented names, class and term',()=>{
 const a={name:'Vật lý',code:'VL',category:'specialized',targetClasses:['OTQS1'],semester:1};
 assert.equal(stableOfferingId(a),stableOfferingId({...a}));
 for(const diff of [{name:'Vat ly'},{name:'Vật-lý'},{targetClasses:['TTG1']},{semester:2},{name:'A'.repeat(100)+'B'},{name:'A'.repeat(100)+'C'}])assert.notEqual(stableOfferingId(a),stableOfferingId({...a,...diff}));
 assert.notEqual(stableOfferingId({...a,name:'A'.repeat(100)+'B'}),stableOfferingId({...a,name:'A'.repeat(100)+'C'}));
});
test('Excel resolution never takes a course from a different term or silently expands another class',()=>{
 const old=AppState.subjects;
 try{
  AppState.subjects=[{id:'a1',name:'Môn A',code:'A',semester:1,credits:3,category:'specialized',targetClasses:['OTQS1'],targetClass:'OTQS1'}];
  assert.throws(()=>resolveSubjectByCompositeKey({headerInfo:parseExcelSubjectHeader('Môn chưa cấu hình (3 TC)',1),studentClass:'OTQS1'}),/thêm đúng tên/);
  const raw='Kỹ thuật - thực hành (nâng cao)';assert.equal(parseExcelSubjectHeader(raw,2).courseName,raw);
  assert.equal(resolveSubjectByCompositeKey({headerInfo:parseExcelSubjectHeader('Môn A'),studentClass:'OTQS1',semesterHint:2,autoCreate:false}),null);
  const later=resolveSubjectByCompositeKey({headerInfo:parseExcelSubjectHeader('Môn A',2),studentClass:'TTG1',semesterHint:2});
  assert.notEqual(later.id,'a1');assert.equal(later.semester,2);assert.deepEqual(later.targetClasses,['TTG1']);assert.deepEqual(AppState.subjects[0].targetClasses,['OTQS1']);
  AppState.subjects.push({id:'literal',name:'Môn thực hành (HK1)',code:'LIT',semester:3,credits:2,category:'common',targetClass:'all'});
  assert.equal(resolveSubjectByCompositeKey({headerInfo:parseExcelSubjectHeader('Môn thực hành (HK1)',3),studentClass:'OTQS1',semesterHint:3}).id,'literal');
  AppState.subjects.push({id:'ambiguous',name:'Môn A',code:'A2',semester:1,credits:3,category:'specialized',targetClasses:['OTQS1'],targetClass:'OTQS1'});
  assert.throws(()=>resolveSubjectByCompositeKey({headerInfo:parseExcelSubjectHeader('Môn A',1),studentClass:'OTQS1'}),/trùng tên/);
  assert.equal(resolveSubjectByCompositeKey({headerInfo:parseExcelSubjectHeader('A2',1),studentClass:'OTQS1'}).id,'ambiguous');
 }finally{AppState.subjects=old;}
});
