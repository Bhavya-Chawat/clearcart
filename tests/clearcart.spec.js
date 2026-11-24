const { test, expect, chromium } = require('@playwright/test');
const path = require('path');

const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');

const EXT = path.resolve(__dirname, '../extension');
const BASE = 'http://localhost:8000';
let context, sw, browser, chromeProc;
const errors = [];

test.describe.configure({ mode: 'serial' });

// Two launch modes:
//  - default: Playwright's bundled Chromium with --load-extension
//  - CHROME_PATH=<chrome.exe>: branded Chrome (137+ ignores --load-extension), extension loaded via CDP Extensions.loadUnpacked
async function launch() {
  if (!process.env.CHROME_PATH) {
    context = await chromium.launchPersistentContext('', {
      channel: 'chromium', headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    });
    [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent('serviceworker');
    return;
  }
  const port = 9333;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-chrome-'));
  chromeProc = spawn(process.env.CHROME_PATH, [
    '--headless=new', `--remote-debugging-port=${port}`, '--enable-unsafe-extension-debugging',
    `--user-data-dir=${dir}`, '--no-first-run', '--no-default-browser-check', 'about:blank'
  ], { stdio: 'ignore' });
  for (let i = 0; i < 60; i++) {
    try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break; } catch (e) { await new Promise((r) => setTimeout(r, 250)); }
  }
  const cdp = await browser.newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', { path: EXT });
  context = browser.contexts()[0];
  sw = context.serviceWorkers().find((w) => w.url().includes(id)) ||
    await context.waitForEvent('serviceworker', { predicate: (w) => w.url().includes(id) });
}

test.beforeAll(async () => {
  await launch();
  context.on('page', watch);
  sw.on?.('console', (m) => m.type() === 'error' && errors.push('[sw] ' + m.text()));
  await sw.evaluate(async () => {
    const s = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: { ...s, userName: 'Test User', userEmail: 'test@example.test' } });
  });
});
test.afterAll(async () => {
  if (browser) await browser.close().catch(() => {}); else await context?.close();
  if (chromeProc) chromeProc.kill();
});

