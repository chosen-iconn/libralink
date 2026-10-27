import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { useApp, useApi } from '../store';
import { go } from '../router';
import { Alert, Avatar, Badge, Btn, Card, Confirm, DataTable, Empty, ErrorBox, Field, Input, Loading, Modal, PageHead, Pager, SearchBox, Select } from '../ui';
import { IncidentForm } from '../components/IncidentForm';
import { STATUS_LABEL, fmtDate, fmtDateLong, parseCsv, todayStr } from '../util';

function LearnerForm({ learner, defaultClass, onClose, onSaved }) {
  const { meta, toast } = useApp();
  const [f, setF] = useState({ adm_no: learner?.adm_no || '', name: learner?.name || '', class_id: learner?.class_id || defaultClass || meta.classes[0]?.id });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { const r = learner ? await api.put('/learners/' + learner.id, { adm_no: f.adm_no, name: f.name }) : await api.post('/learners', { ...f, class_id: Number(f.class_id) }); toast('Learner saved.', 'ok'); onSaved(r); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={learner ? 'Edit learner' : 'Add learner'} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} disabled={busy}>Save</Btn></>}>
      <div className="stack">
        {err && <Alert kind="bad">{err}</Alert>}
        <Field label="Admission number"><Input value={f.adm_no} onChange={e => setF({ ...f, adm_no: e.target.value })} /></Field>
        <Field label="Full name"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        {!learner && <Field label="Class"><Select value={f.class_id} onChange={e => setF({ ...f, class_id: e.target.value })}>{meta.classes.filter(c => c.active).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>}
      </div>
    </Modal>
  );
}

