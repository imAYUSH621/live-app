import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, media } from './lib/api.js';

// ---------- toasts ----------
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const id = useRef(0);
  const toast = useCallback((text, kind = 'info') => {
    const k = ++id.current;
    setList((l) => [...l, { k, text, kind }]);
    setTimeout(() => setList((l) => l.filter((x) => x.k !== k)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts">{list.map((t) => <div key={t.k} className={`toast ${t.kind}`}>{t.text}</div>)}</div>
    </ToastCtx.Provider>
  );
}

/** const { data, loading, reload } = useLoad('/admin/x') */
export function useLoad(path, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = useCallback(async () => {
    if (!path) return setState({ data: null, loading: false, error: null });
    setState((s) => ({ ...s, loading: true }));
    try { setState({ data: await api(path), loading: false, error: null }); } catch (e) { setState({ data: null, loading: false, error: e }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}

/** Run an API action with toast feedback. */
export function useAct() {
  const toast = useToast();
  return useCallback(async (fn, ok) => {
    try {
      const r = await fn();
      if (ok) toast(ok, 'success');
      return r;
    } catch (e) {
      toast(e.message, 'error');
      return undefined;
    }
  }, [toast]);
}

export const Badge = ({ v, kind }) => <span className={`badge ${kind || String(v || '').toLowerCase()}`}>{String(v ?? '—').replace(/_/g, ' ')}</span>;

export function Avatar({ src, name, size = 32 }) {
  return src ? <img className="avatar" src={media(src)} alt="" style={{ width: size, height: size }} />
    : <span className="avatar" style={{ width: size, height: size }}>{(name || '?')[0]}</span>;
}

export function UserCell({ u, onClick }) {
  if (!u) return '—';
  return (
    <span className="user-cell" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <Avatar src={u.avatar_url} name={u.name} />
      <span><div style={{ fontWeight: 600 }}>{u.name}</div><div className="muted small">ID {u.uid}</div></span>
    </span>
  );
}

/** columns: [{ key, label, render?(row), right? }] */
export function Table({ columns, rows, onRow, empty = 'Nothing here yet.', loading }) {
  return (
    <div className="tbl">
      <table>
        <thead><tr>{columns.map((c) => <th key={c.key || c.label} className={c.right ? 'right' : ''}>{c.label}</th>)}</tr></thead>
        <tbody>
          {loading && <tr><td colSpan={columns.length} className="empty">Loading…</td></tr>}
          {!loading && (!rows || rows.length === 0) && <tr><td colSpan={columns.length} className="empty">{empty}</td></tr>}
          {!loading && rows?.map((r, i) => (
            <tr key={r.id ?? r.key ?? r.code ?? r.level ?? r.rank ?? r.slug ?? i} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {columns.map((c) => <td key={c.key || c.label} className={c.right ? 'right' : ''}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="backdrop center" onClick={onClose}>
      <div className="modal" style={wide ? { width: 'min(860px, 100%)' } : undefined} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function Drawer({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()} role="dialog">{children}</div>
    </div>
  );
}

/**
 * Form built from a field list.
 * fields: [{ name, label, type: text|number|textarea|select|checkbox|date|json|file|tags, options, hint }]
 */
export function FormModal({ open, onClose, title, fields, initial = {}, onSubmit, submitLabel = 'Save' }) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setV(initial); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await onSubmit(v); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit}>
        {fields.map((f) => <FieldInput key={f.name} f={f} value={v[f.name]} onChange={(val) => set(f.name, val)} />)}
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
        </div>
      </form>
    </Modal>
  );
}

export function FieldInput({ f, value, onChange }) {
  let input;
  if (f.type === 'textarea') input = <textarea rows={f.rows || 4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  else if (f.type === 'select') input = (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      {f.options.map((o) => (Array.isArray(o) ? <option key={o[0]} value={o[0]}>{o[1]}</option> : <option key={o} value={o}>{o}</option>))}
    </select>
  );
  else if (f.type === 'checkbox') return (
    <div className="field"><label className="check"><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {f.label}</label>{f.hint && <div className="hint">{f.hint}</div>}</div>
  );
  else if (f.type === 'json') input = <textarea rows={f.rows || 5} value={typeof value === 'string' ? value : JSON.stringify(value ?? f.empty ?? {}, null, 2)} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: 'monospace', fontSize: 12 }} />;
  else if (f.type === 'file') input = <input type="file" accept={f.accept} onChange={(e) => onChange(e.target.files[0])} />;
  else if (f.type === 'tags') input = <input value={Array.isArray(value) ? value.join(', ') : value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="comma, separated" />;
  else if (f.type === 'date') input = <input type="datetime-local" value={value ? String(value).slice(0, 16) : ''} onChange={(e) => onChange(e.target.value)} />;
  else input = <input type={f.type || 'text'} value={value ?? ''} onChange={(e) => onChange(f.type === 'number' ? e.target.value : e.target.value)} step={f.step} />;
  return <div className="field"><label>{f.label}</label>{input}{f.hint && <div className="hint">{f.hint}</div>}</div>;
}

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs">{tabs.map(([k, l]) => <button type="button" key={k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>{l}</button>)}</div>;
}

export function Stat({ label, value, kind, sub }) {
  return <div className={`stat ${kind || ''}`}><div className="v">{value}</div><div className="l">{label}</div>{sub && <div className="small muted">{sub}</div>}</div>;
}

/** Minimal SVG bar chart: data [{label, value}] — hover a bar for its value. */
export function Bars({ data, color = 'var(--plum)', height = 180, format = (v) => v }) {
  const max = Math.max(1, ...data.map((d) => Number(d.value) || 0));
  const w = 100 / Math.max(1, data.length);
  const step = Math.ceil(data.length / 7);
  const total = data.reduce((a, d) => a + (Number(d.value) || 0), 0);
  return (
    <div>
      <div className="muted small" style={{ marginBottom: 6 }}>Total {format(total)} · peak {format(max)}</div>
      <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ height }} role="img">
        <line x1="0" y1="100" x2="100" y2="100" stroke="#e4dfef" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const h = ((Number(d.value) || 0) / max) * 96;
          return (
            <rect key={i} x={i * w + w * 0.18} y={100 - h} width={w * 0.64} height={h} fill={color}>
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="chart-labels">{data.filter((_, i) => i % step === 0 || i === data.length - 1).map((d, i) => <span key={i}>{d.label}</span>)}</div>
    </div>
  );
}

export function Pager({ offset, limit, count, onChange }) {
  return (
    <div className="pager">
      <button className="btn sm" disabled={offset === 0} onClick={() => onChange(Math.max(0, offset - limit))}>‹ Prev</button>
      <span className="muted small">{offset + 1}–{offset + count}</span>
      <button className="btn sm" disabled={count < limit} onClick={() => onChange(offset + limit)}>Next ›</button>
    </div>
  );
}

export const confirmAct = (msg) => window.confirm(msg);
