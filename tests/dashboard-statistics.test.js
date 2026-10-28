import {test} from 'node:test';
import assert from 'node:assert/strict';
import {studentBirthYear,collectLanguageStatistics,failedStudentExportRows} from '../src/js/dashboard-statistics.js';

test('birth years are extracted from persisted ISO or Vietnamese dates without guessing missing years',()=>{
  for(const value of ['2003-05-09','09/05/2003','9.5.2003','2003-05-09T00:00:00Z',2003])assert.equal(studentBirthYear(value),2003);
  for(const value of [null,undefined,'','not-a-date'])assert.equal(studentBirthYear(value),'');
});

test('language class totals use their own headcounts and put all passing students first',()=>{
  const students=[{id:'a',code:'A',name:'An',class:'OTQS1',currentLangLevel:'A1'},{id:'b',code:'B',name:'Bình',class:'OTQS2',currentLangLevel:'B1'},{id:'c',code:'C',name:'Cường',class:'OTQS1'},{id:'d',code:'D',name:'Dung',class:'OTQS1'}];
  const evaluate=(level,standard)=>({isPassed:level===standard});
  const result=collectLanguageStatistics(students,{c:{currentLevel:'B1'}},'B1',evaluate,['OTQS1','OTQS2','TTG1','TTG2','XMCB']);
  assert.equal(result.rows.length,5);assert.equal(result.rows[0].total,3);assert.equal(result.rows[0].passed,1);assert.equal(result.rows[0].notPassed,2);
  assert.equal(result.rows[0].passedRate,100/3);assert.equal(result.rows[1].passedRate,100);assert.equal(result.rows[2].passedRate,0);assert.equal(result.rows[2].notPassedRate,0);
  assert.deepEqual(result.roster.map(item=>item.passed),[true,true,false,false]);
  const changed=collectLanguageStatistics(students,{},'A1',evaluate,['OTQS1']);assert.equal(changed.rows[0].passed,1);
});

test('failed student export totals only failed credits and preserves full course names',()=>{
  const rows=failedStudentExportRows([{student:{code:'001',name:'Nguyễn An',dob:'02/01/2003',class:'OTQS1'},debts:[{subject:{name:'Toán cao cấp',credits:3},score:3.99},{subject:{name:'Vật lý đại cương',credits:'2'},score:2}]}],subject=>subject.name);
  assert.deepEqual(rows[0].slice(0,4),['001','Nguyễn An',2003,'OTQS1']);assert.equal(rows[0][5],5);
  assert.match(rows[0][4],/Toán cao cấp \(3 tín chỉ\)/);assert.match(rows[0][4],/Vật lý đại cương \(2 tín chỉ\)/);
  assert.deepEqual(failedStudentExportRows([],subject=>subject.name),[]);
});
