// Read-only exports against an isolated Supabase fixture; no production data is accessed.
const {chromium}=require('playwright');const XLSX=require('xlsx');const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    const classes=['OTQS1','OTQS1','OTQS1','OTQS1','OTQS2','TTG1','XMCB'];
    const levels=['A2.1','A2','B1',null,'A1','B2','A2'];
    const tables={
      students:classes.map((className,index)=>({id:`s${index}`,code:`HV00${index}`,name:`Học viên ${index}`,class:className,dob:index===3?'':'2003-02-01',current_lang_level:levels[index]})),
      subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'},{id:'physics',code:'PHYS',name:'Vật lý đại cương',credits:2,semester:2,category:'common'}],
      grades:[{student_id:'s0',subject_id:'math',score:3.99},{student_id:'s0',subject_id:'physics',score:2},{student_id:'s4',subject_id:'math',score:4},{student_id:'s1',subject_id:'math',score:8}],
      languages:[],unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]
    };
    const context=await browser.newContext({viewport:{width:Number(process.env.EXPORT_TEST_WIDTH)||1440,height:1000},acceptDownloads:true});
    await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.hostname==='127.0.0.1')return route.continue();
      if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});
      if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'),'utf8')});
      if(url.hostname.endsWith('.supabase.co'))return route.fulfill(request.method()==='POST'?{status:204,headers:{'access-control-allow-origin':'*'}}:{json:tables[url.pathname.split('/').pop()]||[],headers:{'access-control-allow-origin':'*'}});
      return route.fulfill({contentType:url.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});
    });
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3016',{waitUntil:'networkidle'});
    if(process.env.BENTO_TEST_CSS_PATH)await page.addStyleTag({path:process.env.BENTO_TEST_CSS_PATH});
    await page.waitForFunction(()=>window.AppState?.students.length===7);
    assert.equal(await page.locator('.bento-grid').isVisible(),false);
    const rows=page.locator('#dashboardLanguageSummaryBody tr');assert.equal(await rows.count(),5);
    assert.deepEqual(await rows.first().locator('th,td').allTextContents(),['OTQS1','4','2','50,0%','2','50,0%']);
    assert.deepEqual(await rows.nth(3).locator('th,td').allTextContents(),['TTG2','0','0','0,0%','0','0,0%']);
    await page.locator('#dashboardClassFilter').selectOption('OTQS2');
    assert.equal(await page.locator('#statTotalCadets').innerText(),'7');assert.equal(await rows.count(),5);
    const bounds=await page.evaluate(()=>({width:innerWidth,page:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('main *')].filter(e=>e.clientWidth && e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({id:e.id,cls:e.className,tag:e.tagName}))}));
    assert.ok(bounds.page<=bounds.width,JSON.stringify(bounds));
    const download=async selector=>{
      const previous=await page.evaluate(()=>window.AppState.activeTab);
      await page.evaluate(()=>window.switchTab('tab-reports'));
      const pending=page.waitForEvent('download');await page.locator(selector).click();const file=await pending;
      const book=XLSX.read(fs.readFileSync(await file.path()),{type:'buffer'});
      await page.evaluate(tab=>window.switchTab(tab),previous);return book;
    };
    const languageBook=await download('#btnExportLanguageSummary');
    assert.equal(languageBook.SheetNames.length,2);
    const roster=XLSX.utils.sheet_to_json(languageBook.Sheets.Danh_Sach_Hoc_Vien,{header:1,defval:''});
    assert.deepEqual(roster[4],['Mã học viên','Họ và tên','Ngày sinh','Lớp','Trình độ hiện tại','Trạng thái']);
    assert.deepEqual(roster.slice(5).map(row=>row[5]),['Đạt','Đạt','Đạt','Đạt','Chưa đạt','Chưa đạt','Chưa đạt']);
    assert.equal(roster.find(row=>row[0]==='HV000')[2],'01/02/2003');assert.equal(roster.find(row=>row[0]==='HV003')[2],'');
    const failedBook=await download('#btnExportFailedStudents');
    const failed=XLSX.utils.sheet_to_json(failedBook.Sheets.Hoc_Vien_Rot_Mon,{header:1,defval:''});
    assert.equal(failed.length,6);assert.deepEqual(failed[5].slice(0,4),['HV000','Học viên 0',2003,'OTQS1']);
    assert.match(failed[5][4],/Toán cao cấp \(3 tín chỉ\)/);assert.match(failed[5][4],/Vật lý đại cương \(2 tín chỉ\)/);assert.equal(failed[5][5],5);
    await page.locator('#dashboardLanguageStandard').selectOption('B1');
    assert.deepEqual(await rows.first().locator('th,td').allTextContents(),['OTQS1','4','1','25,0%','3','75,0%']);
    const changedBook=await download('#btnExportLanguageSummary');
    const changed=XLSX.utils.sheet_to_json(changedBook.Sheets.Danh_Sach_Hoc_Vien,{header:1});
    assert.match(changed[2][0],/B1/);assert.equal(changed.slice(5).filter(row=>row[5]==='Đạt').length,2);
    if(process.env.EXPORT_SCREENSHOT_PATH)await page.screenshot({path:process.env.EXPORT_SCREENSHOT_PATH,fullPage:false});
    await page.evaluate(()=>window.AuthState.setUser({type:'company_officer',displayName:'Cán bộ'}));
    assert.equal(await page.locator('.bento-grid').isVisible(),false);assert.equal(await rows.count(),5);
    assert.equal(await page.locator('#dashboardLanguageStandard').isDisabled(),true);assert.equal(await page.locator('#statTotalCadets').innerText(),'7');
    const officerBook=await download('#btnExportLanguageSummary');assert.equal(XLSX.utils.sheet_to_json(officerBook.Sheets.Danh_Sach_Hoc_Vien,{header:1}).length,12);
    await page.evaluate(()=>window.AuthState.setUser({type:'class_account',class:'OTQS1',displayName:'OTQS1'}));
    assert.equal(await rows.count(),1);assert.equal(await page.locator('#statTotalCadets').innerText(),'4');assert.equal(await page.locator('.bento-grid').isVisible(),true);
    assert.equal(await page.locator('#dashboardClassFilter').isDisabled(),true);assert.equal(await page.locator('#dashboardLanguageStandard').isDisabled(),true);
    const classBook=await download('#btnExportLanguageSummary');const classRows=XLSX.utils.sheet_to_json(classBook.Sheets.Danh_Sach_Hoc_Vien,{header:1});
    assert.equal(classRows.length,9);assert.ok(classRows.slice(5).every(row=>row[3]==='OTQS1'));
    const classFailed=await download('#btnExportFailedStudents');assert.equal(XLSX.utils.sheet_to_json(classFailed.Sheets.Hoc_Vien_Rot_Mon,{header:1}).length,6);
    await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'s0',code:'HV000',class:'OTQS1',displayName:'Học viên 0'}));
    let unauthorizedDownloads=0;page.on('download',()=>unauthorizedDownloads++);
    await page.evaluate(async()=>{const module=await import(new URL('./src/js/grades.js',document.baseURI).href);module.exportDashboardLanguageExcel();module.exportFailedStudentsExcel();});
    assert.equal(unauthorizedDownloads,0);assert.equal(await page.locator('.nav-tab[data-tab="tab-dashboard"]').isVisible(),false);assert.deepEqual(errors,[]);
    console.log('PASS: unit/class KPI scope, five/one language rows, zero headcount, threshold changes, actual sorted XLSX rosters and failed-credit totals, four roles, no live writes.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
