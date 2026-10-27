// Run:  node scripts/test-api.mjs     (uses a throw-away database)
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from '../backend/server.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'libra-'));
const server = createServer({ dbFile: path.join(dir, 't.db'), dataDir: dir, publicDir: path.join(dir, 'none') });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0, failN = 0;
const ok = (cond, msg) => { if (cond) pass++; else { failN++; console.log('  ✗ FAIL:', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`);
async function call(method, url, body, token) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  return { status: r.status, data };
}

console.log('Auth');
let r = await call('GET', '/api/bootstrap');
eq(r.status, 401, 'bootstrap requires login');
r = await call('POST', '/api/auth/login', { username: 'admin', password: 'wrong' });
eq(r.status, 401, 'wrong password rejected');
r = await call('POST', '/api/auth/login', { username: 'admin', password: 'Libra@2026' });
eq(r.status, 200, 'default admin can log in');
let T = r.data.token;
ok(r.data.user.must_change === true, 'admin must change password');
r = await call('GET', '/api/summary', null, T);
eq(r.status, 403, 'blocked until password changed');
r = await call('POST', '/api/auth/change-password', { current: 'Libra@2026', next: 'short' }, T);
eq(r.status, 400, 'weak password rejected');
r = await call('POST', '/api/auth/change-password', { current: 'Libra@2026', next: 'Whitestar#2026' }, T);
eq(r.status, 200, 'password changed');
r = await call('POST', '/api/auth/login', { username: 'admin', password: 'Whitestar#2026' });
T = r.data.token;

console.log('Seed data');
r = await call('GET', '/api/bootstrap', null, T);
eq(r.data.classes.length, 29, '29 classes');
eq(r.data.titles.length, 99, '99 titles');
eq(r.data.settings.school_name, "WHITESTAR ACADEMY LANG'ATA", 'school name');
r = await call('GET', '/api/learners?limit=1', null, T);
eq(r.data.total, 607, '607 learners');
r = await call('GET', '/api/summary', null, T);
eq(r.data.school.learners, 607, 'school roll 607');
eq(r.data.classes.find(c => c.code === '1N').learners, 0, '1N has no learners in the supplied list');
eq(r.data.classes.find(c => c.code === '1S').learners, 26, '1S has 26');
eq(r.data.classes.find(c => c.code === '3N').learners, 28, '3N has 28');
eq(r.data.school.issued, 0, 'nothing issued at start');

const classes = r.data.classes;
const c6w = classes.find(c => c.code === '6W');
const c6e = classes.find(c => c.code === '6E');
r = await call('GET', `/api/classes/${c6w.id}/register`, null, T);
const reg = r.data;
eq(reg.learners.length, 25, '6W register has 25 learners');
eq(reg.titles.length, 15, '6W has 15 titles (8+7)');
const L1 = reg.learners[0], L2 = reg.learners[1], L3 = reg.learners[2];
const [t1, t2] = reg.titles;

console.log('Register records');
const put = (b, tok = T) => call('PUT', '/api/records', b, tok);
eq((await put({ learner_id: L1.id, title_id: t1.id, issued_on: '2026-05-04', status: 'issued' })).status, 200, 'issue');
eq((await put({ learner_id: L1.id, title_id: t2.id, issued_on: '2026-05-04', status: 'issued' })).status, 200, 'issue 2nd');
eq((await put({ learner_id: L1.id, title_id: t1.id, issued_on: '2026-05-04', status: 'collected', returned_on: '2026-08-27' })).status, 200, 'collect');
eq((await put({ learner_id: L1.id, title_id: t1.id, issued_on: '2026-05-04', status: 'collected' })).status, 400, 'collected needs date');
eq((await put({ learner_id: L1.id, title_id: t1.id, issued_on: '2026-05-04', status: 'collected', returned_on: '2026-05-01' })).status, 400, 'collected before issued rejected');
eq((await put({ learner_id: L1.id, title_id: t1.id, issued_on: '2026-02-30', status: 'issued' })).status, 400, 'impossible date rejected');
eq((await put({ learner_id: L2.id, title_id: t1.id, issued_on: '2026-05-04', status: 'lost' })).status, 200, 'mark lost');
eq((await put({ learner_id: L3.id, title_id: t1.id, issued_on: '2026-05-05', status: 'damaged', returned_on: '2026-08-20' })).status, 200, 'mark damaged');
eq((await put({ learner_id: L3.id, title_id: t2.id, issued_on: '2026-05-05', status: 'issued' })).status, 200, 'issue L3 t2');
r = await call('GET', `/api/classes/${c6w.id}/register`, null, T);
eq(r.data.totals[t1.id], { issued: 3, collected: 1, lost: 1, damaged: 1, out: 0 }, 'column totals for title 1');
eq(r.data.totals[t2.id], { issued: 2, collected: 0, lost: 0, damaged: 0, out: 2 }, 'column totals for title 2');
eq(r.data.learners[0].out, 1, 'learner OUT count');
let st = r.data.stats;
eq([st.issued, st.collected, st.out, st.lost, st.damaged], [5, 1, 2, 1, 1], 'class stats');
eq(st.expected, 25 * 15, 'expected = learners × titles');
eq(st.check, 'register 2 vs log 0', 'incident check flags mismatch');

console.log('Bulk');
r = await call('POST', `/api/classes/${c6w.id}/bulk`, { action: 'issue', title_id: reg.titles[2].id, date: '2026-05-06' }, T);
eq([r.data.changed, r.data.skipped], [25, 0], 'bulk issue to all');
r = await call('POST', `/api/classes/${c6w.id}/bulk`, { action: 'issue', title_id: reg.titles[2].id, date: '2026-05-06' }, T);
eq([r.data.changed, r.data.skipped], [0, 25], 'bulk issue is idempotent');
r = await call('POST', `/api/classes/${c6w.id}/bulk`, { action: 'collect', title_id: reg.titles[2].id, date: '2026-08-24' }, T);
eq(r.data.changed, 25, 'bulk collect');

console.log('Incidents');
const inc = { learner_id: L2.id, title_id: t1.id, type: 'Lost', status: 'Pending replacement', value: 850, issued_on: '2026-05-04' };
r = await call('POST', '/api/incidents', { ...inc, reported_on: '2026-08-27' }, T);
eq(r.status, 200, 'create incident');
eq(r.data.ref, 'INC-001', 'ref format');
eq(r.data.resolution, 'Open', 'open');
const incId = r.data.id;
eq((await call('POST', '/api/incidents', { ...inc, type: 'Stolen' }, T)).status, 400, 'bad type');
eq((await call('POST', '/api/incidents', { ...inc, status: 'Whatever' }, T)).status, 400, 'bad status');
r = await call('POST', '/api/incidents', { learner_id: L3.id, title_id: t1.id, type: 'Damaged', category: 'Water damage', status: 'Under investigation', reported_on: '2026-08-20' }, T);
eq(r.status, 200, 'damaged incident');
r = await call('GET', `/api/classes/${c6w.id}/register`, null, T);
eq(r.data.stats.check, 'matches', 'register and log now match');

console.log('Stock');
r = await call('GET', '/api/stock', null, T);
let row = r.data.rows.find(x => x.id === t1.id);
eq([row.issued, row.collected, row.lost, row.damaged, row.with_learners], [3, 1, 1, 1, 0], 'stock pulls from registers');
eq(row.status, 'Enter stock', 'no stock entered yet');
r = await call('PUT', `/api/stock/${t1.id}`, { opening: 100, purchased: 10, physical: 108 }, T);
eq(r.status, 200, 'update stock');
eq([r.data.total, r.data.expected, r.data.variance, r.data.status], [110, 109, -1, 'Shortfall'], 'shortfall computed');
r = await call('PUT', `/api/incidents/${incId}`, { status: 'Replaced', replaced_on: '2026-09-01', new_copy_id: 'NC-77' }, T);
eq(r.data.resolution, 'Closed', 'replaced closes the case');
r = await call('GET', '/api/stock', null, T);
row = r.data.rows.find(x => x.id === t1.id);
eq([row.replacements, row.total, row.expected, row.variance, row.status], [1, 111, 110, -2, 'Shortfall'], 'replacement raises total copies');
eq((await call('PUT', `/api/stock/${t1.id}`, { opening: -5 }, T)).status, 400, 'negative stock rejected');

console.log('Moving learners (records follow the learner)');
r = await call('POST', `/api/learners/${L1.id}/move`, { to_class_id: c6e.id, note: 'Parent request' }, T);
eq(r.data.class_label, '6 East', 'moved to 6 East');
r = await call('GET', `/api/classes/${c6w.id}/register`, null, T);
eq(r.data.learners.length, 24, '6W now 24');
r = await call('GET', `/api/classes/${c6e.id}/register`, null, T);
const moved = r.data.learners.find(l => l.id === L1.id);
ok(moved && moved.out === 1, 'moved learner appears in new register still holding 1 book');
eq(Object.keys(moved.records).length, 3, 'all 3 of their records moved with them');
r = await call('GET', `/api/learners/${L1.id}`, null, T);
eq(r.data.moves.length, 1, 'move history stored');
eq((await call('POST', `/api/learners/${L1.id}/move`, { to_class_id: c6e.id }, T)).status, 400, 'cannot move to same class');
r = await call('PUT', `/api/learners/${L1.id}`, { status: 'left' }, T);
eq(r.data.status, 'left', 'mark left');
r = await call('GET', '/api/summary', null, T);
ok(r.data.checks.find(c => c.key === 'left').count === 1, 'left-with-books check raised');
eq((await call('DELETE', `/api/learners/${L1.id}`, null, T)).status, 409, 'cannot delete learner with records');
await call('PUT', `/api/learners/${L1.id}`, { status: 'active' }, T);

console.log('Learners CRUD & import');
r = await call('POST', '/api/learners', { adm_no: '9001', name: '  New   Learner ', class_id: c6w.id }, T);
eq(r.data.name, 'New Learner', 'name normalised');
eq((await call('POST', '/api/learners', { adm_no: '9001', name: 'Dup', class_id: c6w.id }, T)).status, 409, 'duplicate admission no rejected');
r = await call('POST', '/api/learners/import', { update_existing: true, rows: [
  { adm_no: '9001', name: 'New Learner', class_code: '6S' }, { adm_no: '9002', name: 'Imported One', class_code: '7N' }, { adm_no: '9003', name: 'Bad', class_code: 'ZZ' }, { adm_no: '9 0', name: 'Bad adm', class_code: '7N' }] }, T);
eq([r.data.created, r.data.moved, r.data.errors.length], [1, 1, 2], 'import: 1 created, 1 moved, 2 errors');
r = await call('GET', '/api/learners?q=imported', null, T);
eq(r.data.total, 1, 'search by name');
r = await call('GET', '/api/learners?q=9001', null, T);
eq(r.data.rows[0].class_code, '6S', 'search by adm no / moved by import');
const lid = (await call('GET', '/api/learners?q=9002', null, T)).data.rows[0].id;
eq((await call('DELETE', `/api/learners/${lid}`, null, T)).status, 200, 'delete clean learner');

console.log('Titles & class titles');
r = await call('POST', '/api/titles', { name: 'new book x', grade: 6, class_ids: [c6w.id] }, T);
eq(r.data.name, 'NEW BOOK X', 'title upper-cased');
const nt = r.data.id;
eq((await call('POST', '/api/titles', { name: 'NEW BOOK X', grade: 6 }, T)).status, 409, 'duplicate title');
r = await call('GET', `/api/classes/${c6w.id}/register`, null, T);
eq(r.data.titles.length, 16, 'new title appears in register');
const ids = r.data.titles.map(t => t.id).filter(i => i !== nt);
eq((await call('PUT', `/api/classes/${c6w.id}/titles`, { title_ids: ids }, T)).status, 200, 'unassign unused title');
eq((await call('DELETE', `/api/titles/${nt}`, null, T)).status, 200, 'delete unused title');
eq((await call('DELETE', `/api/titles/${t1.id}`, null, T)).status, 409, 'cannot delete used title');
eq((await call('PUT', `/api/classes/${c6w.id}/titles`, { title_ids: ids.filter(i => i !== t2.id) }, T)).status, 409, 'cannot unassign title with live records');

console.log('Roles & users');
r = await call('POST', '/api/users', { username: 'tr.merlin', name: 'Tr. Merlin', role: 'teacher', class_id: c6w.id, password: 'Teacher#2026' }, T);
eq(r.status, 200, 'create teacher');
r = await call('POST', '/api/users', { username: 'teacher.no.class', name: 'X', role: 'teacher', password: 'Teacher#2026' }, T);
eq(r.status, 400, 'teacher needs class');
await call('POST', '/api/users', { username: 'head1', name: 'Head Teacher', role: 'head', password: 'Head#2026ab' }, T);
await call('POST', '/api/users', { username: 'lib1', name: 'Librarian', role: 'librarian', password: 'Lib#2026abc' }, T);
const login = async (u, p) => { const x = await call('POST', '/api/auth/login', { username: u, password: p }); return x.data.token; };
let TT = await login('tr.merlin', 'Teacher#2026');
r = await call('GET', '/api/bootstrap', null, TT); eq(r.status, 200, 'must_change can still bootstrap');
eq((await call('GET', '/api/summary', null, TT)).status, 403, 'new account must change password');
await call('POST', '/api/auth/change-password', { current: 'Teacher#2026', next: 'Teacher#2027x' }, TT);
TT = await login('tr.merlin', 'Teacher#2027x');
let HT = await login('head1', 'Head#2026ab'); await call('POST', '/api/auth/change-password', { current: 'Head#2026ab', next: 'Head#2027xyz' }, HT); HT = await login('head1', 'Head#2027xyz');
let LT = await login('lib1', 'Lib#2026abc'); await call('POST', '/api/auth/change-password', { current: 'Lib#2026abc', next: 'Lib#2027xyz1' }, LT); LT = await login('lib1', 'Lib#2027xyz1');
const l6w = (await call('GET', `/api/classes/${c6w.id}/register`, null, TT)).data.learners;
eq((await put({ learner_id: l6w[3].id, title_id: t1.id, issued_on: '2026-05-04', status: 'issued' }, TT)).status, 200, 'teacher edits own class');
eq((await put({ learner_id: moved.id, title_id: t1.id, issued_on: '2026-05-04', status: 'issued' }, TT)).status, 403, 'teacher blocked from other class');
eq((await call('POST', '/api/learners', { adm_no: '9100', name: 'X', class_id: c6w.id }, TT)).status, 403, 'teacher cannot add learners');
eq((await call('PUT', '/api/stock/1', { opening: 5 }, TT)).status, 403, 'teacher cannot edit stock');
eq((await call('GET', '/api/users', null, TT)).status, 403, 'teacher cannot list users');
eq((await put({ learner_id: l6w[3].id, title_id: t1.id, issued_on: '2026-05-04', status: 'issued' }, HT)).status, 403, 'head teacher read-only');
eq((await call('GET', '/api/audit', null, HT)).status, 200, 'head teacher can read audit');
eq((await call('GET', '/api/summary', null, HT)).status, 200, 'head teacher can read summary');
eq((await call('PUT', '/api/stock/1', { opening: 5 }, LT)).status, 200, 'librarian edits stock');
eq((await call('PUT', '/api/settings', { term: 'Term 3' }, LT)).status, 403, 'librarian cannot change settings');
eq((await call('POST', '/api/snapshots', { label: 'Head snapshot' }, HT)).status, 200, 'head can create snapshot');
r = await call('POST', '/api/incidents', { learner_id: l6w[3].id, title_id: t1.id, type: 'Lost', status: 'Replaced', reported_on: '2026-09-01', replaced_on: '2026-09-02' }, TT);
eq([r.status, r.data.status], [200, 'Under investigation'], 'teacher incident forced to Under investigation');
eq((await call('PUT', `/api/users/${(await call('GET', '/api/users', null, T)).data.find(u => u.username === 'admin').id}`, { active: false }, T)).status, 400, 'admin cannot deactivate self');

console.log('Settings');
eq((await call('PUT', '/api/settings', { term: 'Term 9' }, T)).status, 400, 'invalid term');
r = await call('PUT', '/api/settings', { term: 'Term 3', librarian: 'Ms Wanjiru', cutoff: '2026-11-30' }, T);
eq([r.data.term, r.data.librarian, r.data.cutoff], ['Term 3', 'Ms Wanjiru', '2026-11-30'], 'settings saved');
eq((await call('PUT', '/api/lists/statuses', { values: ['A', 'B'] }, T)).status, 400, 'status list must keep closing statuses');
eq((await call('PUT', '/api/lists/damage_categories', { values: ['Torn pages', 'Mould'] }, T)).status, 200, 'damage categories editable');
eq((await call('PUT', '/api/settings', { logo: 'data:text/html;base64,AAAA' }, T)).status, 400, 'bad logo rejected');

console.log('Dashboard, reports, exports, snapshots');
r = await call('GET', '/api/dashboard', null, T);
eq(r.status, 200, 'dashboard'); eq(r.data.trend.length, 8, '8 trend weeks');
r = await call('GET', '/api/reports/outstanding', null, T);
ok(r.data.books >= 2 && r.data.learners >= 1, 'outstanding report has rows');
for (const k of ['summary', 'stock', 'incidents', 'learners', 'outstanding']) {
  r = await call('GET', `/api/export/${k}`, null, T);
  ok(r.status === 200 && typeof r.data === 'string' && r.data.length > 20, `csv export ${k}`);
}
r = await call('GET', `/api/export/register?class_id=${c6w.id}`, null, T);
ok(r.data.includes('ISSUED') && r.data.includes('LOST'), 'register csv has LOST marker');
r = await call('POST', '/api/snapshots', { label: 'End of Term 2' }, T);
const snap = r.data.id;
r = await call('GET', `/api/snapshots/${snap}`, null, T);
eq(r.data.data.school.learners > 0, true, 'snapshot contains summary');

console.log('Backup / restore');
r = await call('GET', '/api/admin/backup', null, T);
ok(r.status === 200 && r.data.app === 'libralink', 'backup downloads');
const backup = r.data;
await call('PUT', `/api/stock/${t1.id}`, { opening: 1 }, T);
r = await call('POST', '/api/admin/restore', backup, T);
eq(r.status, 200, 'restore');
r = await call('GET', '/api/stock', null, T);
eq(r.data.rows.find(x => x.id === t1.id).opening, 100, 'restore brought back the value saved in the backup (100)');
eq((await call('POST', '/api/admin/restore', { app: 'x' }, T)).status, 400, 'bogus restore refused');

console.log('Throttle');
let last;
for (let i = 0; i < 7; i++) last = await call('POST', '/api/auth/login', { username: 'lib1', password: 'nope' });
eq(last.status, 429, 'login throttled after repeated failures');

console.log('Misc');
eq((await call('GET', '/api/nope', null, T)).status, 404, '404 for unknown route');
eq((await call('GET', '/api/health')).status, 200, 'health');
const raw = await fetch(base + '/api/learners', { headers: { Authorization: 'Bearer bad.token.here' } });
eq(raw.status, 401, 'tampered token rejected');

console.log(`\n${failN ? '✗' : '✓'} ${pass} passed, ${failN} failed`);
server.close(); server.app.db.close(); fs.rmSync(dir, { recursive: true, force: true });
process.exit(failN ? 1 : 0);
