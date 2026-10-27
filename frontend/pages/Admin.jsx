import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { useApp, useApi } from '../store';
import { Alert, Badge, Btn, Card, Confirm, DataTable, Empty, ErrorBox, Field, Input, Loading, Modal, PageHead, Pager, SearchBox, Select, Seg, Textarea } from '../ui';
import { ROLE_LABEL, fmtTs } from '../util';

function ListEditor({ kind, title, hint }) {
  const { meta, toast, loadMeta } = useApp();
  const [text, setText] = useState((meta.lists[kind] || []).join('\n'));
  const save = async () => { try { await api.put('/lists/' + kind, { values: text.split('\n').map(s => s.trim()).filter(Boolean) }); await loadMeta(); toast('List saved.', 'ok'); } catch (e) { toast(e.message, 'bad'); } };
  return <Card title={title}><div className="stack"><Textarea rows={6} value={text} onChange={e => setText(e.target.value)} /><p className="hint">{hint}</p><Btn onClick={save} icon="check">Save list</Btn></div></Card>;
}

function ClassesEditor() {
  const { meta, toast, loadMeta } = useApp();
  const [adding, setAdding] = useState(false), [f, setF] = useState({ grade: 1, stream: 'North', teacher: '' });
  const setTeacher = async (c, teacher) => { if (teacher === c.teacher) return; try { await api.put('/classes/' + c.id, { teacher }); await loadMeta(); toast(`${c.label} teacher saved.`, 'ok'); } catch (e) { toast(e.message, 'bad'); } };
  const toggle = async (c) => { try { await api.put('/classes/' + c.id, { active: !c.active }); await loadMeta(); } catch (e) { toast(e.message, 'bad'); } };
  const add = async () => { try { await api.post('/classes', f); await loadMeta(); toast('Class added.', 'ok'); setAdding(false); } catch (e) { toast(e.message, 'bad'); } };
  return (
    <Card title="Classes & class teachers" action={<Btn size="sm" icon="plus" onClick={() => setAdding(true)}>Add class</Btn>}>
      <div className="stack">
        {meta.classes.map(c => (
          <div className="bybook" key={c.id} style={{ opacity: c.active ? 1 : .55 }}>
            <b style={{ minWidth: 80 }}>{c.label}</b>
            <Input className="sm" style={{ flex: 1, minWidth: 160 }} defaultValue={c.teacher} placeholder="Class teacher" aria-label={`Teacher for ${c.label}`} onBlur={e => setTeacher(c, e.target.value.trim())} />
            <Btn size="sm" onClick={() => toggle(c)}>{c.active ? 'Hide' : 'Show'}</Btn>
          </div>
        ))}
      </div>
      {adding && <Modal title="Add class" onClose={() => setAdding(false)} footer={<><Btn onClick={() => setAdding(false)}>Cancel</Btn><Btn kind="primary" onClick={add}>Add class</Btn></>}>
        <div className="stack"><div className="grid2"><Field label="Grade"><Select value={f.grade} onChange={e => setF({ ...f, grade: e.target.value })}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(g => <option key={g}>{g}</option>)}</Select></Field><Field label="Stream"><Select value={f.stream} onChange={e => setF({ ...f, stream: e.target.value })}>{['North', 'East', 'South', 'West', 'Central'].map(s => <option key={s}>{s}</option>)}</Select></Field></div><Field label="Class teacher"><Input value={f.teacher} onChange={e => setF({ ...f, teacher: e.target.value })} /></Field><p className="hint">The books of another class in the same grade are copied across automatically.</p></div>
      </Modal>}
    </Card>
  );
}

