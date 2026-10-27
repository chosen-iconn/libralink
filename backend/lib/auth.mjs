import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  try {
    const [alg, saltHex, hashHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const h = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
    const want = Buffer.from(hashHex, 'hex');
    return want.length === h.length && crypto.timingSafeEqual(h, want);
  } catch { return false; }
}

export function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain letters and numbers.';
  if (pw.length > 128) return 'Password is too long.';
  return null;
}

let SECRET;
export function loadSecret(dataDir) {
  if (process.env.JWT_SECRET) { SECRET = process.env.JWT_SECRET; return; }
  const f = path.join(dataDir || path.join(here, '..', 'data'), 'secret.key');
  if (fs.existsSync(f)) SECRET = fs.readFileSync(f, 'utf8').trim();
  else {
    SECRET = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, SECRET, { mode: 0o600 });
  }
}

const b64 = (b) => Buffer.from(b).toString('base64url');

export function signToken(payload, ttlSeconds = 12 * 3600) {
  const head = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds }));
  const sig = crypto.createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

export function verifyToken(token) {
  try {
    const [h, b, s] = String(token).split('.');
    if (!h || !b || !s) return null;
    const want = crypto.createHmac('sha256', SECRET).update(`${h}.${b}`).digest();
    const got = Buffer.from(s, 'base64url');
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
    const p = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (!p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch { return null; }
}

/** Simple in-memory login throttle: 6 failures per 15 minutes per username+IP. */
const fails = new Map();
const WINDOW = 15 * 60 * 1000, MAX = 6;
export function throttled(key) {
  const f = fails.get(key);
  if (!f) return 0;
  if (Date.now() - f.first > WINDOW) { fails.delete(key); return 0; }
  return f.n >= MAX ? Math.ceil((WINDOW - (Date.now() - f.first)) / 60000) : 0;
}
export function recordFail(key) {
  const f = fails.get(key);
  if (!f || Date.now() - f.first > WINDOW) fails.set(key, { n: 1, first: Date.now() });
  else f.n++;
}
export function clearFails(key) { fails.delete(key); }
