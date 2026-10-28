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
   assert.equal(await page.locator('#btnStudentSelfEdit').count(),0);
   assert.equal(await page.locator('.bento-account #btnLogout').count(),0);
   assert.equal(await page.locator('#sidebarAccountMenu #btnLogout').count(),1);
   assert.equal(await page.locator('button[id^="btnExport"]').evaluateAll(buttons=>buttons.every(button=>button.closest('#tab-reports'))),true);
   await page.evaluate(()=>window.switchTab('tab-reports'));
   assert.equal(await page.locator('#tab-reports .report-export-card:visible').count(),5);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   const download=async id=>{if(id==='#btnExportClassExcel' && await page.locator('#reportsClassSelect').isEnabled()) await page.locator('#reportsClassSelect').selectOption('OTQS1');const pending=page.waitForEvent('download');await page.locator(id).click();const file=await pending;if(id==='#btnExportClassExcel' && await page.evaluate(()=>window.AppState.role!=='student')) assert.equal(file.suggestedFilename(),'Bảng điểm OTQS1.xlsx');const data=fs.readFileSync(await file.path());const archive=XLSX.CFB.read(data,{type:'buffer'});const styles=new TextDecoder().decode(archive.FileIndex.find(f=>f.name==='styles.xml').content);assert.match(styles,/name val="Times New Roman"/);assert.doesNotMatch(styles,/name val="Calibri"/);assert.match(styles,/<left style="thin">/);assert.match(styles,/<right style="thin">/);assert.match(styles,/horizontal="center" vertical="center" wrapText="1"/);return XLSX.read(data,{type:'buffer'});};
   await page.evaluate(()=>{window.AppState.students[0].currentLangLevel='A1, A2, B11';});
   const language=await download('#btnExportLanguageSummary');
   const list=XLSX.utils.sheet_to_json(language.Sheets.Danh_Sach_Hoc_Vien,{header:1,defval:''});
   assert.equal(list[4][2],'Ngày sinh');assert.equal(list.find(row=>row[0]==='HV001')[2],'01/02/2003');assert.equal(list.find(row=>row[0]==='HV001')[4],'B11');
   assert.deepEqual(list.slice(5).map(row=>row[5]),['Đạt','Đạt','Chưa đạt']);
   await page.locator('#reportsClassSelect').selectOption('TTG1');const scoped=await download('#btnExportLanguageSummary');assert.equal(XLSX.utils.sheet_to_json(scoped.Sheets.Danh_Sach_Hoc_Vien,{header:1}).length,6);
   await page.locator('#reportsClassSelect').selectOption('all');
   for(const id of ['#btnExportProfileExcel','#btnExportClassExcel','#btnExportFailedStudents','#btnExportAchievements','#btnExportReportExcel','#btnExportCumulativeExcel','#btnExportMasterExcel']){
    const book=await download(id); if(id==='#btnExportClassExcel') { const transcriptRows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1}); assert.deepEqual(transcriptRows[0],['MÃ HỌC VIÊN','HỌ VÀ TÊN','LỚP','NĂM SINH','ĐIỂM CÁC MÔN KỲ 1','ĐIỂM TB KỲ 1']); assert.match(transcriptRows[1][4],/Toán cao cấp/); } if(id==='#btnExportClassExcel') await page.locator('#reportsClassSelect').selectOption('all');assert.ok(book.SheetNames.length>0);
    if(id==='#btnExportAchievements')assert.ok(XLSX.utils.sheet_to_json(book.Sheets.Thanh_Tich_Hoc_Tap,{header:1}).flat().some(value=>String(value).includes('Chiến sĩ tiên tiến')));
   }
   await page.evaluate(()=>window.AuthState.setUser({type:'class_account',class:'OTQS1',displayName:'OTQS1'}));await page.evaluate(()=>window.switchTab('tab-reports'));
   assert.equal(await page.locator('#reportsClassSelect').isDisabled(),true);
   const classBook=await download('#btnExportLanguageSummary');assert.equal(XLSX.utils.sheet_to_json(classBook.Sheets.Danh_Sach_Hoc_Vien,{header:1}).length,7);
   // Switching from a class account must restore the officer's whole-unit scope.
   await page.evaluate(()=>window.AuthState.setUser({type:'company_officer',displayName:'Cán bộ'}));
   await page.evaluate(()=>window.switchTab('tab-master'));
   assert.equal(await page.locator('#masterFilterSemester option').count(),5);
   await page.locator('#masterFilterSemester').selectOption('2');
   assert.equal(await page.locator('#masterTableBody tr').first().locator('td').nth(6).innerText(),'0.00');
   assert.equal(await page.locator('#masterTableBody tr').first().locator('td').nth(7).innerText(),'0.00');
   assert.equal(await page.locator('#masterTableBody tr').first().locator('td').nth(8).innerText(),'0.00');
   await page.locator('#masterFilterSemester').selectOption('1');
   assert.equal(await page.locator('#masterThScoreLabel').innerText(),'ĐTB Cả Năm');
   await page.evaluate(()=>window.switchTab('tab-dashboard'));
   for(const id of ['dashboardClassFilter','reportCourseFilterClass','reportYearsFilterClass','reportDebtFilterClass']) {
    assert.equal(await page.locator(`#${id}`).isDisabled(),false);
    assert.equal(await page.locator(`#${id}`).inputValue(),'all');
    assert.equal(await page.locator(`#${id} option`).count(),6);
   }
   assert.equal(await page.locator('#statTotalCadets').innerText(),'3');
   assert.equal(await page.locator('#statLanguagePassRate').innerText(),'66.7%');
   assert.equal(await page.locator('#statLanguageNotPassedRate').innerText(),'33.3%');
   assert.match(await page.locator('#statLanguageDetail').innerText(),/Chuẩn A2.*2\/3 học viên đạt/);
   assert.equal(await page.locator('#reportYearSemesterMatrixBody tr').count(),7);
   assert.doesNotMatch(await page.locator('#reportCompanyTableBody').innerText(),/Tỷ lệ Đạt tích lũy|Tỷ lệ Rớt tích lũy/);
   await page.evaluate(()=>window.switchTab('tab-cumulative'));
   assert.equal(await page.locator('.nav-tab[data-tab="tab-languages"]').count(),0);
   assert.match(await page.locator('.nav-tab[data-tab="tab-cumulative"]').innerText(),/Tiếng Nga và Tích lũy/);
   assert.equal(await page.locator('#languageTableBody').count(),0);
   await page.locator('#cumulFilterClass').selectOption('all');
   assert.equal(await page.locator('#tab-cumulative #languageClassSummary > div').count(),5);
   await page.locator('#cumulFilterClass').selectOption('OTQS1');
   assert.equal(await page.locator('#languageClassSummary > div').count(),1);
   await page.locator('#cumulFilterClass').selectOption('all');
   const cumulativeTable = page.locator('#cumulativeTableBody').locator('..');
   assert.equal(await cumulativeTable.locator('thead th').count(),11);
   assert.equal(await cumulativeTable.locator('tbody tr').first().locator('td').count(),11);
   assert.doesNotMatch(await cumulativeTable.locator('thead').innerText(),/HK1|HKII/);
   await page.evaluate(()=>window.switchTab('tab-dashboard'));
   const officerReport = await page.locator('#reportCompanyTableBody').innerText();
   assert.match(officerReport,/Trung bình khá/); assert.match(officerReport,/Kém/);
   assert.equal(await page.locator('#reportCompanyTableBody tr').count(),7);
   assert.match(await page.locator('#reportYearSemesterMatrixBody').innerText(),/9.00/);
   assert.doesNotMatch(await page.locator('#reportYearSemesterMatrixBody').innerText(),/8.50/);
   assert.ok(await page.locator('meta[name="app-release"]').getAttribute('content'));
   assert.match(await page.locator('#reportDebtCadetsTableBody').innerText(),/HV001/);
   await page.locator('#reportCourseFilterClass').selectOption('TTG1');
   await page.locator('#reportYearsFilterClass').selectOption('TTG1');
   assert.match(await page.locator('#reportDebtCadetsTableBody').innerText(),/HV001/);
   await page.locator('#reportDebtFilterClass').selectOption('TTG1');
   assert.doesNotMatch(await page.locator('#reportDebtCadetsTableBody').innerText(),/HV001/);
   await page.locator('#reportDebtFilterClass').selectOption('all');
   assert.match(await page.locator('#reportDebtCadetsTableBody').innerText(),/HV001/);
   await page.evaluate(()=>window.switchTab('tab-reports'));
   assert.equal(await page.locator('#reportsClassSelect').isDisabled(),false);
   assert.equal(await page.locator('#reportsClassSelect').inputValue(),'all');
   for(const id of ['#btnExportProfileExcel','#btnExportClassExcel','#btnExportFailedStudents','#btnExportAchievements','#btnExportReportExcel','#btnExportCumulativeExcel','#btnExportMasterExcel','#btnExportLanguageSummary']) {
    const book=await download(id); if(id==='#btnExportClassExcel') { const transcriptRows=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1}); assert.deepEqual(transcriptRows[0],['MÃ HỌC VIÊN','HỌ VÀ TÊN','LỚP','NĂM SINH','ĐIỂM CÁC MÔN KỲ 1','ĐIỂM TB KỲ 1']); assert.match(transcriptRows[1][4],/Toán cao cấp/); } if(id==='#btnExportClassExcel') await page.locator('#reportsClassSelect').selectOption('all'); assert.ok(book.SheetNames.length>0);
    if(id==='#btnExportFailedStudents') assert.ok(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1}).flat().includes('HV001'));
   }
   await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'s1',code:'HV001',class:'OTQS1',displayName:'Nguyễn Minh Anh'}));
   assert.equal(await page.locator('.nav-tab[data-tab="tab-cumulative"]').isVisible(),false);
   await page.evaluate(()=>window.switchTab('tab-cumulative'));assert.equal(await page.evaluate(()=>window.AppState.activeTab),'tab-sheet');
   await page.evaluate(()=>window.switchTab('tab-reports'));assert.equal(await page.locator('#tab-reports .report-export-card:visible').count(),2);
   const personal=await download('#btnExportClassExcel');assert.ok(personal.SheetNames.includes('Bang_Diem_Ca_Nhan'));assert.ok(personal.SheetNames.includes('Diem_Tich_Luy'));
   const cumulative=XLSX.utils.sheet_to_json(personal.Sheets.Diem_Tich_Luy,{header:1});assert.equal(cumulative[4].length,11);assert.equal(cumulative[5][1],'HV001');assert.ok(!cumulative.flat().includes('HV002'));
   const ownProfile=await download('#btnExportProfileExcel');const ownRows=XLSX.utils.sheet_to_json(ownProfile.Sheets[ownProfile.SheetNames[0]],{header:1}).flat();assert.ok(ownRows.includes('HV001'));assert.ok(!ownRows.includes('HV002'));
   const avatar=page.locator('.sidebar-account-trigger');await avatar.click();assert.equal(await page.locator('#btnLogout').isVisible(),true);assert.equal(await page.locator('#btnLogout').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0;}),true);await page.keyboard.press('Escape');assert.equal(await avatar.getAttribute('aria-expanded'),'false');
   await avatar.focus();await page.keyboard.press('Enter');await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'btnLogout');await page.keyboard.press('Enter');
   assert.equal(await page.locator('.u040').isVisible(),false);assert.deepEqual(errors,[]);
   console.log(`PASS: ${width}px report center, formatted real XLSX files, highest language/date, class/self scope, combined personal transcript, footer logout keyboard.`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
