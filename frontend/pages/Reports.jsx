import { useState } from 'react';
import { api } from '../api';
import { Icon } from '../icons';
import { useApp, useApi } from '../store';
import { Alert, Badge, BarChart, Btn, Card, Confirm, DataTable, Empty, ErrorBox, Field, Input, Loading, Modal, PageHead, Progress, Select } from '../ui';
import { fmtDateLong, fmtTs, num, pct } from '../util';

const dl = (toast, path, name) => api.download(path, name).catch(e => toast(e.message, 'bad'));

export function Summary() {
  const { toast, meta } = useApp();
  const { data, loading, error, reload } = useApi('/summary');
  if (loading) return <Loading rows={8} />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const t = data.school;
  const cols = [
    { label: 'Class', title: true, render: r => <a href={'#/class/' + r.id}><b>{r.label}</b></a> },
    { label: 'Teacher', render: r => r.teacher || '—' },
    { label: 'Learners', num: true, render: r => r.learners },
    { label: 'Titles', num: true, render: r => r.titles },
    { label: 'Expected', num: true, render: r => num(r.expected) },
    { label: 'Issued', num: true, render: r => num(r.issued) },
    { label: 'Collected', num: true, render: r => num(r.collected) },
    { label: 'Out', num: true, render: r => r.out ? <b style={{ color: 'var(--bad)' }}>{r.out}</b> : 0 },
    { label: 'Lost', num: true, render: r => r.lost },
    { label: 'Dmg', num: true, render: r => r.damaged },
    { label: 'Coverage', render: r => r.coverage == null ? '—' : <div style={{ minWidth: 90 }}><span className="small">{pct(r.coverage)}</span><Progress value={r.coverage} kind={r.coverage >= 0.95 ? 'ok' : undefined} /></div> },
    { label: 'Check', render: r => r.check === 'matches' ? <Badge kind="ok">✔ matches</Badge> : r.check === 'No roll entered' ? <Badge kind="gray">no roll</Badge> : <Badge kind="warn">⚠ {r.check}</Badge> },
  ];
  return (
    <div className="stack">
      <PageHead title="Executive summary" sub={`${meta.settings.school_name} · ${meta.settings.term} ${meta.settings.academic_year}`}>
        <Btn icon="download" onClick={() => dl(toast, '/export/summary', 'summary.csv')}>CSV</Btn><Btn icon="print" onClick={() => window.print()}>Print</Btn>
      </PageHead>
      <div className="kpis">
        <div className="kpi dark"><div className="l">Learners</div><div className="v">{num(t.learners)}</div></div>
        <div className="kpi"><div className="l">Issued</div><div className="v">{num(t.issued)}</div><div className="c">of {num(t.expected)}</div></div>
        <div className="kpi"><div className="l">Collected</div><div className="v">{num(t.collected)}</div></div>
        <div className="kpi warn"><div className="l">Outstanding</div><div className="v">{num(t.out)}</div></div>
        <div className="kpi"><div className="l">Lost / Dmg</div><div className="v">{t.lost} / {t.damaged}</div></div>
        <div className="kpi"><div className="l">Coverage</div><div className="v">{pct(t.coverage, 1)}</div></div>
      </div>
      <DataTable columns={cols} rows={data.classes} footer={['WHOLE SCHOOL', '', t.learners, '', num(t.expected), num(t.issued), num(t.collected), t.out, t.lost, t.damaged, pct(t.coverage, 1), '']} />
      <div className="cols2">
        <Card title="By grade">
          <DataTable columns={[{ label: 'Grade', title: true, render: r => <b>Grade {r.grade}</b> }, { label: 'Learners', num: true, render: r => r.learners }, { label: 'Issued', num: true, render: r => r.issued }, { label: 'Collected', num: true, render: r => r.collected }, { label: 'Out', num: true, render: r => r.out }, { label: 'Lost', num: true, render: r => r.lost }, { label: 'Dmg', num: true, render: r => r.damaged }, { label: 'Coverage', num: true, render: r => pct(r.coverage) }]} rows={data.grades.map(g => ({ ...g, id: g.grade }))} />
        </Card>
        <Card title="Issued · collected · outstanding">
          <BarChart data={data.grades.map(g => ({ label: 'Gr ' + g.grade, issued: g.issued, collected: g.collected, out: g.out }))} series={[{ key: 'issued', label: 'Issued', color: '#2F7BEA' }, { key: 'collected', label: 'Collected', color: '#17936A' }, { key: 'out', label: 'Outstanding', color: '#E3B24B' }]} />
        </Card>
      </div>
      <Card title="Data integrity">
        <div className="health">{data.checks.map(c => <a key={c.key} className={`hitem ${c.level}`} href={c.link}><span className="n">{c.count}</span><span className="grow small"><b>{c.label}</b></span></a>)}</div>
      </Card>
    </div>
  );
}

