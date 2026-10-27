import { useEffect, useRef, useState } from 'react';
import { Icon, LogoMark } from '../icons';
import { useApp } from '../store';
import { api } from '../api';
import { go } from '../router';
import { Avatar, Spinner } from '../ui';
import { ROLE_LABEL, cx } from '../util';

function GlobalSearch() {
  const [q, setQ] = useState(''), [hits, setHits] = useState(null), [open, setOpen] = useState(false);
  const box = useRef();
  useEffect(() => {
    if (q.trim().length < 2) { setHits(null); return; }
    const id = setTimeout(async () => { try { const r = await api.get('/learners?limit=8&q=' + encodeURIComponent(q.trim())); setHits(r.rows); } catch { setHits([]); } }, 250);
    return () => clearTimeout(id);
  }, [q]);
  useEffect(() => { const f = (e) => { if (!box.current?.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  return (
    <div className="gsearch" ref={box}>
      <div className="searchbox"><Icon n="search" size={18} className="ico" /><input className="input" placeholder="Find a learner by name or admission no…" value={q} onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); }} aria-label="Find a learner" /></div>
      {open && hits && (
        <div className="pop">
          {!hits.length && <div className="emptystate small">No learner found.</div>}
          {hits.map(h => (
            <button key={h.id} className="hit" onClick={() => { setOpen(false); setQ(''); go('/learner/' + h.id); }}>
              <Avatar name={h.name} /><div className="grow"><b>{h.name}</b><div className="small muted">Adm {h.adm_no} · {h.class_label}{h.status === 'left' ? ' · left' : ''}</div></div>
              {h.out > 0 && <span className="badge warn">{h.out} out</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Shell({ path, children }) {
  const { user, meta, logout, can } = useApp();
  const [open, setOpen] = useState(false);
  const [openCases, setOpenCases] = useState(0);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { api.get('/summary').then(s => setOpenCases(s.openIncidents)).catch(() => {}); }, [path]);
  const s = meta.settings;
  const myClass = user.role === 'teacher' ? meta.classById[user.class_id] : null;
  const item = (to, icon, label, extra) => {
    const on = path === to || (to !== '/dashboard' && path.startsWith(to + '/')) || (to === '/classes' && path.startsWith('/class/')) || (to === '/learners' && path.startsWith('/learner/'));
    return <a key={to} href={'#' + to} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}><Icon n={icon} size={19} />{label}{extra}</a>;
  };
  return (
    <div className="shell">
      {open && <div className="overlay" onClick={() => setOpen(false)} />}
      <aside className={cx('sidebar', open && 'open')} aria-label="Main navigation">
        <div className="brand">
          <div className="logo">{s.logo ? <img src={s.logo} alt="" /> : <LogoMark size={26} />}</div>
          <div><b>LIBRA LINK</b><span>TEXTBOOK MANAGEMENT</span></div>
        </div>
        <nav className="nav">
          {item('/dashboard', 'home', 'Dashboard')}
          {myClass && item('/class/' + myClass.id, 'book', 'My class · ' + myClass.label)}
          <div className="nav-sec">REGISTERS</div>
          {item('/classes', 'school', 'Class registers')}
          {item('/learners', 'users', 'Learners')}
          <div className="nav-sec">LIBRARY</div>
          {item('/books', 'books', 'Book titles')}
          {item('/stock', 'box', 'Stock')}
          {item('/incidents', 'alert', 'Lost & damaged', openCases > 0 ? <span className="count">{openCases}</span> : null)}
          <div className="nav-sec">INSIGHTS</div>
          {item('/summary', 'chart', 'Executive summary')}
          {item('/reports', 'file', 'Reports & exports')}
          {(can.admin || can.audit) && <div className="nav-sec">ADMINISTRATION</div>}
          {can.admin && item('/settings', 'settings', 'Settings')}
          {can.admin && item('/users', 'shield', 'Users & roles')}
          {can.audit && item('/audit', 'clock', 'Audit trail')}
          <div className="nav-sec">HELP</div>
          {item('/guide', 'help', 'User guide')}
        </nav>
        <div className="sb-foot">
          <div className="me"><Avatar name={user.name} /><div className="grow" style={{ minWidth: 0 }}><b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.name}</b><span>{ROLE_LABEL[user.role]}</span></div></div>
          <div className="nav"><a href="#/account"><Icon n="lock" size={19} />Account</a><button onClick={logout}><Icon n="logout" size={19} />Sign out</button></div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar noprint">
          <button className="iconbtn menu" aria-label="Open menu" onClick={() => setOpen(true)}><Icon n="menu" /></button>
          <GlobalSearch />
          <div className="right row">
            <span className="term-chip hide-m"><Icon n="calendar" size={15} />{s.term} {s.academic_year}</span>
          </div>
        </header>
        <main className="page" id="main">{children}</main>
      </div>
      <nav className="bottomnav noprint" aria-label="Quick navigation">
        {[['/dashboard', 'home', 'Home'], ['/classes', 'school', 'Registers'], ['/learners', 'users', 'Learners'], ['/incidents', 'alert', 'Cases']].map(([to, ic, l]) => (
          <a key={to} href={'#' + to} className={path === to || path.startsWith(to + '/') || (to === '/classes' && path.startsWith('/class/')) || (to === '/learners' && path.startsWith('/learner/')) ? 'on' : ''}><Icon n={ic} size={22} />{l}</a>
        ))}
        <button onClick={() => setOpen(true)} aria-label="More menu"><Icon n="menu" size={22} />More</button>
      </nav>
    </div>
  );
}
