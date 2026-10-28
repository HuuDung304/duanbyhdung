import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankAcademicRoster, rankingTableRows } from '../src/js/academic-ranking.js';
const records = count => Array.from({length:count},(_,i)=>({student:{id:`s${i}`,code:String(i).padStart(3,'0'),name:`HV ${i}`,class:'TTG1'},total:10-i*.01,hk1:9,hk2:9,languagePassed:true}));
test('ranking caps independent green and yellow quotas, sorts descending and does not overlap awards',()=>{
 const result=rankAcademicRoster(records(100).reverse());
 assert.equal(result.greens,10);assert.equal(result.yellows,25);
 assert.equal(result.ranked[0].student.code,'000');assert.equal(result.ranked[9].award,'green');assert.equal(result.ranked[10].award,'yellow');assert.equal(result.ranked[35].award,null);
 const small=rankAcademicRoster(records(19));assert.equal(small.greens,1);assert.equal(small.yellows,4);
});
test('strict thresholds, language requirement and no scores never manufacture award recipients',()=>{
 const data=records(20).map((r,i)=>({...r,total:i===0?8:i===1?7:i===2?9:null,languagePassed:i!==2}));
 const result=rankAcademicRoster(data);assert.equal(result.greens,0);assert.equal(result.yellows,1);assert.equal(result.ranked.find(r=>r.total===8).award,'yellow');
 assert.equal(rankAcademicRoster([]).ranked.length,0);
 const row=rankingTableRows([{student:{code:'001',name:'A',class:'TTG1'},total:null,hk1:null,hk2:null,languagePassed:false}],()=>'',{}).rows[0];
 assert.equal(row[1],'001');assert.deepEqual(row.slice(5),['','','','Chưa đạt','']);
});
test('each class quota uses its own roster and ties have a stable code order',()=>{
 const result=rankAcademicRoster(records(4).map(r=>({...r,total:9})).reverse());
 assert.equal(result.greens,0);assert.equal(result.yellows,1);assert.equal(result.ranked[0].student.code,'000');
});