export function MoveModal({ learner, onClose, onSaved }) {
  const { meta, toast } = useApp();
  const [to, setTo] = useState(''), [note, setNote] = useState(''), [date, setDate] = useState(todayStr()), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const save = async () => {
    if (!to) return setErr('Choose the new class.');
    setBusy(true);
    try { await api.post(`/learners/${learner.id}/move`, { to_class_id: Number(to), note, date }); toast(`${learner.name} moved.`, 'ok'); onSaved(); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={`Move ${learner.name}`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="swap" onClick={save} disabled={busy}>Move learner</Btn></>}>
      <div className="stack">
        {err && <Alert kind="bad">{err}</Alert>}
        <Alert>Currently in <b>{learner.class_label}</b>. All their book records move with them into the new register.</Alert>
        <Field label="New class"><Select value={to} onChange={e => setTo(e.target.value)}><option value="">Select class…</option>{meta.classes.filter(c => c.active && c.id !== learner.class_id).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
        <div className="grid2"><Field label="Date"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Field label="Note (optional)"><Input value={note} maxLength={200} onChange={e => setNote(e.target.value)} placeholder="e.g. parent request" /></Field></div>
      </div>
    </Modal>
  );
}

function ImportModal({ onClose, onDone }) {
  const { toast } = useApp();
  const [rows, setRows] = useState(null), [upd, setUpd] = useState(true), [res, setRes] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [fname, setFname] = useState('');
  const read = async (file) => {
    setErr(''); setRes(null);
    try {
      const all = parseCsv(await file.text());
      if (all.length < 2) throw new Error('The file has no data rows.');
      const head = all[0].map(h => h.trim().toLowerCase());
      const find = (...keys) => head.findIndex(h => keys.some(k => h.includes(k)));
      const ia = find('adm'), inm = find('name'), ic = find('class', 'code');
      if (ia < 0 || inm < 0 || ic < 0) throw new Error('Column headings needed: Adm No, Name, Class code (e.g. 5E).');
      setRows(all.slice(1).map(r => ({ adm_no: (r[ia] || '').trim(), name: (r[inm] || '').trim(), class_code: (r[ic] || '').trim() }))); setFname(file.name);
    } catch (e) { setErr(e.message); setRows(null); }
  };
  const run = async () => { setBusy(true); try { const r = await api.post('/learners/import', { rows, update_existing: upd }); setRes(r); toast('Import finished.', 'ok'); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  return (
    <Modal wide title="Import learners from CSV" onClose={onClose} footer={<><Btn onClick={onClose}>{res ? 'Close' : 'Cancel'}</Btn>{!res && <Btn kind="primary" icon="upload" disabled={!rows || busy} onClick={run}>{busy ? 'Importing…' : `Import ${rows?.length || ''} rows`}</Btn>}</>}>
      <div className="stack">
        {err && <Alert kind="bad">{err}</Alert>}
        <Alert>Save your list as CSV with three columns: <b>Adm No</b>, <b>Name</b>, <b>Class code</b> (like 5E, 7N). New admission numbers are added; existing ones can be renamed or moved to a different class.</Alert>
        <Field label="CSV file"><Input type="file" accept=".csv,text/csv,.txt" onChange={e => e.target.files[0] && read(e.target.files[0])} /></Field>
        <label className="check"><input type="checkbox" checked={upd} onChange={e => setUpd(e.target.checked)} />Update names and move classes for admission numbers that already exist</label>
        {rows && !res && <div className="small"><b>{fname}</b>: {rows.length} rows. First rows: {rows.slice(0, 3).map(r => `${r.adm_no} ${r.name} (${r.class_code})`).join(' · ')}</div>}
        {res && <div className="stack"><div className="row wrap"><Badge kind="ok">{res.created} added</Badge><Badge>{res.updated} renamed</Badge><Badge kind="gold">{res.moved} moved</Badge><Badge kind="gray">{res.unchanged} unchanged</Badge><Badge kind={res.errors.length ? 'bad' : 'ok'}>{res.errors.length} errors</Badge></div>
          {res.errors.slice(0, 15).map((e, i) => <div key={i} className="small err">Row {e.line} ({e.adm_no || 'no adm'}): {e.error}</div>)}</div>}
      </div>
    </Modal>
  );
}

export function Learners() {
  const { meta, can, toast } = useApp();
  const [q, setQ] = useState(''), [dq, setDq] = useState(''), [cls, setCls] = useState(''), [status, setStatus] = useState('active'), [holding, setHolding] = useState(false), [offset, setOffset] = useState(0);
  const [modal, setModal] = useState(null);
  const limit = 50;
  useEffect(() => { const id = setTimeout(() => { setDq(q); setOffset(0); }, 300); return () => clearTimeout(id); }, [q]);
  const path = `/learners?limit=${limit}&offset=${offset}&q=${encodeURIComponent(dq)}&class_id=${cls}&status=${status}${holding ? '&holding=1' : ''}`;
  const { data, loading, error, reload } = useApi(path);
  const cols = [
    { label: 'Learner', title: true, render: r => <div className="row"><Avatar name={r.name} /><div><b>{r.name}</b><div className="small muted">Adm {r.adm_no}</div></div></div> },
    { label: 'Class', render: r => r.class_label },
    { label: 'Books out', num: true, render: r => r.out ? <Badge kind="warn">{r.out}</Badge> : <span className="muted">0</span> },
    { label: 'Lost / Dmg', num: true, render: r => `${r.lost} / ${r.damaged}` },
    { label: 'Status', render: r => <Badge kind={r.status === 'left' ? 'gray' : 'ok'}>{r.status}</Badge> },
  ];
  return (
    <div className="stack">
      <PageHead title="Learners" sub="The master list. Open a learner to move them to another class.">
        <Btn icon="download" onClick={() => api.download('/export/learners', 'learners.csv').catch(e => toast(e.message, 'bad'))}>Export</Btn>
        {can.staff && <><Btn icon="upload" onClick={() => setModal({ t: 'import' })}>Import</Btn><Btn kind="primary" icon="plus" onClick={() => setModal({ t: 'add' })}>Add learner</Btn></>}
      </PageHead>
      <div className="filters">
        <SearchBox value={q} onChange={setQ} placeholder="Search name or admission no." />
        <Select style={{ width: 'auto' }} value={cls} onChange={e => { setCls(e.target.value); setOffset(0); }} aria-label="Class"><option value="">All classes</option>{meta.classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
        <Select style={{ width: 'auto' }} value={status} onChange={e => { setStatus(e.target.value); setOffset(0); }} aria-label="Status"><option value="active">Active</option><option value="left">Left school</option><option value="">All</option></Select>
        <label className="check"><input type="checkbox" checked={holding} onChange={e => { setHolding(e.target.checked); setOffset(0); }} />Holding books</label>
      </div>
      {loading && !data ? <Loading rows={8} /> : error ? <ErrorBox error={error} retry={reload} /> : <>
        <DataTable columns={cols} rows={data.rows} onRow={r => go('/learner/' + r.id)} empty={<Card><Empty icon="users" title="No learners found">Try a different search or filter.</Empty></Card>} />
        <Pager total={data.total} limit={limit} offset={offset} onChange={setOffset} />
      </>}
      {modal?.t === 'add' && <LearnerForm defaultClass={cls || undefined} onClose={() => setModal(null)} onSaved={reload} />}
      {modal?.t === 'import' && <ImportModal onClose={() => setModal(null)} onDone={reload} />}
    </div>
  );
}

export function LearnerProfile({ id }) {
  const { can, toast } = useApp();
  const { data, loading, error, reload } = useApi('/learners/' + id, [id]);
  const [modal, setModal] = useState(null);
  if (loading) return <Loading rows={6} />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const { learner: l, records, incidents, moves } = data;
  const toggleLeft = async () => { try { await api.put('/learners/' + l.id, { status: l.status === 'left' ? 'active' : 'left' }); toast('Updated.', 'ok'); reload(); } catch (e) { toast(e.message, 'bad'); } };
  const del = async () => { await api.del('/learners/' + l.id); toast('Learner deleted.', 'ok'); go('/learners'); };
  return (
    <div className="stack">
      <PageHead crumbs={[{ label: 'Learners', href: '#/learners' }, { label: l.name }]} title={l.name} sub={`Admission ${l.adm_no} · ${l.class_label}`}>
        <a className="btn" href={'#/class/' + l.class_id}><Icon n="book" size={18} />Register</a>
        {can.staff && <><Btn icon="edit" onClick={() => setModal('edit')}>Edit</Btn><Btn kind="primary" icon="swap" onClick={() => setModal('move')}>Move class</Btn></>}
      </PageHead>
      <div className="kpis">
        <div className="kpi"><div className="l">Status</div><div className="v" style={{ fontSize: '1.2rem' }}>{l.status === 'left' ? 'Left school' : 'Active'}</div></div>
        <div className={'kpi ' + (l.out ? 'warn' : 'ok')}><div className="l">Books out</div><div className="v">{l.out}</div></div>
        <div className="kpi"><div className="l">Lost</div><div className="v">{l.lost}</div></div>
        <div className="kpi"><div className="l">Damaged</div><div className="v">{l.damaged}</div></div>
      </div>
      {l.status === 'left' && l.out > 0 && <Alert kind="warn" icon="alert">This learner has left but still holds {l.out} book(s).</Alert>}
      <Card title="Book record">
        <DataTable rows={records.map(r => ({ ...r, id: r.title_id }))} empty={<Empty title="No books issued yet" />} columns={[
          { label: 'Book', title: true, render: r => <b>{r.title} <span className="muted small">Gr {r.grade}</span></b> },
          { label: 'Issued', render: r => fmtDateLong(r.issued_on) },
          { label: 'Status', render: r => <Badge kind={{ issued: 'warn', collected: 'ok', lost: 'bad', damaged: 'gold' }[r.status]}>{STATUS_LABEL[r.status]}</Badge> },
          { label: 'Returned / reported', render: r => fmtDateLong(r.returned_on) || '—' },
        ]} />
      </Card>
      <div className="cols2">
        <Card title="Lost & damaged cases" action={can.staff && <Btn size="sm" icon="plus" onClick={() => setModal('case')}>Log case</Btn>}>
          {!incidents.length ? <Empty icon="check" title="No cases" /> : incidents.map(i => <div className="hitem" key={i.id} style={{ marginBottom: 8 }}><span className="n">{i.type[0]}</span><div className="grow small"><b>{i.ref} · {i.title}</b><div className="muted">{fmtDateLong(i.reported_on)} · {i.status}</div></div></div>)}
        </Card>
        <Card title="Class history">
          {!moves.length ? <p className="muted small">Never moved. Original class: {l.class_label}.</p> : moves.map(m => <div className="feed" key={m.id}><div><span className="d" /><div className="grow"><b>{m.from_label} → {m.to_label}</b><div className="small muted">{fmtDateLong(m.moved_on)} · by {m.by_user}{m.note ? ` · ${m.note}` : ''}</div></div></div></div>)}
        </Card>
      </div>
      {can.staff && <Card title="Manage"><div className="row wrap"><Btn onClick={toggleLeft}>{l.status === 'left' ? 'Mark as active again' : 'Mark as left school'}</Btn>{can.admin && <Btn kind="danger" icon="trash" onClick={() => setModal('del')}>Delete learner</Btn>}</div><p className="hint" style={{ marginTop: 8 }}>Learners with book records cannot be deleted — mark them as left instead.</p></Card>}
      {modal === 'edit' && <LearnerForm learner={l} onClose={() => setModal(null)} onSaved={reload} />}
      {modal === 'move' && <MoveModal learner={l} onClose={() => setModal(null)} onSaved={reload} />}
      {modal === 'case' && <IncidentForm initial={{ learner_id: l.id, learner_name: l.name, adm_no: l.adm_no, class_label: l.class_label, class_id: l.class_id }} onClose={() => setModal(null)} onSaved={reload} />}
      {modal === 'del' && <Confirm danger title="Delete learner?" message={`Permanently delete ${l.name}? This cannot be undone.`} confirmLabel="Delete" onConfirm={del} onClose={() => setModal(null)} />}
    </div>
  );
}
