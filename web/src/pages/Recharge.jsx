import { useEffect, useState } from 'react';
import { api, fmt, rupees } from '../api.js';
import { useApp } from '../store.jsx';
import { Link } from 'react-router-dom';
import { CoinIcon, Header, Spinner } from '../components/ui.jsx';
import { useT } from '../i18n.js';

function loadRazorpay() {
  return new Promise((res, rej) => {
    if (window.Razorpay) return res(window.Razorpay);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => res(window.Razorpay);
    s.onerror = rej;
    document.body.appendChild(s);
  });
}

export default function Recharge() {
  const { wallet, setWallet, toast, me } = useApp();
  const t = useT();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState('coins');
  const [ledger, setLedger] = useState([]);
  useEffect(() => { api('/recharge/packs').then(setData).catch(() => {}); }, []);
  useEffect(() => { if (tab === 'history') api('/wallet/ledger?currency=coins').then(setLedger).catch(() => {}); }, [tab]);

  const buy = async (p) => {
    setBusy(p.id);
    try {
      const o = await api('/recharge/order', { method: 'POST', body: { packId: p.id } });
      if (o.status === 'paid') {
        setWallet(o.wallet);
        toast(`${fmt(o.coins)} coins added (test mode)`);
      } else {
        const Razorpay = await loadRazorpay();
        const rz = new Razorpay({
          key: o.keyId, order_id: o.gatewayOrderId, amount: o.amount, currency: o.currency || 'INR', name: 'Coins', prefill: { contact: me?.user?.phone },
          handler: async (resp) => {
            try { const v = await api('/recharge/verify', { method: 'POST', body: resp }); setWallet(v.wallet); toast('Recharge successful'); }
            catch (e) { toast(e.message, 'error'); }
          },
          theme: { color: '#ff3d77' },
        });
        rz.open();
      }
    } catch (e) { toast(e.message, 'error'); if (e.code === 'need_age') window.location.assign('/me/edit'); }
    setBusy(null);
  };

  return (
    <div className="page">
      <Header title={t('recharge')} />
      <div className="balance-hero"><CoinIcon size={34} /><b>{fmt(wallet.coins)}</b><span>coins</span></div>
      <div className="tabs"><button className={tab === 'coins' ? 'on' : ''} onClick={() => setTab('coins')}>Buy coins</button><button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>History</button></div>
      {tab === 'coins' ? (!data ? <Spinner /> : (
        <>
          {data.gateway.provider === 'dev' && <p className="pill warn">Test mode: no payment gateway configured, coins are added instantly.</p>}
          <div className="pack-grid">
            {data.packs.map((p) => (
              <button key={p.id} className="pack" disabled={busy === p.id} onClick={() => buy(p)}>
                <CoinIcon size={30} />
                <b>{fmt(p.coins)}</b>
                {Number(p.bonus) > 0 && <span className="bonus">+{fmt(p.bonus)} bonus</span>}
                <span className="price">{p.priceLabel || rupees(p.price_paise)}</span>
              </button>
            ))}
          </div>
          {data.country?.methods?.length > 0 && <p className="muted small center-text">{data.country.name}: {data.country.methods.join(' · ')}</p>}
          <p className="muted small center-text">Coins are for gifts and items inside the app only. They cannot be converted to cash.{data.country?.code === 'IN' ? ' Prices include GST.' : ' Prices include local taxes where applicable.'}</p>
          <p className="center-text small"><Link to="/safety">{t('refunds')} ›</Link></p>
        </>
      )) : (
        <div className="list">{ledger.map((l) => (
          <div key={l.id} className="list-row"><div className="grow"><b>{l.type.replace(/_/g, ' ')}</b><small>{l.note || ''} · {new Date(Number(l.created_at)).toLocaleString('en-IN')}</small></div><span className={Number(l.amount) > 0 ? 'plus' : 'minus'}>{Number(l.amount) > 0 ? '+' : ''}{fmt(l.amount)}</span></div>
        ))}</div>
      )}
    </div>
  );
}
