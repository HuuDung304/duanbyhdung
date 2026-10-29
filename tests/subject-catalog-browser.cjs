// Curriculum workflows use only local database fixtures; never touches production.
const {chromium}=require('playwright'),XLSX=require('xlsx'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [1440,390]){
   const tables={students:[{id:'s1',code:'HV001',name:'Nguyễn Minh Anh',class:'OTQS1',dob:'2003-02-01',current_lang_level:'A2',achievements:['Chiến sĩ tiên tiến 2025']},{id:'s2',code:'HV002',name:'Trần Hải Nam',class:'OTQS1',dob:'2004-03-02',current_lang_level:'A1'},{id:'s3',code:'HV003',name:'Lê Minh Đức',class:'TTG1',dob:'2002-04-03',current_lang_level:'B1.1'}],subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'},{id:'phys',code:'PHYS',name:'Vật lý đại cương',credits:2,semester:2,category:'common'}],grades:[{student_id:'s1',subject_id:'math',score:9},{student_id:'s1',subject_id:'phys',score:3.99},{student_id:'s2',subject_id:'math',score:4}],languages:[],unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]};
   tables.subjects.push({id:'legacy-ttqs',code:'TTQS',name:'TTQS',semester:1,credits:1,category:'common'});
   tables.grades.push({student_id:'s1',subject_id:'legacy-ttqs',score:8.2},{student_id:'s3',subject_id:'legacy-ttqs',score:0});
   const originalGrades=JSON.stringify(tables.grades),writes=[];let denyNext=false;
   const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
   await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});if(u.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'),'utf8')});if(u.hostname.endsWith('.supabase.co')){
    const request=route.request(),table=u.pathname.split('/').pop();
    if(request.method()==='DELETE')throw new Error('Curriculum must never delete fixture data');
    if(request.method()==='POST'){
      const raw=request.postDataJSON(),rows=Array.isArray(raw)?raw:[raw];writes.push({table,rows:JSON.parse(JSON.stringify(rows))});
      if(table==='subjects'&&denyNext){denyNext=false;return route.fulfill({status:400,json:{code:'42501',message:'Fixture denied'},headers:{'access-control-allow-origin':'*'}});}
      if(table==='subjects')for(const row of rows){const existing=tables.subjects.find(s=>s.id===row.id);if(existing)Object.assign(existing,row);else tables.subjects.push(row);}
      return route.fulfill({json:rows,headers:{'access-control-allow-origin':'*'}});
    }
    return route.fulfill({json:tables[table]||[],headers:{'access-control-allow-origin':'*'}});
   }return route.fulfill({contentType:u.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3018',{waitUntil:'networkidle'});if(process.env.REPORT_TEST_CSS_PATH)await page.addStyleTag({path:process.env.REPORT_TEST_CSS_PATH});
   await page.waitForFunction(()=>window.AppState?.students.length===3);
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.locator('.u040-it[data-tab="tab-settings"]').click();
   assert.match(await page.locator('.subject-catalog').innerText(),/TTQS/);
   assert.doesNotMatch(await page.locator('.subject-catalog').innerText(),/Môn Học Chuyên Ngành/);
   assert.equal(writes.filter(write=>write.table==='subjects').length,0);
   const modal=page.locator('#modalAddSubject');
   const save=()=>modal.locator('button[type="submit"]').click();
   async function add(name,semester,classes,code=''){
    await page.locator(`.btn-add-to-sem[data-sem="${semester}"][data-cat="${classes?'specialized':'common'}"]`).click();
    await page.locator('#newSubjName').fill(name);await page.locator('#newSubjCode').fill(code);
    if(classes){await page.locator('#btnClearAllTargetClasses').click();for(const cls of classes)await page.locator(`.subj-target-class-cb[value="${cls}"]`).check();}
    await save();await modal.waitFor({state:'hidden'});
    return tables.subjects.at(-1);
   }
   const literal='Kỹ thuật - Chi tiết máy (thực hành)';
   const common=await add(literal,1,null);
   assert.equal(common.name,literal);assert.equal(common.category,'common');
   const first=await add('Môn A',1,['OTQS1'],'A');
   await page.locator('#subjectCatalogClass').selectOption('OTQS1');
   const different=await add('Môn B',1,['TTG1'],'B');
   assert.equal(await page.locator('#subjectCatalogClass').inputValue(),'TTG1');
   assert.deepEqual(different.target_classes,['TTG1']);
   const later=await add('Môn A',2,['TTG1'],'A');
   assert.notEqual(first.id,later.id);assert.equal(first.semester,1);assert.equal(later.semester,2);
   assert.deepEqual(first.target_classes,['OTQS1']);assert.deepEqual(later.target_classes,['TTG1']);
   // A name correction keeps the original foreign key and all original grades, including zero.
   await page.locator('.btn-edit-subj[data-id="legacy-ttqs"]').click();
   assert.equal(await page.locator('#newSubjSemester').isDisabled(),true);
   const exact='THỂ THAO QUÂN SỰ 1 (thực hành)';await page.locator('#newSubjName').fill(exact);
   await page.locator('#newSubjCategory').selectOption('specialized');await page.locator('#btnClearAllTargetClasses').click();await page.locator('.subj-target-class-cb[value="OTQS1"]').check();
   const before=writes.filter(w=>w.table==='subjects').length;
   await save();assert.match(await page.locator('#subjectFormError').innerText(),/bỏ lớp đang có điểm/);
   assert.equal(writes.filter(w=>w.table==='subjects').length,before);
   assert.equal(tables.subjects.find(s=>s.id==='legacy-ttqs').name,'TTQS');
   await page.locator('#newSubjCategory').selectOption('common');await save();await modal.waitFor({state:'hidden'});
   assert.equal(tables.subjects.find(s=>s.id==='legacy-ttqs').name,exact);assert.equal(JSON.stringify(tables.grades),originalGrades);
   assert.equal(await page.evaluate(()=>window.AppState.grades.s3['legacy-ttqs']),0);
   // A rejected save leaves the local catalog untouched; retry uses the same new ID.
   await page.locator('.btn-add-to-sem[data-sem="1"][data-cat="common"]').click();await page.locator('#newSubjName').fill('Retry course');
   const localCount=await page.evaluate(()=>window.AppState.subjects.length);denyNext=true;
   await save();await page.waitForFunction(()=>!document.getElementById('subjectFormError').hidden&&document.getElementById('subjectFormError').textContent.includes('Fixture denied'));assert.match(await page.locator('#subjectFormError').innerText(),/Fixture denied/);assert.equal(await page.evaluate(()=>window.AppState.subjects.length),localCount);
   const failedId=writes.filter(w=>w.table==='subjects').at(-1).rows[0].id;
   await save();await modal.waitFor({state:'hidden'});assert.equal(writes.filter(w=>w.table==='subjects').at(-1).rows[0].id,failedId);
   assert.equal(tables.subjects.filter(s=>s.id===failedId).length,1);
   assert.ok(writes.every(write=>['subjects','unit_settings'].includes(write.table)));assert.equal(JSON.stringify(tables.grades),originalGrades);
   // Fill only the in-memory export fixture so the class has completed this semester.
   await page.evaluate(async()=>{
    const {AppState,getSubjectsForClass}=await import(new URL('./src/js/grades.js',document.baseURI).href);
    for(const student of AppState.students.filter(s=>s.class==='OTQS1'))for(const subject of getSubjectsForClass('OTQS1',1)){
     AppState.grades[student.id] ||= {};if(AppState.grades[student.id][subject.id]===undefined)AppState.grades[student.id][subject.id]=8;
    }
   });
   await page.evaluate(()=>window.switchTab('tab-reports'));
   await page.locator('#btnExportClassExcel').click();await page.locator('#reportsClassSelect').selectOption('OTQS1');
   const download=page.waitForEvent('download');await page.locator('#reportExportConfirm').click();
   const book=XLSX.read(fs.readFileSync(await(await download).path()),{type:'buffer'});
   const values=XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1}).flat();assert.ok(values.includes(literal));assert.ok(values.includes(exact));assert.ok(!values.includes('Môn B'));
   await page.evaluate(()=>window.AuthState.setUser({type:'company_officer',displayName:'Cán bộ'}));await page.locator('.u040-it[data-tab="tab-settings"]').click();
   assert.equal(await page.locator('.subject-catalog .btn-add-to-sem').count(),0);assert.equal(await page.locator('.subject-catalog .btn-edit-subj').count(),0);
   await page.evaluate(()=>window.AuthState.setUser({type:'class_account',class:'OTQS1'}));await page.locator('.u040-it[data-tab="tab-settings"]').click();
   assert.equal(await page.locator('#subjectCatalogClass').isDisabled(),true);assert.equal(await page.locator('.btn-edit-subj[data-id="legacy-ttqs"]').count(),0);
   assert.equal(await page.locator(`.btn-edit-subj[data-id="${first.id}"]`).count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
   console.log(`PASS: ${width}px TH1/TH2, separate same-name semesters, exact Excel names, graded-scope protection, stable legacy IDs, unchanged database grades and retry-safe local state`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
