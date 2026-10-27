import { useState } from 'react';
import { Icon, LogoMark } from '../icons';
import { useApp } from '../store';
import { api } from '../api';
import { go } from '../router';
import { Alert, Btn, Card, Field, Input, PageHead } from '../ui';

export function Splash({ out }) {
  return (
    <div className={'splash' + (out ? ' out' : '')} role="status" aria-label="Loading Libra Link">
      <div>
        <div className="mark"><LogoMark size={58} /></div>
        <h1>LIBRA LINK</h1>
        <p>Textbook &amp; Resource Management</p>
        <div className="ld"><i /></div>
      </div>
    </div>
  );
}

const FEATURES = [
  ['book', 'Digital class registers', 'Issue and collect every textbook, learner by learner.'],
  ['box', 'Live stock reconciliation', 'Opening stock, replacements and physical counts balanced automatically.'],
  ['alert', 'Lost & damaged tracking', 'A full case history from report to replacement.'],
  ['chart', 'Executive summary', 'Coverage, outstanding books and trends at a glance.'],
  ['swap', 'Learner moves', 'Move learners between classes; their book records follow them.'],
  ['shield', 'Roles & audit trail', 'Admin, librarian, teacher and head-teacher access, fully logged.'],
];

export function Landing() {
  return (
    <div className="auth">
      <div className="auth-art">
        <div className="row"><div className="avatar" style={{ borderRadius: 12, width: 44, height: 44, background: 'linear-gradient(135deg,#2F7BEA,#1B5FD6)', border: '1.5px solid #E3B24B' }}><LogoMark size={26} /></div><b style={{ letterSpacing: '.18em' }}>LIBRA LINK</b></div>
        <div>
          <h1>Every textbook,<br /><em>accounted for.</em></h1>
          <p>The complete issuance, collection and stock system for your school library — built for class teachers, librarians and head teachers.</p>
          <div className="feat hide-m">{FEATURES.map(([ic, t, d]) => <div key={t}><Icon n={ic} size={20} /><span><b style={{ color: '#fff', display: 'block' }}>{t}</b>{d}</span></div>)}</div>
        </div>
        <span className="small" style={{ color: '#8fb0ea' }}>© Libra Link · Secure, role-based access</span>
      </div>
      <div className="auth-form">
        <div className="auth-card stack">
          <div><h2>Welcome</h2><p className="muted">Sign in to manage registers, stock and reports.</p></div>
          <Btn kind="primary" size="lg" block icon="lock" onClick={() => go('/login')}>Sign in to continue</Btn>
          <div className="alert"><Icon n="info" size={18} /><div>Accounts are created by your school administrator. Forgotten your password? Ask the administrator to reset it.</div></div>
        </div>
      </div>
    </div>
  );
}

