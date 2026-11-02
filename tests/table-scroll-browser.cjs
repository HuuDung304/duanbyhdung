// Exercise large DOM tables without live services; catch full-table work caused by unrelated UI mutations.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
 try {
  for (const touch of [false,true]) {
   const context = await browser.newContext({viewport:{width:touch?390:1440,height:900},hasTouch:touch,isMobile:touch});
   const page=await context.newPage(), errors=[];page.on('pageerror',error=>errors.push(error.message));
   const header='<thead><tr><th>STT</th><th>Mã học viên</th><th>Họ và tên</th>'+Array.from({length:27},(_,i)=>`<th>Môn ${i}</th>`).join('')+'</tr></thead>';
   const body='<tbody>'+Array.from({length:300},(_,i)=>`<tr><td>${i+1}</td><td>HV${i}</td><td>Học viên ${i}</td>`+Array.from({length:27},()=>'<td>8</td>').join('')+'</tr>').join('')+'</tbody>';
   await page.setContent(`<body class="bento-app ui-modern"><div class="u040-content"><section class="tab-content active"><div><table id="large">${header}${body}</table></div><div><table id="other">${header}${body}</table></div></section><button id="toolbar">Tùy chọn</button></div></body>`);
   await page.addStyleTag({content:fs.readFileSync('src/css/readability.css','utf8')+'\n'+fs.readFileSync('src/css/interface.css','utf8')+'\ntable {width:3000px} td {min-width:80px}'});
   await page.evaluate(()=>{
    window.geometryReads=[];
    const read=Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect=function(...args){if(this.tagName==='TH')window.geometryReads.push(this.closest('table').id);return read.apply(this,args);};
    window.settled=()=>new Promise(resolve=>{let frames=5;const frame=()=>--frames?requestAnimationFrame(frame):resolve();requestAnimationFrame(frame);});
   });
   await page.addScriptTag({content:fs.readFileSync(process.env.READABILITY_SOURCE || 'src/js/components/readability.js','utf8').replace(/^import .*;\n/gm,'')});
   await page.evaluate(()=>window.settled());
   assert.equal(await page.locator('#large [data-identity-column]').count(),903);
   const untouched=await page.evaluate(async()=>{
    window.geometryReads=[];
    document.querySelector('#toolbar').classList.toggle('active');
    document.querySelector('#large tbody tr').classList.toggle('focused');
    await window.settled();
    return [...window.geometryReads];
   });
   assert.deepEqual(untouched,[],'toolbar and row focus must not measure tables');
   const changed=await page.evaluate(async()=>{
    window.geometryReads=[];
    document.querySelector('#large tbody tr td:nth-child(4)').textContent='Chưa có';
    await window.settled();
    return {reads:[...window.geometryReads],numeric:document.querySelector('#large tbody tr td:nth-child(4)').hasAttribute('data-numeric-cell')};
   });
   assert.ok(changed.reads.length>0);
   assert.ok(changed.reads.every(id=>id==='large'),'changing one table must not measure other tables');
   assert.equal(changed.numeric,false);
   await page.evaluate(async()=>{window.geometryReads=[];const scroll=document.querySelector('#large').parentElement;scroll.scrollLeft=600;scroll.scrollTop=700;await window.settled();});
   const scroll=await page.locator('#large').evaluate(table=>({x:table.parentElement.scrollLeft,y:table.parentElement.scrollTop,behavior:getComputedStyle(table.parentElement).scrollBehavior,transition:getComputedStyle(table.rows[1]).transitionDuration,reads:window.geometryReads.length}));
   assert.ok(scroll.x>0 && scroll.y>0);
   assert.equal(scroll.behavior,'auto');assert.equal(scroll.transition,'0s');assert.equal(scroll.reads,0);
   assert.deepEqual(errors,[]);
   console.log(`PASS: ${touch?'touch':'desktop'}: 2 × 300-row/30-column tables; no geometry reads on focus/scroll; only changed table updated; native scroll, no row transitions`);
   await context.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
