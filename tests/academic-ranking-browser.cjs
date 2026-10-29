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
    const classes=['OTQS1','OTQS2','TTG1','TTG2','XMCB'];
    window.AppState.students=Array.from({length:20},(_,i)=>({id:`r${i}`,code:`HV${String(i).padStart(3,'0')}`,name:`Học viên ${i}`,dob:'2004-01-02',class:classes[Math.floor(i/4)],currentLangLevel:'A2'}));
    window.AppState.subjects=[{id:'y1a',name:'Toán',credits:3,semester:1,category:'common'},{id:'y1b',name:'Lý',credits:3,semester:2,category:'common'},{id:'y2a',name:'Tin',credits:3,semester:3,category:'common'}];
    window.AppState.grades=Object.fromEntries(window.AppState.students.map((s,i)=>[s.id,{y1a:9.9-i*.03,y1b:9.9-i*.03,y2a:6}]));window.AppState.languages={};
   });
   const download=async(year)=>{const pending=page.waitForEvent('download');await page.locator('#btnExportRanking').click();await page.locator('#rankingYearSelect').selectOption(String(year));await page.locator('#reportExportConfirm').click();const file=await pending;assert.equal(file.suggestedFilename(),'Xếp hạng điểm.xlsx');const bytes=fs.readFileSync(await file.path());return {book:XLSX.read(bytes,{type:'buffer'}),archive:XLSX.CFB.read(bytes,{type:'buffer'})};};
   const colors=(archive,name,column='A')=>{
    const decode=file=>new TextDecoder().decode(file.content);
    const styles=decode(archive.FileIndex.find(f=>f.name==='styles.xml'));
    const fills=[...styles.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)[1].matchAll(/<fill>[\s\S]*?<\/fill>/g)].map(m=>m[0]);
    const xfs=[...styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)[1].matchAll(/<xf\b[^>]*>/g)].map(m=>Number(m[0].match(/fillId="(\d+)"/)?.[1]||0));
    const xml=decode(archive.FileIndex.find(f=>f.name===name));
    return [...xml.matchAll(new RegExp(`<c r="${column}(\\d+)"[^>]*s="(\\d+)"`,'g'))].filter(m=>Number(m[1])>=4).map(m=>fills[xfs[Number(m[2])]]||'');
   };
   for(const type of ['admin','company_officer','class_account']) {
    await page.evaluate(type=>window.AuthState.setUser({type,class:'OTQS1'}),type);await page.evaluate(()=>window.switchTab('tab-reports'));
    const {book,archive}=await download(1);
    assert.equal(book.SheetNames.length,type==='class_account'?1:2);
    const sheet=book.Sheets[book.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''});
    assert.equal(rows.length,type==='class_account'?7:23);assert.equal(rows[3][1],'HV000');assert.equal(rows[3][8],'Đạt');
    const fills=colors(archive,'sheet1.xml');assert.equal(fills.filter(f=>f.includes('FFDCFCE7')).length,type==='class_account'?0:2);assert.equal(fills.filter(f=>f.includes('FFFEF9C3')).length,type==='class_account'?1:5);
    if(type!=='class_account') {
     const classes=book.Sheets.Tung_lop;for(const start of [0,12,24,36,48]) assert.match(classes[XLSX.utils.encode_cell({r:0,c:start})].v,/LỚP/);
     assert.equal(colors(archive,'sheet2.xml','M').filter(f=>f.includes('FFFEF9C3')).length,1);
    } else {assert.ok(rows.slice(3).every(row=>row[4]==='OTQS1'));}
    const second=await download(2);const secondRows=XLSX.utils.sheet_to_json(second.book.Sheets[second.book.SheetNames[0]],{header:1,defval:''});assert.equal(secondRows[3][5],6);assert.equal(secondRows[3][6],'');assert.equal(secondRows[3][7],6);assert.equal(colors(second.archive,'sheet1.xml').filter(f=>/FFDCFCE7|FFFEF9C3/.test(f)).length,0);
   }
   assert.deepEqual(errors,[]);console.log(`PASS: ${width}px ranking scopes, years, two-column class gaps, exact quotas and genuine Excel row fills`);await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
