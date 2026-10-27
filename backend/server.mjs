import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './lib/db.mjs';
import { loadSecret, verifyToken } from './lib/auth.mjs';
import { buildRoutes, HttpError } from './lib/routes.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(here, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'libralink.db');
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(here, '..', 'frontend', 'dist');
const MAX_BODY = 30 * 1024 * 1024; // restore files can be large

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.map': 'application/json', '.webmanifest': 'application/manifest+json',
};

export function createServer({ dbFile = DB_FILE, publicDir = PUBLIC_DIR, dataDir = DATA_DIR } = {}) {
  loadSecret(dataDir);
  const app = openDb(dbFile);
  const routes = buildRoutes(app);

  const headers = (extra = {}) => ({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    ...extra,
  });

  const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
    res.writeHead(status, headers({ 'Content-Type': type, ...extra }));
    res.end(body);
  };
  const sendJson = (res, status, obj, extra) => send(res, status, JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? Number(v) : v), undefined, { 'Cache-Control': 'no-store', ...extra });

  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) { reject(new HttpError(413, 'Request too large.')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HttpError(400, 'Invalid JSON.')); }
    });
    req.on('error', reject);
  });

  const serveStatic = (req, res, pathname) => {
    if (!fs.existsSync(publicDir)) return send(res, 503, 'Frontend not built yet. Run "npm run build" in the project folder.', 'text/plain; charset=utf-8');
    let rel = decodeURIComponent(pathname);
    let file = path.normalize(path.join(publicDir, rel));
    if (!file.startsWith(path.normalize(publicDir))) return send(res, 403, 'Forbidden', 'text/plain');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      if (path.extname(rel)) return send(res, 404, 'Not found', 'text/plain');
      file = path.join(publicDir, 'index.html'); // SPA fallback
    }
    const ext = path.extname(file).toLowerCase();
    const immutable = /\.(js|css|woff2|png|svg|webp|jpg)$/.test(ext) && /-[A-Z0-9]{6,}\./.test(path.basename(file));
    res.writeHead(200, headers({ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' }));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  };

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    try {
      if (!pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
        return serveStatic(req, res, pathname);
      }
      if (pathname === '/api/health') return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
      const method = req.method;
      let route, params = {};
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(pathname);
        if (m) { route = r; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); break; }
      }
      if (!route) {
        if (routes.some(r => r.re.test(pathname))) throw new HttpError(405, 'Method not allowed.');
        throw new HttpError(404, 'Not found.');
      }
      let user = null;
      if (route.roles !== 'public') {
        const auth = req.headers.authorization || '';
        const payload = auth.startsWith('Bearer ') ? verifyToken(auth.slice(7)) : null;
        user = payload && app.q.get('SELECT * FROM users WHERE id=? AND active=1', payload.uid);
        if (!user) throw new HttpError(401, 'Please sign in again.');
        if (user.must_change && !(pathname === '/api/auth/change-password' || pathname === '/api/auth/me' || pathname === '/api/bootstrap'))
          throw new HttpError(403, 'You must change your password first.', { code: 'must_change' });
        if (Array.isArray(route.roles) && !route.roles.includes(user.role)) throw new HttpError(403, 'You do not have permission to do that.');
        if (user.role === 'head' && method !== 'GET' && !route.roles?.includes('head') && pathname !== '/api/auth/change-password')
          throw new HttpError(403, 'Head teacher accounts are read-only.');
      }
      const body = (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') ? await readBody(req) : {};
      const query = Object.fromEntries(url.searchParams);
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().split(',')[0].trim();
      const out = await route.handler({ req, user, params, query, body, ip });
      if (out && out.__csv !== undefined) return send(res, 200, out.__csv, 'text/csv; charset=utf-8', { 'Content-Disposition': `attachment; filename="${out.filename}"`, 'Cache-Control': 'no-store' });
      if (out && out.__json !== undefined) return send(res, 200, JSON.stringify(out.__json), 'application/json', { 'Content-Disposition': `attachment; filename="${out.filename}"`, 'Cache-Control': 'no-store' });
      sendJson(res, 200, out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) sendJson(res, e.status, { error: e.message, ...(e.extra || {}) });
      else {
        const msg = String(e?.message || e);
        if (/UNIQUE constraint failed/.test(msg)) sendJson(res, 409, { error: 'That value already exists.' });
        else if (/FOREIGN KEY constraint failed/.test(msg)) sendJson(res, 409, { error: 'That item is still in use.' });
        else { console.error('[error]', req.method, pathname, e); sendJson(res, 500, { error: 'Something went wrong on the server.' }); }
      }
    } finally {
      if (process.env.LOG_REQUESTS === '1') console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
  server.app = app;
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer();
  server.listen(PORT, HOST, () => {
    console.log(`\n  Libra Link is running  →  http://localhost:${PORT}`);
    console.log(`  Database: ${DB_FILE}`);
    console.log('  First sign-in: username "admin" (you will be asked to set a new password)\n');
  });
  const stop = () => { server.close(() => { try { server.app.db.close(); } catch {} process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
