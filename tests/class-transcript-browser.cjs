// Export-center, OOXML formatting and account-menu checks against a REST fixture only.
const {chromium}=require('playwright'),XLSX=require('xlsx'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [1440,390]){
   const tables={students:[{id:'s1',code:'HV001',name:'Nguyễn Minh Anh',class:'OTQS1',dob:'2003-02-01',current_lang_level:'A2',achievements:['Chiến sĩ tiên tiến 2025']},{id:'s2',code:'HV002',name:'Trần Hải Nam',class:'OTQS1',dob:'2004-03-02',current_lang_level:'A1'},{id:'s3',code:'HV003',name:'Lê Minh Đức',class:'TTG1',dob:'2002-04-03',current_lang_level:'B1.1'}],subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'},{id:'phys',code:'PHYS',name:'Vật lý đại cương',credits:2,semester:2,category:'common'}],grades:[{student_id:'s1',subject_id:'math',score:9},{student_id:'s1',subject_id:'phys',score:3.99},{student_id:'s2',subject_id:'math',score:4}],languages:[],unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]};
   const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
   await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});if(u.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'),'utf8')});if(u.hostname.endsWith('.supabase.co'))return route.fulfill({json:tables[u.pathname.split('/').pop()]||[],headers:{'access-control-allow-origin':'*'}});return route.fulfill({contentType:u.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3018',{waitUntil:'networkidle'});if(process.env.REPORT_TEST_CSS_PATH)await page.addStyleTag({path:process.env.REPORT_TEST_CSS_PATH});
   await page.waitForFunction(()=>window.AppState?.students.length===3);
   for(const type of ['admin','company_officer','class_account']) {
    await page.evaluate(type=>window.AuthState.setUser({type,class:'OTQS1',displayName:'Kiểm thử'}),type);
    await page.evaluate(()=>window.switchTab('tab-reports'));
    assert.equal(await page.locator('button[id^="btnExport"]').count(),1);
    const selector=page.locator('#reportsClassSelect');
    if(type==='class_account') {
     assert.equal(await selector.isDisabled(),true); assert.equal(await selector.inputValue(),'OTQS1');
    } else {
     assert.equal(await selector.isDisabled(),false);
     assert.deepEqual(await selector.locator('option').evaluateAll(items=>items.map(item=>item.value)),['','OTQS1','OTQS2','TTG1','TTG2','XMCB']);
     await selector.selectOption('OTQS1');
    }
    const pending=page.waitForEvent('download'); await page.locator('#btnExportClassExcel').click();
    const file=await pending; assert.equal(file.suggestedFilename(),'Bảng điểm OTQS1.xlsx');
    const bytes=fs.readFileSync(await file.path()),book=XLSX.read(bytes,{type:'buffer'});
    const rows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1});
    assert.deepEqual(rows[0].slice(0,6),['STT','MÃ HỌC VIÊN','HỌ VÀ TÊN','LỚP','NGÀY THÁNG NĂM SINH','HỌC KỲ 1']);
    assert.equal(rows[1][5],'Toán cao cấp'); assert.equal(rows[2][5],3);
    assert.equal(rows.length,5);assert.equal(rows[3][1],'HV001');assert.equal(rows[3][4],'01/02/2003');
    assert.equal(rows[3][5],9); assert.ok(book.Sheets[book.SheetNames[0]]['!merges'].length>0);
    assert.ok(!rows.flat().includes('HV003'));
    const archive=XLSX.CFB.read(bytes,{type:'buffer'});
    const styles=new TextDecoder().decode(archive.FileIndex.find(file=>file.name==='styles.xml').content);
    assert.match(styles,/Times New Roman/);assert.match(styles,/<left style="thin">/);assert.match(styles,/horizontal="center" vertical="center"/);
   }
   await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'s1',code:'HV001',class:'OTQS1'}));
   await page.evaluate(()=>window.switchTab('tab-reports'));
   assert.equal(await page.locator('#btnExportClassExcel').isVisible(),false);
   assert.deepEqual(errors,[]);
   console.log(`PASS: ${width}px class transcript: admin/officer choice, class isolation, completed semesters, exact filename, formatted real XLSX`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
