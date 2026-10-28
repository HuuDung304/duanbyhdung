// Browser integration test: all external services are replaced with local fixtures.
// Run against a local static server; never writes to the real Supabase project.
const {chromium}=require('playwright');
const XLSX=require('xlsx');
const fs=require('fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const tables=Object.fromEntries(['students','subjects','grades','languages','unit_settings'].map(t=>[t,[]]));
 const errors=[];const writes=[];
 async function newPage(){
  const context=await browser.newContext();
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());
   if(url.hostname==='127.0.0.1')return route.continue();
   if(url.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});
   if(url.hostname==='cdn.jsdelivr.net'&&url.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))});
   if(url.hostname.endsWith('.supabase.co')){
    const table=url.pathname.split('/').pop();let rows=tables[table]||[];
    if(request.method()==='POST'){
     let incoming=request.postDataJSON();incoming=Array.isArray(incoming)?incoming:[incoming];
     const keys=(url.searchParams.get('on_conflict')||'id').split(',');
     const ignore=(request.headers().prefer||'').includes('ignore-duplicates');
     for(const row of incoming){const existing=rows.find(r=>keys.every(k=>r[k]===row[k]));if(existing){if(!ignore)Object.assign(existing,row);}else rows.push(row);}
     writes.push({table,count:incoming.length});
     return route.fulfill({json:incoming,headers:{'access-control-allow-origin':'*'}});
    }
    const codes=url.searchParams.get('code');if(codes&&codes.startsWith('in.'))rows=rows.filter(r=>codes.includes('"'+r.code+'"'));
    const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
    return route.fulfill({json:rows.slice(offset,offset+limit),headers:{'access-control-allow-origin':'*'}});
   }
   return route.fulfill({contentType:url.hostname==='cdn.jsdelivr.net'?'text/javascript':'text/css',body:''});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.error('browser console:',m.text())});
  await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(()=>{document.getElementById('loginAdminUser').value='huudung';document.getElementById('loginAdminPass').value='hd304';document.getElementById('formAdminLogin').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
  await page.waitForFunction(()=>window.AppState?.role==='admin');
  return page;
 }
 const pages=await Promise.all([newPage(),newPage()]);
 const file=(code,subject,score)=>{const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Mã HV','Họ và Tên','Lớp',subject],[code,'Học viên kiểm thử','OTQS1',score]]),'Diem');return {name:'Diem_OTQS1_Nam_1.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})};};
 await Promise.all(pages.map(async(p,i)=>{
  await p.locator('#btnImportExcel').dispatchEvent('click');
  await p.locator('#excelFileInput').setInputFiles(file('HVTEST',i?'Vật lý':'Toán',i?'4,00':'3,99'));
  await p.waitForFunction(()=>!document.getElementById('btnConfirmImport').disabled);
  await p.locator('#btnConfirmImport').dispatchEvent('click');
  await p.waitForFunction(()=>document.getElementById('modalImportExcel').getAttribute('aria-hidden')==='true' && !document.getElementById('btnConfirmImport').disabled);
  assert.match(await p.locator('#classSpreadsheetWrapper').innerText(),/HVTEST/);
 }));
 assert.equal(tables.students.length,1);assert.equal(tables.grades.length,2);assert.equal(tables.languages.length,1);
 assert.deepEqual(tables.grades.map(g=>g.score).sort(),[3.99,4]);assert.deepEqual(errors,[]);
 for(const page of pages){
  await page.evaluate(()=>window.switchTab('tab-dashboard'));
  assert.doesNotMatch(await page.locator('#reportCompanyTableBody').innerText(),/Trung bình khá/);
  assert.match(await page.locator('#reportCompanyTableBody').innerText(),/Yếu/);
  assert.equal(await page.locator('#masterFilterRank option').count(),8);
 }
 // Two real XLSX profile uploads: identical names, distinct codes, then update only one code.
 const profilePage=pages[0];
 const uploadProfiles=async rows=>{
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Mã HV','Họ và Tên','Lớp','SĐT'],...rows]),'HoSo');
  await profilePage.evaluate(()=>window.switchTab('tab-profiles'));
  await profilePage.locator('#btnImportProfileExcel').dispatchEvent('click');
  await profilePage.locator('#quickImportFileInput').setInputFiles({name:'HoSo.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'})});
  await profilePage.waitForFunction(()=>!document.getElementById('btnExecuteQuickImport').disabled);
  await profilePage.locator('#btnExecuteQuickImport').dispatchEvent('click');
  await profilePage.waitForFunction(()=>document.getElementById('modalQuickImportExcel').getAttribute('aria-hidden')==='true');
 };
 await uploadProfiles([['HVPROFILE1','Nguyễn Văn A','OTQS1','0900000001'],['HVPROFILE2','Nguyễn Văn A','OTQS2','0900000002']]);
 await uploadProfiles([[' hvprofile2 ','Nguyễn Văn A','OTQS2','0900000099']]);
 assert.equal(tables.students.filter(student=>student.name==='Nguyễn Văn A').length,2);
 assert.equal(tables.students.find(student=>student.code==='HVPROFILE1').phone,'0900000001');
 assert.equal(tables.students.find(student=>student.code==='HVPROFILE2').phone,'0900000099');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',workflow:'Two browser sessions concurrently upload actual XLSX files through the UI against an in-memory REST fixture',students:tables.students.length,subjects:tables.subjects.length,grades:tables.grades.length,browserErrors:errors,writes},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
