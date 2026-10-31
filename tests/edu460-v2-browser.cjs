// Presentation regression. Every external service is mocked; any write fails the test.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
const students=[{id:'a',code:'001',name:'Nguyễn Văn An',class:'OTQS1',rank:'Thượng sĩ',dob:'2003-01-01'},{id:'b',code:'002',name:'Trần Minh Bình',class:'TTG2',rank:'Thượng sĩ',dob:'2003-01-01'}];
const project={id:'v2-demo',year:1,title:'Ứng dụng công nghệ trong học tập',leaderId:'a',participants:students.map(s=>({studentId:s.id,code:s.code,name:s.name,class:s.class})),objective:'Nâng cao hiệu quả học tập.',content:'Khảo sát, phân tích và đánh giá.',product:'Báo cáo tổng kết.',advisors:[{name:'Nguyễn Văn C',unit:'K13'}],awards:['Giấy khen'],notes:'Dữ liệu minh họa giao diện.'};
const tables={students,subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',semester:1,credits:3,category:'common'},{id:'phys',code:'PHYS',name:'Vật lý đại cương',semester:2,credits:2,category:'common'}],grades:[{student_id:'a',subject_id:'math',score:8},{student_id:'a',subject_id:'phys',score:3.5}],languages:[]};
const roles=[{name:'admin',user:{type:'admin'}},{name:'officer',user:{type:'company_officer'}},{name:'class',user:{type:'class_account',class:'OTQS1'}},{name:'student',user:{type:'student',studentId:'a',code:'001'}}];
async function contrastAudit(page){return page.evaluate(()=>{
 const rgb=s=>{const n=(s.match(/[\d.]+/g)||[]).map(Number);return[n[0]||0,n[1]||0,n[2]||0,n.length>3?n[3]:1];};
 const blend=(a,b)=>a.slice(0,3).map((n,i)=>n*a[3]+b[i]*(1-a[3])).concat(1);
 const luminance=c=>c.slice(0,3).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
 const failures=[],seen=new Set();
 for(const el of document.querySelectorAll('body *')){
  if(![...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())&&!el.matches('input,textarea,select'))continue;
  if(!el.getClientRects().length||el.closest('[inert],svg,script,style,[hidden],button:disabled,input:disabled,select:disabled,textarea:disabled'))continue;
  const st=getComputedStyle(el);if(st.visibility!=='visible'||Number(st.opacity)===0)continue;
  if(el.closest('#modalAuthLogin')&&getComputedStyle(document.getElementById('modalAuthLogin')).display==='none')continue;
  let bg=[255,255,255,1];const chain=[];for(let p=el;p;p=p.parentElement)chain.unshift(p);
  for(const p of chain){const ps=getComputedStyle(p);bg=blend(rgb(ps.backgroundColor),bg);}
  const fg=blend(rgb(st.color),bg),a=luminance(fg),b=luminance(bg),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  const large=parseFloat(st.fontSize)>=24||(parseFloat(st.fontSize)>=18.66&&Number(st.fontWeight)>=700),min=large?3:4.5;
  const text=(el.value||el.textContent).trim().slice(0,70);if(!text)continue;
  if(ratio+.01<min){const key=st.color+'|'+bg+'|'+text;if(!seen.has(key)){seen.add(key);failures.push({tag:el.tagName,id:el.id,class:el.className,text,ratio:+ratio.toFixed(2),fg:st.color,bg:bg.slice(0,3),size:st.fontSize});}}
 }
 return failures;
});}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const results=[],violations=[];fs.mkdirSync('/tmp/edu460-v2',{recursive:true});
 try{
 for(const role of roles.filter(r=>!process.env.UI_TEST_ROLES||process.env.UI_TEST_ROLES.split(',').includes(r.name)))for(const width of (process.env.UI_TEST_WIDTHS?process.env.UI_TEST_WIDTHS.split(',').map(Number):[1440,768,390])){
  const context=await browser.newContext({viewport:{width,height:1000},reducedMotion:'reduce'}),writes=[],errors=[];
  await context.addInitScript(user=>sessionStorage.setItem('dd460_auth_session',JSON.stringify(user)),role.user);
  await context.route('**/*',route=>{
   const req=route.request(),u=new URL(req.url());if(u.hostname==='127.0.0.1')return route.continue();
   if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});
   if(u.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))});
   if(u.hostname.endsWith('.supabase.co')){
    if(!['GET','OPTIONS'].includes(req.method())){writes.push(req.method());return route.abort();}
    const table=u.pathname.split('/').pop();if(table==='unit_settings'){
     const unit=u.searchParams.get('unit_id')||'';
     return route.fulfill({json:unit==='eq.daidoi460'?[{unit_id:'daidoi460',locks:{},audit_logs:[],required_lang_standard:'A2'}]:[{unit_id:'research-project:v2-demo',locks:{research_project:project,revision:'v1'}}]});
    }
    return route.fulfill({json:tables[table]||[]});
   }
   return route.fulfill({contentType:u.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'networkidle'});
  if(process.env.UI_TEST_CSS_PATH)await page.addStyleTag({path:process.env.UI_TEST_CSS_PATH});
  await page.waitForFunction(()=>window.AppState?.students.length===2&&window.AppState.role!=='guest');
  const tabs=await page.locator('.u040-nav .nav-tab').evaluateAll(items=>items.filter(el=>!el.hidden&&!el.classList.contains('hidden')&&el.style.display!=='none').map(el=>el.dataset.tab));
  tabs.push('tab-preferences');
  const checkedTabs=tabs.filter(tab=>!process.env.UI_TEST_TABS||process.env.UI_TEST_TABS.split(',').includes(tab));
  for(const tab of checkedTabs){
   if(width<=760)await page.locator('#interfaceMenuButton').click();
   if(tab==='tab-preferences'){await page.locator('.sidebar-account-trigger').click();await page.locator('#btnAccountSettings').click();}
   else await page.locator(`.u040-nav [data-tab="${tab}"]`).click();
   await page.waitForFunction(tab=>window.AppState.activeTab===tab,tab);
   if(tab==='tab-research')await page.waitForFunction(()=>/^\d+$/.test(document.getElementById('researchTopicCount').textContent));
   for(const theme of ['light','dark']){
    if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme)await page.locator('#interfaceThemeButton').click();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false,`${role.name} ${width} ${tab} ${theme}: page overflow`);
    const failures=await contrastAudit(page);if(failures.length)violations.push({role:role.name,width,tab,theme,failures});fs.writeFileSync('/tmp/edu460-v2/contrast.json',JSON.stringify(violations,null,2));
    if(role.name==='admin'&&[1440,390].includes(width)&&['tab-dashboard','tab-sheet','tab-research','tab-reports','tab-profiles','tab-settings'].includes(tab))await page.screenshot({path:`/tmp/edu460-v2/${tab}-${width}-${theme}.png`,fullPage:true,animations:'disabled'});
   }
  }
  if(role.name==='admin'&&!process.env.UI_TEST_TABS){
   await page.evaluate(()=>window.openStudentProfileModal('a'));
   await page.locator('#profFormPhone').fill('Giữ nguyên bản nháp');
   await page.evaluate(()=>{window.__v2DraftNode=document.getElementById('profFormPhone');});
   for(const theme of ['light','dark']){
    if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme)await page.evaluate(()=>document.getElementById('themeToggle').click());
    assert.equal(await page.locator('#profFormPhone').inputValue(),'Giữ nguyên bản nháp');
    assert.equal(await page.evaluate(()=>window.__v2DraftNode===document.getElementById('profFormPhone')),true);
    const failures=await contrastAudit(page);if(failures.length)violations.push({role:role.name,width,tab:'profile-modal',theme,failures});
    await page.screenshot({path:`/tmp/edu460-v2/profile-modal-${width}-${theme}.png`,animations:'disabled'});
   }
   await page.locator('#modalStudentProfile .modal-close').first().click();
   if(width<=760)await page.locator('#interfaceMenuButton').click();
   await page.locator('.u040-nav [data-tab="tab-research"]').click();
   await page.locator('[data-research-action="open"]').first().click();
   const section=page.locator('[data-research-section="information"]');
   if(!await section.evaluate(el=>el.open))await section.locator('summary').click();
   await section.locator('[data-research-field]').click();
   for(const theme of ['light','dark']){
    if(await page.evaluate(()=>document.documentElement.dataset.theme)!==theme)await page.evaluate(()=>document.getElementById('themeToggle').click());
    const failures=await contrastAudit(page);if(failures.length)violations.push({role:role.name,width,tab:'research-modal',theme,failures});
   }
   await page.keyboard.press('Escape');
   fs.writeFileSync('/tmp/edu460-v2/contrast.json',JSON.stringify(violations,null,2));
  }
  assert.deepEqual(errors,[],`${role.name} ${width}: runtime errors`);assert.deepEqual(writes,[],`${role.name} ${width}: writes`);
  results.push({role:role.name,width,tabs:checkedTabs.length});console.log(`PASS ${role.name} ${width}px: ${checkedTabs.length} tabs, light/dark, no page overflow, errors or writes.`);await context.close();
 }
 fs.writeFileSync('/tmp/edu460-v2/contrast.json',JSON.stringify(violations,null,2));
 console.log('Contrast audit:',violations.length,'screen/role combinations with failures; see /tmp/edu460-v2/contrast.json');
 if(violations.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
