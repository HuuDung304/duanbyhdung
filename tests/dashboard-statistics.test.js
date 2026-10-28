import {test} from 'node:test';
import assert from 'node:assert/strict';
import {highestLanguageLevel,studentBirthYear,collectLanguageStatistics,failedStudentExportRows} from '../src/js/dashboard-statistics.js';

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


test('language export selects one highest level and accepts abbreviated level codes',()=>{
  assert.equal(highestLanguageLevel('A1, A21, A2'),'A2');
  assert.equal(highestLanguageLevel('A2; B11; B1'),'B1');
  assert.equal(highestLanguageLevel('B11'),'B11');
  assert.equal(highestLanguageLevel(null),'Chưa đạt');
});

test('Russian roster accepts only the five supported levels and canonicalizes legacy dotted spelling', () => {
 for(const [input,expected] of [['A1','A1'],['A2.1','A21'],['A21','A21'],['A2','A2'],['B1.1','B11'],['B11','B11'],['B1','B1'],['A1, A21, A2','A2'],['A2.2','Chưa đạt'],['B1.2','Chưa đạt'],['B2','Chưa đạt'],['A1.1','Chưa đạt']]) assert.equal(highestLanguageLevel(input),expected);
});
