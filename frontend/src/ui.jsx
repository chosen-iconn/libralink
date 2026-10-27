import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import { Icon } from './icons';
import { cx } from './util';

export function Btn({ kind, size, icon, children, block, className, ...p }) {
  return <button type="button" {...p} className={cx('btn', kind, size, block && 'block', className)}>{icon && <Icon n={icon} size={size === 'sm' ? 16 : 18} />}{children}</button>;
}
export const IconBtn = ({ n, label, ...p }) => <button type="button" className="iconbtn" aria-label={label} title={label} {...p}><Icon n={n} /></button>;

export function Field({ label, hint, error, children, className }) {
  const id = useId();
  const child = isValidElement(children) ? cloneElement(children, { id: children.props.id || id }) : children;
  return (
    <div className={cx('field', className)}>
      {label && <label htmlFor={id}>{label}</label>}
      {child}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}
export const Input = ({ className, ...p }) => <input className={cx('input', className)} {...p} />;
export const Select = ({ className, children, ...p }) => <select className={cx('input', className)} {...p}>{children}</select>;
export const Textarea = ({ className, ...p }) => <textarea className={cx('input', className)} {...p} />;

export function SearchBox({ value, onChange, placeholder = 'Search…', ...p }) {
  return (
    <div className="searchbox">
      <Icon n="search" size={18} className="ico" />
      <input className="input" type="search" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} {...p} />
    </div>
  );
}
export function Seg({ value, onChange, options }) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}
export const Card = ({ title, action, children, className, tight }) => (
  <section className={cx('card', tight && 'tight', className)}>
    {(title || action) && <div className="card-h">{title && <h3>{title}</h3>}{action}</div>}
    {children}
  </section>
);
export const Badge = ({ kind, children }) => <span className={cx('badge', kind)}>{children}</span>;
export const Progress = ({ value, kind }) => <div className={cx('bar', kind)} role="progressbar" aria-valuenow={Math.round((value || 0) * 100)} aria-valuemin="0" aria-valuemax="100"><i style={{ width: `${Math.min(100, Math.max(0, (value || 0) * 100))}%` }} /></div>;
export const Avatar = ({ name }) => <span className="avatar">{(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</span>;
export const Spinner = () => <span className="spin" role="status" aria-label="Loading" />;
export const Loading = ({ rows = 4 }) => <div className="stack" aria-busy="true">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height: 46 }} />)}</div>;
export const Empty = ({ icon = 'book', title, children }) => <div className="emptystate"><Icon n={icon} size={42} /><b style={{ color: 'var(--ink-2)' }}>{title}</b>{children && <div className="small">{children}</div>}</div>;
export const ErrorBox = ({ error, retry }) => <div className="alert bad"><Icon n="alert" /><div className="grow">{error}</div>{retry && <Btn size="sm" onClick={retry}>Retry</Btn>}</div>;
export const Alert = ({ kind, icon, children }) => <div className={cx('alert', kind)}><Icon n={icon || (kind === 'bad' ? 'alert' : kind === 'ok' ? 'check' : 'info')} size={18} /><div className="grow">{children}</div></div>;

export function PageHead({ title, sub, crumbs, children }) {
  return (
    <div>
      {crumbs && <div className="crumbs noprint">{crumbs.map((c, i) => <span key={i}>{i > 0 && ' / '}{c.href ? <a href={c.href}>{c.label}</a> : c.label}</span>)}</div>}
      <div className="page-h">
        <div className="t"><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
        {children && <div className="row wrap right noprint">{children}</div>}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide, labelledBy }) {
  const ref = useRef();
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector('input:not([readonly]),select,textarea,button.primary');
    first?.focus({ preventScroll: true });
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, []); // eslint-disable-line
  return (
    <div className="modal-wrap" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cx('modal', wide && 'wide')} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-h"><h3>{title}</h3><IconBtn n="x" label="Close" onClick={onClose} /></div>
        <div className="modal-b">{children}</div>
        {footer && <div className="modal-f">{footer}</div>}
      </div>
    </div>
  );
}
export function Confirm({ title = 'Are you sure?', message, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={title} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind={danger ? 'danger' : 'primary'} disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmLabel}</Btn></>}>
      <p>{message}</p>
    </Modal>
  );
}

