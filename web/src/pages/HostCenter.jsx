import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { GemIcon, Header, Icon, Spinner } from '../components/ui.jsx';
import { useT } from '../i18n.js';

const METHODS = { upi: 'UPI', bank: 'Bank', paypal: 'PayPal', payoneer: 'Payoneer' };
const PH = { upi: 'yourname@upi', bank: 'Account no, IFSC, name', paypal: 'PayPal email', payoneer: 'Payoneer email' };
const hrs = (s) => (Number(s || 0) / 3600).toFixed(1);

export default function HostCenter() {
  const { me, toast } = useApp();
  const t = useT();
  const [c, setC] = useState(null);
  const [income, setIncome] = useState(null);
  const [earn, setEarn] = useState(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('upi');
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => {
    api('/host/center').then((d) => {
      setC(d);
      if (d.host?.payout_method) setMethod(d.host.payout_method);
      if (d.host?.payout_details?.account) setAccount(d.host.payout_details.account);
    }).catch((e) => toast(e.message, 'error'));
    api('/host/income').then(setIncome).catch(() => {});
    api('/host/earnings').then(setEarn).catch(() => {});
  };
  useEffect(() => { if (me?.user?.isHost) load(); }, [me?.user?.isHost]); // eslint-disable-line react-hooks/exhaustive-deps

  if (me && (!me.user.isHost || !me.user.verified || me.user.hostStatus !== 'approved')) {
    const isSuspended = me.user.hostStatus === 'suspended';
    const isPending = me.user.hostStatus === 'pending';
    return (
      <div className="page"><Header title={t('hostCentre')} />
        <div className="card center-text">
          <div style={{ fontSize: '42px', marginBottom: '8px' }}>{isSuspended ? '⛔' : '💎'}</div>
          <h2>{isSuspended ? 'Host Privileges Suspended' : isPending ? 'Verification Under Review' : 'Become a Verified Host'}</h2>
          <p className="muted">
            {isSuspended
              ? 'Your host account has been suspended by Admin. Please contact support to have your account reconsidered.'
              : isPending
              ? 'Your ID and live photo verification is currently under review by our Admin team. You will be notified as soon as it is approved.'
              : 'Every gift you receive in live streams becomes diamonds. Earnings are settled to your payout account every month. Verify your ID & live selfie to start.'}
          </p>
          {isSuspended ? (
            <Link to="/safety" className="btn primary block">Support</Link>
          ) : isPending ? (
            <Link to="/verify" className="btn primary block">Check Verification Status</Link>
          ) : (
            <Link to="/verify" className="btn primary block">Verify ID & Live Photo</Link>
          )}
          {!me.user.dob && <Link to="/me/edit" className="btn ghost block">Add date of birth (18+)</Link>}
        </div>
      </div>
    );
  }
  if (!c) return <div className="page"><Header title="Host centre" /><Spinner /></div>;

  const m = c.month || {};
  const cur = m.currency || 'INR';
  const sym = cur === 'INR' ? '₹' : `${cur} `;
  const withdraw = async (e) => {
    e.preventDefault();
    if (!account.trim()) return toast('Save your payout account below first', 'error');
    setBusy(true);
    try {
      await api('/host/withdraw', { method: 'POST', body: { diamonds: Number(amount), method, account: account.trim() } });
      toast('Withdrawal requested. Diamonds are held until it is processed.');
      setAmount('');
      load();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };
  const savePayout = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/host/payout', { method: 'PATCH', body: { method, details: { account } } });
      toast('Payout details saved');
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  return (
    <div className="page">
      <Header title="Host centre" />
      <div className="balance-hero"><GemIcon size={30} /><b>{fmt(c.user?.diamonds)}</b><span>diamonds balance</span></div>
      {c.host?.agency_name && <p className="pill">Agency: {c.host.agency_name} (code {c.host.agency_code})</p>}
      <div className="stat-grid">
        <div><b>{fmt(c.today?.diamonds)}</b><span>Today</span></div>
        <div><b>{fmt(m.diamonds)}</b><span>This month</span></div>
        <div><b>{m.live_hours ?? 0}h</b><span>Live hours</span></div>
        <div><b>{m.valid_days ?? 0}</b><span>Valid days</span></div>
      </div>
      <section className="card rate-card">
        <h3>{t('rateCard')}</h3>
        <ul>
          <li>Gifts from viewers become diamonds in your balance.</li>
          <li>This month so far: {sym}{Number(m.base || 0).toLocaleString('en-IN')}{m.bonus ? ` + ${sym}${Number(m.bonus).toLocaleString('en-IN')} level bonus` : ''}.</li>
          <li>Monthly target: {m.target?.hours}h live over {m.target?.days} days{m.target?.met ? ' - met ✓' : ''}.</li>
          {m.level && <li>Current level: {m.level.name}{m.next_level ? ` - next: ${m.next_level.name} at ${fmt(m.next_level.min_diamonds)} diamonds` : ''}</li>}
        </ul>
        <p className="muted small">Earnings are settled monthly by the platform. Keep your payout details below up to date.</p>
      </section>
      <h3 className="section-title">Daily record</h3>
      <div className="list compact">
        {!income || income.days.length === 0 ? <p className="muted">Go live to start earning.</p> : income.days.map((x) => (
          <div key={x.day} className="list-row"><div className="grow"><b>{new Date(x.day).toLocaleDateString('en-IN')}</b></div><span className="muted">{hrs(x.live_seconds)} h</span><span className="coins">{fmt(x.diamonds)}</span></div>
        ))}
      </div>
      {earn && <>
        <h3 className="section-title">Withdraw earnings</h3>
        <form className="card form" onSubmit={withdraw}>
          <p className="muted small">Minimum {fmt(earn.rate.minWithdraw)} diamonds ({sym}{(earn.rate.minWithdraw / earn.rate.diamondsPerUnit).toLocaleString('en-IN')}). Diamonds are held while the request is processed.</p>
          <div className="row gap">
            <input className="input grow" type="number" min={earn.rate.minWithdraw} max={c.user?.diamonds || 0} placeholder={`Diamonds (min ${earn.rate.minWithdraw})`} value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <button className="btn primary" disabled={busy}>Withdraw</button>
          </div>
          {amount >= earn.rate.minWithdraw && <p className="muted small">= {sym}{Math.floor((Number(amount) / earn.rate.diamondsPerUnit) * 100) / 100} to your {METHODS[method]} account below</p>}
        </form>
        {earn.withdrawals.length > 0 && (
          <div className="list compact">{earn.withdrawals.map((w) => (
            <div key={w.id} className="list-row">
              <div className="grow"><b>{fmt(w.diamonds)} diamonds</b><small>{new Date(w.created_at).toLocaleString('en-IN')} · {METHODS[w.method] || w.method}{w.note ? ` · ${w.note}` : ''}</small></div>
              <span>{sym}{Number(w.amount).toLocaleString('en-IN')}</span>
              <span className={`status ${w.status}`}>{w.status}</span>
            </div>
          ))}</div>
        )}
      </>}
      <h3 className="section-title">Payout account</h3>
      <form className="form" onSubmit={savePayout}>
        <div className="seg small wrap">{Object.keys(METHODS).map((x) => <button key={x} type="button" className={method === x ? 'on' : ''} onClick={() => setMethod(x)}>{METHODS[x]}</button>)}</div>
        <input className="input" placeholder={PH[method] || 'Account details'} value={account} onChange={(e) => setAccount(e.target.value)} required />
        <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save payout details'}</button>
      </form>
      {c.settlements?.length > 0 && <>
        <h3 className="section-title">Monthly settlements</h3>
        <div className="list compact">{c.settlements.map((w) => (
          <div key={w.id} className="list-row"><span className="grow">{w.month}</span><span>{sym}{Number(w.total).toLocaleString('en-IN')}</span><span className={`status ${w.status}`}>{w.status}</span></div>
        ))}</div>
      </>}
    </div>
  );
}
