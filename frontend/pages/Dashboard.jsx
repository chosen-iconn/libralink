import { useState } from 'react';
import { Icon } from '../icons';
import { useApp, useApi } from '../store';
import { go } from '../router';
import { Badge, BarChart, Card, Donut, Empty, ErrorBox, Loading, PageHead, Progress, SearchBox, Seg, Trend, Avatar } from '../ui';
import { fmtDateLong, fmtTs, num, pct } from '../util';

const STREAMS = ['North', 'East', 'South', 'West'];
const STATE = ['Not set up', 'No books issued', 'Books out', 'All collected'];

export function ClassGrid({ classes }) {
  const grades = [...new Set(classes.map(c => c.grade))].sort((a, b) => a - b);
  return (
    <div>
      {grades.map(g => (
        <div className="gradeRow" key={g}>
          <div className="g">GRADE {g}</div>
          {STREAMS.map(s => {
            const c = classes.find(x => x.grade === g && x.stream === s);
            if (!c) return <div key={s} className="cbtn none" />;
            return (
              <a key={s} href={'#/class/' + c.id} className={`cbtn s${c.state}`} aria-label={`${c.label} register. ${STATE[c.state]}. ${c.out} out.`}>
                <b>{s.toUpperCase()}</b><small>{c.teacher || 'No teacher set'}</small>
                <div className="o"><span>{c.learners} learners</span><span style={{ color: c.out ? 'var(--warn)' : c.state === 3 ? 'var(--ok)' : 'var(--muted)' }}>{c.state === 0 ? '—' : `OUT ${c.out}`}</span></div>
              </a>
            );
          })}
        </div>
      ))}
      <div className="legend noprint"><span><i style={{ background: '#F0F2F7' }} />No learners yet</span><span><i style={{ background: '#fff' }} />No books issued</span><span><i style={{ background: 'var(--warn-bg)' }} />Books still out</span><span><i style={{ background: 'var(--ok-bg)' }} />All collected</span></div>
    </div>
  );
}

