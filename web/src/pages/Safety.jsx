import { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.js';
import { CoinIcon, Header, Icon, Spinner } from '../components/ui.jsx';

const PRESETS = [0, 1000, 5000, 20000, 50000];

export default function Safety() {
  const { toast, setWallet, lowData, setLowData, lang } = useApp();
  const t = useT();
  const [d, setD] = useState(null);
  const [limit, setLimit] = useState('');
  const [reports, setReports] = useState([]);
  const load = () => api('/safety').then((x) => { setD(x); setLimit(String(x.pendingLimit ?? x.dailyLimit ?? 0)); }).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); api('/reports/mine').then(setReports).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="page"><Header title={t('safety')} /><Spinner /></div>;

  const local = (coins) => `${d.symbol}${(coins / d.coinsPerUnit).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const saveLimit = async () => {
    try {
      const r = await api('/safety/limit', { method: 'PUT', body: { coins: Number(limit || 0) } });
      toast(r.pendingLimit ? t('limitPending', { n: fmt(r.pendingLimit), when: new Date(r.pendingAt).toLocaleString(lang) }) : 'Saved');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };
  const refund = async (o) => {
    const reason = window.prompt('Why? (e.g. recharged by mistake, child used my phone)', 'Recharged by mistake');
    if (reason === null) return;
    try { const r = await api(`/recharge/${o.id}/refund`, { method: 'POST', body: { reason } }); setWallet(r.wallet); toast('Refund requested. Coins are on hold until it is processed.'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <Header title={t('safety')} />
      <section className="card">
        <h3 className="row gap"><Icon name="lock" /> {t('dailyLimit')}</h3>
        <p className="muted small">{t('spentToday')}: <b><CoinIcon size={12} /> {fmt(d.spentToday)}</b> ({local(d.spentToday)})</p>
        <div className="chips">
          {PRESETS.map((p) => <button key={p} className={Number(limit) === p ? 'on' : ''} onClick={() => setLimit(String(p))}>{p === 0 ? t('noLimit') : `${fmt(p)} (${local(p)})`}</button>)}
        </div>
        <input className="input" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, ''))} aria-label={t('dailyLimit')} />
        {d.pendingLimit !== null && d.pendingAt && <p className="pill">{t('limitPending', { n: fmt(d.pendingLimit), when: new Date(d.pendingAt).toLocaleString(lang) })}</p>}
        <p className="muted small">Lowering the limit works at once. Raising it takes {d.raiseDelayHours} hours, so you can't change it in the heat of the moment. Gifts above {fmt(d.confirmCoins)} coins always ask you to confirm.</p>
        <button className="btn primary block" onClick={saveLimit}>{t('setLimit')}</button>
      </section>

      <section className="card">
        <h3>{t('refunds')}</h3>
        <p className="muted small">{t('refundNote', { h: d.refundWindowHours })}</p>
        {d.orders.length === 0 ? <p className="muted">No recharges in the last 7 days.</p> : (
          <div className="list compact">{d.orders.map((o) => (
            <div key={o.id} className="list-row">
              <div className="grow"><b>{o.amount}</b> · <CoinIcon size={12} /> {fmt(o.coins)}<small>{new Date(o.at).toLocaleString(lang)}</small></div>
              {o.refundStatus ? <span className={`status ${o.refundStatus}`}>{o.refundStatus}</span>
                : o.canRefund ? <button className="btn small" onClick={() => refund(o)}>{t('askRefund')}</button>
                  : <span className="muted small">{o.status === 'paid' ? 'Not eligible' : o.status}</span>}
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
        <h3>{t('myReports')}</h3>
        {reports.length === 0 ? <p className="muted">{t('noReports')}</p> : (
          <div className="list compact">{reports.map((r) => (
            <div key={r.id} className="list-row"><div className="grow"><b>{r.reason}</b><small>{r.target_type} · {new Date(Number(r.created_at)).toLocaleDateString(lang)}</small></div>
              <span className={`status ${r.status}`}>{r.status === 'open' ? 'Under review' : r.action === 'dismissed' ? 'No rule broken' : `Action taken: ${r.action}`}</span></div>
          ))}</div>
        )}
      </section>
    </div>
  );
}
