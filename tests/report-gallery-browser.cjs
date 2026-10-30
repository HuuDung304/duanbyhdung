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
   await page.evaluate(()=>window.switchTab('tab-reports'));
   await page.emulateMedia({reducedMotion:'reduce'});
   const cards=page.locator('.report-gallery .report-export-card');assert.equal(await cards.count(),5);
   const positions=await cards.evaluateAll(items=>items.map(item=>{const r=item.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width};}));
   if(width>640){assert.equal(positions[0].y,positions[1].y);assert.ok(positions[1].x>positions[0].x);assert.equal(positions[2].y,positions[3].y);}else{assert.ok(positions[1].y>positions[0].y);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   for(const button of await page.locator('.report-gallery button').all()) {assert.equal((await button.innerText()).trim(),'');assert.ok(await button.getAttribute('aria-label'));assert.equal(await button.locator('svg').count(),1);}
   let downloads=0;page.on('download',()=>downloads++);
   const icon=page.locator('#btnExportRanking');await icon.focus();await page.keyboard.press('Enter');
   assert.equal(await page.locator('#reportExportDialog').evaluate(d=>d.open),true);
   assert.equal(await page.locator('#rankingYearSelect').inputValue(),'');
   await page.locator('#reportExportConfirm').click();assert.equal(await page.locator('#reportExportDialog').evaluate(d=>d.open),true);
   await page.locator('#rankingYearSelect').selectOption('3');await page.keyboard.press('Escape');
   assert.equal(await page.locator('#reportExportDialog').evaluate(d=>d.open),false);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'btnExportRanking');assert.equal(downloads,0);
   await icon.click();assert.equal(await page.locator('#rankingYearSelect').inputValue(),'');await page.locator('#reportExportCancel').click();assert.equal(downloads,0);
   await page.locator('#btnExportClassExcel').click();assert.equal(await page.locator('#reportsClassSelect').isVisible(),true);assert.equal(await page.locator('#rankingYearSelect').isVisible(),false);await page.locator('#reportExportCancel').click();
   assert.deepEqual(errors,[]);console.log(`PASS: ${width}px gallery, accessible icon buttons, responsive columns, reduced motion, required year and keyboard cancellation`);await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