export function Dashboard() {
  const { meta, user, can } = useApp();
  const { data, loading, error, reload } = useApi('/dashboard');
  const [adm, setAdm] = useState(''), [hit, setHit] = useState(null), [msg, setMsg] = useState('');
  const s = meta.settings;
  const find = async (e) => {
    e.preventDefault(); setMsg(''); setHit(null);
    if (!adm.trim()) return;
    try { const { api } = await import('../api'); const r = await api.get('/learners?limit=1&q=' + encodeURIComponent(adm.trim())); if (r.rows[0]) setHit(r.rows[0]); else setMsg('No learner matches that admission number or name.'); } catch (ex) { setMsg(ex.message); }
  };
  if (loading) return <Loading rows={6} />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const t = data.school;
  const status = [{ label: 'With learners', value: t.out, color: '#2F7BEA' }, { label: 'Collected', value: t.collected, color: '#17936A' }, { label: 'Lost', value: t.lost, color: '#C93636' }, { label: 'Damaged', value: t.damaged, color: '#E39B17' }];
  const warn = data.checks.filter(c => c.level !== 'ok');
  return (
    <div className="stack">
      <section className="hero">
        <div className="logo">{s.logo ? <img src={s.logo} alt="School logo" /> : <Icon n="school" size={32} stroke={1.6} />}</div>
        <div className="grow"><h1>{s.school_name}</h1><p>{s.term} · {s.academic_year} · Textbook issuance &amp; collection{s.cutoff ? ` · cut-off ${fmtDateLong(s.cutoff)}` : ''}</p></div>
        <div className="row wrap" style={{ zIndex: 1 }}><Badge kind="gold"><Icon n="star" size={13} />{user.name}</Badge></div>
      </section>

      <div className="kpis">
        <div className="kpi dark"><div className="l">Learners on roll</div><div className="v">{num(t.learners)}</div><div className="c">{t.classes} classes</div></div>
        <div className="kpi"><div className="l">Copies issued</div><div className="v">{num(t.issued)}</div><div className="c">of {num(t.expected)} expected</div></div>
        <div className={'kpi' + (t.out ? ' warn' : ' ok')}><div className="l">Outstanding</div><div className="v">{num(t.out)}</div><div className="c">still with learners</div></div>
        <div className="kpi"><div className="l">Lost</div><div className="v">{num(t.lost)}</div><div className="c">copies</div></div>
        <div className="kpi"><div className="l">Damaged</div><div className="v">{num(t.damaged)}</div><div className="c">on return</div></div>
        <div className="kpi"><div className="l">Coverage</div><div className="v">{pct(t.coverage)}</div><div className="c"><Progress value={t.coverage || 0} /></div></div>
        <div className="kpi"><div className="l">Open cases</div><div className="v">{data.openIncidents}</div><div className="c">lost / damaged</div></div>
      </div>

      <div className="quick">
        <a className="qbtn gold" href="#/classes"><Icon n="book" />Class registers</a>
        <a className="qbtn" href="#/summary"><Icon n="chart" />Summary</a>
        <a className="qbtn" href="#/stock"><Icon n="box" />Stock</a>
        <a className="qbtn" href="#/incidents"><Icon n="alert" />Lost &amp; damaged</a>
        <a className="qbtn" href="#/learners"><Icon n="users" />Learners</a>
        <a className="qbtn" href="#/reports"><Icon n="file" />Reports</a>
        {can.admin && <a className="qbtn" href="#/settings"><Icon n="settings" />Settings</a>}
      </div>

      <div className="cols">
        <Card title="Class registers"><ClassGrid classes={data.classes} /></Card>
        <div className="stack">
          <Card title="Find a learner">
            <form onSubmit={find} className="stack"><SearchBox value={adm} onChange={setAdm} placeholder="Admission no. or name" /><button className="btn primary block" type="submit">Look up</button></form>
            {msg && <p className="small muted" style={{ marginTop: 10 }}>{msg}</p>}
            {hit && (
              <a href={'#/learner/' + hit.id} className="hitem" style={{ marginTop: 12 }}>
                <Avatar name={hit.name} /><div className="grow"><b>{hit.name}</b><div className="small muted">Adm {hit.adm_no} · {hit.class_label}</div></div>
                <Badge kind={hit.out ? 'warn' : 'ok'}>{hit.out} out</Badge>
              </a>
            )}
          </Card>
          <Card title="Health checks">
            <div className="stack" style={{ '--x': 0 }}>
              {data.checks.map(c => <a key={c.key} href={c.link} className={`hitem ${c.level}`}><span className="n">{c.count}</span><span className="grow small"><b>{c.label}</b></span><Icon n="chevR" size={16} /></a>)}
            </div>
            {!warn.length && <p className="small muted" style={{ marginTop: 10 }}>Everything is in order.</p>}
          </Card>
        </div>
      </div>

      <div className="cols3">
        <Card title="Copies by status"><div className="donutwrap"><Donut parts={status} center={t.issued} /><div className="lg grow">{status.map(p => <div key={p.label}><i style={{ background: p.color }} />{p.label}<b>{p.value}</b></div>)}</div></div></Card>
        <Card title="Books issued · last 8 weeks"><Trend data={data.trend} /></Card>
        <Card title="Open cases" action={<a href="#/incidents" className="small">View all</a>}>
          {data.recentIncidents.length === 0 ? <Empty icon="check" title="No open cases" /> : data.recentIncidents.map(i => (
            <a key={i.id} className="hitem" style={{ marginBottom: 8 }} href="#/incidents"><span className="n" style={{ fontSize: '.7rem' }}>{i.type[0]}</span><div className="grow small"><b>{i.ref} · {i.learner || '—'}</b><div className="muted">{i.title} · {i.class_label}</div></div></a>
          ))}
        </Card>
      </div>

      <div className="cols2">
        <Card title="Issued vs collected by grade"><BarChart data={data.grades.map(g => ({ label: 'Gr ' + g.grade, issued: g.issued, collected: g.collected, out: g.out }))} series={[{ key: 'issued', label: 'Issued', color: '#2F7BEA' }, { key: 'collected', label: 'Collected', color: '#17936A' }, { key: 'out', label: 'Outstanding', color: '#E3B24B' }]} /><div className="legend" style={{ marginTop: 6 }}><span><i style={{ background: '#2F7BEA' }} />Issued</span><span><i style={{ background: '#17936A' }} />Collected</span><span><i style={{ background: '#E3B24B' }} />Outstanding</span></div></Card>
        <Card title="Recent activity">
          <div className="feed">{data.activity.map((a, i) => <div key={i}><span className="d" /><div className="grow"><b>{a.user}</b> · {a.action} {a.entity}<div className="small muted">{a.detail}</div></div><span className="tiny muted">{fmtTs(a.ts)}</span></div>)}</div>
        </Card>
      </div>
    </div>
  );
}

export function Classes() {
  const { data, loading, error, reload } = useApi('/classes');
  const [view, setView] = useState('grid'), [q, setQ] = useState('');
  if (loading) return <Loading />;
  if (error) return <ErrorBox error={error} retry={reload} />;
  const rows = data.filter(c => (c.label + c.teacher).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="stack">
      <PageHead title="Class registers" sub="Open a class to issue and collect books."><Seg value={view} onChange={setView} options={[{ value: 'grid', label: 'Grid' }, { value: 'list', label: 'List' }]} /></PageHead>
      {view === 'grid' ? <Card><ClassGrid classes={data} /></Card> : (
        <>
          <div className="filters"><SearchBox value={q} onChange={setQ} placeholder="Search class or teacher" /></div>
          <div className="grid3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
            {rows.map(c => (
              <a key={c.id} href={'#/class/' + c.id} className="card hitem" style={{ display: 'block' }}>
                <div className="row between"><b style={{ fontSize: '1.05rem' }}>{c.label}</b><Badge kind={['gray', '', 'warn', 'ok'][c.state]}>{STATE[c.state]}</Badge></div>
                <div className="small muted" style={{ margin: '4px 0 10px' }}>{c.teacher || 'No teacher set'} · {c.learners} learners · {c.titles} titles</div>
                <Progress value={c.coverage || 0} kind={c.out ? 'warn' : 'ok'} />
                <div className="row between small" style={{ marginTop: 8 }}><span>Issued {c.issued}</span><span>Out <b>{c.out}</b></span><span>Lost {c.lost}</span><span>Dmg {c.damaged}</span></div>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
