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
   const chip=page.locator('.sidebar-account-trigger'), account=page.locator('#sidebarAccountMenu');
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await chip.focus();await page.keyboard.press('ArrowUp');
    assert.equal(await chip.getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#btnAccountSettings').evaluate(el=>el===document.activeElement),true);
    assert.equal(await account.evaluate(el=>el.inert),false);
    assert.equal(await page.locator('#btnAccountSettings').evaluate(el=>getComputedStyle(el).display),'flex');
    assert.equal(await page.locator('#btnLogout span').evaluate(el=>getComputedStyle(el).opacity),'1');
    assert.equal(await account.evaluate(el=>getComputedStyle(el).backgroundColor),theme==='dark'?'rgb(48, 38, 45)':'rgb(255, 252, 250)');
    await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#btnLogout').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Home');assert.equal(await page.locator('#btnAccountSettings').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('End');assert.equal(await page.locator('#btnLogout').evaluate(el=>el===document.activeElement),true);
    const bounds=await account.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width+1&&bounds.y>=0);
    await page.keyboard.press('Escape');assert.equal(await chip.getAttribute('aria-expanded'),'false');
    assert.equal(await account.evaluate(el=>el.inert),true);assert.equal(await chip.evaluate(el=>el===document.activeElement),true);
   }
   await page.evaluate(()=>document.documentElement.dataset.theme='light');
   await page.emulateMedia({reducedMotion:'no-preference'});await chip.click();
   assert.equal(await chip.getAttribute('aria-expanded'),'true');
   await page.waitForTimeout(600);
   await page.locator('#btnLogout').hover();
   assert.equal(await page.locator('.u037-list').evaluate(el=>el.classList.contains('is-hl')),true);
   await page.locator('.u037').screenshot({path:`/tmp/account-chip-${width}.png`});
   await page.screenshot({path:`/tmp/account-menu-${width}.png`});
   await page.mouse.click(width-10,10);assert.equal(await chip.getAttribute('aria-expanded'),'false');
   await page.emulateMedia({reducedMotion:'reduce'});
   for(const type of ['admin','company_officer','class_account']){
    await page.evaluate(type=>{window.AuthState.setUser({type,class:'OTQS1',displayName:'Kiểm thử'});window.AppState.requiredLangStandard='A2';},type);
    await page.locator('.u040-it[data-tab="tab-dashboard"]').click();
    assert.equal(await page.locator('.u040-page-heading').isVisible(),false);
    assert.equal(await page.locator('#statTotalCadets').count(),0);
    assert.equal(await page.locator('#dashboardKpis>div').count(),3);
    assert.equal(await page.locator('#tab-dashboard .digital-report-banner').count(),0);
    assert.equal(await page.locator('#dashboardClassFilter').count(),0);
    assert.equal(await page.locator('.u040-it[data-tab="tab-settings"]').innerText(),'Môn học');
    const tabs=page.getByRole('tablist',{name:'Nội dung báo cáo giao ban'}).getByRole('tab');
    await tabs.nth(0).click();
    const own=type==='class_account';
    assert.deepEqual(await page.locator('#languageMissingBody tr').evaluateAll(rows=>rows.filter(r=>r.cells.length===6).map(r=>r.cells[5].textContent)),own?['A1','Chưa đạt']:['A21','A1','Chưa đạt']);
    assert.equal(await page.locator('#languageMissingClass').isDisabled(),own);
    assert.equal(await page.locator('#dashboardLanguageStandard').isDisabled(),type!=='admin');
    if(!own){await page.locator('#languageMissingClass').selectOption('TTG1');assert.equal(await page.locator('#languageMissingBody tr').count(),1);await page.locator('#languageMissingClass').selectOption('all');}
    if(type==='admin'){
      await page.locator('#dashboardLanguageStandard').selectOption('A21');
      assert.deepEqual(await page.locator('#languageMissingBody tr').evaluateAll(rows=>rows.filter(r=>r.cells.length===6).map(r=>r.cells[5].textContent)),['A1','Chưa đạt']);
      await page.locator('#dashboardLanguageStandard').selectOption('A2');
    }
    await tabs.nth(0).focus();await page.keyboard.press('ArrowRight');
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('#reportYearSemesterMatrixBody').isVisible(),true);
    await tabs.nth(2).click();assert.equal(await page.locator('#reportCompanyTableBody').isVisible(),true);
    await tabs.nth(3).click();assert.equal(await page.locator('#reportDebtCadetsTableBody').isVisible(),true);
    assert.equal(await page.locator('.workspace-report-panel:visible').count(),1);
    await page.locator('.sidebar-account-trigger').click();
    assert.equal(await page.locator('#sidebarAccountMenu #btnLogout').isVisible(),true);
    await page.locator('#btnAccountSettings').click();
    assert.equal(await page.locator('#tab-preferences').isVisible(),true);
    assert.equal(await page.locator('#tab-settings #settingsDangerZone').count(),0);
    assert.equal(await page.locator('#tab-preferences #settingsDangerZone').isVisible(),type==='admin');
    assert.equal(await page.locator('#cfgUnitRoomId').isDisabled(),type!=='admin');
    assert.equal(await page.locator('#btnSaveCloudConfig').isDisabled(),type!=='admin');
    await page.locator('.cloud-subtab[data-subtab="cloudtab-manual"]').click();
    assert.equal(await page.locator('#cloudtab-manual input').isVisible(),true);
    assert.match(await page.locator('#cloudtab-manual input').inputValue(),/127.0.0.1/);
    await page.locator('.cloud-subtab[data-subtab="cloudtab-config"]').click();
    if(type==='admin'){
      await page.locator('#cfgUnitRoomId').fill('Giữ nội dung');
      await page.evaluate(async()=>{const {renderDashboard}=await import(new URL('./src/js/grades.js',document.baseURI).href);renderDashboard();});
      assert.equal(await page.locator('#cfgUnitRoomId').inputValue(),'Giữ nội dung');
      await page.locator('#settingsDangerZone>summary').click();await page.locator('#btnClearAllSubjectsBtn').click();
      assert.equal(await page.locator('.danger-confirm [data-confirm]').isDisabled(),true);await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>window.AppState.subjects.length),2);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   }
   await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'s1',code:'HV001',class:'OTQS1'}));
   assert.equal(await page.locator('.u040-it[data-tab="tab-dashboard"]').isVisible(),false);
   assert.equal(await page.locator('#btnAccountSettings').isVisible(),false);
   await page.evaluate(()=>window.switchTab('tab-preferences'));
   assert.equal(await page.locator('#tab-preferences').isVisible(),false);
   assert.equal(await page.locator('#languageMissingBody tr').count(),0);
   await page.locator('.sidebar-account-trigger').click();
   assert.equal(await page.locator('#btnAccountSettings').isVisible(),false);
   await page.locator('#btnLogout').click();
   await page.waitForFunction(()=>window.AppState.role==='guest');
   assert.deepEqual(errors,[]);
   console.log(`PASS: ${width}px three KPIs, report keyboard tabs, sorted unmet levels, class isolation, officer read-only, account settings, protected delete and student restrictions`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
