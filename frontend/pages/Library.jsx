import { useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { useApp, useApi } from '../store';
import { Alert, Badge, Btn, Card, Confirm, DataTable, Empty, ErrorBox, Field, Input, Loading, Modal, PageHead, SearchBox, Select, Seg } from '../ui';
import { IncidentForm } from '../components/IncidentForm';
import { fmtDateLong, money, num } from '../util';

// ---------------- STOCK ----------------
function NumCell({ value, field, id, canEdit, onSaved, nullable }) {
  const { toast } = useApp();
  const [v, setV] = useState(value ?? '');
  useEffect(() => setV(value ?? ''), [value]);
  if (!canEdit) return <span>{value ?? '—'}</span>;
  const commit = async () => {
    if (String(v) === String(value ?? '')) return;
    try { const r = await api.put('/stock/' + id, { [field]: v === '' ? (nullable ? null : 0) : Number(v) }); onSaved(r); }
    catch (e) { toast(e.message, 'bad'); setV(value ?? ''); }
  };
  return <input className="input sm" style={{ width: 74, textAlign: 'right' }} type="number" min="0" inputMode="numeric" value={v} onChange={e => setV(e.target.value)} onBlur={commit} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()} aria-label={field} />;
}
const SBADGE = { Reconciled: 'ok', Shortfall: 'bad', Surplus: 'warn', 'No count': 'gray', 'Enter stock': 'gray' };

export function Stock() {
  const { can, toast } = useApp();
  const { data, loading, error, reload, setData } = useApi('/stock');
  const [q, setQ] = useState(''), [grade, setGrade] = useState(''), [status, setStatus] = useState('');
  if (loading) return <Loading rows={8} />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const t = data.totals;
  const rows = data.rows.filter(r => (!grade || r.grade === Number(grade)) && (!status || r.status === status) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));
  const saved = (row) => { setData({ ...data, rows: data.rows.map(r => r.id === row.id ? row : r) }); reload(); };
  const cell = (r, field, nullable) => <NumCell value={r[field]} field={field} id={r.id} canEdit={can.staff} onSaved={saved} nullable={nullable} />;
  const cols = [
    { label: 'Title', title: true, render: r => <div><b>{r.name}</b> <span className="muted small">Gr {r.grade}</span></div> },
    { label: 'Opening', num: true, render: r => cell(r, 'opening') },
    { label: 'Purchased', num: true, render: r => cell(r, 'purchased') },
    { label: 'Replaced', num: true, render: r => r.replacements },
    { label: 'Total', num: true, render: r => <b>{r.total}</b> },
    { label: 'Issued', num: true, render: r => r.issued },
    { label: 'Collected', num: true, render: r => r.collected },
    { label: 'With learners', num: true, render: r => r.with_learners },
    { label: 'Lost', num: true, render: r => r.lost },
    { label: 'Damaged', num: true, render: r => r.damaged },
    { label: 'Withdrawn', num: true, render: r => cell(r, 'withdrawn') },
    { label: 'Expected', num: true, render: r => <b>{r.expected}</b> },
    { label: 'Count', num: true, render: r => cell(r, 'physical', true) },
    { label: 'Variance', num: true, render: r => r.variance == null ? '—' : <b style={{ color: r.variance < 0 ? 'var(--bad)' : r.variance > 0 ? 'var(--warn)' : 'var(--ok)' }}>{r.variance > 0 ? '+' : ''}{r.variance}</b> },
    { label: 'Status', render: r => <Badge kind={SBADGE[r.status]}>{r.status}</Badge> },
  ];
  return (
    <div className="stack">
      <PageHead title="Stock reconciliation" sub="Issued, collected and lost copies flow in from the registers. Enter opening stock, purchases, withdrawals and your physical count."><Btn icon="download" onClick={() => api.download('/export/stock', 'stock.csv').catch(e => toast(e.message, 'bad'))}>CSV</Btn></PageHead>
      <div className="kpis">
        <div className="kpi"><div className="l">Titles</div><div className="v">{t.titles}</div></div>
        <div className="kpi"><div className="l">Total copies</div><div className="v">{num(t.total)}</div></div>
        <div className="kpi"><div className="l">With learners</div><div className="v">{num(t.with_learners)}</div></div>
        <div className="kpi"><div className="l">Lost</div><div className="v">{num(t.lost)}</div></div>
        <div className="kpi"><div className="l">Expected in library</div><div className="v">{num(t.expected)}</div></div>
        <div className={'kpi ' + (t.unreconciled ? 'warn' : 'ok')}><div className="l">Not reconciled</div><div className="v">{t.unreconciled}</div></div>
      </div>
      {!can.staff && <Alert icon="lock">Only the administrator or librarian can change stock figures.</Alert>}
      <div className="filters"><SearchBox value={q} onChange={setQ} placeholder="Search title" />
        <Select style={{ width: 'auto' }} value={grade} onChange={e => setGrade(e.target.value)} aria-label="Grade"><option value="">All grades</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => <option key={g} value={g}>Grade {g}</option>)}</Select>
        <Select style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value)} aria-label="Status"><option value="">All statuses</option>{Object.keys(SBADGE).map(s => <option key={s}>{s}</option>)}</Select></div>
      <DataTable columns={cols} rows={rows} empty={<Card><Empty icon="box" title="No titles match" /></Card>} />
      <p className="hint">Total = opening + purchased + replacements. Expected in library = total − with learners − lost − withdrawn. Variance = physical count − expected.</p>
    </div>
  );
}