function Backup() {
  const { toast } = useApp();
  const [confirm, setConfirm] = useState(null);
  const file = useRef();
  const pick = async (f) => { try { const j = JSON.parse(await f.text()); if (j.app !== 'libralink') throw new Error(); setConfirm(j); } catch { toast('That is not a Libra Link backup file.', 'bad'); } finally { file.current.value = ''; } };
  return (
    <Card title="Backup & restore">
      <div className="stack">
        <p className="small muted">Download a complete copy of all data (registers, learners, stock, cases, users). Keep copies somewhere safe — e.g. before each term.</p>
        <div className="row wrap"><Btn icon="download" kind="primary" onClick={() => api.download('/admin/backup', 'libralink-backup.json').catch(e => toast(e.message, 'bad'))}>Download backup</Btn>
          <Btn icon="upload" onClick={() => file.current.click()}>Restore from file…</Btn><input ref={file} type="file" accept=".json,application/json" hidden onChange={e => e.target.files[0] && pick(e.target.files[0])} /></div>
        <Alert kind="warn">Restoring <b>replaces everything</b> currently in the system with the contents of the file.</Alert>
      </div>
      {confirm && <Confirm danger title="Restore backup?" message={`Replace ALL current data with the backup made ${fmtTs(confirm.created)}? This cannot be undone.`} confirmLabel="Yes, restore" onConfirm={async () => { try { await api.post('/admin/restore', confirm); toast('Backup restored. Reloading…', 'ok'); setTimeout(() => location.reload(), 900); } catch (e) { toast(e.message, 'bad'); } }} onClose={() => setConfirm(null)} />}
    </Card>
  );
}

export function Settings() {
  const { meta, toast, loadMeta } = useApp();
  const s = meta.settings;
  const [f, setF] = useState({ school_name: s.school_name, academic_year: s.academic_year, term: s.term, cutoff: s.cutoff || '', librarian: s.librarian || '', head_teacher: s.head_teacher || '', currency: s.currency || 'KES' });
  const [logo, setLogo] = useState(s.logo || ''), [busy, setBusy] = useState(false), [tab, setTab] = useState('school');
  const onLogo = (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return toast('Use a PNG, JPEG or WebP image.', 'bad');
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const m = 256, k = Math.min(1, m / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); setLogo(c.toDataURL('image/png')); URL.revokeObjectURL(url); };
    img.src = url;
  };
  const save = async () => { setBusy(true); try { await api.put('/settings', { ...f, logo }); await loadMeta(); toast('Settings saved.', 'ok'); } catch (e) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  return (
    <div className="stack">
      <PageHead title="Settings" sub="School details, lists, classes and data safety." />
      <Seg value={tab} onChange={setTab} options={[{ value: 'school', label: 'School' }, { value: 'classes', label: 'Classes' }, { value: 'lists', label: 'Lists' }, { value: 'data', label: 'Backup' }]} />
      {tab === 'school' && <Card title="School & reporting period"><div className="stack">
        <Field label="School name"><Input value={f.school_name} onChange={e => setF({ ...f, school_name: e.target.value })} /></Field>
        <div className="grid3"><Field label="Academic year"><Input type="number" value={f.academic_year} onChange={e => setF({ ...f, academic_year: e.target.value })} /></Field>
          <Field label="Term"><Select value={f.term} onChange={e => setF({ ...f, term: e.target.value })}><option>Term 1</option><option>Term 2</option><option>Term 3</option></Select></Field>
          <Field label="Report cut-off date" hint="Optional."><Input type="date" value={f.cutoff} onChange={e => setF({ ...f, cutoff: e.target.value })} /></Field></div>
        <div className="grid3"><Field label="Librarian"><Input value={f.librarian} onChange={e => setF({ ...f, librarian: e.target.value })} /></Field><Field label="Head teacher"><Input value={f.head_teacher} onChange={e => setF({ ...f, head_teacher: e.target.value })} /></Field><Field label="Currency"><Input value={f.currency} maxLength={6} onChange={e => setF({ ...f, currency: e.target.value })} /></Field></div>
        <Field label="School logo"><div className="logo-drop"><div className="pv">{logo ? <img src={logo} alt="Logo preview" /> : <Icon n="school" size={30} />}</div><div className="stack"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => onLogo(e.target.files[0])} />{logo && <Btn size="sm" onClick={() => setLogo('')}>Remove logo</Btn>}</div></div></Field>
        <div><Btn kind="primary" icon="check" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save settings'}</Btn></div>
      </div></Card>}
      {tab === 'classes' && <ClassesEditor />}
      {tab === 'lists' && <div className="cols2"><ListEditor kind="damage_categories" title="Damage categories" hint="One per line." /><ListEditor kind="statuses" title="Case statuses" hint="One per line. “Under investigation”, “Replaced”, “Repaired” and “Waived” must remain — the last three close a case." /></div>}
      {tab === 'data' && <Backup />}
    </div>
  );
}