function SnapshotView({ id, onClose }) {
  const { data, loading } = useApi('/snapshots/' + id);
  return (
    <Modal wide title={data ? `Snapshot · ${data.label}` : 'Snapshot'} onClose={onClose}>
      {loading ? <Loading /> : <div className="stack">
        <p className="small muted">Taken {fmtTs(data.created_at)} by {data.created_by} · {data.data.settings.term} {data.data.settings.academic_year}</p>
        <div className="row wrap"><Badge>Learners {data.data.school.learners}</Badge><Badge>Issued {data.data.school.issued}</Badge><Badge kind="ok">Collected {data.data.school.collected}</Badge><Badge kind="warn">Out {data.data.school.out}</Badge><Badge kind="bad">Lost {data.data.school.lost}</Badge><Badge kind="gold">Dmg {data.data.school.damaged}</Badge><Badge>Coverage {pct(data.data.school.coverage, 1)}</Badge></div>
        <DataTable rows={data.data.classes} columns={[{ label: 'Class', title: true, render: r => <b>{r.label}</b> }, { label: 'Learners', num: true, render: r => r.learners }, { label: 'Issued', num: true, render: r => r.issued }, { label: 'Out', num: true, render: r => r.out }, { label: 'Lost', num: true, render: r => r.lost }, { label: 'Dmg', num: true, render: r => r.damaged }]} />
      </div>}
    </Modal>
  );
}

export function Reports() {
  const { meta, toast, can } = useApp();
  const [cls, setCls] = useState('');
  const out = useApi('/reports/outstanding' + (cls ? '?class_id=' + cls : ''));
  const snaps = useApi('/snapshots');
  const [label, setLabel] = useState(''), [view, setView] = useState(null), [del, setDel] = useState(null);
  const snap = async () => { try { await api.post('/snapshots', { label: label.trim() }); setLabel(''); toast('Snapshot saved.', 'ok'); snaps.reload(); } catch (e) { toast(e.message, 'bad'); } };
  const exportsList = [['summary', 'Executive summary', 'chart'], ['stock', 'Stock reconciliation', 'box'], ['incidents', 'Lost & damaged log', 'alert'], ['learners', 'Learner master list', 'users'], ['outstanding', 'Outstanding books', 'book']];
  return (
    <div className="stack">
      <PageHead title="Reports & exports" sub="Printable lists, spreadsheet exports and term snapshots." />
      <Card title="Downloads (CSV, opens in Excel)"><div className="quick">{exportsList.map(([k, l, ic]) => <button key={k} className="qbtn" onClick={() => dl(toast, '/export/' + k, k + '.csv')}><Icon n={ic} />{l}</button>)}</div></Card>
      <Card title="Outstanding books" action={<div className="row wrap noprint" style={{ justifyContent: 'flex-end' }}><Select style={{ width: 'auto', maxWidth: '100%' }} value={cls} onChange={e => setCls(e.target.value)} aria-label="Class"><option value="">Whole school</option>{meta.classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</Select><Btn size="sm" icon="print" onClick={() => window.print()}>Print</Btn></div>}>
        {out.loading ? <Loading /> : out.error ? <ErrorBox error={out.error} /> : <>
          <p className="small muted" style={{ marginBottom: 10 }}>{out.data.books} book(s) held by {out.data.learners} learner(s).</p>
          <DataTable rows={out.data.rows.map((r, i) => ({ ...r, id: i }))} empty={<Empty icon="check" title="Nothing outstanding" />} columns={[
            { label: 'Learner', title: true, render: r => <a href={'#/learner/' + r.learner_id}><b>{r.name}</b></a> }, { label: 'Adm', render: r => r.adm_no }, { label: 'Class', render: r => r.class_label },
            { label: 'Book', render: r => `${r.title} (Gr ${r.title_grade})` }, { label: 'Issued', render: r => fmtDateLong(r.issued_on) }, { label: 'Days', num: true, render: r => r.days },
            { label: 'Status', render: r => r.learner_status === 'left' ? <Badge kind="bad">left school</Badge> : <Badge kind="warn">with learner</Badge> }]} />
        </>}
      </Card>
      <Card title="Snapshots">
        <p className="small muted" style={{ marginBottom: 10 }}>Freeze today's summary and stock figures — handy at the end of each term.</p>
        {!can.readOnly || true ? <div className="row wrap noprint" style={{ marginBottom: 12 }}><Input style={{ maxWidth: 320 }} placeholder="e.g. End of Term 2 2026" value={label} onChange={e => setLabel(e.target.value)} maxLength={80} /><Btn kind="primary" icon="archive" disabled={!label.trim()} onClick={snap}>Save snapshot</Btn></div> : null}
        {snaps.loading ? <Loading rows={2} /> : <DataTable rows={snaps.data} empty={<Empty icon="archive" title="No snapshots yet" />} columns={[{ label: 'Label', title: true, render: r => <b>{r.label}</b> }, { label: 'Taken', render: r => fmtTs(r.created_at) }, { label: 'By', render: r => r.created_by }, { label: '', render: r => <div className="row"><Btn size="sm" onClick={() => setView(r.id)}>View</Btn>{can.admin && <Btn size="sm" kind="danger" onClick={() => setDel(r)} aria-label="Delete snapshot" icon="trash" />}</div> }]} />}
      </Card>
      {view && <SnapshotView id={view} onClose={() => setView(null)} />}
      {del && <Confirm danger message={`Delete snapshot "${del.label}"?`} confirmLabel="Delete" onConfirm={async () => { await api.del('/snapshots/' + del.id); snaps.reload(); }} onClose={() => setDel(null)} />}
    </div>
  );
}