// ---------------- INCIDENTS ----------------
export function Incidents() {
  const { meta, can, toast } = useApp();
  const [state, setState] = useState('open'), [type, setType] = useState(''), [cls, setCls] = useState(''), [q, setQ] = useState(''), [dq, setDq] = useState('');
  const [form, setForm] = useState(null), [del, setDel] = useState(null);
  useEffect(() => { const id = setTimeout(() => setDq(q), 300); return () => clearTimeout(id); }, [q]);
  const { data, loading, error, reload } = useApi(`/incidents?state=${state === 'all' ? '' : state}&type=${type}&class_id=${cls}&q=${encodeURIComponent(dq)}`);
  const cur = meta.settings.currency;
  const cols = [
    { label: 'Ref', title: true, render: r => <div><b>{r.ref}</b> <Badge kind={r.type === 'Lost' ? 'bad' : 'gold'}>{r.type}</Badge></div> },
    { label: 'Learner', render: r => r.learner_name ? <a href={'#/learner/' + r.learner_id} onClick={e => e.stopPropagation()}>{r.learner_name}</a> : '—' },
    { label: 'Class', render: r => r.class_label || '—' },
    { label: 'Book', render: r => r.title_name ? `${r.title_name} (Gr ${r.title_grade})` : '—' },
    { label: 'Reported', render: r => fmtDateLong(r.reported_on) },
    { label: 'Status', render: r => <Badge kind={r.resolution === 'Closed' ? 'ok' : 'warn'}>{r.status}</Badge> },
    { label: 'Value', num: true, render: r => r.value != null ? money(r.value, cur) : '—' },
    ...(can.admin ? [{ label: '', render: r => <Btn size="sm" kind="danger" icon="trash" aria-label="Delete case" onClick={(e) => { e.stopPropagation(); setDel(r); }} /> }] : []),
  ];
  return (
    <div className="stack">
      <PageHead title="Lost & damaged books" sub="Track every case from report to replacement."><Btn icon="download" onClick={() => api.download('/export/incidents', 'incidents.csv').catch(e => toast(e.message, 'bad'))}>CSV</Btn>{!can.readOnly && <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Log case</Btn>}</PageHead>
      <div className="filters">
        <Seg value={state} onChange={setState} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'all', label: 'All' }]} />
        <SearchBox value={q} onChange={setQ} placeholder="Learner, adm no. or book" />
        <Select style={{ width: 'auto' }} value={type} onChange={e => setType(e.target.value)} aria-label="Type"><option value="">Lost &amp; damaged</option><option>Lost</option><option>Damaged</option></Select>
        <Select style={{ width: 'auto' }} value={cls} onChange={e => setCls(e.target.value)} aria-label="Class"><option value="">All classes</option>{meta.classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
      </div>
      {loading && !data ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <>
        <div className="row wrap"><Badge>{data.totals.all} shown</Badge><Badge kind="warn">{data.totals.open} open</Badge><Badge kind="ok">{data.totals.closed} closed</Badge><Badge kind="gold">Value {money(data.totals.value, cur)}</Badge></div>
        <DataTable columns={cols} rows={data.rows} onRow={r => can.staff && setForm(r)} empty={<Card><Empty icon="check" title="No cases here">Cases are logged from a register when a book is marked lost or damaged, or with “Log case”.</Empty></Card>} />
      </>}
      {form && <IncidentForm initial={form} onClose={() => setForm(null)} onSaved={reload} />}
      {del && <Confirm danger message={`Delete ${del.ref}?`} confirmLabel="Delete" onConfirm={async () => { await api.del('/incidents/' + del.id); toast('Case deleted.', 'ok'); reload(); }} onClose={() => setDel(null)} />}
    </div>
  );
}

