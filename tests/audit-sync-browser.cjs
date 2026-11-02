// Two independent authenticated browser contexts share only the mocked backend.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  const tables={students:[{id:'s1',code:'HV001',name:'Học viên kiểm thử',class:'TTG2'}],subjects:[{id:'m1',name:'Công Nghệ Thông Tin',code:'CNTT',credits:3,semester:3,category:'common'}],grades:[{student_id:'s1',subject_id:'m1',score:0}],languages:[],unit_settings:[{unit_id:'daidoi460',audit_logs:[],locks:{}}]};
  let failedAudit=false, rejectGrades=false;
  async function session(user){
   const context=await browser.newContext();
   await context.addInitScript(user=>sessionStorage.setItem('dd460_auth_session',JSON.stringify(user)),user);
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});
    if(!url.hostname.endsWith('.supabase.co'))return route.fulfill({contentType:'text/javascript',body:''});
    const table=url.pathname.split('/').pop();let rows=tables[table]||[];
    if(request.method()==='POST'){
     let payload=request.postDataJSON();payload=Array.isArray(payload)?payload:[payload];
     if(table==='grades'&&rejectGrades)return route.fulfill({status:400,json:{code:'23514',message:'Không lưu được điểm kiểm thử'}});
     if(payload.some(row=>row.unit_id?.includes(':audit:'))&&!failedAudit){failedAudit=true;return route.fulfill({status:403,json:{code:'42501',message:'Audit temporarily denied'}});}
     for(const row of payload){const keys=(url.searchParams.get('on_conflict')||'id').split(',');const old=rows.find(item=>keys.every(key=>item[key]===row[key]));if(old)Object.assign(old,row);else rows.push(row);}
     return route.fulfill({json:payload});
    }
    for(const [key,value]of url.searchParams){
     if(value.startsWith('eq.'))rows=rows.filter(row=>String(row[key])===value.slice(3));
     if(value.startsWith('ilike.'))rows=rows.filter(row=>String(row[key]).startsWith(value.slice(6).replace(/%$/,'')));
    }
    if(url.searchParams.get('order')?.includes('updated_at'))rows=[...rows].sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)));
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
    return route.fulfill({json:rows.slice(offset,offset+limit)});
   });
   const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3001',{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.AppState?.students.length===1);
   return {page,context,errors};
  }
  const admin=await session({type:'admin',displayName:'Admin kiểm thử'});
  const leader=await session({type:'class_account',class:'TTG2',displayName:'Lớp TTG2'});
  await admin.page.evaluate(()=>window.switchTab('tab-audit'));
  await leader.page.evaluate(()=>{window.switchTab('tab-sheet');window.AppState.currentSheetSemester=2;window.updateAllViews?.();});
  await leader.page.locator('#tab-sheet .table-dialog-launcher').click();
  // Choose year 2 using the application's real selector and edit a real grid input.
  await leader.page.locator('#sheetSemesterSelect').selectOption('2');
  let input=leader.page.locator('.grid-cell-input[data-student="s1"][data-subject="m1"]');
  await input.fill('8.25');await input.press('Tab');
  await leader.page.waitForFunction(()=>window.AppState.grades.s1.m1===8.25);
  await leader.page.waitForFunction(()=>Object.keys(localStorage).some(key=>key.startsWith('dd460_pending_audit:')));
  assert.equal(tables.grades[0].score,8.25);
  // Reload: local queue survives even though the source tab no longer has a pending promise.
  await leader.page.reload({waitUntil:'networkidle'});
  await admin.page.waitForFunction(()=>document.querySelector('#auditTableBody').textContent.includes('8.25'),null,{timeout:30000});
  const text=await admin.page.locator('#auditTableBody').innerText();
  assert.match(text,/Tài khoản Lớp TTG2/);assert.match(text,/Công Nghệ Thông Tin · Học kỳ 3/);assert.match(text,/\b0\b/);assert.match(text,/8.25/);
  await admin.page.locator('#auditSearch').fill('cong nghe thong tin');
  assert.match(await admin.page.locator('#auditSearchStatus').innerText(),/1 bản ghi/);
  await admin.page.locator('#auditSearch').fill('khong co ban ghi');
  assert.match(await admin.page.locator('#auditTableBody').innerText(),/Không tìm thấy/);
  await admin.page.locator('#auditSearchClear').click();
  assert.match(await admin.page.locator('#auditTableBody').innerText(),/8.25/);
  assert.equal(tables.unit_settings.filter(row=>row.unit_id.includes(':audit:')).length,1);
  // The unsuccessful grade mutation must not create a second audit record.
  rejectGrades=true;
  await leader.page.evaluate(()=>window.switchTab('tab-sheet'));
  await leader.page.locator('#tab-sheet .table-dialog-launcher').click();
  await leader.page.locator('#sheetSemesterSelect').selectOption('2');
  input=leader.page.locator('.grid-cell-input[data-student="s1"][data-subject="m1"]');
  await input.fill('9');await input.press('Tab');
  await leader.page.waitForFunction(()=>document.querySelector('#toastContainer').textContent.includes('Không lưu được điểm kiểm thử'));
  assert.equal(tables.grades[0].score,8.25);
  assert.equal(await leader.page.evaluate(()=>window.AppState.grades.s1.m1),8.25);
  assert.equal(tables.unit_settings.filter(row=>row.unit_id.includes(':audit:')).length,1);
  assert.deepEqual(admin.errors,[]);assert.deepEqual(leader.errors,[]);
  console.log('PASS: class edits 0 → 8.25; rejected audit survives reload and retries; independent Admin receives actor, subject, semester and before/after; rejected grade produces no log');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
