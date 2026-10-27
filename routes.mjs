import { audit, classStats, stockRows, nowIso, today } from './db.mjs';
import { hashPassword, verifyPassword, passwordProblem, signToken, throttled, recordFail, clearFails } from './auth.mjs';

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const bad = (m) => new HttpError(400, m);
const forbidden = (m = 'You do not have permission to do that.') => new HttpError(403, m);
const notFound = (m = 'Not found.') => new HttpError(404, m);

// ---------- validators ----------
const isDate = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s && d.getUTCFullYear() >= 2020 && d.getUTCFullYear() <= 2100;
};
const str = (v, name, { max = 200, required = false } = {}) => {
  if (v == null || v === '') { if (required) throw bad(`${name} is required.`); return ''; }
  if (typeof v !== 'string' && typeof v !== 'number') throw bad(`${name} is invalid.`);
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (required && !s) throw bad(`${name} is required.`);
  if (s.length > max) throw bad(`${name} is too long (max ${max}).`);
  return s;
};
const date = (v, name, required = false) => {
  if (v == null || v === '') { if (required) throw bad(`${name} is required.`); return null; }
  if (!isDate(v)) throw bad(`${name} must be a valid date (YYYY-MM-DD).`);
  return v;
};
const int = (v, name, { min = 0, max = 1e7, nullable = false } = {}) => {
  if ((v == null || v === '') && nullable) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number between ${min} and ${max}.`);
  return n;
};
const num = (v, name, { min = 0, max = 1e9, nullable = true } = {}) => {
  if ((v == null || v === '') && nullable) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw bad(`${name} must be a number between ${min} and ${max}.`);
  return n;
};

export const csvEscape = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (headers, rows) => '\ufeff' + [headers, ...rows].map(r => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';

const CLOSED = ['Replaced', 'Repaired', 'Waived'];
const SETTING_KEYS = ['school_name', 'academic_year', 'term', 'cutoff', 'librarian', 'head_teacher', 'currency', 'logo'];
const STREAM_ORDER = "CASE c.stream WHEN 'North' THEN 1 WHEN 'East' THEN 2 WHEN 'South' THEN 3 WHEN 'West' THEN 4 ELSE 5 END";

export function buildRoutes(app) {
  const { q, tx } = app;
  const routes = [];
  const add = (method, pattern, roles, handler) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    routes.push({ method, re, keys, roles, handler });
  };
  const ADMIN = ['admin'], STAFF = ['admin', 'librarian'], WRITERS = ['admin', 'librarian', 'teacher'];
  const log = (u, action, entity, detail) => audit(app, u, action, entity, detail);

  const settingsObj = () => Object.fromEntries(q.all('SELECT key,value FROM settings').map(r => [r.key, r.value]));
  const getClass = (id) => { const c = q.get('SELECT * FROM classes WHERE id=?', Number(id)); if (!c) throw notFound('Class not found.'); return c; };
  const canWriteClass = (u, classId) => u.role === 'admin' || u.role === 'librarian' || (u.role === 'teacher' && u.class_id === classId);
  const needWriteClass = (u, classId) => { if (!canWriteClass(u, classId)) throw forbidden('You can only edit the register of your own class.'); };
  const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role, class_id: u.class_id, must_change: !!u.must_change, active: !!u.active, last_login: u.last_login, created_at: u.created_at });
  const refOf = (id) => 'INC-' + String(id).padStart(3, '0');

  // ================= AUTH =================
  add('POST', '/api/auth/login', 'public', ({ body, ip }) => {
    const username = str(body.username, 'Username', { required: true, max: 60 }).toLowerCase();
    const password = typeof body.password === 'string' ? body.password : '';
    const key = `${username}|${ip}`;
    const wait = throttled(key);
    if (wait) throw new HttpError(429, `Too many failed attempts. Try again in ${wait} minute(s).`);
    const u = q.get('SELECT * FROM users WHERE lower(username)=?', username);
    if (!u || !u.active || !verifyPassword(password, u.pass_hash)) {
      recordFail(key);
      throw new HttpError(401, 'Incorrect username or password.');
    }
    clearFails(key);
    q.run('UPDATE users SET last_login=? WHERE id=?', nowIso(), u.id);
    log(u, 'login', 'user', u.username);
    return { token: signToken({ uid: u.id }), user: publicUser(u) };
  });
  add('GET', '/api/auth/me', null, ({ user }) => ({ user: publicUser(user) }));
  add('POST', '/api/auth/change-password', null, ({ user, body }) => {
    if (!verifyPassword(String(body.current || ''), user.pass_hash)) throw bad('Current password is incorrect.');
    const p = passwordProblem(body.next); if (p) throw bad(p);
    if (body.next === body.current) throw bad('Choose a password different from the current one.');
    q.run('UPDATE users SET pass_hash=?, must_change=0 WHERE id=?', hashPassword(body.next), user.id);
    log(user, 'password', 'user', user.username);
    return { ok: true };
  });

  // ================= BOOTSTRAP =================
  add('GET', '/api/bootstrap', null, () => {
    const lists = {};
    for (const r of q.all('SELECT kind,value FROM lists ORDER BY kind,position,id')) (lists[r.kind] ||= []).push(r.value);
    const classTitles = {};
    for (const r of q.all('SELECT class_id,title_id FROM class_titles ORDER BY class_id,position')) (classTitles[r.class_id] ||= []).push(r.title_id);
    return {
      settings: settingsObj(), lists, classTitles,
      classes: q.all(`SELECT c.* FROM classes c ORDER BY c.grade, ${STREAM_ORDER}`),
      titles: q.all('SELECT * FROM titles ORDER BY grade,name'),
      today: today(),
    };
  });

  // ================= SUMMARY / DASHBOARD =================
  const totalsOf = (rows) => {
    const t = { classes: rows.length, learners: 0, titles: 0, expected: 0, issued: 0, collected: 0, out: 0, lost: 0, damaged: 0, incidents: 0, inClass: 0 };
    for (const r of rows) for (const k of ['learners', 'expected', 'issued', 'collected', 'out', 'lost', 'damaged', 'incidents', 'inClass']) t[k] += r[k] || 0;
    t.coverage = t.expected ? t.inClass / t.expected : null;
    return t;
  };
  const summaryData = () => {
    const classes = classStats(app);
    const grades = [];
    for (let g = 1; g <= 9; g++) {
      const rows = classes.filter(c => c.grade === g);
      if (rows.length) grades.push({ grade: g, ...totalsOf(rows) });
    }
    const school = totalsOf(classes);
    const stock = stockRows(app);
    const emptyTitles = q.get("SELECT COUNT(*) n FROM learners l WHERE l.status='active' AND NOT EXISTS (SELECT 1 FROM class_titles ct WHERE ct.class_id=l.class_id)").n;
    const left = q.get("SELECT COUNT(DISTINCT l.id) n FROM learners l JOIN records r ON r.learner_id=l.id AND r.status='issued' WHERE l.status='left'").n;
    const openInc = q.get(`SELECT COUNT(*) n FROM incidents WHERE status NOT IN ('Replaced','Repaired','Waived')`).n;
    const mismatches = classes.filter(c => c.check.startsWith('register')).length;
    const unstocked = stock.filter(s => s.issued > 0 && s.total === 0).length;
    const unreconciled = stock.filter(s => s.status === 'Shortfall' || s.status === 'Surplus').length;
    const checks = [
      { key: 'mismatch', label: 'Register vs incident log mismatches', count: mismatches, level: mismatches ? 'warn' : 'ok', link: '#/summary' },
      { key: 'unstocked', label: 'Titles issued with no stock entered', count: unstocked, level: unstocked ? 'warn' : 'ok', link: '#/stock' },
      { key: 'unreconciled', label: 'Stock lines with shortfall / surplus', count: unreconciled, level: unreconciled ? 'warn' : 'ok', link: '#/stock' },
      { key: 'left', label: 'Learners who left holding books', count: left, level: left ? 'warn' : 'ok', link: '#/reports' },
      { key: 'notitles', label: 'Learners in classes with no books assigned', count: emptyTitles, level: emptyTitles ? 'warn' : 'ok', link: '#/books' },
      { key: 'open', label: 'Open lost / damaged cases', count: openInc, level: openInc ? 'info' : 'ok', link: '#/incidents' },
    ];
    return { classes, grades, school, checks, openIncidents: openInc };
  };
  add('GET', '/api/summary', null, () => summaryData());

  add('GET', '/api/dashboard', null, () => {
    const s = summaryData();
    const trendRaw = Object.fromEntries(q.all(`SELECT date(issued_on,'weekday 0','-6 days') wk, COUNT(*) n FROM records WHERE issued_on >= date('now','-62 days') GROUP BY wk`).map(r => [r.wk, r.n]));
    const trend = [];
    const d = new Date(); d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    for (let i = 7; i >= 0; i--) { const x = new Date(d); x.setUTCDate(d.getUTCDate() - i * 7); const k = x.toISOString().slice(0, 10); trend.push({ week: k, n: trendRaw[k] || 0 }); }
    const activity = q.all("SELECT ts,user,action,entity,detail FROM audit WHERE action NOT IN ('login') ORDER BY id DESC LIMIT 8");
    const recentIncidents = q.all(`SELECT i.id,i.type,i.status,i.reported_on,c.label class_label,l.name learner,t.name title
      FROM incidents i LEFT JOIN classes c ON c.id=i.class_id LEFT JOIN learners l ON l.id=i.learner_id LEFT JOIN titles t ON t.id=i.title_id
      WHERE i.status NOT IN ('Replaced','Repaired','Waived') ORDER BY i.id DESC LIMIT 5`).map(r => ({ ...r, ref: refOf(r.id) }));
    return { ...s, trend, activity, recentIncidents };
  });

  // ================= CLASSES =================
  add('GET', '/api/classes', null, () => classStats(app));
  add('POST', '/api/classes', ADMIN, ({ user, body }) => {
    const grade = int(body.grade, 'Grade', { min: 1, max: 12 });
    const stream = str(body.stream, 'Stream', { required: true, max: 20 });
    const label = `${grade} ${stream}`;
    const code = (grade + stream.slice(0, 1)).toUpperCase();
    if (q.get('SELECT 1 x FROM classes WHERE code=? OR label=?', code, label)) throw new HttpError(409, `Class ${label} already exists.`);
    const id = tx(() => {
      const r = q.run('INSERT INTO classes(code,grade,stream,label,teacher) VALUES(?,?,?,?,?)', code, grade, stream, label, str(body.teacher, 'Teacher', { max: 80 }));
      const cid = Number(r.lastInsertRowid);
      const sib = q.get('SELECT id FROM classes WHERE grade=? AND id<>? ORDER BY id LIMIT 1', grade, cid);
      if (sib) q.run('INSERT INTO class_titles(class_id,title_id,position) SELECT ?,title_id,position FROM class_titles WHERE class_id=?', cid, sib.id);
      return cid;
    });
    log(user, 'create', 'class', label);
    return q.get('SELECT * FROM classes WHERE id=?', id);
  });
  add('PUT', '/api/classes/:id', ADMIN, ({ user, params, body }) => {
    const c = getClass(params.id);
    const teacher = body.teacher !== undefined ? str(body.teacher, 'Teacher', { max: 80 }) : c.teacher;
    const active = body.active !== undefined ? (body.active ? 1 : 0) : c.active;
    q.run('UPDATE classes SET teacher=?, active=? WHERE id=?', teacher, active, c.id);
    log(user, 'update', 'class', `${c.label}: teacher=${teacher} active=${active}`);
    return q.get('SELECT * FROM classes WHERE id=?', c.id);
  });
  add('PUT', '/api/classes/:id/titles', STAFF, ({ user, params, body }) => {
    const c = getClass(params.id);
    if (!Array.isArray(body.title_ids)) throw bad('title_ids must be a list.');
    const ids = [...new Set(body.title_ids.map(Number))];
    for (const t of ids) if (!q.get('SELECT 1 x FROM titles WHERE id=?', t)) throw bad(`Unknown title ${t}.`);
    // refuse to unassign a title where learners of this class still hold records of it
    const dropped = q.all('SELECT title_id FROM class_titles WHERE class_id=?', c.id).map(r => r.title_id).filter(t => !ids.includes(t));
    for (const t of dropped) {
      const n = q.get("SELECT COUNT(*) n FROM records r JOIN learners l ON l.id=r.learner_id WHERE l.class_id=? AND l.status='active' AND r.title_id=?", c.id, t).n;
      if (n) throw new HttpError(409, `Cannot remove "${q.get('SELECT name FROM titles WHERE id=?', t).name}": ${n} record(s) exist for this class. Clear them first.`);
    }
    tx(() => {
      q.run('DELETE FROM class_titles WHERE class_id=?', c.id);
      ids.forEach((t, i) => q.run('INSERT INTO class_titles(class_id,title_id,position) VALUES(?,?,?)', c.id, t, i));
    });
    log(user, 'update', 'class-titles', `${c.label}: ${ids.length} titles`);
    return { ok: true };
  });

  // ---- register ----
  const registerData = (c) => {
    const titles = q.all('SELECT t.* FROM class_titles ct JOIN titles t ON t.id=ct.title_id WHERE ct.class_id=? ORDER BY ct.position', c.id);
    const learners = q.all("SELECT id,adm_no,name FROM learners WHERE class_id=? AND status='active' ORDER BY CAST(adm_no AS INTEGER), adm_no", c.id);
    const ids = learners.map(l => l.id);
    const recs = ids.length ? q.all(`SELECT r.*, t.name title_name, t.grade title_grade FROM records r JOIN titles t ON t.id=r.title_id WHERE r.learner_id IN (${ids.map(() => '?').join(',')})`, ...ids) : [];
    const byLearner = {};
    for (const r of recs) (byLearner[r.learner_id] ||= []).push(r);
    const tset = new Set(titles.map(t => t.id));
    const totals = Object.fromEntries(titles.map(t => [t.id, { issued: 0, collected: 0, lost: 0, damaged: 0, out: 0 }]));
    const rows = learners.map(l => {
      const records = {}, carry = [];
      let out = 0;
      for (const r of byLearner[l.id] || []) {
        const rec = { status: r.status, issued_on: r.issued_on, returned_on: r.returned_on };
        if (r.status === 'issued') out++;
        if (tset.has(r.title_id)) {
          records[r.title_id] = rec;
          const t = totals[r.title_id]; t.issued++;
          if (r.status === 'collected') t.collected++; else if (r.status === 'lost') t.lost++; else if (r.status === 'damaged') t.damaged++; else t.out++;
        } else carry.push({ title_id: r.title_id, title: r.title_name, grade: r.title_grade, ...rec });
      }
      return { ...l, out, records, carry };
    });
    const stats = classStats(app).find(s => s.id === c.id) || null;
    return { class: c, titles, learners: rows, totals, stats, remarks: settingsObj()[`remarks_${c.id}`] || '' };
  };
  add('GET', '/api/classes/:id/register', null, ({ params }) => registerData(getClass(params.id)));
  add('PUT', '/api/classes/:id/remarks', WRITERS, ({ user, params, body }) => {
    const c = getClass(params.id); needWriteClass(user, c.id);
    const text = str(body.text, 'Remarks', { max: 1000 });
    q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', `remarks_${c.id}`, text);
    log(user, 'update', 'remarks', c.label);
    return { ok: true };
  });

  // ---- records ----
  const upsertRecord = (user, b) => {
    const learner = q.get('SELECT * FROM learners WHERE id=?', Number(b.learner_id));
    if (!learner) throw notFound('Learner not found.');
    needWriteClass(user, learner.class_id);
    const title = q.get('SELECT * FROM titles WHERE id=?', Number(b.title_id));
    if (!title) throw notFound('Book title not found.');
    const issued_on = date(b.issued_on, 'Issue date', true);
    const status = ['issued', 'collected', 'lost', 'damaged'].includes(b.status) ? b.status : (() => { throw bad('Invalid status.'); })();
    let returned_on = date(b.returned_on, 'Return date');
    if (status === 'issued') returned_on = null;
    if (status === 'collected' && !returned_on) throw bad('A collected book needs a collected date.');
    if (returned_on && returned_on < issued_on) throw bad('Collected date cannot be before the issue date.');
    q.run(`INSERT INTO records(learner_id,title_id,issued_on,status,returned_on,updated_by,updated_at) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(learner_id,title_id) DO UPDATE SET issued_on=excluded.issued_on,status=excluded.status,returned_on=excluded.returned_on,updated_by=excluded.updated_by,updated_at=excluded.updated_at`,
      learner.id, title.id, issued_on, status, returned_on, user.username, nowIso());
    return { learner, title, status, issued_on, returned_on };
  };
  add('PUT', '/api/records', WRITERS, ({ user, body }) => {
    const r = upsertRecord(user, body);
    log(user, 'record', 'register', `${r.learner.adm_no} ${r.title.name}: ${r.status}`);
    return { ok: true, record: { learner_id: r.learner.id, title_id: r.title.id, status: r.status, issued_on: r.issued_on, returned_on: r.returned_on } };
  });
  add('POST', '/api/records/batch', WRITERS, ({ user, body }) => {
    if (!Array.isArray(body.items) || !body.items.length) throw bad('Nothing to save.');
    if (body.items.length > 500) throw bad('Too many items (max 500).');
    tx(() => body.items.forEach(i => upsertRecord(user, i)));
    log(user, 'record', 'register', `batch of ${body.items.length}`);
    return { ok: true, count: body.items.length };
  });
  add('POST', '/api/records/clear', WRITERS, ({ user, body }) => {
    const learner = q.get('SELECT * FROM learners WHERE id=?', Number(body.learner_id));
    if (!learner) throw notFound('Learner not found.');
    needWriteClass(user, learner.class_id);
    const r = q.run('DELETE FROM records WHERE learner_id=? AND title_id=?', learner.id, Number(body.title_id));
    if (r.changes) log(user, 'clear', 'register', `${learner.adm_no} title ${body.title_id}`);
    return { ok: true, removed: Number(r.changes) };
  });
  add('POST', '/api/classes/:id/bulk', WRITERS, ({ user, params, body }) => {
    const c = getClass(params.id); needWriteClass(user, c.id);
    const title = q.get('SELECT * FROM titles WHERE id=?', Number(body.title_id));
    if (!title) throw notFound('Book title not found.');
    const on = date(body.date, 'Date', true);
    let ids = q.all("SELECT id FROM learners WHERE class_id=? AND status='active'", c.id).map(r => r.id);
    if (Array.isArray(body.learner_ids)) { const s = new Set(body.learner_ids.map(Number)); ids = ids.filter(i => s.has(i)); }
    let changed = 0, skipped = 0;
    tx(() => {
      for (const id of ids) {
        const r = q.get('SELECT * FROM records WHERE learner_id=? AND title_id=?', id, title.id);
        if (body.action === 'issue') {
          if (r) { skipped++; continue; }
          q.run('INSERT INTO records(learner_id,title_id,issued_on,status,updated_by,updated_at) VALUES(?,?,?,?,?,?)', id, title.id, on, 'issued', user.username, nowIso()); changed++;
        } else if (body.action === 'collect') {
          if (!r || r.status !== 'issued' || on < r.issued_on) { skipped++; continue; }
          q.run("UPDATE records SET status='collected', returned_on=?, updated_by=?, updated_at=? WHERE id=?", on, user.username, nowIso(), r.id); changed++;
        } else throw bad('Unknown bulk action.');
      }
    });
    log(user, 'bulk', 'register', `${c.label} ${title.name}: ${body.action} ${changed} (skipped ${skipped})`);
    return { ok: true, changed, skipped };
  });

  // ================= LEARNERS =================
  const learnerSelect = `SELECT l.id,l.adm_no,l.name,l.class_id,l.status,c.code class_code,c.label class_label,
      (SELECT COUNT(*) FROM records r WHERE r.learner_id=l.id AND r.status='issued') out,
      (SELECT COUNT(*) FROM records r WHERE r.learner_id=l.id AND r.status='lost') lost,
      (SELECT COUNT(*) FROM records r WHERE r.learner_id=l.id AND r.status='damaged') damaged
    FROM learners l JOIN classes c ON c.id=l.class_id`;
  add('GET', '/api/learners', null, ({ query }) => {
    const where = [], p = [];
    if (query.q) { const like = '%' + String(query.q).replace(/[\\%_]/g, m => '\\' + m) + '%'; where.push("(l.name LIKE ? ESCAPE '\\' OR l.adm_no LIKE ? ESCAPE '\\')"); p.push(like, like); }
    if (query.class_id) { where.push('l.class_id=?'); p.push(Number(query.class_id)); }
    if (query.status === 'active' || query.status === 'left') { where.push('l.status=?'); p.push(query.status); }
    if (query.holding === '1') where.push("EXISTS (SELECT 1 FROM records r WHERE r.learner_id=l.id AND r.status='issued')");
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const total = q.get(`SELECT COUNT(*) n FROM learners l${w}`, ...p).n;
    const limit = Math.min(Math.max(parseInt(query.limit) || 50, 1), 500), offset = Math.max(parseInt(query.offset) || 0, 0);
    const rows = q.all(`${learnerSelect}${w} ORDER BY c.grade, ${STREAM_ORDER}, CAST(l.adm_no AS INTEGER), l.adm_no LIMIT ? OFFSET ?`, ...p, limit, offset);
    return { total, rows };
  });
  add('GET', '/api/learners/:id', null, ({ params }) => {
    const l = q.get(`${learnerSelect} WHERE l.id=?`, Number(params.id));
    if (!l) throw notFound('Learner not found.');
    const records = q.all('SELECT r.title_id,t.name title,t.grade,r.status,r.issued_on,r.returned_on FROM records r JOIN titles t ON t.id=r.title_id WHERE r.learner_id=? ORDER BY r.issued_on DESC, t.name', l.id);
    const incidents = q.all('SELECT i.*, t.name title FROM incidents i LEFT JOIN titles t ON t.id=i.title_id WHERE i.learner_id=? ORDER BY i.id DESC', l.id).map(r => ({ ...r, ref: refOf(r.id) }));
    const moves = q.all(`SELECT m.*, a.label from_label, b.label to_label FROM moves m LEFT JOIN classes a ON a.id=m.from_class LEFT JOIN classes b ON b.id=m.to_class WHERE m.learner_id=? ORDER BY m.id DESC`, l.id);
    return { learner: l, records, incidents, moves };
  });
  const cleanName = (v) => str(v, 'Name', { required: true, max: 80 });
  const cleanAdm = (v) => { const s = str(v, 'Admission number', { required: true, max: 20 }); if (!/^[A-Za-z0-9\-\/]+$/.test(s)) throw bad('Admission number may contain letters, numbers, - and / only.'); return s; };
  add('POST', '/api/learners', STAFF, ({ user, body }) => {
    const adm = cleanAdm(body.adm_no), name = cleanName(body.name);
    const c = getClass(body.class_id);
    if (q.get('SELECT 1 x FROM learners WHERE adm_no=?', adm)) throw new HttpError(409, `Admission number ${adm} already exists.`);
    const r = q.run('INSERT INTO learners(adm_no,name,class_id,created_at) VALUES(?,?,?,?)', adm, name, c.id, nowIso());
    log(user, 'create', 'learner', `${adm} ${name} → ${c.label}`);
    return q.get(`${learnerSelect} WHERE l.id=?`, Number(r.lastInsertRowid));
  });
  add('PUT', '/api/learners/:id', STAFF, ({ user, params, body }) => {
    const l = q.get('SELECT * FROM learners WHERE id=?', Number(params.id));
    if (!l) throw notFound('Learner not found.');
    const name = body.name !== undefined ? cleanName(body.name) : l.name;
    const adm = body.adm_no !== undefined ? cleanAdm(body.adm_no) : l.adm_no;
    const status = body.status !== undefined ? (['active', 'left'].includes(body.status) ? body.status : (() => { throw bad('Invalid status.'); })()) : l.status;
    if (adm !== l.adm_no && q.get('SELECT 1 x FROM learners WHERE adm_no=? AND id<>?', adm, l.id)) throw new HttpError(409, `Admission number ${adm} already exists.`);
    q.run('UPDATE learners SET name=?, adm_no=?, status=? WHERE id=?', name, adm, status, l.id);
    log(user, 'update', 'learner', `${adm} ${name} (${status})`);
    return q.get(`${learnerSelect} WHERE l.id=?`, l.id);
  });
  add('POST', '/api/learners/:id/move', STAFF, ({ user, params, body }) => {
    const l = q.get('SELECT * FROM learners WHERE id=?', Number(params.id));
    if (!l) throw notFound('Learner not found.');
    const to = getClass(body.to_class_id);
    if (to.id === l.class_id) throw bad('The learner is already in that class.');
    const on = date(body.date, 'Move date') || today();
    tx(() => {
      q.run('UPDATE learners SET class_id=?, status=? WHERE id=?', to.id, 'active', l.id);
      q.run('INSERT INTO moves(learner_id,from_class,to_class,moved_on,by_user,note) VALUES(?,?,?,?,?,?)', l.id, l.class_id, to.id, on, user.username, str(body.note, 'Note', { max: 200 }));
    });
    const from = q.get('SELECT label FROM classes WHERE id=?', l.class_id);
    log(user, 'move', 'learner', `${l.adm_no} ${l.name}: ${from.label} → ${to.label}`);
    return q.get(`${learnerSelect} WHERE l.id=?`, l.id);
  });
  add('DELETE', '/api/learners/:id', ADMIN, ({ user, params }) => {
    const l = q.get('SELECT * FROM learners WHERE id=?', Number(params.id));
    if (!l) throw notFound('Learner not found.');
    const n = q.get('SELECT (SELECT COUNT(*) FROM records WHERE learner_id=?)+(SELECT COUNT(*) FROM incidents WHERE learner_id=?) n', l.id, l.id).n;
    if (n) throw new HttpError(409, 'This learner has book records or incidents. Mark them as "left" instead of deleting.');
    q.run('DELETE FROM learners WHERE id=?', l.id);
    log(user, 'delete', 'learner', `${l.adm_no} ${l.name}`);
    return { ok: true };
  });
  add('POST', '/api/learners/import', STAFF, ({ user, body }) => {
    if (!Array.isArray(body.rows) || !body.rows.length) throw bad('No rows to import.');
    if (body.rows.length > 5000) throw bad('Too many rows (max 5000).');
    const classByCode = Object.fromEntries(q.all('SELECT id,code,label FROM classes').map(c => [c.code.toUpperCase(), c]));
    const res = { created: 0, updated: 0, moved: 0, unchanged: 0, errors: [] };
    tx(() => {
      body.rows.forEach((row, i) => {
        const line = i + 1;
        try {
          const adm = cleanAdm(row.adm_no), name = cleanName(row.name);
          const c = classByCode[String(row.class_code || '').trim().toUpperCase()];
          if (!c) throw bad(`unknown class code "${row.class_code}"`);
          const ex = q.get('SELECT * FROM learners WHERE adm_no=?', adm);
          if (!ex) { q.run('INSERT INTO learners(adm_no,name,class_id,created_at) VALUES(?,?,?,?)', adm, name, c.id, nowIso()); res.created++; return; }
          if (!body.update_existing) { res.unchanged++; return; }
          let changed = false;
          if (ex.name !== name) { q.run('UPDATE learners SET name=? WHERE id=?', name, ex.id); res.updated++; changed = true; }
          if (ex.class_id !== c.id) {
            q.run('UPDATE learners SET class_id=?, status=? WHERE id=?', c.id, 'active', ex.id);
            q.run('INSERT INTO moves(learner_id,from_class,to_class,moved_on,by_user,note) VALUES(?,?,?,?,?,?)', ex.id, ex.class_id, c.id, today(), user.username, 'Bulk import');
            res.moved++; changed = true;
          }
          if (!changed) res.unchanged++;
        } catch (e) { res.errors.push({ line, adm_no: row.adm_no, error: e.message }); }
      });
    });
    log(user, 'import', 'learners', `created ${res.created}, updated ${res.updated}, moved ${res.moved}, errors ${res.errors.length}`);
    return res;
  });

  // ================= TITLES =================
  add('GET', '/api/titles', null, () => q.all(`SELECT t.*,
      (SELECT COUNT(*) FROM class_titles ct WHERE ct.title_id=t.id) classes,
      (SELECT COUNT(*) FROM records r WHERE r.title_id=t.id) records
    FROM titles t ORDER BY t.grade, t.name`));
  add('POST', '/api/titles', STAFF, ({ user, body }) => {
    const name = str(body.name, 'Title', { required: true, max: 80 }).toUpperCase();
    const grade = int(body.grade, 'Grade', { min: 1, max: 12 });
    if (q.get('SELECT 1 x FROM titles WHERE name=? AND grade=?', name, grade)) throw new HttpError(409, `${name} (Gr ${grade}) already exists.`);
    const id = tx(() => {
      const r = q.run('INSERT INTO titles(name,grade,publisher,code) VALUES(?,?,?,?)', name, grade, str(body.publisher, 'Publisher', { max: 80 }), str(body.code, 'Book code', { max: 80 }));
      const tid = Number(r.lastInsertRowid);
      q.run('INSERT INTO stock(title_id) VALUES(?)', tid);
      for (const cid of Array.isArray(body.class_ids) ? body.class_ids.map(Number) : []) {
        const pos = (q.get('SELECT COALESCE(MAX(position),-1)+1 p FROM class_titles WHERE class_id=?', cid) || { p: 0 }).p;
        if (q.get('SELECT 1 x FROM classes WHERE id=?', cid)) q.run('INSERT OR IGNORE INTO class_titles(class_id,title_id,position) VALUES(?,?,?)', cid, tid, pos);
      }
      return tid;
    });
    log(user, 'create', 'title', `${name} (Gr ${grade})`);
    return q.get('SELECT * FROM titles WHERE id=?', id);
  });
  add('PUT', '/api/titles/:id', STAFF, ({ user, params, body }) => {
    const t = q.get('SELECT * FROM titles WHERE id=?', Number(params.id));
    if (!t) throw notFound('Title not found.');
    const name = body.name !== undefined ? str(body.name, 'Title', { required: true, max: 80 }).toUpperCase() : t.name;
    const grade = body.grade !== undefined ? int(body.grade, 'Grade', { min: 1, max: 12 }) : t.grade;
    if ((name !== t.name || grade !== t.grade) && q.get('SELECT 1 x FROM titles WHERE name=? AND grade=? AND id<>?', name, grade, t.id)) throw new HttpError(409, `${name} (Gr ${grade}) already exists.`);
    q.run('UPDATE titles SET name=?,grade=?,publisher=?,code=? WHERE id=?', name, grade,
      body.publisher !== undefined ? str(body.publisher, 'Publisher', { max: 80 }) : t.publisher,
      body.code !== undefined ? str(body.code, 'Book code', { max: 80 }) : t.code, t.id);
    log(user, 'update', 'title', `${t.name} → ${name} (Gr ${grade})`);
    return q.get('SELECT * FROM titles WHERE id=?', t.id);
  });
  add('DELETE', '/api/titles/:id', STAFF, ({ user, params }) => {
    const t = q.get('SELECT * FROM titles WHERE id=?', Number(params.id));
    if (!t) throw notFound('Title not found.');
    const n = q.get('SELECT (SELECT COUNT(*) FROM records WHERE title_id=?)+(SELECT COUNT(*) FROM incidents WHERE title_id=?) n', t.id, t.id).n;
    if (n) throw new HttpError(409, `${t.name} has ${n} record(s)/incident(s) and cannot be deleted. Remove it from the class registers instead.`);
    q.run('DELETE FROM titles WHERE id=?', t.id);
    log(user, 'delete', 'title', t.name);
    return { ok: true };
  });

  // ================= STOCK =================
  add('GET', '/api/stock', null, () => {
    const rows = stockRows(app);
    const t = { titles: rows.length, total: 0, issued: 0, with_learners: 0, lost: 0, damaged: 0, expected: 0, unreconciled: 0 };
    for (const r of rows) { t.total += r.total; t.issued += r.issued; t.with_learners += r.with_learners; t.lost += r.lost; t.damaged += r.damaged; t.expected += r.expected; if (r.status === 'Shortfall' || r.status === 'Surplus') t.unreconciled++; }
    return { rows, totals: t };
  });
  add('PUT', '/api/stock/:id', STAFF, ({ user, params, body }) => {
    const t = q.get('SELECT * FROM titles WHERE id=?', Number(params.id));
    if (!t) throw notFound('Title not found.');
    const cur = q.get('SELECT * FROM stock WHERE title_id=?', t.id) || { opening: 0, purchased: 0, withdrawn: 0, physical: null };
    const v = {
      opening: body.opening !== undefined ? int(body.opening, 'Opening stock') : cur.opening,
      purchased: body.purchased !== undefined ? int(body.purchased, 'Purchased / received') : cur.purchased,
      withdrawn: body.withdrawn !== undefined ? int(body.withdrawn, 'Withdrawn') : cur.withdrawn,
      physical: body.physical !== undefined ? int(body.physical, 'Physical count', { nullable: true }) : cur.physical,
    };
    q.run(`INSERT INTO stock(title_id,opening,purchased,withdrawn,physical) VALUES(?,?,?,?,?)
      ON CONFLICT(title_id) DO UPDATE SET opening=excluded.opening,purchased=excluded.purchased,withdrawn=excluded.withdrawn,physical=excluded.physical`,
      t.id, v.opening, v.purchased, v.withdrawn, v.physical);
    if (body.publisher !== undefined || body.code !== undefined)
      q.run('UPDATE titles SET publisher=?, code=? WHERE id=?', body.publisher !== undefined ? str(body.publisher, 'Publisher', { max: 80 }) : t.publisher, body.code !== undefined ? str(body.code, 'Book code', { max: 80 }) : t.code, t.id);
    log(user, 'stock', 'stock', `${t.name} (Gr ${t.grade}): open ${v.opening}, bought ${v.purchased}, withdrawn ${v.withdrawn}, count ${v.physical ?? '—'}`);
    return stockRows(app).find(r => r.id === t.id);
  });

  // ================= INCIDENTS =================
  const incSelect = `SELECT i.*, c.label class_label, l.name learner_name, l.adm_no, t.name title_name, t.grade title_grade
    FROM incidents i LEFT JOIN classes c ON c.id=i.class_id LEFT JOIN learners l ON l.id=i.learner_id LEFT JOIN titles t ON t.id=i.title_id`;
  const incOut = (r) => ({ ...r, ref: refOf(r.id), resolution: CLOSED.includes(r.status) ? 'Closed' : 'Open' });
  const validIncident = (b, cur) => {
    const statuses = q.all("SELECT value FROM lists WHERE kind='statuses'").map(r => r.value);
    const cats = q.all("SELECT value FROM lists WHERE kind='damage_categories'").map(r => r.value);
    const v = {
      reported_on: date(b.reported_on ?? cur?.reported_on, 'Date reported', true),
      learner_id: b.learner_id ? Number(b.learner_id) : null,
      title_id: b.title_id ? Number(b.title_id) : null,
      type: ['Lost', 'Damaged'].includes(b.type) ? b.type : (() => { throw bad('Type must be Lost or Damaged.'); })(),
      category: str(b.category, 'Damage category', { max: 60 }),
      issued_on: date(b.issued_on, 'Date issued'),
      details: str(b.details, 'Details', { max: 500 }), action: str(b.action, 'Action taken', { max: 300 }),
      status: str(b.status || 'Under investigation', 'Status', { max: 40 }),
      replaced_on: date(b.replaced_on, 'Date replaced'),
      new_copy_id: str(b.new_copy_id, 'New copy ID', { max: 60 }),
      value: num(b.value, 'Value'), reported_by: str(b.reported_by, 'Reported by', { max: 80 }),
    };
    if (!statuses.includes(v.status)) throw bad(`Status must be one of: ${statuses.join(', ')}.`);
    if (v.category && !cats.includes(v.category)) throw bad('Unknown damage category.');
    if (v.type === 'Lost') v.category = '';
    if (v.replaced_on && v.replaced_on < v.reported_on) throw bad('Date replaced cannot be before the date reported.');
    if (v.learner_id) { const l = q.get('SELECT class_id FROM learners WHERE id=?', v.learner_id); if (!l) throw bad('Learner not found.'); v.class_id = b.class_id ? Number(b.class_id) : l.class_id; }
    else v.class_id = b.class_id ? Number(b.class_id) : null;
    if (v.class_id) getClass(v.class_id);
    if (v.title_id && !q.get('SELECT 1 x FROM titles WHERE id=?', v.title_id)) throw bad('Book title not found.');
    if (!v.title_id) throw bad('Choose the book involved.');
    return v;
  };
  add('GET', '/api/incidents', null, ({ query }) => {
    const where = [], p = [];
    if (query.state === 'open') where.push("i.status NOT IN ('Replaced','Repaired','Waived')");
    if (query.state === 'closed') where.push("i.status IN ('Replaced','Repaired','Waived')");
    if (query.class_id) { where.push('i.class_id=?'); p.push(Number(query.class_id)); }
    if (query.type === 'Lost' || query.type === 'Damaged') { where.push('i.type=?'); p.push(query.type); }
    if (query.q) { const like = '%' + String(query.q).replace(/[\\%_]/g, m => '\\' + m) + '%'; where.push("(l.name LIKE ? ESCAPE '\\' OR l.adm_no LIKE ? ESCAPE '\\' OR t.name LIKE ? ESCAPE '\\')"); p.push(like, like, like); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const rows = q.all(`${incSelect}${w} ORDER BY i.id DESC LIMIT 1000`, ...p).map(incOut);
    return { rows, totals: { all: rows.length, open: rows.filter(r => r.resolution === 'Open').length, closed: rows.filter(r => r.resolution === 'Closed').length, value: rows.reduce((s, r) => s + (r.value || 0), 0) } };
  });
  add('POST', '/api/incidents', WRITERS, ({ user, body }) => {
    const v = validIncident({ reported_on: today(), ...body });
    needWriteClass(user, v.class_id);
    if (user.role === 'teacher') { v.status = 'Under investigation'; v.replaced_on = null; }
    const ts = nowIso();
    const r = q.run(`INSERT INTO incidents(reported_on,class_id,learner_id,title_id,type,category,issued_on,details,action,status,replaced_on,new_copy_id,value,reported_by,created_by,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, v.reported_on, v.class_id, v.learner_id, v.title_id, v.type, v.category, v.issued_on, v.details, v.action, v.status, v.replaced_on, v.new_copy_id, v.value, v.reported_by, user.username, ts, ts);
    const id = Number(r.lastInsertRowid);
    log(user, 'create', 'incident', `${refOf(id)} ${v.type}`);
    return incOut(q.get(`${incSelect} WHERE i.id=?`, id));
  });
  add('PUT', '/api/incidents/:id', STAFF, ({ user, params, body }) => {
    const cur = q.get('SELECT * FROM incidents WHERE id=?', Number(params.id));
    if (!cur) throw notFound('Incident not found.');
    const v = validIncident({ ...cur, ...body }, cur);
    q.run(`UPDATE incidents SET reported_on=?,class_id=?,learner_id=?,title_id=?,type=?,category=?,issued_on=?,details=?,action=?,status=?,replaced_on=?,new_copy_id=?,value=?,reported_by=?,updated_at=? WHERE id=?`,
      v.reported_on, v.class_id, v.learner_id, v.title_id, v.type, v.category, v.issued_on, v.details, v.action, v.status, v.replaced_on, v.new_copy_id, v.value, v.reported_by, nowIso(), cur.id);
    log(user, 'update', 'incident', `${refOf(cur.id)} → ${v.status}`);
    return incOut(q.get(`${incSelect} WHERE i.id=?`, cur.id));
  });
  add('DELETE', '/api/incidents/:id', ADMIN, ({ user, params }) => {
    const cur = q.get('SELECT * FROM incidents WHERE id=?', Number(params.id));
    if (!cur) throw notFound('Incident not found.');
    q.run('DELETE FROM incidents WHERE id=?', cur.id);
    log(user, 'delete', 'incident', refOf(cur.id));
    return { ok: true };
  });

  // ================= SETTINGS & LISTS =================
  add('PUT', '/api/settings', ADMIN, ({ user, body }) => {
    tx(() => {
      for (const k of SETTING_KEYS) {
        if (body[k] === undefined) continue;
        let v = body[k];
        if (k === 'logo') {
          if (v && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw bad('Logo must be a PNG, JPEG or WebP image.');
          if (v && v.length > 600000) throw bad('Logo is too large (max ~400 KB).');
        } else if (k === 'term') {
          if (!['Term 1', 'Term 2', 'Term 3'].includes(v)) throw bad('Term must be Term 1, Term 2 or Term 3.');
        } else if (k === 'academic_year') v = String(int(v, 'Academic year', { min: 2020, max: 2100 }));
        else if (k === 'cutoff') v = date(v, 'Cut-off date') || '';
        else v = str(v, k, { max: 120, required: k === 'school_name' });
        q.run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, v ?? '');
      }
    });
    log(user, 'update', 'settings', Object.keys(body).filter(k => k !== 'logo').join(', ') + (body.logo !== undefined ? ' logo' : ''));
    return settingsObj();
  });
  add('PUT', '/api/lists/:kind', ADMIN, ({ user, params, body }) => {
    if (!['damage_categories', 'statuses'].includes(params.kind)) throw notFound('Unknown list.');
    if (!Array.isArray(body.values)) throw bad('values must be a list.');
    const values = [...new Set(body.values.map(v => str(v, 'Item', { max: 60 })).filter(Boolean))];
    if (!values.length) throw bad('The list cannot be empty.');
    if (params.kind === 'statuses') for (const need of CLOSED) if (!values.includes(need)) throw bad(`The status list must keep "${need}" (it closes a case).`);
    if (params.kind === 'statuses' && !values.includes('Under investigation')) throw bad('The status list must keep "Under investigation".');
    tx(() => {
      q.run('DELETE FROM lists WHERE kind=?', params.kind);
      values.forEach((v, i) => q.run('INSERT INTO lists(kind,value,position) VALUES(?,?,?)', params.kind, v, i));
    });
    log(user, 'update', 'list', params.kind);
    return { values };
  });

  // ================= USERS =================
  add('GET', '/api/users', ADMIN, () => q.all('SELECT * FROM users ORDER BY active DESC, role, username').map(publicUser));
  const userFields = (b, cur) => {
    const role = b.role ?? cur?.role;
    if (!['admin', 'librarian', 'teacher', 'head'].includes(role)) throw bad('Invalid role.');
    let class_id = b.class_id === '' ? null : (b.class_id ?? cur?.class_id ?? null);
    if (role === 'teacher') { if (!class_id) throw bad('A teacher account must be linked to a class.'); getClass(class_id); class_id = Number(class_id); } else class_id = null;
    return { role, class_id, name: str(b.name ?? cur?.name, 'Name', { required: true, max: 80 }) };
  };
  add('POST', '/api/users', ADMIN, ({ user, body }) => {
    const username = str(body.username, 'Username', { required: true, max: 40 }).toLowerCase();
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw bad('Username: 3–40 letters, numbers, dot, dash or underscore.');
    if (q.get('SELECT 1 x FROM users WHERE lower(username)=?', username)) throw new HttpError(409, 'That username is taken.');
    const p = passwordProblem(body.password); if (p) throw bad(p);
    const f = userFields(body);
    const r = q.run('INSERT INTO users(username,name,role,pass_hash,class_id,must_change,created_at) VALUES(?,?,?,?,?,1,?)', username, f.name, f.role, hashPassword(body.password), f.class_id, nowIso());
    log(user, 'create', 'user', `${username} (${f.role})`);
    return publicUser(q.get('SELECT * FROM users WHERE id=?', Number(r.lastInsertRowid)));
  });
  add('PUT', '/api/users/:id', ADMIN, ({ user, params, body }) => {
    const cur = q.get('SELECT * FROM users WHERE id=?', Number(params.id));
    if (!cur) throw notFound('User not found.');
    const f = userFields(body, cur);
    const active = body.active !== undefined ? (body.active ? 1 : 0) : cur.active;
    if (cur.id === user.id && (!active || f.role !== 'admin')) throw bad('You cannot deactivate yourself or remove your own admin role.');
    if ((cur.role === 'admin' && cur.active) && (!active || f.role !== 'admin') && q.get("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1").n <= 1) throw bad('There must be at least one active administrator.');
    let hash = cur.pass_hash, must = cur.must_change;
    if (body.password) { const p = passwordProblem(body.password); if (p) throw bad(p); hash = hashPassword(body.password); must = 1; }
    q.run('UPDATE users SET name=?,role=?,class_id=?,active=?,pass_hash=?,must_change=? WHERE id=?', f.name, f.role, f.class_id, active, hash, must, cur.id);
    log(user, 'update', 'user', `${cur.username}${body.password ? ' (password reset)' : ''}`);
    return publicUser(q.get('SELECT * FROM users WHERE id=?', cur.id));
  });

  // ================= AUDIT =================
  add('GET', '/api/audit', ['admin', 'head'], ({ query }) => {
    const where = [], p = [];
    if (query.q) { const like = '%' + String(query.q).replace(/[\\%_]/g, m => '\\' + m) + '%'; where.push("(user LIKE ? ESCAPE '\\' OR action LIKE ? ESCAPE '\\' OR entity LIKE ? ESCAPE '\\' OR detail LIKE ? ESCAPE '\\')"); p.push(like, like, like, like); }
    const w = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const limit = Math.min(parseInt(query.limit) || 100, 500), offset = parseInt(query.offset) || 0;
    return { total: q.get(`SELECT COUNT(*) n FROM audit${w}`, ...p).n, rows: q.all(`SELECT * FROM audit${w} ORDER BY id DESC LIMIT ? OFFSET ?`, ...p, limit, offset) };
  });

  // ================= REPORTS =================
  const outstandingRows = (classId) => q.all(`
    SELECT c.label class_label, c.grade, l.id learner_id, l.adm_no, l.name, l.status learner_status, t.name title, t.grade title_grade, r.issued_on,
      CAST(julianday('now') - julianday(r.issued_on) AS INTEGER) days
    FROM records r JOIN learners l ON l.id=r.learner_id JOIN classes c ON c.id=l.class_id JOIN titles t ON t.id=r.title_id
    WHERE r.status='issued' ${classId ? 'AND l.class_id=?' : ''}
    ORDER BY c.grade, ${STREAM_ORDER}, CAST(l.adm_no AS INTEGER), t.name`, ...(classId ? [Number(classId)] : []));
  add('GET', '/api/reports/outstanding', null, ({ query }) => {
    const rows = outstandingRows(query.class_id);
    const learners = new Set(rows.map(r => r.learner_id)).size;
    return { rows, learners, books: rows.length };
  });

  // ================= EXPORTS (CSV) =================
  add('GET', '/api/export/:kind', null, ({ params, query }) => {
    const s = settingsObj();
    const stamp = today();
    let name, headers, rows;
    switch (params.kind) {
      case 'register': {
        const c = getClass(query.class_id), d = registerData(c);
        headers = ['Adm No', "Learner's name", 'Out'];
        d.titles.forEach(t => headers.push(`${t.name} ISSUED`, `${t.name} COLLECTED`));
        rows = d.learners.map(l => [l.adm_no, l.name, l.out, ...d.titles.flatMap(t => {
          const r = l.records[t.id];
          return r ? [r.issued_on, r.status === 'collected' ? r.returned_on : r.status === 'lost' ? 'LOST' : r.status === 'damaged' ? 'DMG' : ''] : ['', ''];
        })]);
        const tot = (k) => ['', k, '', ...d.titles.flatMap(t => [d.totals[t.id][k === 'OUTSTANDING' ? 'out' : k.toLowerCase()], ''])];
        ['ISSUED', 'COLLECTED', 'LOST', 'DAMAGED', 'OUTSTANDING'].forEach(k => rows.push(tot(k)));
        name = `register-${c.code}-${stamp}`; break;
      }
      case 'summary': {
        const d = summaryData();
        headers = ['Class', 'Grade', 'Class teacher', 'Learners', 'Titles', 'Expected', 'Issued', 'Collected', 'Outstanding', 'Lost', 'Damaged', 'Coverage %', 'Incidents logged', 'Check'];
        rows = d.classes.map(c => [c.label, c.grade, c.teacher, c.learners, c.titles, c.expected, c.issued, c.collected, c.out, c.lost, c.damaged, c.coverage == null ? '' : (c.coverage * 100).toFixed(1), c.incidents, c.check]);
        const t = d.school;
        rows.push(['WHOLE SCHOOL', '', '', t.learners, '', t.expected, t.issued, t.collected, t.out, t.lost, t.damaged, t.coverage == null ? '' : (t.coverage * 100).toFixed(1), t.incidents, '']);
        name = `summary-${stamp}`; break;
      }
      case 'stock': {
        headers = ['Title', 'Grade', 'Publisher', 'Book code', 'Opening stock', 'Purchased / received', 'Replacements received', 'Total copies', 'Issued', 'Collected', 'Currently with learners', 'Lost', 'Damaged on return', 'Withdrawn', 'Expected in library', 'Physical count', 'Variance', 'Status'];
        rows = stockRows(app).map(r => [r.name, r.grade, r.publisher, r.code, r.opening, r.purchased, r.replacements, r.total, r.issued, r.collected, r.with_learners, r.lost, r.damaged, r.withdrawn, r.expected, r.physical ?? '', r.variance ?? '', r.status]);
        name = `stock-${stamp}`; break;
      }
      case 'incidents': {
        headers = ['Ref', 'Date reported', 'Class', 'Adm No', 'Learner', 'Book', 'Type', 'Damage category', 'Date issued', 'Details', 'Action taken', 'Status', 'Date replaced', 'New copy ID', `Value (${s.currency})`, 'Reported by', 'Resolution'];
        rows = q.all(`${incSelect} ORDER BY i.id`).map(incOut).map(r => [r.ref, r.reported_on, r.class_label, r.adm_no, r.learner_name, r.title_name ? `${r.title_name} (Gr ${r.title_grade})` : '', r.type, r.category, r.issued_on, r.details, r.action, r.status, r.replaced_on, r.new_copy_id, r.value, r.reported_by, r.resolution]);
        name = `incidents-${stamp}`; break;
      }
      case 'learners': {
        headers = ['Adm No', 'Full name', 'Class code', 'Class', 'Status', 'Books held', 'Lost', 'Damaged'];
        rows = q.all(`${learnerSelect} ORDER BY c.grade, ${STREAM_ORDER}, CAST(l.adm_no AS INTEGER)`).map(l => [l.adm_no, l.name, l.class_code, l.class_label, l.status, l.out, l.lost, l.damaged]);
        name = `learners-${stamp}`; break;
      }
      case 'outstanding': {
        headers = ['Class', 'Adm No', 'Learner', 'Status', 'Book', 'Date issued', 'Days held'];
        rows = outstandingRows(query.class_id).map(r => [r.class_label, r.adm_no, r.name, r.learner_status, `${r.title} (Gr ${r.title_grade})`, r.issued_on, r.days]);
        name = `outstanding-${stamp}`; break;
      }
      default: throw notFound('Unknown export.');
    }
    return { __csv: toCsv(headers, rows), filename: `${name}.csv` };
  });

  // ================= SNAPSHOTS =================
  add('GET', '/api/snapshots', null, () => q.all('SELECT id,label,created_at,created_by FROM snapshots ORDER BY id DESC'));
  add('GET', '/api/snapshots/:id', null, ({ params }) => {
    const r = q.get('SELECT * FROM snapshots WHERE id=?', Number(params.id));
    if (!r) throw notFound('Snapshot not found.');
    return { ...r, data: JSON.parse(r.data) };
  });
  add('POST', '/api/snapshots', ['admin', 'librarian', 'head'], ({ user, body }) => {
    const label = str(body.label, 'Label', { required: true, max: 80 });
    const s = settingsObj();
    const data = { ...summaryData(), stock: stockRows(app), settings: { school_name: s.school_name, term: s.term, academic_year: s.academic_year } };
    const r = q.run('INSERT INTO snapshots(label,created_at,created_by,data) VALUES(?,?,?,?)', label, nowIso(), user.username, JSON.stringify(data));
    log(user, 'create', 'snapshot', label);
    return { id: Number(r.lastInsertRowid), label };
  });
  add('DELETE', '/api/snapshots/:id', ADMIN, ({ user, params }) => {
    q.run('DELETE FROM snapshots WHERE id=?', Number(params.id));
    log(user, 'delete', 'snapshot', params.id);
    return { ok: true };
  });

  // ================= BACKUP / RESTORE =================
  const TABLES = ['settings', 'lists', 'users', 'classes', 'titles', 'class_titles', 'learners', 'moves', 'records', 'stock', 'incidents', 'audit', 'snapshots'];
  add('GET', '/api/admin/backup', ADMIN, ({ user }) => {
    const tables = Object.fromEntries(TABLES.map(t => [t, q.all(`SELECT * FROM ${t}`)]));
    log(user, 'backup', 'database', 'downloaded');
    return { __json: { app: 'libralink', version: 1, created: nowIso(), tables }, filename: `libralink-backup-${today()}.json` };
  });
  add('POST', '/api/admin/restore', ADMIN, ({ user, body }) => {
    if (body?.app !== 'libralink' || !body.tables) throw bad('This is not a Libra Link backup file.');
    for (const t of TABLES) if (!Array.isArray(body.tables[t])) throw bad(`Backup is missing table "${t}".`);
    if (!body.tables.users.some(u => u.role === 'admin' && u.active)) throw bad('Backup has no active administrator; restore refused.');
    tx(() => {
      for (const t of [...TABLES].reverse()) q.run(`DELETE FROM ${t}`);
      for (const t of TABLES) {
        const cols = q.all(`PRAGMA table_info(${t})`).map(c => c.name);
        for (const row of body.tables[t]) {
          const use = cols.filter(c => row[c] !== undefined);
          q.run(`INSERT INTO ${t}(${use.join(',')}) VALUES(${use.map(() => '?').join(',')})`, ...use.map(c => row[c]));
        }
      }
    });
    log(user, 'restore', 'database', `from backup dated ${body.created || 'unknown'}`);
    return { ok: true };
  });

  return routes;
}