// ---------------- BOOKS ----------------
function TitleForm({ title, onClose, onSaved }) {
  const { meta, toast, loadMeta } = useApp();
  const [f, setF] = useState({ name: title?.name || '', grade: title?.grade || 1, publisher: title?.publisher || '', code: title?.code || '', class_ids: [] });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { title ? await api.put('/titles/' + title.id, f) : await api.post('/titles', { ...f, grade: Number(f.grade) }); await loadMeta(); toast('Title saved.', 'ok'); onSaved(); onClose(); } catch (e) { setErr(e.message); setBusy(false); }
  };
  const sameGrade = meta.classes.filter(c => c.grade === Number(f.grade));
  return (
    <Modal title={title ? 'Edit title' : 'Add book title'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={save}>Save</Btn></>}>
      <div className="stack">
        {err && <Alert kind="bad">{err}</Alert>}
        <Field label="Title"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. SPOTLIGHT MATHS" /></Field>
        <div className="grid2"><Field label="Grade"><Select value={f.grade} onChange={e => setF({ ...f, grade: e.target.value })}>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => <option key={g} value={g}>Grade {g}</option>)}</Select></Field><Field label="Publisher"><Input value={f.publisher} onChange={e => setF({ ...f, publisher: e.target.value })} /></Field></div>
        <Field label="Book code / ISBN"><Input value={f.code} onChange={e => setF({ ...f, code: e.target.value })} /></Field>
        {!title && <Field label="Add to these class registers" hint="You can change this later under Class assignments."><div className="row wrap">{sameGrade.map(c => <label className="check" key={c.id}><input type="checkbox" checked={f.class_ids.includes(c.id)} onChange={e => setF({ ...f, class_ids: e.target.checked ? [...f.class_ids, c.id] : f.class_ids.filter(x => x !== c.id) })} />{c.label}</label>)}</div></Field>}
      </div>
    </Modal>
  );
}

