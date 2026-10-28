import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const cases = [
  {file:'students.js',name:'executeClearAllStudents',api:'deleteAllStudentsFromSupabase'},
  {file:'grades.js',name:'deleteAllSubjectsAllSemesters',api:'deleteAllSubjectsFromSupabase'}
];
for (const scenario of cases) {
  function fixture({role='admin',accept=false,fail=false}={}) {
    const state={role,students:[{id:'hv1'}],subjects:[{id:'s1'}],grades:{hv1:{s1:3.99}},languages:{hv1:{current_level:'A2'}}};
    const counts={prompts:0,writes:0};
    const context=vm.createContext({AppState:state,showToast(){},logAuditTrail(){},populateStudentPicker(){},updateAllViews(){},
      requestDestructiveConfirmation:async()=>{counts.prompts++;return accept;},
      withButtonLock:async(button,label,action)=>action(),
      [scenario.api]:async()=>{counts.writes++;if(fail)throw new Error('Database unavailable');}
    });
    const source=readFileSync(new URL(`../src/js/${scenario.file}`,import.meta.url),'utf8');
    const start=source.indexOf(`export async function ${scenario.name}`);const end=source.indexOf('\nexport ',start+1);
    vm.runInContext(source.slice(start,end).replace(/^export /gm,''),context);
    return {state,counts,context};
  }
  test(`${scenario.name}: cancelling confirmation never changes local data or sends a write`, async()=>{
    const {state,counts,context}=fixture();const before=JSON.stringify(state);
    await context[scenario.name]();assert.equal(JSON.stringify(state),before);assert.equal(counts.writes,0);assert.equal(counts.prompts,1);
  });
  test(`${scenario.name}: a database error preserves local data`,async()=>{
    const {state,counts,context}=fixture({accept:true,fail:true});const before=JSON.stringify(state);
    await assert.rejects(context[scenario.name](),/Database unavailable/);
    assert.equal(JSON.stringify(state),before);assert.equal(counts.writes,1);
  });
  test(`${scenario.name}: officer and class accounts cannot open confirmation or delete`,async()=>{
    for(const role of ['company_officer','class_leader_OTQS1','student','guest']) {
      const {counts,context}=fixture({role,accept:true});await context[scenario.name]();
      assert.equal(counts.prompts,0);assert.equal(counts.writes,0);
    }
  });
}
