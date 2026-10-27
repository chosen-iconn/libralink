const KEY = 'libralink.token';
export const tokenStore = { get: () => localStorage.getItem(KEY), set: (t) => localStorage.setItem(KEY, t), clear: () => localStorage.removeItem(KEY) };
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (f) => { onUnauthorized = f; };

export class ApiError extends Error { constructor(status, message, data) { super(message); this.status = status; this.data = data; } }

async function request(method, path, body, raw) {
  const t = tokenStore.get();
  let res;
  try {
    res = await fetch('/api' + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch { throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.'); }
  if (raw && res.ok) return res;
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data?.error || `Request failed (${res.status})`, data);
  }
  return data;
}
export const api = {
  get: (p) => request('GET', p), post: (p, b = {}) => request('POST', p, b), put: (p, b = {}) => request('PUT', p, b), del: (p) => request('DELETE', p, {}),
  async download(path, fallbackName) {
    const res = await request('GET', path, undefined, true);
    const cd = res.headers.get('content-disposition') || '';
    const name = (/filename="([^"]+)"/.exec(cd) || [])[1] || fallbackName;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
};
