import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS lists(id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, value TEXT NOT NULL, position INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','librarian','teacher','head')),
  pass_hash TEXT NOT NULL, class_id INTEGER, active INTEGER NOT NULL DEFAULT 1,
  must_change INTEGER NOT NULL DEFAULT 0, last_login TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS classes(
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, grade INTEGER NOT NULL,
  stream TEXT NOT NULL, label TEXT UNIQUE NOT NULL, teacher TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS titles(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, grade INTEGER NOT NULL,
  publisher TEXT DEFAULT '', code TEXT DEFAULT '', UNIQUE(name, grade));
CREATE TABLE IF NOT EXISTS class_titles(
  class_id INTEGER NOT NULL, title_id INTEGER NOT NULL, position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(class_id, title_id),
  FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY(title_id) REFERENCES titles(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS learners(
  id INTEGER PRIMARY KEY AUTOINCREMENT, adm_no TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  class_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','left')),
  created_at TEXT NOT NULL, FOREIGN KEY(class_id) REFERENCES classes(id));
CREATE INDEX IF NOT EXISTS idx_learners_class ON learners(class_id, status);
CREATE TABLE IF NOT EXISTS moves(
  id INTEGER PRIMARY KEY AUTOINCREMENT, learner_id INTEGER NOT NULL, from_class INTEGER, to_class INTEGER,
  moved_on TEXT NOT NULL, by_user TEXT, note TEXT DEFAULT '',
  FOREIGN KEY(learner_id) REFERENCES learners(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS records(
  id INTEGER PRIMARY KEY AUTOINCREMENT, learner_id INTEGER NOT NULL, title_id INTEGER NOT NULL,
  issued_on TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'issued' CHECK(status IN ('issued','collected','lost','damaged')),
  returned_on TEXT, updated_by TEXT, updated_at TEXT NOT NULL,
  UNIQUE(learner_id, title_id),
  FOREIGN KEY(learner_id) REFERENCES learners(id) ON DELETE CASCADE,
  FOREIGN KEY(title_id) REFERENCES titles(id) ON DELETE CASCADE);
CREATE INDEX IF NOT EXISTS idx_records_title ON records(title_id, status);
CREATE TABLE IF NOT EXISTS stock(
  title_id INTEGER PRIMARY KEY, opening INTEGER NOT NULL DEFAULT 0, purchased INTEGER NOT NULL DEFAULT 0,
  withdrawn INTEGER NOT NULL DEFAULT 0, physical INTEGER,
  FOREIGN KEY(title_id) REFERENCES titles(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS incidents(
  id INTEGER PRIMARY KEY AUTOINCREMENT, reported_on TEXT NOT NULL, class_id INTEGER, learner_id INTEGER,
  title_id INTEGER, type TEXT NOT NULL CHECK(type IN ('Lost','Damaged')), category TEXT DEFAULT '',
  issued_on TEXT, details TEXT DEFAULT '', action TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'Under investigation',
  replaced_on TEXT, new_copy_id TEXT DEFAULT '', value REAL, reported_by TEXT DEFAULT '',
  created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, user TEXT, action TEXT NOT NULL, entity TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS snapshots(
  id INTEGER PRIMARY KEY AUTOINCREMENT, label TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT, data TEXT NOT NULL);
`;

export const nowIso = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(SCHEMA);
  const q = {
    all: (sql, ...p) => db.prepare(sql).all(...p),
    get: (sql, ...p) => db.prepare(sql).get(...p),
    run: (sql, ...p) => db.prepare(sql).run(...p),
  };
  const tx = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  };
  const ctx = { db, q, tx };
  if (!q.get('SELECT 1 x FROM classes LIMIT 1')) seed(ctx);
  return ctx;
}

function seed({ q, tx }) {
  const data = JSON.parse(fs.readFileSync(path.join(here, '..', 'seed', 'seed.json'), 'utf8'));
  tx(() => {
    for (const [k, v] of Object.entries(data.settings)) q.run('INSERT INTO settings(key,value) VALUES(?,?)', k, v);
    for (const [kind, arr] of Object.entries(data.lists)) arr.forEach((v, i) => q.run('INSERT INTO lists(kind,value,position) VALUES(?,?,?)', kind, v, i));
    for (const t of data.titles) {
      q.run('INSERT INTO titles(id,name,grade) VALUES(?,?,?)', t.id, t.name, t.grade);
      q.run('INSERT INTO stock(title_id) VALUES(?)', t.id);
    }
    const classId = {};
    for (const c of data.classes) {
      const r = q.run('INSERT INTO classes(code,grade,stream,label,teacher) VALUES(?,?,?,?,?)', c.code, c.grade, c.stream, c.label, c.teacher);
      classId[c.code] = Number(r.lastInsertRowid);
      c.titles.forEach((tid, i) => q.run('INSERT INTO class_titles(class_id,title_id,position) VALUES(?,?,?)', classId[c.code], tid, i));
    }
    const ts = nowIso();
    for (const l of data.learners) q.run('INSERT INTO learners(adm_no,name,class_id,created_at) VALUES(?,?,?,?)', l.adm_no, l.name, classId[l.class_code], ts);
    const pw = process.env.ADMIN_PASSWORD || 'Libra@2026';
    q.run('INSERT INTO users(username,name,role,pass_hash,must_change,created_at) VALUES(?,?,?,?,?,?)',
      'admin', 'System Administrator', 'admin', hashPassword(pw), 1, ts);
    q.run('INSERT INTO audit(ts,user,action,entity,detail) VALUES(?,?,?,?,?)', ts, 'system', 'seed', 'database', `Initial load: ${data.classes.length} classes, ${data.titles.length} titles, ${data.learners.length} learners`);
  });
}

export function audit({ q }, user, action, entity, detail) {
  q.run('INSERT INTO audit(ts,user,action,entity,detail) VALUES(?,?,?,?,?)', nowIso(), user?.username || 'system', action, entity || '', String(detail || '').slice(0, 500));
}

/** Per-class statistics: the single source of truth for Home, Summary, Classes. */
export function classStats({ q }) {
  const classes = q.all('SELECT * FROM classes WHERE active=1 ORDER BY grade, CASE stream WHEN \'North\' THEN 1 WHEN \'East\' THEN 2 WHEN \'South\' THEN 3 ELSE 4 END, stream');
  const roll = Object.fromEntries(q.all("SELECT class_id, COUNT(*) n FROM learners WHERE status='active' GROUP BY class_id").map(r => [r.class_id, r.n]));
  const titles = Object.fromEntries(q.all('SELECT class_id, COUNT(*) n FROM class_titles GROUP BY class_id').map(r => [r.class_id, r.n]));
  const rec = Object.fromEntries(q.all(`
    SELECT l.class_id,
      COUNT(*) issued,
      SUM(r.status='collected') collected, SUM(r.status='issued') out,
      SUM(r.status='lost') lost, SUM(r.status='damaged') damaged,
      SUM(ct.title_id IS NOT NULL) in_class
    FROM records r JOIN learners l ON l.id=r.learner_id AND l.status='active'
    LEFT JOIN class_titles ct ON ct.class_id=l.class_id AND ct.title_id=r.title_id
    GROUP BY l.class_id`).map(r => [r.class_id, r]));
  const inc = Object.fromEntries(q.all('SELECT class_id, COUNT(*) n FROM incidents WHERE class_id IS NOT NULL GROUP BY class_id').map(r => [r.class_id, r.n]));
  return classes.map(c => {
    const r = rec[c.id] || {};
    const n = roll[c.id] || 0, t = titles[c.id] || 0, expected = n * t;
    const issued = r.issued || 0, lost = r.lost || 0, damaged = r.damaged || 0, incidents = inc[c.id] || 0;
    let check;
    if (n === 0) check = 'No roll entered';
    else if (lost + damaged === incidents) check = 'matches';
    else check = `register ${lost + damaged} vs log ${incidents}`;
    const out = r.out || 0;
    const state = n === 0 ? 0 : issued === 0 ? 1 : out > 0 ? 2 : 3;
    return {
      id: c.id, code: c.code, grade: c.grade, stream: c.stream, label: c.label, teacher: c.teacher,
      learners: n, titles: t, expected, issued, collected: r.collected || 0, out, lost, damaged,
      inClass: r.in_class || 0, coverage: expected ? (r.in_class || 0) / expected : null, incidents, check, state,
    };
  });
}

export function stockRows({ q }) {
  const rows = q.all(`
    SELECT t.id, t.name, t.grade, t.publisher, t.code,
      COALESCE(s.opening,0) opening, COALESCE(s.purchased,0) purchased, COALESCE(s.withdrawn,0) withdrawn, s.physical,
      (SELECT COUNT(*) FROM incidents i WHERE i.title_id=t.id AND i.status='Replaced') replacements,
      (SELECT COUNT(*) FROM records r WHERE r.title_id=t.id) issued,
      (SELECT COUNT(*) FROM records r WHERE r.title_id=t.id AND r.status='collected') collected,
      (SELECT COUNT(*) FROM records r WHERE r.title_id=t.id AND r.status='issued') with_learners,
      (SELECT COUNT(*) FROM records r WHERE r.title_id=t.id AND r.status='lost') lost,
      (SELECT COUNT(*) FROM records r WHERE r.title_id=t.id AND r.status='damaged') damaged,
      (SELECT COUNT(*) FROM class_titles ct WHERE ct.title_id=t.id) classes
    FROM titles t LEFT JOIN stock s ON s.title_id=t.id ORDER BY t.grade, t.name`);
  return rows.map(r => {
    const total = r.opening + r.purchased + r.replacements;
    const expected = total - r.with_learners - r.lost - r.withdrawn;
    const variance = r.physical == null ? null : r.physical - expected;
    const status = total === 0 ? 'Enter stock' : r.physical == null ? 'No count' : variance === 0 ? 'Reconciled' : variance < 0 ? 'Shortfall' : 'Surplus';
    return { ...r, total, expected, variance, status };
  });
}