function watch(page) {
  page.on('pageerror', (e) => errors.push(`[pageerror] ${page.url()} ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ads\.example/.test(m.text())) errors.push(`[console] ${page.url()} ${m.text()}`); });
}
const tabIdFor = (part) => sw.evaluate(async (p) => (await chrome.tabs.query({})).find((t) => t.url && t.url.includes(p)).id, part);
const labels = (page) => page.evaluate(() => (document.documentElement.dataset.ccLabels || '').split('|').filter(Boolean));
const patterns = (page) => page.evaluate(() => (document.documentElement.dataset.ccPatterns || '').split(','));

test('hotel.html: ≥6 findings incl. fake timer after reload', async () => {
  const page = await context.newPage();
  await page.goto(BASE + '/hotel.html');
  await page.waitForTimeout(5000);
  await page.reload();
  await page.waitForTimeout(3500);
  const l = await labels(page), p = await patterns(page);
  console.log('hotel labels:', l);
  expect(l.length).toBeGreaterThanOrEqual(6);
  expect(l).toContain('Fake timer');
  for (const id of ['false_urgency', 'confirm_shaming', 'interface_interference', 'disguised_advertisement', 'nagging']) expect(p).toContain(id);
  expect(l.some((x) => /scarcity/i.test(x))).toBeTruthy();
  expect(l.some((x) => /social proof/i.test(x))).toBeTruthy();
});

test('Clean View hides timer/scarcity/popups and restores them', async () => {
  const page = context.pages().find((p) => p.url().includes('hotel.html'));
  const setClean = (v) => sw.evaluate(async (v) => { const s = (await chrome.storage.local.get('settings')).settings; await chrome.storage.local.set({ settings: { ...s, cleanView: v } }); }, v);
  await expect(page.locator('#timerBox')).toBeVisible();
  await setClean(true);
  await expect(page.locator('#timerBox')).toBeHidden();
  await expect(page.locator('#scarcity')).toBeHidden();
  await expect(page.locator('#viewersBox')).toBeHidden();
  await expect(page.locator('#appNag')).toBeHidden();
  await expect(page.locator('#noProtect')).toHaveText('No thanks');
  await setClean(false);
  await expect(page.locator('#timerBox')).toBeVisible();
  await expect(page.locator('#scarcity')).toBeVisible();
  await expect(page.locator('#appNag')).toBeVisible();
  await expect(page.locator('#noProtect')).toHaveText('No thanks, I like taking risks');
});

test('Ghost Checkout from hotel.html returns ₹4,150 and leaves no extra tabs', async () => {
  const page = context.pages().find((p) => p.url().includes('hotel.html'));
  await page.bringToFront();
  const id = await tabIdFor('hotel.html');
  const before = await sw.evaluate(async () => (await chrome.tabs.query({})).length);
  const g = await sw.evaluate((id) => cc.ghostCheckout(id), id);
  console.log('ghost:', JSON.stringify(g));
  expect(g.listed).toBe(3200);
  expect(g.total).toBe(4150);
  expect(g.diff).toBe(950);
  const fees = Object.fromEntries(g.fees.map((f) => [f.label, f.amount]));
  expect(fees['Platform fee']).toBe(199);
  expect(fees['Convenience fee']).toBe(249);
  expect(fees['Trip protection']).toBe(199);
  await page.waitForTimeout(500);
  const after = await sw.evaluate(async () => (await chrome.tabs.query({})).length);
  expect(after).toBe(before);
});

test('Alternatives show alt-hotel at ₹3,600', async () => {
  const id = await tabIdFor('hotel.html');
  const r = await sw.evaluate((id) => cc.alternatives(id), id);
  console.log('alts:', JSON.stringify(r.alts));
  expect(r.alts[0].total).toBe(3600);
  expect(r.alts[0].cheaperBy).toBe(550);
  expect(r.alts[0].trust).toBe(100);
});

test('checkout.html: trip protection auto-unticked, total drops by ₹199', async () => {
  const page = await context.newPage();
  await page.goto(BASE + '/checkout.html?item=sea-breeze-goa&price=3200&nights=1');
  await page.waitForTimeout(1500);
  await expect(page.locator('#tripProtect')).not.toBeChecked();
  await expect(page.locator('#total')).toHaveText('₹3,951');
  expect(await patterns(page)).toContain('drip_pricing');
});

test('download.html: 3 fake buttons disabled, real highlighted, fake alert removed', async () => {
  const page = await context.newPage();
  await page.goto(BASE + '/download.html');
  await page.waitForTimeout(2500);
  await expect(page.locator('.cc-fake-btn')).toHaveCount(3);
  await expect(page.locator('#realDownload')).toHaveClass(/cc-real-btn/);
  await expect(page.locator('#scamAlert')).toBeHidden();
  await expect(page.locator('.cc-banner')).toContainText('scam popup');
  await expect(page.locator('.close-x')).toHaveClass(/cc-fake-close/);
  // clicking a fake button must not navigate
  await page.locator('.ad-slot .dl-btn').click({ force: true });
  await page.waitForTimeout(300);
  expect(page.url()).toContain('download.html');
});

test('Complaint flow pre-fills every field and does NOT submit', async () => {
  const hotel = context.pages().find((p) => p.url().includes('hotel.html'));
  await hotel.bringToFront();
  const id = await tabIdFor('hotel.html');
  await sw.evaluate(async () => {
    const s = (await chrome.storage.local.get('settings')).settings || {};
    await chrome.storage.local.set({ settings: { ...s, userName: 'Test User', userEmail: 'test@example.test' } });
  });
  const ev = await sw.evaluate((id) => cc.saveEvidence(id), id);
  expect(ev.hash).toMatch(/^[0-9a-f]{64}$/);
  const r = await sw.evaluate((id) => cc.complain(id), id);
  expect(r.filled.length).toBe(8);
  const page = context.pages().find((p) => p.url().includes('complaint.html'));
  for (const f of ['name', 'email', 'company', 'category', 'patternType', 'amount', 'description', 'evidence']) {
    const v = await page.locator('#' + f).inputValue();
    expect(v.length, f).toBeGreaterThan(0);
  }
  await expect(page.locator('#category')).toHaveValue('travel');
  await expect(page.locator('#status')).toHaveText('');
  expect(await page.locator('#description').inputValue()).toContain('Drip Pricing');
});

test('Side panel and options render', async () => {
  const extId = sw.url().split('/')[2];
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html`);
  await expect(page.locator('#score')).toBeVisible();
  const intents = await page.evaluate(() => ['yeh deal sahi hai', 'what is the real price', 'asli keemat batao', 'extras hatao', 'which button is real', 'asli button kaun sa hai', 'saaf karo', 'koi sasta option', 'shikayat karo', 'असली कीमत'].map((q) => ccPanel.parse(q)));
  expect(intents).toEqual(['deal', 'price', 'price', 'remove', 'button', 'button', 'clean', 'cheaper', 'complaint', 'price']);
  const hiBtn = await page.evaluate(() => CCVoice.T.hi.button({ real: 1, fake: 3 }));
  expect(hiBtn).toContain('हरा वाला बटन असली है');
  const opt = await context.newPage();
  await opt.goto(`chrome-extension://${extId}/options/options.html`);
  await expect(opt.locator('#save')).toBeVisible();
});

test('Screenshots for the demo deck', async () => {
  const shots = path.join(__dirname, 'screenshots');
  const hotel = context.pages().find((p) => p.url().includes('hotel.html'));
  await hotel.setViewportSize({ width: 1200, height: 800 });
  await hotel.bringToFront();
  await hotel.waitForTimeout(800);
  await hotel.screenshot({ path: path.join(shots, 'hotel-overlays.png') });
  const id = await tabIdFor('hotel.html');
  const extId = sw.url().split('/')[2];
  const panel = await context.newPage();
  await panel.setViewportSize({ width: 400, height: 1500 });
  await panel.goto(`chrome-extension://${extId}/sidepanel/sidepanel.html?tab=${id}`);
  await panel.waitForTimeout(500);
  await panel.evaluate(async () => { await ccPanel.doGhost(); await ccPanel.doAlts(); });
  await expect(panel.locator('#ghostOut')).toContainText('4,150');
  await expect(panel.locator('#altOut')).toContainText('550');
  await panel.screenshot({ path: path.join(shots, 'sidepanel.png'), fullPage: true });
  const dl = context.pages().find((p) => p.url().includes('download.html'));
  await dl.setViewportSize({ width: 1200, height: 800 });
  await dl.bringToFront();
  await dl.screenshot({ path: path.join(shots, 'download-shield.png') });
});

test('No console errors in pages / content scripts', async () => {
  console.log(errors.join('\n'));
  expect(errors).toEqual([]);
});

