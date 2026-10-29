// Single-year report presentation, with real calculation services and isolated REST fixtures.
const {chromium}=require('playwright'),XLSX=require('xlsx'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [1440,390]){
   const tables={students:[{id:'s1',code:'HV001',name:'Nguyễn Minh Anh',class:'OTQS1',dob:'2003-02-01',current_lang_level:'A2',achievements:['Chiến sĩ tiên tiến 2025']},{id:'s2',code:'HV002',name:'Trần Hải Nam',class:'OTQS1',dob:'2004-03-02',current_lang_level:'A1'},{id:'s3',code:'HV003',name:'Lê Minh Đức',class:'TTG1',dob:'2002-04-03',current_lang_level:'B1.1'}],subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'},{id:'phys',code:'PHYS',name:'Vật lý đại cương',credits:2,semester:2,category:'common'}],grades:[{student_id:'s1',subject_id:'math',score:9},{student_id:'s1',subject_id:'phys',score:3.99},{student_id:'s2',subject_id:'math',score:4}],languages:[],unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]};
   tables.subjects.push({id:'y2a',code:'Y2A',name:'Môn kỳ 3',credits:2,semester:3,category:'common'},{id:'y2b',code:'Y2B',name:'Môn kỳ 4',credits:2,semester:4,category:'common'});
   tables.grades.push({student_id:'s1',subject_id:'y2a',score:8},{student_id:'s1',subject_id:'y2b',score:9},{student_id:'s2',subject_id:'y2a',score:7},{student_id:'s2',subject_id:'y2b',score:0});
   const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
   await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});if(u.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'),'utf8')});if(u.hostname.endsWith('.supabase.co'))return route.fulfill({json:tables[u.pathname.split('/').pop()]||[],headers:{'access-control-allow-origin':'*'}});return route.fulfill({contentType:u.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3018',{waitUntil:'networkidle'});if(process.env.REPORT_TEST_CSS_PATH)await page.addStyleTag({path:process.env.REPORT_TEST_CSS_PATH});
   await page.waitForFunction(()=>window.AppState?.students.length===3);
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.getByRole('tab',{name:'Xếp loại điểm quá trình',exact:true}).click();
   const picker=page.getByRole('group',{name:'Năm học của điểm quá trình'});
   assert.equal(await picker.getByRole('button',{pressed:true}).innerText(),'Năm 2');
   assert.equal(await page.locator('#reportYearSemesterMatrixThead th').count(),4);
   assert.equal(await page.locator('#yearBreakdownTable').evaluate(t=>t.scrollWidth<=t.parentElement.clientWidth+1),true);
   assert.equal(await page.locator('#reportYearSemesterMatrixBody tr').count(),7);
   assert.equal(await page.locator('#reportYearSemesterMatrixFooter tr>*').count(),4);
   assert.match(await page.locator('#reportYearSemesterMatrixThead').innerText(),/Kỳ 3/);
   const row=page.locator('#reportYearSemesterMatrixBody tr').filter({has:page.locator('strong',{hasText:/^Giỏi$/})});
   assert.equal(await row.locator('td.year-total .year-count').innerText(),'1');
   assert.equal(await page.locator('#reportYearSemesterMatrixFooter th').innerText(),'Tổng');
   assert.deepEqual(await page.locator('#reportYearSemesterMatrixFooter td').allTextContents(),['100%','100%','100%']);
   assert.deepEqual(await page.locator('.year-breakdown-summary strong').allTextContents(),['1','1']);
   await picker.getByRole('button',{name:'Năm 1',exact:true}).click();
   assert.match(await page.locator('#reportYearSemesterMatrixThead').innerText(),/Kỳ 1/);
   assert.deepEqual(await page.locator('.year-breakdown-summary strong').allTextContents(),['1','1']);
   await picker.getByRole('button',{name:'Năm 1',exact:true}).focus();await page.keyboard.press('ArrowRight');
   assert.equal(await picker.getByRole('button',{pressed:true}).innerText(),'Năm 2');
   await page.locator('.year-breakdown-debts summary').click();
   assert.equal(await page.locator('.year-breakdown-debts tbody tr').count(),7);
   assert.match(await page.locator('.year-breakdown-debts tbody').innerText(),/Kém/);
   await picker.getByRole('button',{name:'Năm 5',exact:true}).click();
   assert.equal(await page.locator('.year-breakdown-status').innerText(),'Năm 5 chưa có điểm');
   assert.equal(await page.locator('#reportYearSemesterMatrixBody .year-count').first().innerText(),'—');
   assert.deepEqual(await page.locator('.year-breakdown-summary strong').allTextContents(),['—','—']);
   assert.deepEqual(await page.locator('#reportYearSemesterMatrixFooter td').allTextContents(),['—','—','—']);
   await picker.getByRole('button',{name:'Năm 2',exact:true}).click();
   await page.locator('#reportYearsFilterClass').selectOption('OTQS1');
   assert.equal(await page.locator('.year-breakdown-scope').innerText(),'2 học viên');
   assert.deepEqual(await page.locator('#reportYearSemesterMatrixFooter td').allTextContents(),['100%','100%','100%']);
   assert.equal(await picker.getByRole('button',{pressed:true}).innerText(),'Năm 2');
   await page.evaluate(()=>window.AuthState.setUser({type:'class_account',class:'OTQS1',displayName:'Lớp'}));
   await page.locator('.u040-it[data-tab="tab-dashboard"]').click();
   await page.getByRole('tab',{name:'Xếp loại điểm quá trình',exact:true}).click();
   assert.equal(await page.locator('#reportYearsFilterClass').isDisabled(),true);
   assert.equal(await page.locator('.year-breakdown-scope').innerText(),'2 học viên');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.deepEqual(errors,[]);
   await page.locator('.year-breakdown-card').screenshot({path:`/tmp/year-breakdown-${width}.png`});
   console.log(`PASS: ${width}px four-column report, year switching, keyboard focus, unchanged counts/debt and 100% totals, real zero vs absent year, class scope`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
