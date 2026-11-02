const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:900}});await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin'})));
 const tables={students:[{id:'s',code:'HV001',name:'Học viên thử',class:'OTQS1',current_lang_level:'A2'}],subjects:[{id:'m',name:'Toán',credits:3,semester:1,category:'common'}],grades:[{student_id:'s',subject_id:'m',score:8}],languages:[],unit_settings:[{unit_id:'daidoi460',locks:{},audit_logs:[],required_lang_standard:'A2'}]};
 await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname.endsWith('.supabase.co'))return route.fulfill({json:tables[u.pathname.split('/').pop()]||[]});return route.fulfill({contentType:'text/javascript',body:u.hostname==='cdn.tailwindcss.com'?'window.tailwind={};':''});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:3001',{waitUntil:'networkidle'});await page.waitForFunction(()=>window.AppState?.students.length===1);
 for(const [tab,id] of [['tab-sheet','spreadsheetTable'],['tab-profiles','profilesTableBody'],['tab-cumulative','cumulativeTableBody'],['tab-master','masterTableBody']]){
  await page.evaluate(tab=>window.switchTab(tab),tab);const section=page.locator(`#${tab}`),button=section.locator('.table-dialog-launcher');assert.equal(await button.count(),1,tab);await button.click();const dialog=section.locator('dialog.table-dialog');assert.equal(await dialog.isVisible(),true);assert.equal(await dialog.locator(`#${id}`).count(),1);
  const box=await dialog.boundingBox();assert.ok(Math.abs(box.x+box.width/2-width/2)<3,tab);assert.ok(Math.abs(box.y+box.height/2-450)<3,tab);
  if(tab==='tab-sheet'){const input=dialog.locator('.grid-cell-input').first();assert.equal(await input.count(),1);await input.fill('8.50');await input.press('Tab');await page.waitForFunction(()=>window.AppState.grades.s.m===8.5);assert.equal(await dialog.isVisible(),true);}
  await page.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await button.evaluate(el=>document.activeElement===el),true);
 }
 await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'s',code:'HV001',class:'OTQS1'}));await page.evaluate(()=>window.switchTab('tab-sheet'));assert.equal(await page.locator('#tab-sheet .table-dialog-launcher').isVisible(),false);
 assert.deepEqual(errors,[]);console.log(`PASS ${width}px: four centered table dialogs, existing table controls, Escape and focus restoration`);await context.close();
}}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
