import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, tokenStore, setUnauthorizedHandler } from './api';
import { Icon } from './icons';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [meta, setMeta] = useState(null);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState([]);
  const tid = useRef(0);

  const toast = useCallback((message, type = 'info', action) => {
    const id = ++tid.current;
    setToasts(t => [...t.slice(-3), { id, message, type, action }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), action ? 8000 : 3200);
  }, []);

  const loadMeta = useCallback(async () => {
    const m = await api.get('/bootstrap');
    const titleById = Object.fromEntries(m.titles.map(t => [t.id, t]));
    const classById = Object.fromEntries(m.classes.map(c => [c.id, c]));
    setMeta({ ...m, titleById, classById });
    return m;
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear(); setUser(null); setMeta(null);
    if (!/^#\/(login|welcome)?$/.test(location.hash)) location.hash = '/login';
  }, []);

  useEffect(() => { setUnauthorizedHandler(() => { if (tokenStore.get()) { toast('Your session has ended. Please sign in again.', 'bad'); logout(); } }); }, [logout, toast]);

  useEffect(() => {
    (async () => {
      if (tokenStore.get()) {
        try { const { user } = await api.get('/auth/me'); await loadMeta(); setUser(user); }
        catch { tokenStore.clear(); }
      }
      setReady(true);
    })();
  }, [loadMeta]);

  const login = useCallback(async (username, password) => {
    const r = await api.post('/auth/login', { username, password });
    tokenStore.set(r.token);
    try { await loadMeta(); } catch (e) { tokenStore.clear(); throw e; }
    setUser(r.user);
    return r.user;
  }, [loadMeta]);

  const refreshUser = useCallback(async () => { const { user } = await api.get('/auth/me'); setUser(user); return user; }, []);

  // permission helpers
  const can = useMemo(() => {
    const role = user?.role;
    return {
      staff: role === 'admin' || role === 'librarian',
      admin: role === 'admin',
      readOnly: role === 'head',
      editClass: (classId) => role === 'admin' || role === 'librarian' || (role === 'teacher' && user.class_id === classId),
      audit: role === 'admin' || role === 'head',
    };
  }, [user]);

  const value = { user, meta, ready, login, logout, loadMeta, refreshUser, toast, can, setUser };
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`} onClick={() => setToasts(x => x.filter(y => y.id !== t.id))} style={{ cursor: 'pointer' }}>
            <Icon n={t.type === 'ok' ? 'check' : t.type === 'bad' ? 'alert' : 'info'} size={18} />
            <span className="grow">{t.message}</span>
            {t.action && <button onClick={(e) => { e.stopPropagation(); t.action.run(); setToasts(x => x.filter(y => y.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

/** Tiny data-fetching hook. */
export function useApi(path, deps = []) {
  const [state, set] = useState({ data: null, loading: true, error: null });
  const seq = useRef(0);
  const load = useCallback(async (silent) => {
    const id = ++seq.current;
    if (!silent) set(s => ({ ...s, loading: true, error: null }));
    try { const data = await api.get(path); if (id === seq.current) set({ data, loading: false, error: null }); }
    catch (e) { if (id === seq.current) set(s => ({ data: silent ? s.data : null, loading: false, error: e.message })); }
  }, [path]);
  useEffect(() => { if (path) load(false); }, [path, ...deps]); // eslint-disable-line
  return { ...state, reload: () => load(true), setData: (data) => set(s => ({ ...s, data })) };
}
