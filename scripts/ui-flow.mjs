import { createRequire } from 'node:module';
const require = createRequire('/home/claude/.npm-global/lib/node_modules/');
const { chromium } = require('playwright');
import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
import { createServer } from '../backend/server.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-'));
const server = createServer({ dbFile: path.join(dir, 'f.db'), dataDir: dir, publicDir: path.resolve('frontend/dist') });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const out = '/tmp/flow'; fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('  ✗', m); } else console.log('  ✓', m); };
const ctx = await browser.newContext({ viewport: { width: 1366, height: 820 } });
const page = await ctx.newPage();
page.on('pageerror', e => { fails++; console.log('PAGE ERROR', e.message); });
const api = (p) => page.evaluate(async (p) => (await fetch('/api' + p, { headers: { Authorization: 'Bearer ' + localStorage.getItem('libralink.token') } })).json(), p);

await page.goto(base); await page.waitForSelector('text=Sign in to continue', { timeout: 8000 }); await page.click('text=Sign in to continue');
await page.fill('input[autocomplete=username]', 'admin'); await page.fill('input[autocomplete=current-password]', 'Libra@2026'); await page.click('button[type=submit]');
await page.waitForSelector('input[autocomplete=new-password]');
const pw = await page.$$('input[type=password]'); await pw[0].fill('Libra@2026'); await pw[1].fill('Whitestar#2026'); await pw[2].fill('Whitestar#2026'); await page.click('button[type=submit]');
await page.waitForSelector('.kpis');
const classes = await api('/classes'); const c6w = classes.find(c => c.code === '6W');

console.log('Register (desktop)');
await page.goto(`${base}/#/class/${c6w.id}`); await page.waitForSelector('table.reg');
const firstCell = page.locator('.reg tbody tr:first-child td.cell').first();
await firstCell.click(); await page.waitForSelector('.modal');
await page.locator('.modal .btn.primary').click();
await page.waitForSelector('.toast');
await page.waitForTimeout(500);
let reg = await api(`/classes/${c6w.id}/register`);
ok(reg.stats.issued === 1, 'issuing a book via the grid saved 1 record');
ok((await page.locator('.reg tbody tr:first-child td.cell').first().innerText()).trim().length > 2, 'grid cell now shows the issue date');

console.log('Bulk issue');
await page.click('button:has-text("Bulk")'); await page.waitForSelector('.modal');
await page.locator('.modal .btn.primary').click(); await page.waitForTimeout(700);
reg = await api(`/classes/${c6w.id}/register`);
ok(reg.stats.issued === 25, 'bulk issue gave first title to all 25 (1 existing skipped): ' + reg.stats.issued);
await page.screenshot({ path: `${out}/register-desktop.png` });

console.log('Quick actions (By book)');
await page.click('button[role=tab]:has-text("By book")'); await page.waitForTimeout(300);
await page.locator('.bybook .btn:has-text("Collect")').first().click(); await page.waitForTimeout(600);
reg = await api(`/classes/${c6w.id}/register`);
ok(reg.stats.collected === 1, 'quick “Collect” worked');
await page.locator('.bybook .btn:has-text("Lost")').first().click(); await page.waitForSelector('.toast:has-text("Log case")');
await page.locator('.toast button:has-text("Log case")').click(); await page.waitForSelector('.modal');
await page.screenshot({ path: `${out}/incident-form.png` });
await page.locator('.modal .btn.primary').click(); await page.waitForTimeout(700);
const inc = await api('/incidents'); ok(inc.rows.length === 1 && inc.rows[0].type === 'Lost', 'case logged from register in two taps');
reg = await api(`/classes/${c6w.id}/register`); ok(reg.stats.check === 'matches', 'register ↔ incident log now match');

console.log('Print layout');
await page.click('button[role=tab]:has-text("Register")');
await page.emulateMedia({ media: 'print' }); await page.screenshot({ path: `${out}/register-print.png`, fullPage: false });
await page.emulateMedia({ media: 'screen' });

console.log('Stock edit');
await page.goto(`${base}/#/stock`); await page.waitForSelector('table.t');
await page.locator('table.t tbody tr').first().click(); await page.waitForSelector('.modal');
const inputs = page.locator('.modal input[type=number]'); const n = await inputs.count();
await inputs.nth(0).fill('120'); 
await page.locator('.modal .btn.primary').click(); await page.waitForTimeout(700);
const stock = await api('/stock'); ok(stock.rows.some(r => r.opening === 120), 'opening stock saved through the UI (' + n + ' numeric fields)');
await page.screenshot({ path: `${out}/stock.png` });

console.log('Learner profile / move');
const lr = await api('/learners?limit=1&q=2000'); const lid = lr.rows[0].id;
await page.goto(`${base}/#/learner/${lid}`); await page.waitForSelector('h1');
await page.screenshot({ path: `${out}/learner.png` });
const moveBtn = page.locator('button:has-text("Move")').first();
if (await moveBtn.count()) { await moveBtn.click(); await page.waitForSelector('.modal'); await page.screenshot({ path: `${out}/move.png` }); await page.keyboard.press('Escape'); ok(true, 'move dialog opens'); } else ok(false, 'no Move button found');

console.log('Summary / Settings');
await page.goto(`${base}/#/summary`); await page.waitForSelector('table.t'); await page.screenshot({ path: `${out}/summary.png` });
await page.goto(`${base}/#/settings`); await page.waitForTimeout(800); await page.screenshot({ path: `${out}/settings.png`, fullPage: false });

// mobile register cards
const m = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
const mp = await m.newPage(); mp.on('pageerror', e => { fails++; console.log('MOBILE PAGE ERROR', e.message); });
await mp.goto(base); await mp.evaluate(t => localStorage.setItem('libralink.token', t), await page.evaluate(() => localStorage.getItem('libralink.token')));
await mp.goto(`${base}/#/class/${c6w.id}`); await mp.reload(); await mp.waitForSelector('.lcard');
await mp.locator('.lcard > button').first().click(); await mp.waitForTimeout(300);
await mp.screenshot({ path: `${out}/register-mobile.png` });
await mp.locator('.lcard .chip').first().click(); await mp.waitForSelector('.modal'); await mp.screenshot({ path: `${out}/editor-mobile.png` });
ok(true, 'mobile card view + bottom-sheet editor render');
await mp.keyboard.press('Escape');
await mp.goto(`${base}/#/classes`); await mp.waitForTimeout(600); await mp.screenshot({ path: `${out}/classes-mobile.png` });
await mp.goto(`${base}/#/dashboard`); await mp.waitForTimeout(800); await mp.screenshot({ path: `${out}/dash-mobile.png` });
await browser.close(); server.close(); server.app.db.close();
console.log(fails ? `\n✗ ${fails} failure(s)` : '\n✓ UI flows all passed'); process.exit(fails ? 1 : 0);
