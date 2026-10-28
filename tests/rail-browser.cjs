// Local browser checks. Remote libraries and Supabase are fixtures; no live data is accessed.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const results = [];
  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 390]) {
      for (const motion of ['no-preference', 'reduce']) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: motion });
        await context.route('**/*', route => {
          const url = new URL(route.request().url());
          if (url.hostname === '127.0.0.1') return route.continue();
          if (url.hostname === 'cdn.tailwindcss.com') return route.fulfill({ contentType: 'text/javascript', body: 'window.tailwind={};' });
          if (url.hostname.endsWith('.supabase.co')) return route.fulfill({ json: [], headers: { 'access-control-allow-origin': '*' } });
          return route.fulfill({ contentType: url.hostname === 'cdn.jsdelivr.net' ? 'text/javascript' : 'text/css', body: '' });
        });
        await context.addInitScript(() => {
          sessionStorage.setItem('dd460_auth_session', JSON.stringify({ type: 'admin', displayName: 'Admin kiểm thử' }));
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3000', { waitUntil: 'networkidle' });
        if (process.env.RAIL_TEST_CSS_PATH) await page.addStyleTag({ content: fs.readFileSync(process.env.RAIL_TEST_CSS_PATH, 'utf8') });
        await page.waitForSelector('.u040:not([hidden])');
        const root = page.locator('.u040');
        const toggle = page.locator('.u040-tog');
        const rail = page.locator('.u040-rail');
        const title = page.locator('.u040-page-heading h2');
        const collapsedWidth = width < 640 ? 64 : 84;
        // Bento starts expanded on desktop and uses a compact rail on mobile.
        if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click();
        await page.waitForFunction(expected => Math.abs(document.querySelector('.u040-rail').getBoundingClientRect().width - expected) < .1, collapsedWidth);
        await page.waitForFunction(() => document.querySelector('.u040-page-heading h2').textContent === 'Báo cáo giao ban');
        const collapsedLeft = await page.locator('.u040-main').evaluate(element => element.getBoundingClientRect().left);
        await toggle.focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => Math.abs(document.querySelector('.u040-rail').getBoundingClientRect().width - 246) < .1);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        const expandedLeft = await page.locator('.u040-main').evaluate(element => element.getBoundingClientRect().left);
        if (width >= 640) assert.ok(Math.abs(expandedLeft - collapsedLeft - (246 - collapsedWidth)) < 1);
        else assert.ok(Math.abs(expandedLeft - collapsedLeft) < 1, 'mobile sidebar overlays without narrowing the form');
        assert.equal(await root.evaluate(element => element.getBoundingClientRect().right <= innerWidth), true);
        const profiles = page.locator('.u040-it[data-tab="tab-profiles"]');
        await profiles.focus();
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.dataset.tab), 'tab-cumulative');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Space');
        await page.waitForFunction(() => document.querySelector('.u040-page-heading h2').textContent === 'Hồ Sơ Quân Nhân' && !document.querySelector('.u040-page-heading h2').classList.contains('swap'));
        assert.equal(await profiles.getAttribute('aria-current'), 'page');
        assert.equal(await page.locator('#tab-profiles').evaluate(element => element.style.display), 'block');
        const y = await page.locator('.u040-hl').evaluate(element => element.style.getPropertyValue('--y'));
        assert.equal(y, `${await profiles.evaluate(element => element.parentElement.offsetTop)}px`);
        // Expanding/collapsing must not recreate inputs or lose unsaved values.
        const editable = page.locator('#tab-profiles input[type="text"]').first();
        if (await editable.count()) {
          await editable.evaluate(element => { element.value = 'Giữ dữ liệu'; element.dataset.railTest = 'same-node'; });
        }
        await toggle.focus();
        await page.keyboard.press('Space');
        await page.waitForFunction(expected => Math.abs(document.querySelector('.u040-rail').getBoundingClientRect().width - expected) < .1, collapsedWidth);
        if (await editable.count()) {
          assert.equal(await editable.inputValue(), 'Giữ dữ liệu');
          assert.equal(await editable.getAttribute('data-rail-test'), 'same-node');
        }
        await page.evaluate(() => { window.switchTab('tab-settings'); window.switchTab('tab-sheet'); window.switchTab('tab-languages'); });
        await page.waitForFunction(() => document.querySelector('.u040-page-heading h2').textContent === 'Chứng Chỉ Ngoại Ngữ');
        assert.equal(await page.locator('.u040-it[aria-current="page"]').getAttribute('data-tab'), 'tab-languages');
        if (motion === 'reduce') {
          assert.ok(await rail.evaluate(element => parseFloat(getComputedStyle(element).transitionDuration) < .001));
          assert.equal(await title.evaluate(element => element.classList.contains('swap')), false);
        }
        const themedInk = await root.evaluate(element => getComputedStyle(element).getPropertyValue('--ux-ink').trim());
        assert.equal(themedInk, '#182522');
        // Explicit theme overrides the OS preference, within the component only.
        await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme === 'dark' ? 'light' : 'dark');
        const overriddenInk = await root.evaluate(element => getComputedStyle(element).getPropertyValue('--ux-ink').trim());
        assert.equal(overriddenInk, themedInk, 'Bento uses its requested neutral light palette regardless of OS theme');
        await page.evaluate(() => { delete document.documentElement.dataset.theme; });
        if (process.env.RAIL_SCREENSHOT_DIR && motion === 'reduce') {
          await toggle.click({ force: true });
          await page.screenshot({ path: `${process.env.RAIL_SCREENSHOT_DIR}/rail-${theme}-${width}.png` });
        }
        await page.evaluate(() => {
          window.AuthState.setUser({ type: 'student', code: 'HVTEST', name: 'Học viên kiểm thử', class: 'OTQS1' });
          window.switchTab('tab-sheet');
        });
        await page.waitForFunction(() => document.querySelector('.u040-page-heading h2').textContent === 'Bảng Điểm');
        assert.equal(await page.locator('.u040-it:visible').count(), 3);
        await page.locator('.u040-it[data-tab="tab-cumulative"]').focus();
        await page.keyboard.press('ArrowDown');
        assert.equal(await page.evaluate(() => document.activeElement.dataset.tab), 'tab-sheet');
        assert.match(await page.locator('.u040-me small').textContent(), /Học viên/);
        await page.evaluate(() => window.handleLogout());
        assert.equal(await root.isVisible(), false);
        assert.deepEqual(errors, []);
        results.push({ theme, width, motion, result: 'PASS' });
        await context.close();
      }
    }
  }
  await browser.close();
  console.log(JSON.stringify(results, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
