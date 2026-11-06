import { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.js';
import { CoinIcon, Header, Icon } from '../components/ui.jsx';

const money = (o) => (o.currency && o.currency !== 'INR' ? `${o.currency} ${Number(o.amount).toLocaleString('en-IN')}` : `₹${Number(o.amount).toLocaleString('en-IN')}`);

export default function Safety() {
  const { toast, lowData, setLowData } = useApp();
  const t = useT();
  const [safety, setSafety] = useState(null);
  const [limit, setLimit] = useState('');
  const [tickets, setTickets] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => {
    api('/safety').then((d) => { setSafety(d); setLimit(d.dailyLimit ? String(d.dailyLimit) : ''); }).catch(() => {});
    api('/support').then(setTickets).catch(() => {});
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveLimit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/safety/limit', { method: 'PUT', body: { coins: Number(limit) || 0 } });
      toast(r.pendingLimit ? `New limit of ${fmt(r.pendingLimit)} coins applies after the waiting period` : r.dailyLimit ? `Daily gift limit set to ${fmt(r.dailyLimit)} coins` : 'Daily limit removed');
      load();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  const refund = async (o) => {
    if (!window.confirm(`Ask for a refund of order #${o.id} (${fmt(o.coins)} coins)? The coins are held while the team reviews it.`)) return;
    try {
      await api(`/recharge/${o.id}/refund`, { method: 'POST', body: {} });
      toast('Refund requested. The coins are held until it is reviewed.');
      load();
    } catch (err) { toast(err.message, 'error'); }
  };

  const sendTicket = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/support', { method: 'POST', body: { subject, body } });
      toast('Support request sent. We will reply here.');
      setSubject(''); setBody('');
      load();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  return (
    <div className="page">
      <Header title={t('safety')} />

      <section className="card">
        <h3>Daily gift limit</h3>
        {safety && (
          <>
            <p className="muted small">
              {safety.dailyLimit > 0
                ? <>Limit <b>{fmt(safety.dailyLimit)}</b> coins/day · used <b>{fmt(safety.spentToday)}</b> today.</>
                : <>No daily limit set · used <b>{fmt(safety.spentToday)}</b> coins today.</>}
              {safety.pendingLimit != null && <> A higher limit of <b>{fmt(safety.pendingLimit)}</b> applies {safety.pendingAt ? new Date(safety.pendingAt).toLocaleString('en-IN') : 'after the waiting period'}.</>}
            </p>
            <form className="row gap" onSubmit={saveLimit}>
              <input className="input grow" type="number" min="0" placeholder="Coins per day (0 = no limit)" value={limit} onChange={(e) => setLimit(e.target.value)} />
              <button className="btn primary" disabled={busy}>Save</button>
            </form>
            <p className="muted small">Lowering applies right away. Raising applies after a waiting period.</p>
          </>
        )}
      </section>

      <section className="card">
        <h3>{t('refunds')}</h3>
        <p className="muted small">Made a recharge by mistake? You can ask for a refund within {safety?.refundWindowHours ?? 72} hours if the coins are still in your wallet.</p>
        {!safety || safety.orders.length === 0 ? <p className="muted">No recent recharges.</p> : (
          <div className="list compact">{safety.orders.map((o) => (
            <div key={o.id} className="list-row">
              <div className="grow"><b>{money(o)}</b> · <CoinIcon size={12} /> {fmt(o.coins)}<small>Order #{o.id} · {new Date(o.at).toLocaleString('en-IN')}</small></div>
              {o.refundStatus ? <span className={`status ${o.refundStatus}`}>refund {o.refundStatus}</span>
                : o.canRefund ? <button className="btn ghost small" onClick={() => refund(o)}>Refund</button>
                : <span className={`status ${o.status}`}>{o.status}</span>}
            </div>
          ))}</div>
        )}
      </section>

      <section className="card">
        <label className="row gap between">
          <span><b>{t('lowData')}</b><br /><small className="muted">{t('lowDataNote')}</small></span>
          <input type="checkbox" className="toggle" checked={lowData} onChange={(e) => setLowData(e.target.checked)} />
        </label>
      </section>

      <section className="card">
        <h3 className="row gap"><Icon name="chat" /> Support</h3>
        <form className="form" onSubmit={sendTicket}>
          <input className="input" placeholder="Subject" value={subject} maxLength={100} onChange={(e) => setSubject(e.target.value)} required />
          <textarea className="input" rows={3} placeholder="Describe the issue (include the order number for recharge problems)" value={body} maxLength={2000} onChange={(e) => setBody(e.target.value)} required />
          <button className="btn primary block" disabled={busy}>{busy ? 'Sending…' : 'Send to support'}</button>
        </form>
        {tickets.length > 0 && (
          <div className="list compact" style={{ marginTop: '10px' }}>{tickets.map((tk) => (
            <div key={tk.id} className="list-row">
              <div className="grow"><b>{tk.subject}</b><small>{new Date(tk.created_at).toLocaleString('en-IN')}{tk.reply ? ` · Reply: ${tk.reply}` : ''}</small></div>
              <span className={`status ${tk.status}`}>{tk.status}</span>
            </div>
          ))}</div>
        )}
      </section>
    </div>
  );
}