function UserForm({ user, onClose, onSaved }) {
  const { meta, toast, user: me } = useApp();
  const [f, setF] = useState({ username: user?.username || '', name: user?.name || '', role: user?.role || 'teacher', class_id: user?.class_id || '', password: '', active: user ? user.active : true });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    const body = { name: f.name, role: f.role, class_id: f.role === 'teacher' ? Number(f.class_id) || '' : '', active: f.active, ...(f.password ? { password: f.password } : {}) };
    try { user ? await api.put('/users/' + user.id, body) : await api.post('/users', { ...body, username: f.username, password: f.password }); toast('User saved.', 'ok'); onSaved(); onClose(); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={user ? `Edit ${user.username}` : 'New user'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>Save</Btn></>}>
      <div className="stack">
        {err && <Alert kind="bad">{err}</Alert>}
        {!user && <Field label="Username"><Input autoCapitalize="none" value={f.username} onChange={e => setF({ ...f, username: e.target.value })} /></Field>}
        <Field label="Full name"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid2">
          <Field label="Role"><Select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          {f.role === 'teacher' && <Field label="Class"><Select value={f.class_id} onChange={e => setF({ ...f, class_id: e.target.value })}><option value="">Select…</option>{meta.classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>}
        </div>
        <Field label={user ? 'Reset password (optional)' : 'Temporary password'} hint="Min 8 characters with letters and numbers. The user must change it at first sign-in."><Input type="text" autoComplete="off" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></Field>
        {user && user.id !== me.id && <label className="check"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} />Account is active</label>}
      </div>
    </Modal>
  );
}

export function Users() {
  const { meta } = useApp();
  const { data, loading, error, reload } = useApi('/users');
  const [form, setForm] = useState(null);
  return (
    <div className="stack">
      <PageHead title="Users & roles" sub="Administrators manage everything. Librarians run registers and stock. Teachers edit their own class. Head teachers view only."><Btn kind="primary" icon="plus" onClick={() => setForm({})}>New user</Btn></PageHead>
      {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <DataTable rows={data} onRow={r => setForm(r)} columns={[
        { label: 'Name', title: true, render: r => <div><b>{r.name}</b><div className="small muted">@{r.username}</div></div> },
        { label: 'Role', render: r => <Badge kind={r.role === 'admin' ? 'gold' : ''}>{ROLE_LABEL[r.role]}</Badge> },
        { label: 'Class', render: r => r.class_id ? meta.classById[r.class_id]?.label : '—' },
        { label: 'Last sign-in', render: r => r.last_login ? fmtTs(r.last_login) : 'Never' },
        { label: 'Status', render: r => <Badge kind={r.active ? 'ok' : 'gray'}>{r.active ? 'Active' : 'Disabled'}{r.must_change ? ' · temp pw' : ''}</Badge> }]} />}
      {form && <UserForm user={form.id ? form : null} onClose={() => setForm(null)} onSaved={reload} />}
    </div>
  );
}

export function Audit() {
  const [q, setQ] = useState(''), [dq, setDq] = useState(''), [offset, setOffset] = useState(0);
  useEffect(() => { const id = setTimeout(() => { setDq(q); setOffset(0); }, 300); return () => clearTimeout(id); }, [q]);
  const { data, loading, error, reload } = useApi(`/audit?limit=50&offset=${offset}&q=${encodeURIComponent(dq)}`);
  return (
    <div className="stack">
      <PageHead title="Audit trail" sub="Every change made in the system, by whom and when." />
      <div className="filters"><SearchBox value={q} onChange={setQ} placeholder="Search user, action or detail" /></div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <>
        <DataTable rows={data.rows} empty={<Empty icon="clock" title="No entries" />} columns={[
          { label: 'When', title: true, render: r => fmtTs(r.ts) }, { label: 'User', render: r => r.user }, { label: 'Action', render: r => <Badge>{r.action}</Badge> }, { label: 'Item', render: r => r.entity }, { label: 'Detail', render: r => <span className="small">{r.detail}</span> }]} />
        <Pager total={data.total} limit={50} offset={offset} onChange={setOffset} />
      </>}
    </div>
  );
}
