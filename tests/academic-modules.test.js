import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGradeCalculations } from '../src/js/academic/calculations.js';
import { createReportStatistics } from '../src/js/reports/statistics.js';
import { escapeHTML } from '../src/js/safe-html.js';

function fixture() {
  let state = { currentSheetClass:'OTQS1', students:[{id:'a',class:'OTQS1'},{id:'b',class:'TTG1'}],
    subjects:[{id:'m',class:'OTQS1',semester:1,credits:3,name:'Toán'},{id:'p',class:'OTQS1',semester:2,credits:1,name:'Lý'},{id:'other',class:'TTG1',semester:1,credits:2,name:'Môn khác'}],
    grades:{a:{m:8,p:4,other:10},b:{other:3.99}} };
  const context = {
    get AppState() {return state;}, DEFAULT_CLASSES:['OTQS1','TTG1'], escapeHTML,
    getFullSubjectName: subject => subject.name, getCurrentUserClassScope: () => null,
    getSubjectsForClass: (cls,semester) => state.subjects.filter(s=>s.class === cls && (!semester || s.semester === Number(semester))),
  };
  Object.assign(context,createGradeCalculations(context));
  Object.assign(context,createReportStatistics(context));
  return {context,replace: next=>{state=next;},get state(){return state;}};
}

test('calculation module weights credits and excludes subjects belonging to another class',()=>{
  const {context:c}=fixture();
  assert.equal(c.calculateSemesterGPA('a',1),8);
  assert.equal(c.calculateAcademicYearGPA('a',1),7);
  assert.equal(c.calculateYearGPA('a'),7);
  assert.equal(c.calculateCumulativeGPA4('a'),2.875);
  assert.equal(c.calculateCreditsPassed('a'),4);
  assert.equal(c.getDebtSubjects('a').length,0);
  assert.equal(c.getDebtSubjects('b')[0].score,3.99);
});

test('module services read replaced live state rather than retaining a stale snapshot',()=>{
  const f=fixture(),c=f.context;
  f.replace({...f.state,grades:{a:{m:0,p:''},b:{other:4}}});
  assert.equal(c.calculateYearGPA('a'),0);
  assert.equal(c.getDebtSubjects('a').length,1);
  assert.equal(c.getDebtSubjects('b').length,0);
  assert.equal(c.calculateCreditsPassed('a'),0);
});

test('report statistics use the same classification and failure rules as the calculation module',()=>{
  const {context:c,state}=fixture();
  const stats=c.computeReportAcademicStats(state.students,'course');
  assert.equal(stats.rankCounts['Khá'],1);
  assert.equal(stats.rankCounts['Kém'],1);
  assert.equal(stats.failedCourseInstances,1);
  assert.equal(c.REPORT_RANK_LEVELS.length,7);
  assert.equal(c.getReportClassification(8.99),'Giỏi');
  assert.equal(c.getReportClassification(9),'Xuất sắc');
});


test('grade conversion follows all new boundaries without gaps and retains missing/failed scores',()=>{
  const {context:c,state}=fixture();
  const ranges=[
    [9,10,'A+',4], [8.5,8.999,'A',3.7], [8,8.499,'B+',3.5],
    [7,7.999,'B',3], [6.5,6.999,'C+',2.5], [5.5,6.499,'C',2],
    [5,5.499,'D+',1.5], [4,4.999,'D',1], [0,3.99,'F',0],
  ];
  for(const [min,max,letter,scale4] of ranges){
    for(const score of [min,max]){
      const result=c.getGradeLetterAndScale4(score);
      assert.equal(result.letter,letter,`letter at ${score}`);
      assert.equal(result.scale4,scale4,`scale at ${score}`);
    }
  }
  for(const score of [null,undefined,'']) assert.equal(c.getGradeLetterAndScale4(score).letter,'-');
  assert.equal(c.getGradeLetterAndScale4('8.5').scale4,3.7);
  state.grades.a={m:8.5,p:9};
  assert.ok(Math.abs(c.calculateCumulativeGPA4('a')-3.775)<1e-10);
});
