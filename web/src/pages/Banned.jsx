import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { useT } from '../i18n.js';
import { CoinIcon, GemIcon, Icon, Spinner } from '../components/ui.jsx';

const METHODS = { upi: 'UPI', bank: 'Bank (India)', bank_intl: 'Bank transfer', paypal: 'PayPal', payoneer: 'Payoneer', wise: 'Wise' };

export default function Banned() {
  const { toast, logout, lang } = useApp();
  const t = useT();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [text, setText] = useState('');
  const [method, setMethod] = useState('');
  const [account, setAccount] = useState('');
  const load = () => api('/appeal').then((x) => { if (!x.banned) nav('/', { replace: true }); else setD(x); }).catch((e) => toast(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <div className="page"><Spinner /></div>;
  const open = d.appeals.find((a) => a.status === 'open');
  const send = async (e) => {
    e.preventDefault();
    try { await api('/appeal', { method: 'POST', body: { text, payoutMethod: method || undefined, payoutAccount: account || undefined } }); toast('Appeal sent'); load(); }
    catch (err) { toast(err.message, 'error'); }
  };
  return (
    <div className="page banned">
      <div className="card center-text">
        <Icon name="lock" size={44} />
        <h2>{t('bannedTitle')}</h2>
        <p className="muted">{t('bannedUntil', { date: new Date(d.banUntil).toLocaleDateString(lang) })}</p>
        <div className="wallet-tiles"><div><CoinIcon size={22} /><b>{fmt(d.wallet.coins)}</b></div><div><GemIcon size={22} /><b>{fmt(d.wallet.diamonds)}</b></div></div>
        <p className="small">{t('bannedSafe')}</p>
      </div>
      {open ? <p className="pill">{t('appealOpen')}</p> : (
        <form className="form" onSubmit={send}>
          <textarea className="input" rows={4} minLength={10} required placeholder={t('appealPh')} value={text} onChange={(e) => setText(e.target.value)} />
          {d.wallet.diamonds > 0 && <>
            <p className="muted small">{t('payoutFor')}</p>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}><option value="">—</option>{d.payoutMethods.map((m) => <option key={m} value={m}>{METHODS[m] || m}</option>)}</select>
            {method && <input className="input" placeholder="UPI ID / account / email" value={account} onChange={(e) => setAccount(e.target.value)} />}
          </>}
          <button className="btn primary block">{t('appealSend')}</button>
        </form>
      )}
      {d.appeals.filter((a) => a.status !== 'open').map((a) => <p key={a.id} className="muted small">Earlier appeal: {a.status}{a.note ? ` — ${a.note}` : ''}</p>)}
      <button className="btn ghost block" onClick={() => { logout(); nav('/login'); }}>{t('logout')}</button>
    </div>
  );
}
