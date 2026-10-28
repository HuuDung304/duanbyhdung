// Isolated REST fixture only. Typed confirmation tests never touch the live database.
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  try {
    const classes = ['OTQS1','OTQS2','TTG1','TTG2','XMCB'];
    const tables = {
      students: classes.map((className,i)=>({id:`hv${i}`,code:`HV00${i}`,name:`Học viên ${i}`,class:className,rank:'Hạ sĩ'})),
      subjects: [{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'},{id:'phys',code:'PHYS',name:'Vật lý đại cương',credits:2,semester:2,category:'common'},{id:'spec',code:'SPEC',name:'Kỹ thuật khí tài',credits:4,semester:3,category:'specialized',target_class:'OTQS1',target_classes:['OTQS1']}],
      grades: [8.5,8,7,5,3.99].map((score,i)=>({student_id:`hv${i}`,subject_id:'math',score})), languages:[],
      unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]
    };
    const requests=[];
    const context = await browser.newContext({viewport:{width:Number(process.env.ADMIN_TEST_WIDTH)||1440,height:1000},acceptDownloads:true});
    await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
    await context.route('**/*',route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.hostname==='127.0.0.1')return route.continue();
      if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});
      if(url.hostname==='cdn.jsdelivr.net' && url.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'),'utf8')});
      if(url.hostname.endsWith('.supabase.co')){
        const table=url.pathname.split('/').pop();
        if(request.method()==='DELETE'){requests.push(table);tables[table]=[];return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});}
        if(request.method()==='POST')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
        return route.fulfill({json:tables[table]||[],headers:{'access-control-allow-origin':'*'}});
      }
      return route.fulfill({contentType:url.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3015',{waitUntil:'networkidle'});
    if(process.env.BENTO_TEST_CSS_PATH)await page.addStyleTag({path:process.env.BENTO_TEST_CSS_PATH});
    await page.waitForFunction(()=>window.AppState?.students.length===5);
    assert.equal(await page.locator('.u040-top,.u040-logo,#btnOpenLoginModal,#btnCornerSwitchRole,#btnQuickImportExcel,#btnAddCadetModalBtn,#btnAddSubjectFromSheetBtn,#btnAddLangCertBtn,#btnResetDefaultCurriculum,#btnAddSubjectBtn').count(),0);
    const report=await page.locator('#reportCompanyTableBody').innerText();
    assert.match(report,/Trung bình khá/);assert.match(report,/Kém/);assert.match(report,/9.00/);
    assert.match(await page.locator('#reportDebtCadetsTableBody').innerText(),/Vật lý|Toán cao cấp/);
    assert.match(await page.locator('#reportDebtCadetsTableBody').innerText(),/3.99/);
    assert.equal(await page.locator('#statTotalCadets').innerText(),'5');
    assert.equal(await page.locator('#statDebtTotalFails').innerText(),'1');
    assert.equal(await page.locator('#reportCompanyTableBody tr').count(),7); // seven ranks only
    for (const className of classes) {
      await page.locator('#dashboardClassFilter').selectOption(className);
      assert.equal(await page.locator('#statTotalCadets').innerText(),'5');
      const debtText=await page.locator('#reportDebtCadetsTableBody').innerText();
      if(className==='XMCB')assert.match(debtText,/HV004/);else assert.doesNotMatch(debtText,/HV004/);
    }
    await page.locator('#dashboardClassFilter').selectOption('all');
    await page.evaluate(()=>window.switchTab('tab-reports'));
    const downloadPromise=page.waitForEvent('download');
    await page.locator('#btnExportReportExcel').click();
    const download=await downloadPromise;const bytes=fs.readFileSync(await download.path());
    const book=XLSX.read(bytes,{type:'buffer'});assert.equal(book.SheetNames.length,3);
    const allRows=book.SheetNames.map(name=>XLSX.utils.sheet_to_json(book.Sheets[name],{header:1}));
    const summary=allRows[0].flat().join(' ');for(const n of [1,2,3])assert.match(summary,new RegExp(`BẢNG ${n}:`));
    for(const className of classes)assert.match(summary,new RegExp(`Lớp ${className}`));
    assert.equal(allRows[1][4].length,15);assert.ok(allRows[2].flat().includes('Toán cao cấp'));
    assert.ok(allRows[2].flat().some(cell=>String(cell).includes('3.99')));
    const zip=XLSX.CFB.read(bytes,{type:'buffer'});
    for(const file of zip.FileIndex.filter(file=>/^sheet\d+\.xml$/.test(file.name))){const xml=new TextDecoder().decode(file.content);assert.match(xml,/<pageSetup[^>]*paperSize="9"[^>]*orientation="landscape"[^>]*fitToWidth="1"/);assert.match(xml,/pageSetUpPr fitToPage="1"/);}
    await page.evaluate(()=>window.switchTab('tab-settings'));
    assert.equal(await page.locator('#settingsClassSummaries .settings-class-card').count(),5);
    assert.match(await page.locator('#settingsClassSummaries .settings-class-card').first().innerText(),/3 môn/);
    assert.match(await page.locator('#settingsClassSummaries .settings-class-card').first().innerText(),/9 tín chỉ/);
    assert.equal(await page.locator('.btn-clear-sem-subjects').count(),0);
    assert.equal(await page.locator('.btn-clear-all-students').count(),1);
    assert.equal(await page.locator('.btn-clear-all-subjects').count(),1);
    assert.equal(await page.locator('#settingsDangerZone').getAttribute('open'),null);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.locator('#settingsDangerZone summary').click();
    for(const id of ['btnClearAllStudentsSettings','btnClearAllSubjectsBtn','btnClearLog']){
      await page.locator(`#${id}`).click();
      await page.waitForSelector('.danger-confirm[open]');
      assert.equal(await page.locator('.danger-confirm [data-confirm]').isDisabled(),true);
      await page.locator('#dangerConfirmInput').fill('sai cụm từ');
      assert.equal(await page.locator('.danger-confirm [data-confirm]').isDisabled(),true);
      await page.keyboard.press('Escape');
      await page.waitForSelector('.danger-confirm',{state:'detached'});
      assert.equal(requests.length,0);
      assert.equal(await page.evaluate(()=>window.AppState.students.length),5);
    }
    await page.evaluate(()=>window.AuthState.setUser({type:'company_officer',displayName:'Cán bộ'}));
    await page.evaluate(()=>window.switchTab('tab-settings'));
    assert.equal(await page.locator('#settingsDangerZone').isVisible(),false);
    assert.equal(await page.locator('#dashboardClassFilter').isDisabled(),false);
    await page.evaluate(()=>window.AuthState.setUser({type:'class_account',class:'OTQS1',displayName:'OTQS1'}));
    assert.equal(await page.locator('#dashboardClassFilter').isDisabled(),true);
    assert.equal(await page.locator('#statTotalCadets').innerText(),'1');
    await page.evaluate(()=>window.switchTab('tab-settings'));
    assert.equal(await page.locator('#settingsClassSummaries .settings-class-card').count(),1);
    await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'hv0',code:'HV000',class:'OTQS1',displayName:'Học viên 0'}));
    assert.equal(await page.locator('.nav-tab[data-tab="tab-dashboard"]').isVisible(),false);
    await page.evaluate(()=>window.AuthState.setUser({type:'admin',displayName:'Admin kiểm thử'}));
    await page.evaluate(()=>window.switchTab('tab-settings'));
    if(!await page.locator('#settingsDangerZone').evaluate(element=>element.open))await page.locator('#settingsDangerZone summary').click();
    await page.locator('#btnClearAllSubjectsBtn').click();
    await page.locator('#dangerConfirmInput').fill('XÓA MÔN HỌC');
    await page.locator('.danger-confirm [data-confirm]').click();
    await page.waitForFunction(()=>window.AppState.subjects.length===0);
    assert.ok(requests.includes('subjects'));assert.equal(await page.evaluate(()=>window.AppState.students.length),5);
    await page.locator('#btnClearAllStudentsSettings').click();
    await page.locator('#dangerConfirmInput').fill('XÓA HỌC VIÊN');
    await page.locator('.danger-confirm [data-confirm]').click();
    await page.waitForFunction(()=>window.AppState.students.length===0);
    assert.ok(requests.includes('students'));assert.deepEqual(errors,[]);
    console.log('PASS: consolidated controls, typed cancellation/confirmation, class totals, seven-rank scoped report, 3 real XLSX sheets with A4 landscape XML, all roles. Fixture writes only.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exit(1)});
