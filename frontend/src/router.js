import { useEffect, useState } from 'react';
export const go = (p) => { if (location.hash === '#' + p) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = p; };
export function useHash() {
  const [h, setH] = useState(() => location.hash.slice(1) || '/');
  useEffect(() => { const f = () => { setH(location.hash.slice(1) || '/'); window.scrollTo(0, 0); }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return h;
}
export function match(routes, hash) {
  const [path, qs] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  for (const r of routes) {
    const keys = [];
    const re = new RegExp('^' + r.path.replace(/:([a-z_]+)/gi, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    const m = re.exec(path);
    if (m) return { route: r, params: Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])), query, path };
  }
  return { route: null, params: {}, query, path };
}
