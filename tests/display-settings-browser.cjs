// Workspace report tabs and account settings; only isolated REST fixtures.
const {chromium}=require('playwright'),XLSX=require('xlsx'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [1440,390]){
   const tables={students:[{id:'s1',code:'HV001',name:'Nguyễn Minh Anh',class:'OTQS1',dob:'2003-02-01',current_lang_level:'A2',achievements:['Chiến sĩ tiên tiến 2025']},{id:'s2',code:'HV002',name:'Trần Hải Nam',class:'OTQS1',dob:'2004-03-02',current_lang_level:'A1'},{id:'s3',code:'HV003',name:'Lê Minh Đức',class:'TTG1',dob:'2002-04-03',current_lang_level:'B1.1'}],subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'},{id:'phys',code:'PHYS',name:'Vật lý đại cương',credits:2,semester:2,category:'common'}],grades:[{student_id:'s1',subject_id:'math',score:9},{student_id:'s1',subject_id:'phys',score:3.99},{student_id:'s2',subject_id:'math',score:4}],languages:[],unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]};
   tables.students.push({id:'s4',code:'HV004',name:'A21 Student',class:'TTG1',current_lang_level:'A21'},{id:'s5',code:'HV005',name:'No Level',class:'OTQS1',current_lang_level:'Chưa đạt'});
   const writes=[];
   const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
   await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});if(u.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'),'utf8')});if(u.hostname.endsWith('.supabase.co')&&['POST','PATCH','DELETE','PUT'].includes(route.request().method()))writes.push(route.request().method());if(u.hostname.endsWith('.supabase.co'))return route.fulfill({json:tables[u.pathname.split('/').pop()]||[],headers:{'access-control-allow-origin':'*'}});return route.fulfill({contentType:u.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3018',{waitUntil:'networkidle'});if(process.env.REPORT_TEST_CSS_PATH)await page.addStyleTag({path:process.env.REPORT_TEST_CSS_PATH});
   await page.waitForFunction(()=>window.AppState?.students.length===5);
   await page.emulateMedia({reducedMotion:'reduce'});

   const checkContrast=async selectors=>{
    for(const selector of selectors){
     const report=await page.locator(selector).first().evaluate(el=>{
      const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number);
      const fg=rgb(getComputedStyle(el).color);let bg=[255,255,255];
      for(let parent=el;parent;parent=parent.parentElement){const color=rgb(getComputedStyle(parent).backgroundColor);if(color.length===3||color[3]===1){bg=color;break;}}
      const luminance=c=>c.slice(0,3).map(x=>x/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
      const a=luminance(fg),b=luminance(bg);return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),fg,bg};
     });assert.ok(report.ratio>=4.5,`${selector}: ${JSON.stringify(report)}`);
    }
   };
   for(const role of ['admin','company_officer','class_account','student']){
    await page.evaluate(role=>window.AuthState.setUser({type:role,class:'OTQS1',studentId:'s1',code:'HV001',displayName:'Kiểm thử'}),role);
    await page.locator('.sidebar-account-trigger').click();await page.locator('#btnAccountSettings').click();
    assert.equal(await page.locator('#themeToggle').isVisible(),true);
    assert.equal(await page.locator('.unit-settings-only').isVisible(),role!=='student');
    assert.equal(await page.locator('#settingsDangerZone').isVisible(),role==='admin');
    await page.locator('#themeToggle').focus();await page.keyboard.press('Space');
    assert.equal(await page.locator('#themeToggle').getAttribute('aria-checked'),'true');
    assert.equal(await page.evaluate(()=>localStorage.getItem('dd460_display_theme')),'dark');
    await page.keyboard.press('Enter');assert.equal(await page.locator('#themeToggle').getAttribute('aria-checked'),'false');
   }
   await page.evaluate(()=>window.AuthState.setUser({type:'student',class:'OTQS1',studentId:'s1',code:'HV001'}));
   for(const theme of ['light','dark']){
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await page.evaluate(()=>window.switchTab('tab-sheet'));
    await checkContrast(['#studentPersonalPanel .readable-section-header h2','#studentPersonalPanel .readable-section-header .text-gold-300','#studentMetricHK1','#studentMetricAchievements','#studentMetricLang','#studentMetricLangSub','#studentMetricRank','.student-year-header h4','.student-semester-label','.student-course-title','.student-course-score']);
    assert.equal(await page.locator('.student-course-title').first().evaluate(el=>getComputedStyle(el).fontSize),'15px');
    assert.equal(await page.locator('.student-year-header').first().evaluate(el=>getComputedStyle(el).backgroundImage),'none');
    await page.screenshot({path:`/tmp/readable-student-${width}-${theme}.png`});
    await page.evaluate(()=>window.switchTab('tab-profiles'));
    await page.locator('#studentInlineProfileContainer input').first().waitFor();
    await checkContrast(['#studentInlineProfileContainer h3','#studentInlineProfileContainer label','#studentInlineProfileContainer input']);
    assert.equal(await page.locator('#studentInlineProfileContainer input').first().evaluate(el=>getComputedStyle(el).opacity),'1');
    await page.screenshot({path:`/tmp/readable-profile-${width}-${theme}.png`});
   }
   // Personal theme changes must not write data, recreate edit controls or discard draft values.
   await page.evaluate(()=>{window.AuthState.setUser({type:'admin',displayName:'Admin'});window.openStudentProfileModal('s1');});
   await page.locator('#profFormPhone').fill('0901234567');
   await page.evaluate(()=>{window.originalPhoneInput=document.getElementById('profFormPhone');document.getElementById('themeToggle').click();});
   assert.equal(await page.locator('#profFormPhone').inputValue(),'0901234567');
   assert.equal(await page.evaluate(()=>window.originalPhoneInput===document.getElementById('profFormPhone')),true);
   await checkContrast(['#profFormPhone','#formStudentProfile label']);
   await page.evaluate(()=>{localStorage.setItem('dd460_display_theme','dark');});
   await page.reload({waitUntil:'networkidle'});
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),'dark');
   await page.waitForFunction(()=>window.AppState?.students.length===5);
   await page.evaluate(()=>window.switchTab('tab-preferences'));
   assert.equal(await page.locator('#themeToggle').getAttribute('aria-checked'),'true');
   await checkContrast(['#themeToggleLabel','#themeToggleHelp','#settingsDangerZone summary']);
   assert.deepEqual(writes,[]);
   await page.screenshot({path:`/tmp/display-settings-${width}.png`});
   assert.deepEqual(errors,[]);
   console.log(`PASS ${width}px: profile contrast >=4.5, neutral headers, keyboard toggle, persistence, all roles, protected unit settings and retained draft input`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