export function Login() {
  const { login, toast } = useApp();
  const [u, setU] = useState(''), [p, setP] = useState(''), [show, setShow] = useState(false), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!u.trim() || !p) { setErr('Enter your username and password.'); return; }
    setBusy(true);
    try { const user = await login(u.trim(), p); toast(`Welcome back, ${user.name}.`, 'ok'); go('/dashboard'); }
    catch (ex) { setErr(ex.message); setBusy(false); }
  };
  return (
    <div className="auth">
      <div className="auth-art">
        <a href="#/welcome" className="row" style={{ color: '#fff' }}><div className="avatar" style={{ borderRadius: 12, width: 44, height: 44, background: 'linear-gradient(135deg,#2F7BEA,#1B5FD6)', border: '1.5px solid #E3B24B' }}><LogoMark size={26} /></div><b style={{ letterSpacing: '.18em' }}>LIBRA LINK</b></a>
        <div>
          <h1>Sign in to your<br /><em>school library.</em></h1>
          <p>Registers, stock and reports — updated live as you work.</p>
          <div className="feat hide-m">{FEATURES.slice(0, 4).map(([ic, t]) => <div key={t}><Icon n={ic} size={18} /><b style={{ color: '#fff' }}>{t}</b></div>)}</div>
        </div>
        <span className="small hide-m" style={{ color: '#8fb0ea' }}>Your actions are recorded in the audit trail.</span>
      </div>
      <div className="auth-form">
        <form className="auth-card stack" onSubmit={submit} noValidate>
          <div><h2>Sign in</h2><p className="muted">Use the account your administrator gave you.</p></div>
          {err && <Alert kind="bad">{err}</Alert>}
          <Field label="Username"><Input autoComplete="username" autoCapitalize="none" autoFocus value={u} onChange={e => setU(e.target.value)} placeholder="e.g. admin" /></Field>
          <Field label="Password">
            <div className="pw"><Input type={show ? 'text' : 'password'} autoComplete="current-password" value={p} onChange={e => setP(e.target.value)} placeholder="••••••••" style={{ paddingRight: 48 }} />
              <button type="button" className="iconbtn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(s => !s)}><Icon n={show ? 'eyeOff' : 'eye'} size={19} /></button></div>
          </Field>
          <Btn kind="primary" size="lg" block disabled={busy} type="submit">{busy ? 'Signing in…' : 'Sign in'}</Btn>
          <p className="small muted center"><a href="#/welcome">← Back to welcome page</a></p>
        </form>
      </div>
    </div>
  );
}

function PasswordForm({ forced, onDone }) {
  const { toast, refreshUser } = useApp();
  const [cur, setCur] = useState(''), [n1, setN1] = useState(''), [n2, setN2] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const checks = [[n1.length >= 8, 'At least 8 characters'], [/[A-Za-z]/.test(n1) && /[0-9]/.test(n1), 'Letters and numbers'], [n1 !== '' && n1 === n2, 'Both entries match']];
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!checks.every(c => c[0])) { setErr('Please meet all the password rules below.'); return; }
    setBusy(true);
    try { await api.post('/auth/change-password', { current: cur, next: n1 }); await refreshUser(); toast('Password updated.', 'ok'); setCur(''); setN1(''); setN2(''); onDone?.(); }
    catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };
  return (
    <form className="stack" onSubmit={submit}>
      {forced && <Alert kind="warn">For your security, choose a new password before continuing.</Alert>}
      {err && <Alert kind="bad">{err}</Alert>}
      <Field label="Current password"><Input type="password" autoComplete="current-password" value={cur} onChange={e => setCur(e.target.value)} /></Field>
      <Field label="New password"><Input type="password" autoComplete="new-password" value={n1} onChange={e => setN1(e.target.value)} /></Field>
      <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={n2} onChange={e => setN2(e.target.value)} /></Field>
      <div className="lg">{checks.map(([ok, t]) => <div key={t} style={{ color: ok ? 'var(--ok)' : 'var(--muted)' }}><Icon n={ok ? 'check' : 'x'} size={15} />{t}</div>)}</div>
      <Btn kind="primary" type="submit" block disabled={busy}>{busy ? 'Saving…' : 'Update password'}</Btn>
    </form>
  );
}

export function ForcePassword() {
  const { logout } = useApp();
  return (
    <div className="auth">
      <div className="auth-art"><div className="row"><LogoMark size={30} /><b style={{ letterSpacing: '.18em' }}>LIBRA LINK</b></div><div><h1>Set your<br /><em>own password.</em></h1><p>Your account was created with a temporary password. Choose a private one to keep learner data safe.</p></div><span /></div>
      <div className="auth-form"><div className="auth-card stack"><h2>New password</h2><PasswordForm forced onDone={() => go('/dashboard')} /><Btn kind="ghost" block onClick={logout}>Sign out</Btn></div></div>
    </div>
  );
}

export function Account() {
  const { user } = useApp();
  return (
    <div className="stack" style={{ maxWidth: 520 }}>
      <PageHead title="My account" sub={`${user.name} · ${user.username}`} />
      <Card title="Change password"><PasswordForm /></Card>
    </div>
  );
}
