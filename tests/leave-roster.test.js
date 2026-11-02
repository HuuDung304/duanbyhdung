import{test}from'node:test';import assert from'node:assert/strict';import{hometownRegion,leaveTime,leaveRows}from'../src/js/leave-roster.js';
test('leave regions respect boundary and old provinces without guessing unknown addresses',()=>{
 for(const text of['Hà Tĩnh','Hà Nội','Xã Phú Thọ, tỉnh Nghệ An'])assert.equal(hometownRegion(text),'north');
 for(const text of['Quảng Trị','Quảng Bình','Huế','Xã Phú Thịnh, tỉnh Gia Lai','TP. Hồ Chí Minh'])assert.equal(hometownRegion(text),'south');
 assert.equal(hometownRegion('Chưa rõ'),'');assert.equal(leaveTime('2026-07-11T06:00'),'06 giờ 00 ngày 11 tháng 7 năm 2026');assert.throws(()=>leaveTime('2026-02-30T06:00'));
 const students=[{id:'s',name:'A',code:'01',class:'OTQS1',hometown:'Gia Lai',rank:'Hạ sĩ'}];const rows=leaveRows(students,{},'về','lên');assert.equal(rows.south.length,1);assert.match(rows.south[0][3],/Ô tô quân sự 1/);assert.equal(rows.north.length,0);
 assert.throws(()=>leaveRows([{...students[0],hometown:''}],{},'về','lên'),/Chưa xác định/);
});
