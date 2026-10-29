// Readability, responsive controls, sticky columns and empty/zero metrics; isolated REST fixtures only.
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
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.locator('.u040-it[data-tab="tab-sheet"]').click();
   await page.waitForFunction(()=>document.querySelector('.readable-data-table'));
   const options=page.locator('#toolbarOptions');
   assert.equal(await options.evaluate(e=>e.open),width>640);
   assert.equal(await page.locator('.u040-page-heading').evaluate(e=>e.getBoundingClientRect().height<150),true);
   if(width<640){
    assert.equal(await page.locator('#sheetAdvancedControls').evaluate(e=>e.open),false);
    assert.ok((await page.locator('#classSpreadsheetWrapper').boundingBox()).y<650);
    await options.locator('summary').first().click();
    assert.equal(await page.locator('.bento-quick').isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await options.evaluate(e=>e.open),false);
    await page.locator('#sheetAdvancedControls>summary').click();
   }
   assert.equal(await page.locator('#btnSheetScale4').isVisible(),true);
   const identity=page.locator('#spreadsheetThead tr').first().locator('th').nth(2);
   assert.equal(await identity.evaluate(e=>getComputedStyle(e).position),'sticky');
   await page.locator('#spreadsheetTable').evaluate(t=>t.parentElement.scrollLeft=10000);
   const pin=await identity.boundingBox();
   const scroll=await page.locator('#spreadsheetTable').evaluate(t=>{const r=t.parentElement.getBoundingClientRect();return {x:r.x,width:r.width};});
   assert.ok(pin.x>=scroll.x-2 && pin.x<scroll.x+scroll.width);
   assert.equal(await page.locator('#sheetInstructionBanner').evaluate(e=>e.open),false);
   await page.locator('#sheetInstructionBanner>summary').click();
   assert.match(await page.locator('#sheetInstructionBanner').innerText(),/Enter/);
   await page.locator('.u040-it[data-tab="tab-dashboard"]').click();
   assert.equal(await page.locator('.report-policy').evaluate(e=>e.open),false);
   assert.match(await page.locator('#statAvgGPASub').innerText(),/N2: —/);
   await page.locator('.report-policy>summary').click();
   assert.equal(await page.locator('#reportClassificationPolicy').isVisible(),true);
   await page.evaluate(async()=>{
    const {renderDashboard}=await import(new URL('./src/js/grades.js',document.baseURI).href);
    window.AppState.grades={};renderDashboard();
   });
   assert.equal(await page.locator('#statAvgGPA').innerText(),'—');
   await page.evaluate(async()=>{
    const {renderDashboard}=await import(new URL('./src/js/grades.js',document.baseURI).href);
    window.AppState.grades={s1:{math:0}};renderDashboard();
   });
   assert.equal(await page.locator('#statAvgGPA').innerText(),'0.00');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(errors,[]);
   console.log(`PASS: ${width}px compact controls, keyboard disclosures, pinned identity, grade absence versus zero, responsive layout`);
   await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
