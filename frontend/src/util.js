export const cx = (...a) => a.filter(Boolean).join(' ');
const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export const fmtDate = (s) => { if (!s) return ''; const [y,m,d] = s.slice(0,10).split('-'); return `${d} ${MON[+m-1]}`; };
export const fmtDateLong = (s) => { if (!s) return ''; const [y,m,d] = s.slice(0,10).split('-'); return `${d} ${MON[+m-1]} ${y}`; };
export const fmtTs = (s) => { if (!s) return ''; const d = new Date(s); return isNaN(d) ? s : d.toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
export const pct = (v, dp = 0) => v == null ? '–' : (v * 100).toFixed(dp) + '%';
export const num = (v) => v == null ? '–' : Number(v).toLocaleString();
export const money = (v, cur = 'KES') => v == null ? '–' : `${cur} ${Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
export const initials = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
export const ROLE_LABEL = { admin: 'Administrator', librarian: 'Librarian', teacher: 'Class teacher', head: 'Head teacher' };
export const STATUS_LABEL = { issued: 'With learner', collected: 'Collected', lost: 'Lost', damaged: 'Damaged' };
export function useDebounced(value, ms = 300, React) { return value; }
export function parseCsv(text) {
  const rows = []; let row = [], cur = '', q = false;
  text = text.replace(/^\ufeff/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i+1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i+1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}
