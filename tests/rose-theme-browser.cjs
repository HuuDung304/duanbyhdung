// Workspace report tabs and account settings; only isolated REST fixtures.
const {chromium}=require('playwright'),XLSX=require('xlsx'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [1440,390]){
   const tables={students:[{id:'s1',code:'HV001',name:'Nguyễn Minh Anh',class:'OTQS1',dob:'2003-02-01',current_lang_level:'A2',achievements:['Chiến sĩ tiên tiến 2025']},{id:'s2',code:'HV002',name:'Trần Hải Nam',class:'OTQS1',dob:'2004-03-02',current_lang_level:'A1'},{id:'s3',code:'HV003',name:'Lê Minh Đức',class:'TTG1',dob:'2002-04-03',current_lang_level:'B1.1'}],subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'},{id:'phys',code:'PHYS',name:'Vật lý đại cương',credits:2,semester:2,category:'common'}],grades:[{student_id:'s1',subject_id:'math',score:9},{student_id:'s1',subject_id:'phys',score:3.99},{student_id:'s2',subject_id:'math',score:4}],languages:[],unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]};
   tables.students.push({id:'s4',code:'HV004',name:'A21 Student',class:'TTG1',current_lang_level:'A21'},{id:'s5',code:'HV005',name:'No Level',class:'OTQS1',current_lang_level:'Chưa đạt'});
   const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
   await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});if(u.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'),'utf8')});if(u.hostname.endsWith('.supabase.co'))return route.fulfill({json:tables[u.pathname.split('/').pop()]||[],headers:{'access-control-allow-origin':'*'}});return route.fulfill({contentType:u.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3018',{waitUntil:'networkidle'});if(process.env.REPORT_TEST_CSS_PATH)await page.addStyleTag({path:process.env.REPORT_TEST_CSS_PATH});
   await page.waitForFunction(()=>window.AppState?.students.length===5);
   await page.emulateMedia({reducedMotion:'reduce'});

   for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    const primary=theme==='light'?'rgb(135, 61, 89)':'rgb(237, 175, 200)';
    assert.equal(await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),theme==='light'?'rgb(246, 239, 235)':'rgb(33, 26, 32)');
    assert.equal(await page.locator('.u040-it[aria-current="page"]').evaluate(el=>getComputedStyle(el).color),primary);
    assert.equal(await page.locator('#dashboardKpis>div').first().evaluate(el=>getComputedStyle(el).backgroundColor),theme==='light'?'rgb(255, 252, 250)':'rgb(48, 38, 45)');
    await page.screenshot({path:`/tmp/rose-dashboard-${width}-${theme}.png`});
    await page.locator('.sidebar-account-trigger').click();
    assert.equal(await page.locator('#sidebarAccountMenu').evaluate(el=>getComputedStyle(el).backgroundColor),theme==='light'?'rgb(255, 252, 250)':'rgb(48, 38, 45)');
    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.switchTab('tab-reports'));
    const button=page.locator('#btnExportClassExcel');
    assert.match(await button.evaluate(el=>getComputedStyle(el).backgroundImage),/gradient/);
    assert.equal(await button.evaluate(el=>getComputedStyle(el).color),'rgb(255, 250, 252)');
    await button.click();assert.equal(await page.locator('#reportExportDialog').evaluate(el=>el.open),true);
    await page.keyboard.press('Escape');
    await page.screenshot({path:`/tmp/rose-exports-${width}-${theme}.png`});
    await page.evaluate(()=>window.switchTab('tab-settings'));
    await page.screenshot({path:`/tmp/rose-subjects-${width}-${theme}.png`});
    await page.evaluate(()=>window.switchTab('tab-sheet'));
    const cell=page.locator('.grid-cell-input:not([disabled])').first();
    if(await cell.count()){await cell.focus();assert.equal(await cell.evaluate(el=>getComputedStyle(el).outlineColor),theme==='light'?'rgb(164, 72, 107)':'rgb(243, 180, 204)');}
    await page.screenshot({path:`/tmp/rose-sheet-${width}-${theme}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    for(const tab of ['tab-profiles','tab-cumulative','tab-master']){
     await page.evaluate(tab=>window.switchTab(tab),tab);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow in ${tab}`);
     await page.screenshot({path:`/tmp/rose-${tab}-${width}-${theme}.png`});
    }
    await page.evaluate(()=>window.switchTab('tab-dashboard'));
    await page.getByRole('tab',{name:'Xếp loại điểm quá trình',exact:true}).click();
    assert.equal(await page.locator('#yearBreakdownTable tbody td').first().evaluate(el=>getComputedStyle(el).backgroundColor),theme==='light'?'rgb(255, 252, 250)':'rgb(48, 38, 45)');
    await page.screenshot({path:`/tmp/rose-year-${width}-${theme}.png`});
   }
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px warm palette: light/dark, cards, navigation, account, export dialog, subjects, grade focus and responsive layout`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
