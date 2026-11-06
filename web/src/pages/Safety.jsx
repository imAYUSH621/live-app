import { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.js';
import { CoinIcon, Header, Icon } from '../components/ui.jsx';

const money = (o) => (o.currency && o.currency !== 'INR' ? `${o.currency} ${Number(o.amount).toLocaleString('en-IN')}` : `₹${Number(o.amount).toLocaleString('en-IN')}`);

export default function Safety() {
  const { toast, lowData, setLowData } = useApp();
  const t = useT();
  const [orders, setOrders] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => {
    api('/recharge/orders').then(setOrders).catch(() => {});
    api('/support').then(setTickets).catch(() => {});
  };
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        <h3>{t('refunds')}</h3>
        <p className="muted small">Recharges are handled by the payment provider. If a payment failed or was made by mistake, send a support request below with the order number.</p>
        {orders.length === 0 ? <p className="muted">No recharges yet.</p> : (
          <div className="list compact">{orders.map((o) => (
            <div key={o.id} className="list-row">
              <div className="grow"><b>{money(o)}</b> · <CoinIcon size={12} /> {fmt(o.coins)}<small>Order #{o.id} · {o.gateway || 'seller'} · {new Date(o.created_at).toLocaleString('en-IN')}</small></div>
              <span className={`status ${o.status}`}>{o.status}</span>
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
