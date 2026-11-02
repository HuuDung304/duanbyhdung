const {chromium}=require('playwright'),XLSX=require('xlsx'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const width of [1440,390]){
   const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
   const students=['s9','sA','sB','sGood','sDisc','sZero','sLang','sOld'].map(id=>({id,code:'00'+id,name:id,class:'TTG2',dob:'2004-02-03',current_lang_level:id==='sLang'?'A1':'A2'}));
   students.push({id:'other',code:'OTHER',name:'Lớp khác',class:'TTG1',current_lang_level:'B1'});
   const subjects=[{id:'old',name:'Môn cũ',credits:3,semester:1,category:'common'},{id:'a',name:'Toán',credits:3,semester:3,category:'common'},{id:'b',name:'Vật lý',credits:1,semester:3,category:'common'},{id:'z',name:'Thể thao',credits:0,semester:3,category:'common'},{id:'future',name:'Chưa có điểm',credits:3,semester:4,category:'common'},{id:'foreign',name:'Môn riêng',credits:3,semester:5,category:'specialized',target_classes:['TTG1']}];
   const grades=Object.entries({s9:{a:9,b:9,z:4},sA:{a:8.5,b:8.5},sB:{a:8,b:8},sGood:{a:7,b:7},sDisc:{a:9,b:6,z:4},sZero:{a:10,b:10,z:3.99},sLang:{a:10,b:10},sOld:{old:10},other:{foreign:9}}).flatMap(([student_id,scores])=>Object.entries(scores).map(([subject_id,score])=>({student_id,subject_id,score})));
   const tables={students,subjects,grades,languages:[],unit_settings:[{unit_id:'daidoi460',required_lang_standard:'A2',locks:{},audit_logs:[]}]};
   await context.addInitScript(()=>sessionStorage.setItem('dd460_auth_session',JSON.stringify({type:'admin',displayName:'Admin kiểm thử'})));
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname==='cdn.tailwindcss.com')return route.fulfill({contentType:'text/javascript',body:'window.tailwind={};'});if(u.pathname.includes('/xlsx@'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js'))});if(u.hostname.endsWith('.supabase.co'))return route.fulfill({json:tables[u.pathname.split('/').pop()]||[]});return route.fulfill({contentType:'text/javascript',body:''});});
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(process.env.TEST_BASE_URL||'http://127.0.0.1:3001',{waitUntil:'networkidle'});
   await page.waitForFunction(()=>window.AppState?.students.length===9);
   assert.equal(await page.evaluate(()=>window.AppState.subjects.find(s=>s.id==='z').credits),0);
   async function download(kind){
    await page.evaluate(()=>window.switchTab('tab-reports'));
    const pending=page.waitForEvent('download');
    await page.locator(kind==='honors'?'#btnExportHonors':'#btnExportScholarships').click();
    assert.equal(await page.locator('#reportExportDialog').isVisible(),false);
    const file=await pending;assert.equal(file.suggestedFilename(),kind==='honors'?'Danh hiệu học viên.xlsx':'Danh sách học bổng.xlsx');
    const bytes=fs.readFileSync(await file.path()),book=XLSX.read(bytes,{type:'buffer'});
    const sheet=book.Sheets[book.SheetNames[0]],rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''}),info=XLSX.utils.sheet_to_json(book.Sheets.Thong_tin_xet,{header:1,defval:''});
    assert.deepEqual(rows[1],['STT','MÃ HỌC VIÊN','HỌ VÀ TÊN','NGÀY THÁNG NĂM SINH',kind==='honors'?'DANH HIỆU HỌC VIÊN':'HỌC BỔNG','ĐIỂM HỆ 10','ĐIỂM HỆ 4','NGOẠI NGỮ','GHI CHÚ']);
    const archive=XLSX.CFB.read(bytes,{type:'buffer'}),styles=new TextDecoder().decode(archive.FileIndex.find(f=>f.name==='styles.xml').content);
    assert.match(styles,/Times New Roman/);assert.match(styles,/left style="thin"/);
    return {rows,info,records:rows.filter(row=>typeof row[0]==='number'),sheet};
   }
   for(const type of ['admin','company_officer','class_account']){
    await page.evaluate(type=>window.AuthState.setUser({type,class:'TTG2'}),type);
    const scholarships=await download('scholarships');
    if(type!=='class_account') {
     assert.deepEqual(scholarships.records.map(r=>r[2]),['Lớp khác']);
     assert.equal(scholarships.info[1][1],'Toàn đại đội');
     assert.match(scholarships.info[2][1],/Học kỳ 5/);
     const honors=await download('honors');assert.deepEqual(honors.records.map(r=>r[2]),['Lớp khác']);
     continue;
    }
    assert.equal(scholarships.info[1][1],'TTG2');
    assert.deepEqual(scholarships.records.map(r=>r[2]),['s9','sA','sB']);
    assert.deepEqual(scholarships.records.map(r=>r[4]),['Học bổng Lê Quý Đôn','Học bổng loại A','Học bổng loại B']);
    assert.equal(scholarships.records[0][3],'03/02/2004');assert.equal(scholarships.records[0][5],9);assert.equal(scholarships.records[0][6],4);
    assert.match(scholarships.info[2][1],/Học kỳ 3/);
    const honors=await download('honors');
    assert.deepEqual(honors.records.map(r=>r[2]),['s9','sA','sB','sGood']);
    assert.ok(!honors.rows.flat().some(value=>String(value).includes('VẬN DỤNG')));
    assert.equal(honors.records.find(r=>r[2]==='sGood')[4],'Học viên học tốt');
    assert.equal(honors.records.at(-1)[5],7);assert.equal(honors.info[2][1],'Năm 2');
   }
   await page.evaluate(()=>{window.AppState.requiredLangStandard='B1';});
   const higher=await download('honors');assert.equal(higher.records.length,0);assert.ok(higher.rows.flat().includes('Không có học viên đủ điều kiện.'));
   await page.evaluate(()=>{window.AppState.requiredLangStandard='A2';});
   await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'s9',code:'00s9',class:'TTG2'}));
   await page.evaluate(()=>window.switchTab('tab-reports'));
   assert.equal(await page.locator('#btnExportHonors').isVisible(),false);assert.equal(await page.locator('#btnExportScholarships').isVisible(),false);
   const outlook=page.locator('#studentAwardOutlook');
   assert.equal(await outlook.isVisible(),true);
   assert.match(await page.locator('#studentHonorOutlook').innerText(),/Tạm tính: Học viên xuất sắc/);
   assert.match(await page.locator('#studentHonorOutlookNote').innerText(),/Chờ 1\/4 môn/);
   assert.match(await page.locator('#studentScholarshipOutlook').innerText(),/Có khả năng đạt: Học bổng Lê Quý Đôn/);
   await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'sGood',code:'00sGood',class:'TTG2'}));
   assert.match(await page.locator('#studentHonorOutlook').innerText(),/Học viên học tốt/);
   assert.match(await page.locator('#studentScholarshipOutlook').innerText(),/Chưa đủ điều kiện/);
   const bounds=await outlook.boundingBox();assert.ok(bounds.width>0 && bounds.x>=0);
   assert.equal(await outlook.evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   const itemRows=await page.locator('.student-award-outlook-items p').evaluateAll(items=>items.map(el=>el.getBoundingClientRect().top));
   if(width>640)assert.equal(itemRows[0],itemRows[1]);
   await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'sDisc',code:'00sDisc',class:'TTG2'}));
   assert.match(await page.locator('#studentHonorOutlook').innerText(),/Chưa đủ điều kiện/);
   assert.match(await page.locator('#studentHonorOutlookNote').innerText(),/Vật lý.*dưới 7,0/);
   await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'sZero',code:'00sZero',class:'TTG2'}));
   assert.match(await page.locator('#studentScholarshipOutlookNote').innerText(),/chưa qua môn 0 tín chỉ/);
   await page.evaluate(()=>window.AuthState.setUser({type:'student',studentId:'sLang',code:'00sLang',class:'TTG2'}));
   assert.match(await page.locator('#studentHonorOutlookNote').innerText(),/Chưa đạt chuẩn tiếng Nga A2/);
   await page.evaluate(()=>window.AuthState.setUser({type:'company_officer'}));
   assert.equal(await page.locator('#studentPersonalPanel').isVisible(),false);
   assert.deepEqual(errors,[]);
   console.log(`PASS: ${width}px real XLSX downloads; thresholds, missing/zero credits, latest periods, Russian standard, strict subject minimums, scoped roles and student restrictions`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
