import { createRequire } from 'node:module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
import { createServer } from '../backend/server.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-'));
const server = createServer({ dbFile: path.join(dir, 'u.db'), dataDir: dir, publicDir: path.resolve('frontend/dist') });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const out = process.env.SHOTS || '/tmp/shots'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let problems = 0;
async function session(name, viewport, mobile, first) {
  const ctx = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => { problems++; console.log(`[${name}] PAGE ERROR:`, e.message); });
  page.on('console', m => { if (m.type() === 'error') { problems++; console.log(`[${name}] console.error:`, m.text()); } });
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 500) { problems++; console.log(`[${name}] 5xx`, r.url()); } });
  const shot = (n) => page.screenshot({ path: `${out}/${name}-${n}.png` });
  await page.goto(base); await page.waitForTimeout(900); await shot('1-splash');
  await page.waitForTimeout(1800); await shot('2-welcome');
  await page.click('text=Sign in to continue'); await page.waitForSelector('input[autocomplete=username]'); await shot('3-login');
  await page.fill('input[autocomplete=username]', 'admin'); await page.fill('input[autocomplete=current-password]', 'wrong'); await page.click('button[type=submit]');
  await page.waitForSelector('.alert.bad'); 
  if (first) {
    await page.fill('input[autocomplete=current-password]', 'Libra@2026'); await page.click('button[type=submit]');
    await page.waitForSelector('input[autocomplete=new-password]'); await shot('4-forcepw');
    const pw = await page.$$('input[type=password]');
    await pw[0].fill('Libra@2026'); await pw[1].fill('Whitestar#2026'); await pw[2].fill('Whitestar#2026'); await page.click('button[type=submit]');
  } else { await page.fill('input[autocomplete=current-password]', 'Whitestar#2026'); await page.click('button[type=submit]'); }
  await page.waitForSelector('.kpis'); await page.waitForTimeout(600); await shot('5-dashboard');
  const routes = ['classes', 'class/' + 1, 'learners', 'learner/5', 'summary', 'stock', 'incidents', 'books', 'reports', 'settings', 'users', 'audit', 'guide', 'account'];
  for (const r of routes) {
    await page.goto(`${base}/#/${r}`); await page.waitForTimeout(700);
    const body = await page.locator('main').innerText().catch(() => '');
    if (!body.trim() || /Something went wrong|undefined|NaN/.test(body)) { problems++; console.log(`[${name}] suspicious content on #/${r}:`, body.slice(0, 120)); }
    await shot('p-' + r.replace('/', '_'));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 2) { problems++; console.log(`[${name}] horizontal overflow ${overflow}px on #/${r}`); }
  }
  await ctx.close();
}
await session('desktop', { width: 1366, height: 820 }, false, true);
await session('mobile', { width: 390, height: 800 }, true, false);
await browser.close(); server.close(); server.app.db.close();
console.log(problems ? `\n✗ ${problems} problem(s)` : '\n✓ UI smoke test clean');
process.exit(problems ? 1 : 0);
