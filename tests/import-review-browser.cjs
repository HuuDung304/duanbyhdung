const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
 const browser = await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
 try {
  for (const width of [1440,390]) {
   const page = await browser.newPage({viewport:{width,height:850},reducedMotion:'reduce'});
   await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3032');
   await page.evaluate(async () => {
    const {reviewImport} = await import('/src/js/components/import-review.js');
    window.reviewResult = null;
    reviewImport({title:'Xem trước',details:'1 dòng',rows:['<img src=x onerror="window.hacked=1">'],confirm:true}).then(r=>window.reviewResult=r);
   });
   const dialog = page.locator('dialog[open]');
   await dialog.waitFor();
   assert.equal(await dialog.locator('img').count(),0);
   assert.equal(await page.evaluate(()=>Boolean(window.hacked)),false);
   const bounds = await dialog.boundingBox();
   assert.ok(bounds.x >= 0 && bounds.width <= width);
   await page.keyboard.press('Escape');
   assert.equal(await page.evaluate(()=>window.reviewResult),false);
   await page.evaluate(async()=>{
    const {reviewImport}=await import('/src/js/components/import-review.js');
    reviewImport({title:'Nhập',details:'1 dòng',confirm:true}).then(r=>window.reviewResult=r);
   });
   await page.getByRole('button',{name:'Xác nhận nhập',exact:true}).click();
   assert.equal(await page.evaluate(()=>window.reviewResult),true);
   await page.close();
  }
  console.log('PASS: desktop/mobile, literal spreadsheet text, Escape cancellation, confirmation, reduced motion');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