export function Pager({ total, limit, offset, onChange }) {
  const pages = Math.max(1, Math.ceil(total / limit)), page = Math.floor(offset / limit) + 1;
  if (total <= limit) return null;
  return (
    <div className="pager noprint">
      <Btn size="sm" disabled={page <= 1} onClick={() => onChange((page - 2) * limit)} icon="chevL">Prev</Btn>
      <span className="small muted">Page {page} of {pages} · {total.toLocaleString()} total</span>
      <Btn size="sm" disabled={page >= pages} onClick={() => onChange(page * limit)}>Next<Icon n="chevR" size={16} /></Btn>
    </div>
  );
}

/** Responsive table: real table on desktop, stacked cards on phones. */
export function DataTable({ columns, rows, rowKey = 'id', onRow, footer, empty }) {
  if (!rows.length) return empty || <Empty title="Nothing to show" />;
  return (
    <div className="tablewrap stack">
      <table className="t stack">
        <thead><tr>{columns.map(c => <th key={c.key || c.label} className={c.num ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map(r => (
            <tr key={r[rowKey]} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map(c => <td key={c.key || c.label} data-label={c.title ? '' : c.label} className={cx(c.num && 'num', c.title && 'title')}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot><tr>{footer.map((f, i) => <td key={i} data-label={columns[i]?.label || ''} className={columns[i]?.num ? 'num' : ''}>{f}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

// ---------------- charts (pure SVG, responsive) ----------------
export function BarChart({ data, series, height = 220, format = (v) => v }) {
  const W = 620, H = height, pl = 34, pr = 8, pt = 12, pb = 28;
  const max = Math.max(1, ...data.flatMap(d => series.map(s => d[s.key] || 0)));
  const nice = Math.ceil(max / 4 / (10 ** Math.max(0, String(Math.ceil(max / 4)).length - 1))) * 10 ** Math.max(0, String(Math.ceil(max / 4)).length - 1) * 4 || 4;
  const top = Math.max(nice, max);
  const bw = (W - pl - pr) / data.length, g = Math.min(18, bw / (series.length + 1));
  const bar = Math.max(4, (bw - 14) / series.length);
  const y = (v) => pt + (H - pt - pb) * (1 - v / top);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bar chart">
      {[0, .25, .5, .75, 1].map(f => <g key={f}><line x1={pl} x2={W - pr} y1={y(top * f)} y2={y(top * f)} stroke="#E4ECF8" /><text x={pl - 6} y={y(top * f) + 4} textAnchor="end">{Math.round(top * f)}</text></g>)}
      {data.map((d, i) => (
        <g key={i}>
          {series.map((s, j) => {
            const v = d[s.key] || 0, x = pl + i * bw + (bw - bar * series.length) / 2 + j * bar;
            return <rect key={s.key} x={x} y={y(v)} width={bar - 2} height={Math.max(0, H - pb - y(v))} rx="3" fill={s.color}><title>{`${d.label} · ${s.label}: ${format(v)}`}</title></rect>;
          })}
          <text x={pl + i * bw + bw / 2} y={H - 9} textAnchor="middle">{d.label}</text>
        </g>
      ))}
    </svg>
  );
}
export function Donut({ parts, size = 150, center }) {
  const total = parts.reduce((s, p) => s + p.value, 0), r = 52, C = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label="Donut chart">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#E4ECF8" strokeWidth="18" />
      {total > 0 && parts.map((p, i) => { const len = (p.value / total) * C; const el = <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={p.color} strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} transform="rotate(-90 70 70)"><title>{`${p.label}: ${p.value}`}</title></circle>; off += len; return el; })}
      <text x="70" y="68" textAnchor="middle" style={{ fontSize: 22, fontWeight: 800, fill: 'var(--navy-800)' }}>{center ?? total}</text>
      <text x="70" y="86" textAnchor="middle" style={{ fontSize: 10 }}>copies</text>
    </svg>
  );
}
export function Trend({ data, height = 90 }) {
  const W = 300, H = height, max = Math.max(1, ...data.map(d => d.n)), bw = W / data.length;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Books issued per week">
      {data.map((d, i) => { const h = (d.n / max) * (H - 14); return <g key={i}><rect x={i * bw + 6} y={H - h} width={bw - 12} height={Math.max(2, h)} rx="4" fill={i === data.length - 1 ? 'var(--gold)' : 'var(--blue-500)'} opacity={d.n ? 1 : .25}><title>{`Week of ${d.week}: ${d.n}`}</title></rect>{d.n > 0 && <text x={i * bw + bw / 2} y={H - h - 4} textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: 'var(--ink-2)' }}>{d.n}</text>}<text x={i * bw + bw / 2} y={H + 13} textAnchor="middle" style={{ fontSize: 9 }}>{d.week.slice(8)}/{d.week.slice(5, 7)}</text></g>; })}
    </svg>
  );
}
