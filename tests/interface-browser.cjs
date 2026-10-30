// Visual/interaction regression with mocked services. Never touches live data.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try {
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000}}),writes=[],errors=[];
  const tables={students:[{id:'a',code:'001',name:'Nguyễn An',class:'OTQS1',rank:'Thượng sĩ',dob:'2003-01-01'},{id:'b',code:'002',name:'Trần Bình',class:'TTG2',rank:'Thượng sĩ',dob:'2003-01-01'}],subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'}],grades:[{student_id:'a',subject_id:'math',score:8}],languages:[]};
  await context.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());
   if(u.hostname==='127.0.0.1')return route.continue();
   if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});
   if(u.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))});
   if(u.hostname.endsWith('.supabase.co')){
    if(!['GET','OPTIONS'].includes(req.method()))writes.push(req.method());
    const table=u.pathname.split('/').pop();
    if(table==='unit_settings')return route.fulfill({json:(u.searchParams.get('unit_id')||'').startsWith('ilike.')?[]:[{unit_id:'daidoi460',locks:{},audit_logs:[],required_lang_standard:'A2'}]});
    return route.fulfill({json:tables[table]||[]});
   }
   return route.fulfill({contentType:u.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  if(process.env.UI_TEST_CSS_PATH)await page.addStyleTag({path:process.env.UI_TEST_CSS_PATH});
  await page.waitForFunction(()=>document.body.classList.contains('ui-modern'));
  assert.equal(await page.locator('#modalAuthLogin h3').innerText(),'Đăng nhập');
  await page.screenshot({path:`/tmp/interface-login-${width}.png`,fullPage:true,animations:'disabled'});
  await page.locator('#loginAdminUser').fill('huudung');await page.locator('#loginAdminPass').fill('hd304');await page.locator('#btnSubmitAdminLogin').click();
  await page.waitForFunction(()=>window.AppState?.role==='admin'&&window.AppState.students.length===2);
  await page.waitForFunction(()=>document.getElementById('interfacePageTitle').textContent==='Tổng quan');
  const navigate=async tab=>{
   if(width<=760)await page.locator('#interfaceMenuButton').click();
   await page.locator(`[data-tab="${tab}"]`).click();
   await page.waitForFunction(tab=>window.AppState.activeTab===tab,tab);
  };
  if(width<=760){
   assert.equal(await page.locator('.u040-rail').evaluate(e=>e.inert),true);
   await page.locator('#interfaceMenuButton').click();
   assert.equal(await page.locator('.u040-main').evaluate(e=>e.inert),true);
   assert.equal(await page.locator('#interfaceMenuButton').getAttribute('aria-expanded'),'true');
   await page.locator('.ui-drawer-close').focus();await page.keyboard.press('Shift+Tab');
   assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.u040-rail')),true);
   await page.keyboard.press('Escape');
   assert.equal(await page.locator('.u040-main').evaluate(e=>e.inert),false);
   assert.equal(await page.evaluate(()=>document.activeElement.id),'interfaceMenuButton');
   await page.locator('#interfaceMenuButton').click();await page.locator('.ui-drawer-backdrop').click({position:{x:385,y:500}});
   assert.equal(await page.locator('#interfaceMenuButton').getAttribute('aria-expanded'),'false');
  }else{
   await page.locator('#interfaceMenuButton').click();assert.equal(await page.locator('.bento-shell').evaluate(e=>e.classList.contains('is-wide')),false);
   await page.locator('#interfaceMenuButton').click();assert.equal(await page.locator('.bento-shell').evaluate(e=>e.classList.contains('is-wide')),true);
   await page.keyboard.press('Control+k');assert.equal(await page.evaluate(()=>document.activeElement.id),'bentoSearch');
   await page.locator('#bentoSearch').fill('Nguyễn An');await page.waitForFunction(()=>!document.getElementById('bentoSearchResults').hidden);
   assert.match(await page.locator('#bentoSearchResults').innerText(),/Nguyễn An/);
   await page.locator('#bentoSearch').fill('');await page.keyboard.press('Escape');
  }
  await page.screenshot({path:`/tmp/interface-dashboard-${width}.png`,fullPage:true,animations:'disabled'});
  await navigate('tab-research');await page.waitForFunction(()=>document.getElementById('researchTopicCount').textContent==='0');
  assert.equal(await page.locator('#researchAdd,#researchReload').count(),0);
  assert.equal(await page.locator('#tab-research .research-table-toolbar button').count(),1);
  await page.locator('#researchImport').click();await page.waitForFunction(()=>document.getElementById('researchUploadDialog').open);
  assert.equal(await page.locator('#researchDropZone .u032-zone').isVisible(),true);
  await page.screenshot({path:`/tmp/interface-import-${width}.png`,animations:'disabled'});
  await page.keyboard.press('Escape');
  await navigate('tab-reports');assert.equal(await page.locator('.report-gallery .report-export-card').count(),5);
  await page.screenshot({path:`/tmp/interface-reports-${width}-light.png`,fullPage:true,animations:'disabled'});
  await page.locator('#interfaceThemeButton').click();
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
  const contrast=await page.locator('.report-export-card p').first().evaluate(el=>{
   const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);let color=getComputedStyle(el).color,bg=getComputedStyle(el.closest('.report-export-card')).backgroundColor;
   const luminance=c=>rgb(c).slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
   const a=luminance(color),b=luminance(bg);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  });assert.ok(contrast>=4.5);
  await page.screenshot({path:`/tmp/interface-reports-${width}-dark.png`,fullPage:true,animations:'disabled'});
  await navigate('tab-profiles');await page.evaluate(()=>window.openStudentProfileModal('a'));
  await page.locator('#profFormPhone').fill('draft-keep');await page.evaluate(()=>{window.__originalPhone=document.getElementById('profFormPhone');document.getElementById('themeToggle').click();});
  assert.equal(await page.locator('#profFormPhone').inputValue(),'draft-keep');assert.equal(await page.evaluate(()=>window.__originalPhone===document.getElementById('profFormPhone')),true);
  await page.locator('#modalStudentProfile .modal-close').first().click();
  await navigate('tab-sheet');await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('#tab-sheet').evaluate(e=>getComputedStyle(e).animationName),'none');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
  console.log(`PASS ${width}px: login, navigation, drawer focus/escape/backdrop, global search, theme contrast, draft preservation, compact research/import/reports, reduced motion, no page overflow or writes.`);
  await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
