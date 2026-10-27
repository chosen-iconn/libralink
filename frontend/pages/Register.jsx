import { Fragment, useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { useApp, useApi } from '../store';
import { go } from '../router';
import { Alert, Badge, Btn, Card, Empty, ErrorBox, Field, Input, Loading, Modal, PageHead, Select, Seg, Textarea } from '../ui';
import { IncidentForm } from '../components/IncidentForm';
import { STATUS_LABEL, fmtDate, fmtDateLong, num, pct, todayStr, cx } from '../util';

function RecordEditor({ learner, title, rec, classId, onClose, onSaved, onLog }) {
  const { toast } = useApp();
  const [status, setStatus] = useState(rec?.status || 'issued');
  const [issued, setIssued] = useState(rec?.issued_on || todayStr());
  const [ret, setRet] = useState(rec?.returned_on || todayStr());
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const needsRet = status !== 'issued';
  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await api.put('/records', { learner_id: learner.id, title_id: title.id, issued_on: issued, status, returned_on: needsRet ? ret : null });
      onSaved(); onClose();
      if (status === 'lost' || status === 'damaged') toast(`Marked ${status}.`, 'ok', { label: 'Log case', run: () => onLog(status) });
      else toast('Saved.', 'ok');
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try { await api.post('/records/clear', { learner_id: learner.id, title_id: title.id }); onSaved(); onClose(); toast('Record cleared.', 'ok'); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={title.name} onClose={onClose} footer={<>{rec && <Btn kind="danger" onClick={clear} disabled={busy} icon="trash">Clear</Btn>}<Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Btn></>}>
      <div className="stack">
        <div className="row"><b>{learner.name}</b><span className="muted small">Adm {learner.adm_no} · Gr {title.grade}</span></div>
        {err && <Alert kind="bad">{err}</Alert>}
        <Field label="Date issued"><div className="row"><Input type="date" value={issued} onChange={e => setIssued(e.target.value)} /><Btn size="sm" onClick={() => setIssued(todayStr())}>Today</Btn></div></Field>
        <Field label="Outcome">
          <Seg value={status} onChange={setStatus} options={[{ value: 'issued', label: 'With learner' }, { value: 'collected', label: 'Collected' }, { value: 'lost', label: 'Lost' }, { value: 'damaged', label: 'Damaged' }]} />
        </Field>
        {needsRet && <Field label={status === 'collected' ? 'Date collected' : 'Date reported'}><div className="row"><Input type="date" value={ret} onChange={e => setRet(e.target.value)} /><Btn size="sm" onClick={() => setRet(todayStr())}>Today</Btn></div></Field>}
      </div>
    </Modal>
  );
}

function BulkModal({ data, onClose, onDone }) {
  const { toast } = useApp();
  const [action, setAction] = useState('issue'), [tid, setTid] = useState(data.titles[0]?.id || ''), [date, setDate] = useState(todayStr()), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const run = async () => {
    setBusy(true); setErr('');
    try { const r = await api.post(`/classes/${data.class.id}/bulk`, { action, title_id: Number(tid), date }); toast(`${r.changed} updated${r.skipped ? `, ${r.skipped} skipped` : ''}.`, 'ok'); onDone(); onClose(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title="Bulk issue / collect" onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={busy || !tid} onClick={run}>{action === 'issue' ? 'Issue to class' : 'Collect from class'}</Btn></>}>
      <div className="stack">
        {err && <Alert kind="bad">{err}</Alert>}
        <Seg value={action} onChange={setAction} options={[{ value: 'issue', label: 'Issue to all' }, { value: 'collect', label: 'Collect all' }]} />
        <Field label="Book"><Select value={tid} onChange={e => setTid(e.target.value)}>{data.titles.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Date" hint={action === 'issue' ? 'Learners who already have a record for this book are left untouched.' : 'Only books currently with learners are collected.'}><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

const cellOf = (r) => !r ? { c: 'empty', t: '' } : r.status === 'collected' ? { c: 'col', t: fmtDate(r.returned_on) } : r.status === 'lost' ? { c: 'lost', t: 'LOST' } : r.status === 'damaged' ? { c: 'dmg', t: 'DMG' } : { c: 'out', t: 'OUT' };

export function Register({ id }) {
  const { meta, can, user, toast } = useApp();
  const { data, loading, error, reload } = useApi(`/classes/${id}/register`, [id]);
  const [view, setView] = useState(() => window.innerWidth < 720 ? 'cards' : 'grid');
  const [edit, setEdit] = useState(null), [bulk, setBulk] = useState(false), [incident, setIncident] = useState(null);
  const [open, setOpen] = useState({}), [bt, setBt] = useState(null), [wd, setWd] = useState(todayStr()), [printing, setPrinting] = useState(false), [remarks, setRemarks] = useState(null), [filter, setFilter] = useState('');
  useEffect(() => { const f = () => setPrinting(false); window.addEventListener('afterprint', f); return () => window.removeEventListener('afterprint', f); }, []);
  useEffect(() => { setRemarks(null); setBt(null); }, [id]);
  if (loading) return <Loading rows={8} />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const c = data.class, titles = data.titles, st = data.stats;
  const editable = can.editClass(c.id) && !can.readOnly;
  const v = printing ? 'grid' : view;
  const byId = Object.fromEntries(titles.map(t => [t.id, t]));
  const learners = data.learners.filter(l => !filter || (l.name + l.adm_no).toLowerCase().includes(filter.toLowerCase()));
  const curBt = bt || titles[0]?.id;
  const openEdit = (learner, title) => { if (editable) setEdit({ learner, title, rec: learner.records[title.id] }); };
  const logCase = (learner, title, type) => setIncident({ learner_id: learner.id, learner_name: learner.name, adm_no: learner.adm_no, class_label: c.label, class_id: c.id, title_id: title.id, type: type === 'lost' ? 'Lost' : 'Damaged', issued_on: learner.records[title.id]?.issued_on || '', reported_by: user.name });
  const quick = async (learner, title, action) => {
    const rec = learner.records[title.id];
    try {
      if (action === 'issue') await api.put('/records', { learner_id: learner.id, title_id: title.id, issued_on: wd, status: 'issued' });
      else await api.put('/records', { learner_id: learner.id, title_id: title.id, issued_on: rec.issued_on, status: action, returned_on: wd });
      await reload();
      if (action === 'lost' || action === 'damaged') toast(`${learner.name}: marked ${action}.`, 'ok', { label: 'Log case', run: () => logCase(learner, title, action) });
    } catch (e) { toast(e.message, 'bad'); }
  };
  const saveRemarks = async () => { if (remarks == null) return; try { await api.put(`/classes/${c.id}/remarks`, { text: remarks }); toast('Remarks saved.', 'ok'); } catch (e) { toast(e.message, 'bad'); } };
  const print = () => { setPrinting(true); setTimeout(() => window.print(), 250); };
  const s = meta.settings;

  const grid = (
    <div className="regwrap">
      <table className="reg">
        <thead>
          <tr><th className="c0" rowSpan="2">#</th><th className="c1" rowSpan="2" style={{ textAlign: 'left' }}>LEARNER'S NAME</th><th className="c2" rowSpan="2">ADM</th><th className="c3" rowSpan="2">OUT</th>{titles.map(t => <th key={t.id} colSpan="2" title={`${t.name} (Gr ${t.grade})`}>{t.name}</th>)}</tr>
          <tr>{titles.map(t => <Fragment key={t.id}><th>ISSUED</th><th>COLLECTED</th></Fragment>)}</tr>
        </thead>
        <tbody>
          {learners.map((l, i) => (
            <tr key={l.id}>
              <td className="c0">{i + 1}</td>
              <td className="c1"><a href={'#/learner/' + l.id} style={{ color: 'inherit' }} title={l.carry.length ? 'Also holds: ' + l.carry.map(x => x.title).join(', ') : l.name}>{l.name}</a>{l.carry.length > 0 && <Badge kind="warn"> +{l.carry.length}</Badge>}</td>
              <td className="c2">{l.adm_no}</td>
              <td className={cx('c3', l.out ? 'outN' : 'out0')}>{l.out || '✔'}</td>
              {titles.map(t => { const r = l.records[t.id], x = cellOf(r); return <Fragment key={t.id}>
                <td className={cx('cell', r ? '' : 'empty', !editable && 'ro')} onClick={() => openEdit(l, t)}>{r ? fmtDate(r.issued_on) : (editable ? '＋' : '')}</td>
                <td className={cx('cell', r ? x.c : 'empty', !editable && 'ro')} onClick={() => openEdit(l, t)}>{r ? x.t : ''}</td>
              </Fragment>; })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {[['ISSUED', 'issued'], ['COLLECTED', 'collected'], ['LOST', 'lost'], ['DAMAGED', 'damaged'], ['OUTSTANDING', 'out']].map(([lab, k]) => (
            <tr key={k}><td colSpan="4" className="lab">{lab}</td>{titles.map(t => <td key={t.id} colSpan="2" style={k === 'out' && data.totals[t.id].out ? { color: 'var(--bad)' } : undefined}>{data.totals[t.id][k]}</td>)}</tr>
          ))}
        </tfoot>
      </table>
    </div>
  );

  const cards = (
    <div className="lcards">
      {learners.map(l => (
        <div className="lcard" key={l.id}>
          <button onClick={() => setOpen(o => ({ ...o, [l.id]: !o[l.id] }))} aria-expanded={!!open[l.id]}>
            <span className="avatar">{l.name.split(' ').slice(0, 2).map(w => w[0]).join('')}</span>
            <span className="grow"><b>{l.name}</b><br /><span className="small muted">Adm {l.adm_no}{l.carry.length ? ` · +${l.carry.length} other book(s)` : ''}</span></span>
            <Badge kind={l.out ? 'warn' : 'ok'}>{l.out ? `${l.out} out` : '✔ clear'}</Badge><Icon n={open[l.id] ? 'chevD' : 'chevR'} size={18} />
          </button>
          {open[l.id] && <div className="bk">{titles.map(t => { const r = l.records[t.id], x = cellOf(r); return (
            <button key={t.id} className={cx('chip', r ? x.c : 'empty')} onClick={() => openEdit(l, t)}><b title={t.name}>{t.name}</b><span>{r ? `${fmtDate(r.issued_on)} → ${x.t === 'OUT' ? 'out' : x.t}` : editable ? '＋ Issue' : '—'}</span></button>
          ); })}</div>}
        </div>
      ))}
    </div>
  );

  const bookT = byId[curBt];
  const byBook = bookT && (
    <Card>
      <div className="grid2 noprint" style={{ marginBottom: 12 }}>
        <Field label="Book"><Select value={curBt} onChange={e => setBt(Number(e.target.value))}>{titles.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
        <Field label="Working date" hint="Used by the quick buttons below."><Input type="date" value={wd} onChange={e => setWd(e.target.value)} /></Field>
      </div>
      <div className="row wrap small" style={{ marginBottom: 6 }}><Badge>Issued {data.totals[curBt].issued}</Badge><Badge kind="ok">Collected {data.totals[curBt].collected}</Badge><Badge kind="warn">Out {data.totals[curBt].out}</Badge><Badge kind="bad">Lost {data.totals[curBt].lost}</Badge><Badge kind="gold">Dmg {data.totals[curBt].damaged}</Badge></div>
      {learners.map(l => { const r = l.records[curBt], x = cellOf(r); return (
        <div className="bybook" key={l.id}>
          <div className="grow" style={{ minWidth: 150 }}><b>{l.name}</b><div className="small muted">Adm {l.adm_no}</div></div>
          <Badge kind={!r ? 'gray' : x.c === 'col' ? 'ok' : x.c === 'lost' ? 'bad' : x.c === 'dmg' ? 'gold' : 'warn'}>{!r ? 'Not issued' : `${STATUS_LABEL[r.status]} · ${fmtDate(r.issued_on)}`}</Badge>
          {editable && <div className="qa">
            {!r && <Btn kind="primary" size="sm" onClick={() => quick(l, bookT, 'issue')}>Issue</Btn>}
            {r?.status === 'issued' && <><Btn kind="primary" size="sm" onClick={() => quick(l, bookT, 'collected')}>Collect</Btn><Btn size="sm" kind="danger" onClick={() => quick(l, bookT, 'lost')}>Lost</Btn><Btn size="sm" onClick={() => quick(l, bookT, 'damaged')}>Dmg</Btn></>}
            {r && <Btn size="sm" icon="edit" onClick={() => openEdit(l, bookT)} aria-label="Edit record" />}
          </div>}
        </div>
      ); })}
    </Card>
  );

  return (
    <div className="stack">
      <PageHead crumbs={[{ label: 'Class registers', href: '#/classes' }, { label: c.label }]} title={`${c.label} register`} sub={`${c.teacher || 'No class teacher set'} · ${s.term} ${s.academic_year} · ${data.learners.length} learners · ${titles.length} titles`}>
        <Btn icon="download" onClick={() => api.download(`/export/register?class_id=${c.id}`, `register-${c.code}.csv`).catch(e => toast(e.message, 'bad'))}>CSV</Btn>
        <Btn icon="print" onClick={print}>Print</Btn>
        {editable && <Btn kind="primary" icon="zap" onClick={() => setBulk(true)}>Bulk</Btn>}
      </PageHead>
      {!editable && <Alert icon="lock">{can.readOnly ? 'Head teacher accounts are read-only.' : 'You can view this register but only edit your own class.'}</Alert>}
      <div className="printonly" style={{ textAlign: 'center' }}><h2>{s.school_name}</h2><b>{c.label.toUpperCase()} — TEXTBOOK ISSUANCE &amp; COLLECTION REGISTER</b><div>{c.teacher} · {s.term} {s.academic_year}</div></div>
      <div className="kpis noprint">
        <div className="kpi"><div className="l">Learners</div><div className="v">{st.learners}</div></div>
        <div className="kpi"><div className="l">Expected</div><div className="v">{num(st.expected)}</div></div>
        <div className="kpi"><div className="l">Issued</div><div className="v">{num(st.issued)}</div></div>
        <div className="kpi"><div className="l">Collected</div><div className="v">{num(st.collected)}</div></div>
        <div className={'kpi ' + (st.out ? 'warn' : 'ok')}><div className="l">Outstanding</div><div className="v">{num(st.out)}</div></div>
        <div className="kpi"><div className="l">Lost / Dmg</div><div className="v">{st.lost} / {st.damaged}</div></div>
        <div className="kpi"><div className="l">Coverage</div><div className="v">{pct(st.coverage)}</div></div>
      </div>
      {st.check !== 'matches' && st.check !== 'No roll entered' && <Alert kind="warn" icon="alert">Lost/damaged copies in the register ({st.lost + st.damaged}) don't match cases logged ({st.incidents}). <a href="#/incidents">Open the incident log</a>.</Alert>}
      {!data.learners.length ? <Card><Empty icon="users" title="No learners in this class yet">Add learners or move them here from the <a href="#/learners">Learners</a> page.</Empty></Card> : !titles.length ? <Card><Empty icon="book" title="No books assigned to this class">{can.staff ? <a href="#/books">Assign titles</a> : 'Ask the librarian to assign titles.'}</Empty></Card> : <>
        <div className="row wrap noprint"><Seg value={view} onChange={setView} options={[{ value: 'grid', label: 'Register' }, { value: 'cards', label: 'Learners' }, { value: 'book', label: 'By book' }]} />
          <div style={{ flex: 1, minWidth: 180, maxWidth: 320 }} className="searchbox"><Icon n="search" size={18} className="ico" /><input className="input sm" style={{ paddingLeft: 36 }} placeholder="Filter learners" value={filter} onChange={e => setFilter(e.target.value)} aria-label="Filter learners" /></div>
          <span className="small muted">{v === 'grid' && editable ? 'Tap any cell to issue, collect or mark lost.' : ''}</span></div>
        {v === 'grid' ? grid : v === 'cards' ? cards : byBook}
        {learners.length === 0 && <Empty title="No learners match" />}
      </>}
      <Card title="Report / remarks" className="noprint-card">
        {editable ? <><Textarea value={remarks ?? data.remarks} onChange={e => setRemarks(e.target.value)} onBlur={saveRemarks} placeholder="Notes for this class (saved when you leave the box)" maxLength={1000} /></> : <p>{data.remarks || <span className="muted">No remarks.</span>}</p>}
        <div className="sign printonly-sign"><div>Class teacher: {c.teacher}</div><div>Librarian: {s.librarian}</div><div>Head teacher: {s.head_teacher}</div></div>
      </Card>
      {edit && <RecordEditor {...edit} classId={c.id} onClose={() => setEdit(null)} onSaved={reload} onLog={(t) => logCase(edit.learner, edit.title, t)} />}
      {bulk && <BulkModal data={data} onClose={() => setBulk(false)} onDone={reload} />}
      {incident && <IncidentForm initial={incident} onClose={() => setIncident(null)} onSaved={reload} />}
    </div>
  );
}
