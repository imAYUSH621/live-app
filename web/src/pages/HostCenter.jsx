import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt, rupees } from '../api.js';
import { useApp } from '../store.jsx';
import { GemIcon, Header, Icon, Spinner } from '../components/ui.jsx';
import { useT } from '../i18n.js';

const METHODS = { upi: 'UPI', bank: 'Bank', bank_intl: 'Bank transfer', paypal: 'PayPal', payoneer: 'Payoneer', wise: 'Wise' };
const PH = { upi: 'yourname@upi', bank: 'Account no, IFSC, name', bank_intl: 'IBAN / account no, SWIFT, name', paypal: 'PayPal email', payoneer: 'Payoneer email', wise: 'Wise email' };

export default function HostCenter() {
  const { me, toast, setWallet, refresh } = useApp();
  const t = useT();
  const [d, setD] = useState(null);
  const [amt, setAmt] = useState('');
  const [method, setMethod] = useState('upi');
  const [account, setAccount] = useState('');
  const load = () => api('/host/earnings').then(setD).catch((e) => toast(e.message, 'error'));
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
              ? 'Your host account has been suspended by Admin. Please submit an appeal to have your account reconsidered.'
              : isPending
              ? 'Your Aadhaar and live photo verification is currently under review by our Admin team. You will be notified as soon as it is approved.'
              : 'Every gift you receive in live streams becomes diamonds that you can withdraw directly to UPI or Bank. Submit your Aadhaar & live selfie to start.'}
          </p>
          {isSuspended ? (
            <Link to="/safety" className="btn primary block">Safety & Appeals</Link>
          ) : isPending ? (
            <Link to="/verify" className="btn primary block">Check Verification Status</Link>
          ) : (
            <Link to="/verify" className="btn primary block">Verify Aadhaar & Live Photo</Link>
          )}
          {!me.user.dob && <Link to="/me/edit" className="btn ghost block">Add date of birth (18+)</Link>}
        </div>
      </div>
    );
  }
  if (!d) return <div className="page"><Header title="Host centre" /><Spinner /></div>;

  const rate = d.rate.diamondsPerUnit || d.rate.diamondsPerRupee;
  const sym = d.rate.symbol || '₹';
  const cash = (dia) => `${sym}${(Number(dia || 0) / rate).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const methods = d.rate.methods || ['upi', 'bank'];
  const m = methods.includes(method) ? method : methods[0];
  const withdraw = async (e) => {
    e.preventDefault();
    try { const r = await api('/host/withdraw', { method: 'POST', body: { diamonds: Number(amt), method: m, account } }); setWallet(r.wallet); toast(r.instant ? 'Sent to your UPI' : 'Withdrawal requested'); setAmt(''); load(); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <Header title="Host centre" />
      <div className="balance-hero"><GemIcon size={30} /><b>{fmt(d.wallet.diamonds)}</b><span>diamonds ≈ {cash(d.wallet.diamonds)}</span></div>
      {!d.verified && <Link to="/verify" className="pill warn block-link"><Icon name="shield" size={16} /> {t('verifyFirst')} ›</Link>}
      <section className="card rate-card">
        <h3>{t('rateCard')}</h3>
        <ul>
          <li>{t('rate1')}</li>
          <li>{t('rate2', { d: fmt(rate), money1: `${sym}1` })}</li>
          <li>{d.rate.agency ? `${d.rate.agency.name} (level ${d.rate.agency.level}): ` : ''}{t('rate3')}</li>
          <li>{t('rate4', { min: fmt(d.rate.minWithdraw) })} ({cash(d.rate.minWithdraw)})</li>
        </ul>
      </section>
      <div className="stat-grid">
        <div><b>{fmt(d.today)}</b><span>Today</span></div>
        <div><b>{fmt(d.week)}</b><span>7 days</span></div>
        <div><b>{fmt(d.month)}</b><span>30 days</span></div>
        <div><b>{fmt(d.total)}</b><span>All time</span></div>
      </div>
      <h3 className="section-title">Daily record</h3>
      <div className="list compact">
        {d.daily.length === 0 ? <p className="muted">Go live to start earning.</p> : d.daily.map((x) => (
          <div key={x.day} className="list-row"><span className="grow">{x.day}</span><span className="muted">{(Number(x.live_seconds) / 3600).toFixed(1)} h</span><span className="coins">{fmt(x.diamonds)}</span></div>
        ))}
      </div>
      <h3 className="section-title">Withdraw</h3>
      <form className="form" onSubmit={withdraw}>
        <label>Diamonds (minimum {fmt(d.rate.minWithdraw)})<input className="input" inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ''))} /></label>
        {amt && <p className="muted small">You will receive about {cash(amt)}{sym === '₹' ? ' before TDS' : ''}.</p>}
        <div className="seg small wrap">{methods.map((x) => <button key={x} type="button" className={m === x ? 'on' : ''} onClick={() => setMethod(x)}>{METHODS[x] || x}</button>)}</div>
        <input className="input" placeholder={PH[m] || 'Account details'} value={account} onChange={(e) => setAccount(e.target.value)} />
        <button className="btn primary block">Request withdrawal</button>
      </form>
      {d.withdrawals.length > 0 && <>
        <h3 className="section-title">Requests</h3>
        <div className="list compact">{d.withdrawals.map((w) => (
          <div key={w.id} className="list-row"><span className="grow">{new Date(Number(w.created_at)).toLocaleDateString('en-IN')}</span><span>{w.currency && w.currency !== 'INR' ? `${w.currency} ${(Number(w.amount_paise) / 100).toFixed(2)}` : rupees(w.amount_paise)}</span><span className={`status ${w.status}`}>{w.status}</span></div>
        ))}</div>
      </>}
    </div>
  );
}
