import { useEffect, useState } from 'react';
import { AppProvider, useApp } from './store';
import { match, useHash, go } from './router';
import { Shell } from './components/Shell';
import { Account, ForcePassword, Landing, Login, Splash } from './pages/Auth';
import { Classes, Dashboard } from './pages/Dashboard';
import { Register } from './pages/Register';
import { LearnerProfile, Learners } from './pages/Learners';
import { Reports, Summary } from './pages/Reports';
import { Books, Incidents, Stock } from './pages/Library';
import { Audit, Settings, Users } from './pages/Admin';
import { Guide } from './pages/Guide';
import { Alert, Empty } from './ui';

const ROUTES = [
  { path: '/dashboard', render: () => <Dashboard /> },
  { path: '/classes', render: () => <Classes /> },
  { path: '/class/:id', render: (p) => <Register id={p.id} key={p.id} /> },
  { path: '/learners', render: () => <Learners /> },
  { path: '/learner/:id', render: (p) => <LearnerProfile id={p.id} key={p.id} /> },
  { path: '/summary', render: () => <Summary /> },
  { path: '/stock', render: () => <Stock /> },
  { path: '/incidents', render: () => <Incidents /> },
  { path: '/books', render: (_, q) => <Books query={q} /> },
  { path: '/reports', render: () => <Reports /> },
  { path: '/settings', admin: true, render: () => <Settings /> },
  { path: '/users', admin: true, render: () => <Users /> },
  { path: '/audit', audit: true, render: () => <Audit /> },
  { path: '/guide', render: () => <Guide /> },
  { path: '/account', render: () => <Account /> },
];

function Root() {
  const { user, ready, can, meta } = useApp();
  const hash = useHash();
  const [splash, setSplash] = useState(() => !sessionStorage.getItem('libra.splash'));
  const [gone, setGone] = useState(!splash);
  useEffect(() => { if (!splash) return; const t1 = setTimeout(() => { setSplash(false); sessionStorage.setItem('libra.splash', '1'); }, 1700); const t2 = setTimeout(() => setGone(true), 2300); return () => { clearTimeout(t1); clearTimeout(t2); }; }, []); // eslint-disable-line
  const { route, params, query, path } = match(ROUTES, hash);

  useEffect(() => {
    if (!ready) return;
    if (!user && path !== '/login' && path !== '/welcome') go(path === '/' ? '/welcome' : '/login');
    if (user && (path === '/' || path === '/login' || path === '/welcome')) go('/dashboard');
  }, [ready, user, path]);

  let body = null;
  if (ready) {
    if (!user) body = path === '/login' ? <Login /> : <Landing />;
    else if (user.must_change) body = <ForcePassword />;
    else if (!meta) body = <div className="page center"><span className="spin" /></div>;
    else {
      const denied = route && ((route.admin && !can.admin) || (route.audit && !can.audit));
      body = (
        <Shell path={path}>
          {!route ? <Empty icon="search" title="Page not found"><a href="#/dashboard">Go to the dashboard</a></Empty> : denied ? <Alert kind="bad">You do not have access to this page.</Alert> : route.render(params, query)}
        </Shell>
      );
    }
  }
  return <>{body}{!gone && <Splash out={!splash} />}</>;
}
export default function App() { return <AppProvider><Root /></AppProvider>; }
