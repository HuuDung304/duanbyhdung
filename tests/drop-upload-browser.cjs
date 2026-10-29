// Actual Excel parsing with local fixtures: no production database writes.
const {chromium}=require('playwright'),XLSX=require('xlsx'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [1440,390]) for(const colorScheme of ['light','dark']) for(const reducedMotion of ['no-preference','reduce']){
   const tables={students:[{id:'s1',code:'HV001',name:'Nguyễn Minh Anh',class:'OTQS1',dob:'2003-02-01',current_lang_level:'A2',achievements:['Chiến sĩ tiên tiến 2025']},{id:'s2',code:'HV002',name:'Trần Hải Nam',class:'OTQS1',dob:'2004-03-02',current_lang_level:'A1'},{id:'s3',code:'HV003',name:'Lê Minh Đức',class:'TTG1',dob:'2002-04-03',current_lang_level:'B1.1'}],subjects:[{id:'math',code:'MATH',name:'Toán cao cấp',credits:3,semester:1,category:'common'},{id:'phys',code:'PHYS',name:'Vật lý đại cương',credits:2,semester:2,category:'common'}],grades:[{student_id:'s1',subject_id:'math',score:9},{student_id:'s1',subject_id:'phys',score:3.99},{student_id:'s2',subject_id:'math',score:4}],languages:[],unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]};
   const context=await browser.newContext({viewport:{width,height:1000},colorScheme,reducedMotion,acceptDownloads:true});
   await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});if(u.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'),'utf8')});if(u.hostname.endsWith('.supabase.co'))return route.fulfill({json:tables[u.pathname.split('/').pop()]||[],headers:{'access-control-allow-origin':'*'}});return route.fulfill({contentType:u.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});});
   const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3018',{waitUntil:'networkidle'});if(process.env.REPORT_TEST_CSS_PATH)await page.addStyleTag({path:process.env.REPORT_TEST_CSS_PATH});
   await page.waitForFunction(()=>window.AppState?.students.length===3);
   let writes=0; page.on('request',request=>{if(request.method()==='POST'&&request.url().includes('.supabase.co'))writes++;});
   await page.locator('#btnImportExcel').dispatchEvent('click');
   const zone=page.locator('#dropZone .u032-zone');
   await zone.waitFor({state:'visible'});
   const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Mã HV','Họ và Tên','Lớp','Toán'],['HV001','Nguyễn Minh Anh','OTQS1',7.5]]),'Diem');
   const valid={name:'Bảng điểm.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})};
   const chooser=page.waitForEvent('filechooser'); await zone.focus();await page.keyboard.press('Enter'); await(await chooser).setFiles(valid);
   await page.waitForFunction(()=>document.querySelector('#dropZone').parentElement.querySelector('.u032-row.done'));
   assert.match(await page.locator('#dropZone').evaluate(e=>e.parentElement.innerText),/Chưa lưu database/);
   assert.equal(await page.locator('#btnConfirmImport').isDisabled(),false);
   const root=page.locator('#dropZone').locator('..');
   assert.equal(await root.locator('[role="progressbar"]').getAttribute('aria-valuenow'),'100');
   assert.equal(await root.evaluate(e=>getComputedStyle(e).colorScheme),colorScheme);
   if(reducedMotion==='reduce')assert.equal(await root.locator('.u032-st path').evaluate(e=>getComputedStyle(e).strokeDashoffset),'0px');
   await page.locator('#excelFileInput').setInputFiles({name:'wrong.txt',mimeType:'text/plain',buffer:Buffer.from('not excel')});
   assert.equal(await page.locator('#btnConfirmImport').isDisabled(),true);
   assert.equal(await root.locator('.fail').count(),1);
   await page.locator('#excelFileInput').setInputFiles({name:'broken.xlsx',mimeType:valid.mimeType,buffer:Buffer.from('broken')});
   await page.waitForFunction(()=>document.querySelector('#dropZone').parentElement.querySelector('.u032-row.fail'));
   await root.locator('.u032-retry').click();
   await page.waitForFunction(()=>document.querySelector('#dropZone').parentElement.querySelector('.u032-row.fail'));
   // Drop actual CSV and verify the same parser runs through delegated change.
   await zone.evaluate(e=>{
    const data=new DataTransfer();data.items.add(new File(['Mã HV,Họ và Tên,Lớp,Toán\nHV001,Nguyễn Minh Anh,OTQS1,8'], 'drop.csv',{type:'text/csv'}));
    e.dispatchEvent(new DragEvent('dragenter',{bubbles:true,cancelable:true,dataTransfer:data}));
    e.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:data}));
   });
   await page.waitForFunction(()=>document.querySelector('#dropZone').parentElement.querySelector('.u032-row.done'));
   assert.match(await root.innerText(),/drop.csv/);
   assert.equal(await root.evaluate(e=>e.classList.contains('is-over')),false);
   await page.locator('#modalImportExcel .modal-close').first().click();
   await page.locator('#btnImportProfileExcel').dispatchEvent('click');
   const profile=page.locator('#quickImportDropZone').locator('..');
   const profileWB=XLSX.utils.book_new();XLSX.utils.book_append_sheet(profileWB,XLSX.utils.aoa_to_sheet([['Mã HV','Họ và Tên','Lớp'],['HV001','Nguyễn Minh Anh','OTQS1']]),'HoSo');
   await page.locator('#quickImportFileInput').setInputFiles({name:'Hồ sơ.xlsx',mimeType:valid.mimeType,buffer:XLSX.write(profileWB,{type:'buffer',bookType:'xlsx'})});
   await page.waitForFunction(()=>document.querySelector('#quickImportDropZone').parentElement.querySelector('.u032-row.done'));
   assert.equal(await page.locator('#btnExecuteQuickImport').isDisabled(),false);
   assert.match(await profile.innerText(),/Chưa lưu database/);
   const box=await profile.boundingBox();assert.ok(box.width<=width);
   assert.equal(writes,0); assert.deepEqual(errors,[]);
   console.log(`PASS: ${width}px ${colorScheme} ${reducedMotion}: keyboard picker, real progress, invalid file, retry, CSV drop, roster preview, no database writes`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