function Assignments({ initialClass }) {
  const { meta, toast, loadMeta } = useApp();
  const [cid, setCid] = useState(initialClass || meta.classes[0]?.id);
  const cls = meta.classById[cid];
  const [ids, setIds] = useState(meta.classTitles[cid] || []);
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  useEffect(() => { setIds(meta.classTitles[cid] || []); setErr(''); }, [cid, meta]);
  const move = (i, d) => { const a = [...ids]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; setIds(a); };
  const save = async () => { setBusy(true); setErr(''); try { await api.put(`/classes/${cid}/titles`, { title_ids: ids }); await loadMeta(); toast('Class books updated.', 'ok'); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const avail = meta.titles.filter(t => !ids.includes(t.id) && (t.grade === cls?.grade || t.grade === cls?.grade - 1 || t.grade === cls?.grade + 1));
  return (
    <div className="stack">
      <Field label="Class"><Select value={cid} onChange={e => setCid(Number(e.target.value))}>{meta.classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      {err && <Alert kind="bad">{err}</Alert>}
      <div className="cols2">
        <Card title={`In the ${cls?.label} register (${ids.length})`}>
          {!ids.length && <Empty title="No books assigned" />}
          {ids.map((id, i) => { const t = meta.titleById[id]; return <div className="bybook" key={id}><span className="muted small">{i + 1}</span><div className="grow"><b>{t.name}</b> <span className="muted small">Gr {t.grade}</span></div><Btn size="sm" aria-label="Move up" icon="chevL" style={{ transform: 'rotate(90deg)' }} onClick={() => move(i, -1)} /><Btn size="sm" aria-label="Move down" icon="chevR" style={{ transform: 'rotate(90deg)' }} onClick={() => move(i, 1)} /><Btn size="sm" kind="danger" aria-label="Remove" icon="x" onClick={() => setIds(ids.filter(x => x !== id))} /></div>; })}
        </Card>
        <Card title="Available titles">
          {!avail.length && <Empty title="All nearby titles are assigned" />}
          {avail.map(t => <div className="bybook" key={t.id}><div className="grow"><b>{t.name}</b> <span className="muted small">Gr {t.grade}</span></div><Btn size="sm" icon="plus" onClick={() => setIds([...ids, t.id])}>Add</Btn></div>)}
        </Card>
      </div>
      <div className="row"><Btn kind="primary" disabled={busy} onClick={save} icon="check">Save class books</Btn><Btn onClick={() => setIds(meta.classTitles[cid] || [])}>Reset</Btn></div>
    </div>
  );
}

export function Books({ query }) {
  const { can, loadMeta, toast } = useApp();
  const [tab, setTab] = useState(query.class ? 'assign' : 'catalogue');
  const { data, loading, error, reload } = useApi('/titles');
  const [form, setForm] = useState(null), [del, setDel] = useState(null), [q, setQ] = useState(''), [grade, setGrade] = useState('');
  const rows = (data || []).filter(t => (!grade || t.grade === Number(grade)) && (!q || (t.name + t.publisher + t.code).toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="stack">
      <PageHead title="Book titles" sub="The catalogue of titles, and which books each class register carries.">{can.staff && <Btn kind="primary" icon="plus" onClick={() => setForm({})}>Add title</Btn>}</PageHead>
      <Seg value={tab} onChange={setTab} options={[{ value: 'catalogue', label: 'Catalogue' }, { value: 'assign', label: 'Class assignments' }]} />
      {tab === 'assign' ? (can.staff ? <Assignments initialClass={query.class ? Number(query.class) : undefined} /> : <Alert icon="lock">Only the administrator or librarian can change class books.</Alert>) : <>
        <div className="filters"><SearchBox value={q} onChange={setQ} placeholder="Search title, publisher or code" /><Select style={{ width: 'auto' }} value={grade} onChange={e => setGrade(e.target.value)} aria-label="Grade"><option value="">All grades</option>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map(g => <option key={g} value={g}>Grade {g}</option>)}</Select></div>
        {loading ? <Loading /> : error ? <ErrorBox error={error} retry={reload} /> : <DataTable rows={rows} onRow={r => can.staff && setForm(r)} columns={[
          { label: 'Title', title: true, render: r => <b>{r.name}</b> }, { label: 'Grade', num: true, render: r => r.grade }, { label: 'Publisher', render: r => r.publisher || '—' }, { label: 'Code', render: r => r.code || '—' },
          { label: 'Classes', num: true, render: r => r.classes }, { label: 'Records', num: true, render: r => r.records },
          ...(can.staff ? [{ label: '', render: r => <Btn size="sm" kind="danger" icon="trash" aria-label="Delete title" onClick={e => { e.stopPropagation(); setDel(r); }} /> }] : [])]} />}
      </>}
      {form && <TitleForm title={form.id ? form : null} onClose={() => setForm(null)} onSaved={reload} />}
      {del && <Confirm danger message={`Delete ${del.name} (Gr ${del.grade})? It must not be used in any register.`} confirmLabel="Delete" onConfirm={async () => { try { await api.del('/titles/' + del.id); await loadMeta(); reload(); toast('Title deleted.', 'ok'); } catch (e) { toast(e.message, 'bad'); } }} onClose={() => setDel(null)} />}
    </div>
  );
}
