// Presentation regression checks use fixture data and never write to the live Supabase project.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const fixtures = {
    students: [{ id:'one',code:'HV001',name:'Nguyễn Minh Anh',class:'OTQS1' },{ id:'two',code:'HV002',name:'Trần Hải Nam',class:'OTQS1' },{ id:'three',code:'HV003',name:'Lê Minh Đức',class:'TTG1' }],
    subjects: [{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'},{id:'physics',code:'PHYS',name:'Vật lý đại cương',credits:2,semester:2,category:'common'}],
    grades: [{student_id:'one',subject_id:'math',score:9},{student_id:'one',subject_id:'physics',score:8},{student_id:'two',subject_id:'math',score:3.99},{student_id:'three',subject_id:'math',score:4}],
    languages: [], unit_settings: [{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[{actor:'Admin kiểm thử',class:'OTQS1',student:'Nguyễn Minh Anh',subject:'Toán cao cấp',oldVal:8,newVal:9,timestamp:'28/10/2026 10:30:00'}]}]
  };
  for (const width of (process.env.BENTO_TEST_WIDTH ? [Number(process.env.BENTO_TEST_WIDTH)] : [1440,390])) for (const colorScheme of ['light','dark']) for (const reducedMotion of ['no-preference','reduce']) {
    const context = await browser.newContext({ viewport:{width,height:1080},colorScheme,reducedMotion });
    await context.addInitScript(() => sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
    await context.route('**/*',route=>{
      const url = new URL(route.request().url());
      if(url.hostname==='127.0.0.1')return route.continue();
      if(url.pathname.includes('chart.js@') && process.env.BENTO_CHART_JS_PATH)return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.BENTO_CHART_JS_PATH,'utf8')});
      if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});
      if(url.hostname.endsWith('.supabase.co'))return route.fulfill({json:fixtures[url.pathname.split('/').pop()]||[],headers:{'access-control-allow-origin':'*'}});
      return route.fulfill({contentType:url.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});
    });
    const page = await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3013',{waitUntil:'networkidle'});
    if(process.env.BENTO_TEST_CSS_PATH)await page.addStyleTag({path:process.env.BENTO_TEST_CSS_PATH});
    await page.waitForFunction(()=>window.AppState?.students.length===3 && document.querySelector('#statTotalCadets').textContent==='3');
    assert.equal(await page.evaluate(()=>window.AppState.activeTab),'tab-dashboard');
    assert.equal(await page.locator('.bento-grid').isVisible(),false);
    assert.equal(await page.locator('#dashboardLanguageSummaryBody tr').count(),5);
    await page.locator('#dashboardClassFilter').selectOption('OTQS1');
    assert.equal(await page.locator('#statTotalCadets').innerText(),'3');
    await page.evaluate(()=>window.AuthState.setUser({type:'class_account',class:'OTQS1',displayName:'Lớp OTQS1'}));
    assert.equal(await page.locator('.bento-grid').isVisible(),true);
    assert.equal(await page.locator('#dashboardLanguageSummaryBody tr').count(),1);
    assert.equal(await page.locator('#bentoSubjects .bento-course').count(),1);
    assert.match(await page.locator('#bentoSubjects').innerText(),/3,99/);
    assert.match(await page.locator('#bentoSubjects').innerText(),/Toán cao cấp/);
    assert.equal(await page.locator('#bentoBars .bento-bar-column').count(),10);
    if(process.env.BENTO_CHART_JS_PATH) assert.equal(await page.locator('#bentoSemesterChart').isVisible(),true);
    assert.equal(await page.locator('#bentoPeople .bento-person').count(),2);
    await page.locator('#bentoPeriod').selectOption('semester:10');
    assert.equal(await page.locator('#bentoAverage').innerText(),'—');
    await page.locator('#bentoPeriod').selectOption('course');
    assert.equal(await page.locator('#dashboardClassFilter').isDisabled(),true);
    assert.equal(await page.locator('#bentoCount').innerText(),'2');
    if(width===1440 && colorScheme==='light' && reducedMotion==='no-preference')await page.screenshot({path:'/tmp/bento-desktop.png',fullPage:false});
    if(width===390 && colorScheme==='light' && reducedMotion==='no-preference')await page.screenshot({path:'/tmp/bento-mobile.png',fullPage:false});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'page must not overflow horizontally');
    await page.locator('#bentoSearch').fill('HV001');
    await page.waitForSelector('#bentoSearchResults button');
    await page.locator('#bentoSearch').press('ArrowDown');
    assert.equal(await page.evaluate(()=>document.activeElement.parentElement.id),'bentoSearchResults');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>window.AppState.activeTab),'tab-profiles');
    assert.equal(await page.locator('#profileSearchInput').inputValue(),'HV001');
    await page.evaluate(()=>window.switchTab('tab-sheet'));
    for (const tab of ['tab-sheet','tab-profiles','tab-cumulative','tab-master','tab-languages','tab-settings']) {
      await page.evaluate(target => window.switchTab(target), tab);
      const overflow = await page.evaluate(()=>({ width:innerWidth, page:document.documentElement.scrollWidth, elements:[...document.querySelectorAll('main *')].filter(el=>el.getBoundingClientRect().right>innerWidth+1 && el.clientWidth>0).slice(0,6).map(el=>({id:el.id,tag:el.tagName,class:el.className})) }));
      assert.ok(overflow.page<=overflow.width, `no horizontal page overflow in ${tab}: ${JSON.stringify(overflow)}`);
    }
    await page.evaluate(()=>window.switchTab('tab-sheet'));
    await page.evaluate(()=>window.switchTab('tab-profiles'));
    await page.locator('#btnAddNewProfile').click();
    await page.locator('#profFormName').fill('Nội dung đang nhập');
    await page.evaluate(async()=>{const {updateAllViews,AppState}=await import(new URL('./src/js/grades.js',document.baseURI).href);if(AppState!==window.AppState)throw new Error('Duplicate module state');updateAllViews();});
    assert.equal(await page.locator('#profFormName').inputValue(),'Nội dung đang nhập');
    await page.evaluate(()=>window.AuthState.setUser({type:'company_officer',displayName:'Cán bộ kiểm thử'}));
    assert.equal(await page.locator('#btnAddCadetModalBtn').count(),0);
    await page.evaluate(()=>window.AuthState.setUser({type:'class_account',class:'OTQS1',displayName:'Lớp OTQS1'}));
    assert.equal(await page.locator('#bentoCount').innerText(),'2');
    await page.locator('#bentoSearch').fill('HV003');
    assert.equal(await page.locator('#bentoSearchResults button').count(),0);
    await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'one',code:'HV001',class:'OTQS1',displayName:'Nguyễn Minh Anh'}));
    assert.equal(await page.evaluate(()=>window.AppState.activeTab),'tab-sheet');
    assert.equal(await page.locator('[data-bento-tab="tab-audit"]').first().isVisible(),false);
    assert.deepEqual(errors,[]);
    await context.close();
  }
  await browser.close();console.log('PASS: Bento layout at 1440/390px, light/dark system preferences, reduced motion, real academic calculations, scope, search, keyboard and isolated edit state.');
})().catch(error=>{console.error(error);process.exit(1)});
