// Visual and interaction checks use an isolated REST fixture, never live writes.
const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const tables={students:[{id:'s1',code:'HV001',name:'Nguyễn Minh Anh',class:'OTQS1',current_lang_level:'A2',dob:'2003-01-02'},{id:'s2',code:'HV002',name:'Trần Hải Nam',class:'OTQS1',current_lang_level:'A1',dob:'2003-02-01'}],subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',semester:1,credits:3,category:'common'},{id:'phys',code:'PHYS',name:'Vật lý đại cương',semester:1,credits:2,category:'common'}],grades:[{student_id:'s1',subject_id:'math',score:8},{student_id:'s2',subject_id:'math',score:3.99}],languages:[],unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]};
  for(const width of [1440,390])for(const colorScheme of ['light','dark'])for(const reducedMotion of ['no-preference','reduce']){
   const context=await browser.newContext({viewport:{width,height:1050},colorScheme,reducedMotion});
   await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
   await context.route('**/*',route=>{const url=new URL(route.request().url());
    if(url.hostname==='127.0.0.1')return route.continue();
    if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});
    if(url.hostname.endsWith('.supabase.co'))return route.fulfill(route.request().method()==='POST'?{status:204,headers:{'access-control-allow-origin':'*'}}:{json:tables[url.pathname.split('/').pop()]||[],headers:{'access-control-allow-origin':'*'}});
    return route.fulfill({contentType:url.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3017',{waitUntil:'networkidle'});
   if(process.env.DIGITAL_TEST_CSS_PATH)await page.addStyleTag({path:process.env.DIGITAL_TEST_CSS_PATH});
   await page.waitForFunction(()=>window.AppState?.students.length===2);
   assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(248, 250, 252)');
   assert.match(await page.locator('.digital-report-banner').evaluate(e=>getComputedStyle(e).backgroundImage),/gradient/);
   assert.equal(await page.locator('.digital-report-banner h3').evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
   assert.equal(await page.locator('.u040-it[aria-current="page"]').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(239, 246, 255)');
   assert.equal(await page.locator('.u040-it[aria-current="page"]').evaluate(e=>getComputedStyle(e).color),'rgb(37, 99, 235)');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   if(colorScheme==='light'&&reducedMotion==='no-preference')await page.screenshot({path:`/tmp/digital-overview-${width}.png`});
   await page.evaluate(()=>window.switchTab('tab-sheet'));
   await page.evaluate(()=>window.switchTab('tab-reports'));
   const button=page.locator('#btnExportClassExcel');const original=await button.innerHTML();
   assert.match(await button.evaluate(e=>getComputedStyle(e).backgroundImage),/gradient/);
   assert.equal(await button.evaluate(e=>getComputedStyle(e).color),'rgb(255, 255, 255)');
   await page.evaluate(async()=>{const {withButtonLock}=await import(new URL('./src/js/supabase.js',document.baseURI).href);const button=document.getElementById('btnExportClassExcel');window.digitalCalls=0;const task=()=>{window.digitalCalls++;return new Promise(resolve=>window.digitalRelease=resolve);};window.digitalTask=withButtonLock(button,'⏳ Đang xử lý...',task);await withButtonLock(button,'⏳ Đang xử lý...',task);});
   assert.equal(await page.evaluate(()=>window.digitalCalls),1);assert.equal(await button.isDisabled(),true);assert.equal(await button.getAttribute('aria-busy'),'true');assert.equal(await button.innerText(),'Đang xử lý...');
   assert.equal(await button.evaluate(e=>getComputedStyle(e,'::before').animationName),reducedMotion==='reduce'?'none':'digital-spin');
   await page.evaluate(async()=>{window.digitalRelease();await window.digitalTask;});
   assert.equal(await button.isDisabled(),false);assert.equal(await button.innerHTML(),original);assert.equal(await button.getAttribute('aria-busy'),null);
   await page.evaluate(()=>window.switchTab('tab-sheet'));
   const input=page.locator('.grid-cell-input').first();await input.focus();
   assert.equal(await input.evaluate(e=>getComputedStyle(e).color),'rgb(30, 58, 138)');
   assert.equal(await input.evaluate(e=>getComputedStyle(e).fontWeight),'800');
   assert.equal(await input.evaluate(e=>getComputedStyle(e).outlineColor),'rgb(59, 130, 246)');
   await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>document.activeElement.dataset.col),'1');
   await page.evaluate(()=>window.switchTab('tab-profiles'));await page.locator('#btnAddNewProfile').click();
   const frame=page.locator('#modalStudentProfile>div').first();
   assert.equal(await frame.evaluate(e=>getComputedStyle(e).animationName),reducedMotion==='reduce'?'none':'app-dialog-enter');
   await page.locator('#profFormName').fill('Giữ nguyên nội dung đang nhập');
   await page.evaluate(async()=>{window.digitalInput=document.getElementById('profFormName');const {updateAllViews}=await import(new URL('./src/js/grades.js',document.baseURI).href);updateAllViews();});
   assert.equal(await page.locator('#profFormName').inputValue(),'Giữ nguyên nội dung đang nhập');assert.equal(await page.evaluate(()=>window.digitalInput===document.getElementById('profFormName')),true);
   await page.locator('#modalStudentProfile .modal-close').first().click();
   await page.evaluate(()=>window.switchTab('tab-settings'));await page.locator('#settingsDangerZone summary').click();
   assert.equal(await page.locator('#btnClearAllSubjectsBtn').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(255, 241, 242)');
   assert.equal(await page.locator('#btnClearAllSubjectsBtn').evaluate(e=>getComputedStyle(e).color),'rgb(190, 18, 60)');
   await page.locator('#btnClearAllSubjectsBtn').click();assert.equal(await page.locator('.danger-confirm [data-confirm]').isDisabled(),true);await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>window.AppState.subjects.length),2);assert.deepEqual(errors,[]);
   await context.close();
  }
  console.log('PASS: digital palette, gradients, soft danger, loading mutex/spinner/restore, grid keyboard focus, modal isolation, 1440/390px, OS themes and reduced motion. Fixture requests only.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1)});
