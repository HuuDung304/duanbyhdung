import{test}from'node:test';import assert from'node:assert/strict';import{nominationRecords,nominationDocumentXml,nominationYears}from'../src/js/party-nomination.js';
test('three selected semesters expand to complete academic years but only selected terms determine eligibility',()=>{
 assert.deepEqual(nominationYears([2,3,4]),[1,2]);assert.deepEqual(nominationYears([3,4,5]),[2,3]);
 const student={id:'s',code:'1',name:'S',class:'OTQS1',politicalStatus:'CAM_TINH_DANG'};
 const records=nominationRecords({students:[student],grades:{s:{a:2,b:4,c:4,d:4}},semesters:[2,3,4],subjectsForClass:(_class,semester)=>[{id:['a','b','c','d'][semester-1],credits:3}],languageStatus:()=>({isPassed:true,actualLevel:'A2'}),scale4:value=>value,threshold:3});
 assert.equal(records.length,1);assert.deepEqual(records[0].periods.map(period=>period.year),[1,2]);
 assert.deepEqual(records[0].periods[0].cells.slice(0,2),[2,4]);
});
test('party nomination filters learned status, language and all complete semesters; leaves incomplete terms/year blank and sorts classes',()=>{
 const students=['ok','low','language','notLearned','partial','other'].map(id=>({id,code:id,name:id,class:id==='other'?'OTQS1':'TTG1',politicalStatus:id==='notLearned'?'DOAN_VIEN':'CAM_TINH_DANG'}));
 const grades={ok:{a:3,b:3.5},low:{a:3,b:2},language:{a:4,b:4},notLearned:{a:4,b:4},partial:{a:3},other:{a:3,b:3}};
 const result=nominationRecords({students,grades,years:[2],subjectsForClass:(_c,sem)=>[{id:sem===3?'a':'b',credits:3}],languageStatus:s=>({isPassed:s.id!=='language',actualLevel:'A2'}),scale4:v=>v,threshold:2.5});
 assert.deepEqual(result.map(r=>r.student.id),['other','ok','partial']);assert.deepEqual(result.at(-1).periods[0].cells,[3,null,null]);
 const xml=nominationDocumentXml(result,[2],()=> '01/02/2004');assert.match(xml,/ĐỢT THÁNG .... NĂM ..../);assert.match(xml,/ngày ... tháng ... năm .../);assert.match(xml,/>T<\/w:t>/);assert.doesNotMatch(xml,/Lý lịch gia đình trong sạch/);assert.match(xml,/Tổng: 3 đồng chí/);
});
