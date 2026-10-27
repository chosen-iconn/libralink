import { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../store';
import { Alert, Btn, Field, Input, Modal, Select, Seg, Textarea, SearchBox } from '../ui';
import { todayStr } from '../util';

function LearnerPicker({ value, onPick }) {
  const [q, setQ] = useState(''), [hits, setHits] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const id = setTimeout(() => api.get('/learners?limit=6&q=' + encodeURIComponent(q.trim())).then(r => setHits(r.rows)).catch(() => {}), 250);
    return () => clearTimeout(id);
  }, [q]);
  if (value) return <div className="row"><div className="grow"><b>{value.name}</b><div className="small muted">Adm {value.adm_no} · {value.class_label}</div></div><Btn size="sm" onClick={() => onPick(null)}>Change</Btn></div>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <SearchBox value={q} onChange={setQ} placeholder="Type name or admission no…" />
      {hits.map(h => <button type="button" key={h.id} className="btn block" style={{ justifyContent: 'flex-start' }} onClick={() => onPick(h)}>{h.name} <span className="muted small">· Adm {h.adm_no} · {h.class_label}</span></button>)}
    </div>
  );
}

export function IncidentForm({ initial = {}, incident: incidentProp, onSaved, onClose }) {
  const { meta, can, toast } = useApp();
  const incident = incidentProp || (initial.id ? initial : null);
  const editing = !!incident;
  const src = incident || initial;
  const [f, setF] = useState({
    reported_on: src.reported_on || todayStr(), type: src.type || 'Lost', category: src.category || '', issued_on: src.issued_on || '',
    title_id: src.title_id || '', details: src.details || '', action: src.action || '', status: src.status || 'Under investigation',
    replaced_on: src.replaced_on || '', new_copy_id: src.new_copy_id || '', value: src.value ?? '', reported_by: src.reported_by || '',
  });
  const [learner, setLearner] = useState(src.learner_id ? { id: src.learner_id, name: src.learner_name || src.learner, adm_no: src.adm_no, class_label: src.class_label } : null);
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e.target.value }));
  useEffect(() => { if (initial.learner_id && !learner) api.get('/learners/' + initial.learner_id).then(r => setLearner(r.learner)).catch(() => {}); }, []); // eslint-disable-line
  const byGrade = {};
  meta.titles.forEach(t => (byGrade[t.grade] ||= []).push(t));
  const submit = async () => {
    setErr('');
    if (!learner) return setErr('Choose the learner.');
    if (!f.title_id) return setErr('Choose the book involved.');
    setBusy(true);
    try {
      const body = { ...f, learner_id: learner.id, title_id: Number(f.title_id), value: f.value === '' ? null : Number(f.value), replaced_on: f.status === 'Replaced' ? (f.replaced_on || null) : null, issued_on: f.issued_on || null };
      const r = editing ? await api.put('/incidents/' + incident.id, body) : await api.post('/incidents', body);
      toast(`${r.ref} saved.`, 'ok'); onSaved?.(r); onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={editing ? `Edit ${incident.ref}` : 'Log lost / damaged book'} onClose={onClose} wide
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save case'}</Btn></>}>
      <div className="stack">
        {err && <Alert kind="bad">{err}</Alert>}
        <Field label="Learner"><div><LearnerPicker value={learner} onPick={setLearner} /></div></Field>
        <div className="grid2">
          <Field label="Book"><Select value={f.title_id} onChange={set('title_id')}><option value="">Select book…</option>{Object.entries(byGrade).map(([g, ts]) => <optgroup key={g} label={`Grade ${g}`}>{ts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}</Select></Field>
          <Field label="Type"><div><Seg value={f.type} onChange={v => setF(x => ({ ...x, type: v }))} options={[{ value: 'Lost', label: 'Lost' }, { value: 'Damaged', label: 'Damaged' }]} /></div></Field>
        </div>
        <div className="grid2">
          <Field label="Date reported"><Input type="date" value={f.reported_on} onChange={set('reported_on')} /></Field>
          <Field label="Date issued"><Input type="date" value={f.issued_on} onChange={set('issued_on')} /></Field>
        </div>
        {f.type === 'Damaged' && <Field label="Damage category"><Select value={f.category} onChange={set('category')}><option value="">Select…</option>{meta.lists.damage_categories.map(c => <option key={c}>{c}</option>)}</Select></Field>}
        <Field label="Details"><Textarea value={f.details} onChange={set('details')} maxLength={500} /></Field>
        <div className="grid2">
          <Field label="Action taken"><Input value={f.action} onChange={set('action')} maxLength={300} /></Field>
          <Field label="Reported by"><Input value={f.reported_by} onChange={set('reported_by')} maxLength={80} /></Field>
        </div>
        {can.staff ? (
          <>
            <div className="grid2">
              <Field label="Status"><Select value={f.status} onChange={set('status')}>{meta.lists.statuses.map(s => <option key={s}>{s}</option>)}</Select></Field>
              <Field label={`Value (${meta.settings.currency})`}><Input type="number" min="0" step="0.01" value={f.value} onChange={set('value')} /></Field>
            </div>
            {f.status === 'Replaced' && <div className="grid2"><Field label="Date replaced"><Input type="date" value={f.replaced_on} onChange={set('replaced_on')} /></Field><Field label="New copy ID"><Input value={f.new_copy_id} onChange={set('new_copy_id')} /></Field></div>}
          </>
        ) : <Alert>Status starts as “Under investigation”. The librarian updates it once resolved.</Alert>}
      </div>
    </Modal>
  );
}
export default IncidentForm;
