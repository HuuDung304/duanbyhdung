// All remote calls are fixtures. No live Supabase reads or writes.
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
async function navigate(page, tab) { if (page.viewportSize().width <= 760 && await page.locator('#interfaceMenuButton').count()) await page.locator('#interfaceMenuButton').click(); await page.locator(`[data-tab="${tab}"]`).click(); }
async function openField(page,id,field) { if(await page.locator('#researchDetailView').isVisible())await page.locator('#researchDetailBack').click(); await page.locator(`[data-research-action="open"][data-project-id="${id}"]`).click(); const section=page.locator(`[data-research-section="${field}"]`); if(!await section.count())throw new Error('Detail missing: '+JSON.stringify(errors)+' '+await page.locator('#researchDetailView').innerHTML()); if(!await section.evaluate(el=>el.open))await section.locator('summary').click(); await section.locator('[data-research-field]').click(); }
async function openUpload(page) { if(await page.locator('#researchDetailView').isVisible())await page.locator('#researchDetailBack').click(); if (!await page.locator('#researchUploadDialog').evaluate(el => el.open)) await page.locator('#researchImport').click(); }
async function openManual(page) { await openUpload(page); await page.locator('#researchManual').click(); }
const students = [{ id: 'a', code: '001', name: 'Nguyễn An', class: 'OTQS1', rank: 'Thượng sĩ', dob: '2003-01-01' }, { id: 'b', code: '002', name: 'Trần Bình', class: 'TTG2', rank: 'Thượng sĩ', dob: '2003-01-01' }, { id: 'c', code: '003', name: 'Lê Chi', class: 'XMCB', rank: 'Thượng sĩ', dob: '2003-01-01' }];
const person = s => ({ studentId: s.id, code: s.code, name: s.name, class: s.class });
const topic = (id, leaderId, members) => ({ id, title: 'Đề tài ' + id, year: 1, leaderId, participants: members.map(i => person(students[i])), objective: 'Mục tiêu nghiên cứu', content: 'Nội dung 1\nNội dung 2', product: 'Báo cáo', advisors: [{ name: 'Cô Hướng Dẫn', unit: 'K13' }], awards: ['Giấy khen'] });
const prefix = 'research-project:';
const records = new Map([topic('r1', 'a', [0, 1]), topic('r2', 'b', [1, 2])].map(p => [prefix + p.id, { unit_id: prefix + p.id, locks: { research_project: p, revision: 'rev1' } }]));
let writes = 0, rejectTitle = '';
const errors = [];
(async () => {
 const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
 async function session(user, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
  await context.addInitScript(user => sessionStorage.setItem('dd460_auth_session', JSON.stringify(user)), user);
  await context.route('**/*', async route => {
   const request = route.request(), u = new URL(request.url());
   if (u.hostname === '127.0.0.1') return route.continue();
   if (u.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'text/javascript', body: 'window.tailwind={};' });
   if (u.pathname.includes('/xlsx@')) return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(require.resolve('xlsx/dist/xlsx.full.min.js')) });
   if (!u.hostname.endsWith('.supabase.co')) return route.fulfill({ contentType: u.hostname === 'cdn.jsdelivr.net' ? 'text/javascript' : 'text/css', body: '' });
   const table = u.pathname.split('/').pop();
   if (table === 'unit_settings') {
    const unit = u.searchParams.get('unit_id') || '';
    if (request.method() === 'GET') {
     if (unit === 'eq.daidoi460') return route.fulfill({ json: [{ unit_id: 'daidoi460', locks: {}, audit_logs: [], required_lang_standard: 'A2' }] });
     const rows = unit.startsWith('eq.') ? [records.get(unit.slice(3))].filter(Boolean) : [...records.values()];
     return route.fulfill({ json: rows });
    }
    let body = request.postDataJSON(); body = Array.isArray(body) ? body[0] : body;
    const key = body.unit_id || unit.slice(3);
    if (key === 'daidoi460') return route.fulfill({ json: [] });
    writes++;
    if (body.locks?.research_project?.title === rejectTitle) return route.fulfill({ status: 400, json: { message: 'Rejected fixture' } });
    if (request.method() === 'POST') {
     if (records.has(key)) return route.fulfill({ status: 409, json: { message: 'duplicate' } });
     records.set(key, body);
    } else if (request.method() === 'PATCH') {
     const old = records.get(key), revision = u.searchParams.get('locks->>revision');
     if (!old || revision !== 'eq.' + old.locks.revision) return route.fulfill({ json: [] });
     records.set(key, { ...old, ...body });
    } else throw Error('Unexpected research mutation');
    return route.fulfill({ json: [records.get(key)] });
   }
   if (table === 'grades' && request.method() !== 'GET') return route.fulfill({ json: [] });
   if (request.method() !== 'GET') throw Error('Unexpected write to ' + table);
   const tables = { students, subjects: [{ id: 'm1', name: 'Toán', code: 'M1', credits: 3, semester: 1, category: 'common' }, { id: 'm2', name: 'Lý', code: 'M2', credits: 1, semester: 2, category: 'common' }, { id: 'm3', name: 'Hóa', code: 'M3', credits: 2, semester: 3, category: 'common' }], grades: [{ student_id: 'a', subject_id: 'm1', score: 8 }, { student_id: 'a', subject_id: 'm2', score: 0 }, { student_id: 'b', subject_id: 'm3', score: 9 }], languages: [] };
   return route.fulfill({ json: tables[table] || [] });
  });
  const page = await context.newPage(); page.on('pageerror', e => { errors.push(e.message); console.error('PAGEERROR:',e.message); });
  await page.goto(base, { waitUntil: 'networkidle' });
  if (process.env.RESEARCH_TEST_CSS_PATH) await page.addStyleTag({ path: process.env.RESEARCH_TEST_CSS_PATH });
  await page.waitForFunction(() => window.AppState?.students.length === 3);
  await navigate(page, 'tab-research');
  await page.waitForFunction(() => document.getElementById('researchTopicCount').textContent !== '—');
  return { page, context };
 }
 try {
 const {page}=await session({type:'admin',displayName:'Admin kiểm thử'});
 await page.locator('#researchTableBody .research-student-link[data-id="a"]').first().click();
 await page.locator('#cadetAcademicResults').waitFor({state:'visible'});
 assert.equal(await page.locator('[data-cadet-year]').count(),5);
 assert.equal(await page.locator('.cadet-semester').count(),10);
 assert.equal(await page.locator('[data-cadet-course]').count(),3);
 assert.equal(await page.locator('[data-cadet-course="m2"].is-failed').count(),1);
 assert.match(await page.locator('[data-cadet-course="m3"]').innerText(),/Chưa có điểm/);
 const score=page.locator('[data-cadet-course="m1"] input');
 await score.fill('3,99'); await score.press('Enter');
 await page.waitForFunction(()=>window.AppState.grades.a.m1===3.99);
 assert.equal(await page.locator('[data-cadet-course="m1"].is-failed').count(),1);
 await score.fill('4');await score.press('Enter');
 await page.waitForFunction(()=>window.AppState.grades.a.m1===4);
 assert.equal(await page.locator('[data-cadet-course="m1"].is-failed').count(),0);
 await score.fill('');await score.press('Enter');
 await page.waitForFunction(()=>window.AppState.grades.a.m1===undefined);
 await score.fill('11');await score.press('Enter');
 await page.waitForFunction(()=>document.querySelector('[data-cadet-course="m1"] [role="alert"]').textContent.length>0);
 assert.equal(await score.inputValue(),'');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.locator('#btnBackFromCadetDetail').click();
 assert.equal(await page.locator('#tab-research').isVisible(),true);
 const officer=await session({type:'company_officer'});
 await officer.page.locator('#researchTableBody .research-student-link[data-id="a"]').first().click();
 assert.equal(await officer.page.locator('[data-cadet-score]').count(),0);
 assert.equal(await officer.page.locator('[data-cadet-readonly-score]').count(),3);
 const cls=await session({type:'class_account',class:'OTQS1'});
 await cls.page.locator('#researchTableBody .research-student-link[data-id="a"]').first().click();
 assert.equal(await cls.page.locator('[data-cadet-score]').count(),3);
 const self=await session({type:'student',studentId:'a',code:'001'});
 await self.page.locator('#researchTableBody .research-student-link[data-id="a"]').first().click();
 assert.equal(await self.page.locator('[data-cadet-score]').count(),0);
 assert.equal(await self.page.locator('[data-cadet-readonly-score]').count(),3);
 assert.deepEqual(errors,[]);
 console.log('Cadet profile: name links, 5 years/10 terms, all courses, editable scores, red failures, clearing and invalid values, mobile layout passed.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
