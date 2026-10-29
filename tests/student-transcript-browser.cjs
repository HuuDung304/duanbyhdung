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
   await page.evaluate(()=>{
    window.AppState.subjects.push({id:'s3a',code:'HK3A',name:'Môn đã học kỳ 3',credits:2,semester:3,category:'common'},{id:'s3b',name:'Môn chưa học kỳ 3',credits:3,semester:3,category:'common'},{id:'s10a',name:'Môn kỳ 10 điểm 0',credits:1,semester:10,category:'common'},{id:'s4a',name:'Môn chưa có điểm kỳ 4',credits:3,semester:4,category:'common'});
    Object.assign(window.AppState.grades.s1,{s3a:7.5,s3b:'',s10a:0,s4a:null});
   });
   await page.evaluate(()=>window.switchTab('tab-cumulative'));
   await page.locator('#cumulativeTableBody .btn-open-transcript[data-id="s1"]').click();
   const modal=page.locator('#modalTranscriptDetail');assert.equal(await modal.isVisible(),true);
   assert.doesNotMatch(await page.locator('#transcriptModalTitle').innerText(),/toàn khóa/i);
   assert.match(await page.locator('#transcriptModalSubtitle').innerText(),/8 tín chỉ/);
   assert.equal(await modal.locator('[data-semester]:visible').count(),4);
   assert.equal(await page.locator('#tcHk1TableBody tr').count(),1);assert.equal(await page.locator('#tcHk2TableBody tr').count(),1);
   assert.match(await page.locator('#tcHk2TableBody').innerText(),/3.99/);
   assert.match(await page.locator('#tcHk3TableBody').innerText(),/Môn đã học kỳ 3/);
   assert.doesNotMatch(await modal.innerText(),/Môn chưa học kỳ 3|Môn chưa có điểm kỳ 4/);
   assert.match(await page.locator('#tcHk10TableBody').innerText(),/0.00/);
   await modal.locator('button.modal-close').last().click();
   await page.locator('#cumulativeTableBody .btn-open-transcript[data-id="s2"]').click();
   assert.equal(await modal.locator('[data-semester]:visible').count(),1);
   assert.equal(await page.locator('#tcExtraSemestersContainer').innerText(),'');
   await modal.locator('button.modal-close').last().click();
   await page.locator('#cumulativeTableBody .btn-open-transcript[data-id="s3"]').click();
   assert.equal(await modal.locator('[data-semester]:visible').count(),0);assert.equal(await page.locator('#tcNoGradedSubjects').isVisible(),true);
   await modal.locator('button.modal-close').last().click();
   await page.evaluate(()=>window.AuthState.setUser({type:'class_account',class:'OTQS1'}));
   await page.evaluate(()=>window.switchTab('tab-cumulative'));
   assert.equal(await page.locator('#cumulativeTableBody .btn-open-transcript[data-id="s3"]').count(),0);
   assert.deepEqual(errors,[]);console.log(`PASS: ${width}px transcript includes completed and partial semesters through HK10, preserves zero/failing marks and clears stale student content`);await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
