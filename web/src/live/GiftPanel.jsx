import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, assetUrl, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { preload } from '../components/AnimPlayer.jsx';
import { Avatar, CoinIcon, Sheet } from '../components/ui.jsx';
import { useT } from '../i18n.js';

const QTY = [1, 10, 99, 520];
const CATS = [['3d', '3D ✦'], ['local', 'local'], ['popular', 'Popular'], ['luxury', 'Luxury'], ['festival', 'Festival']];
let giftCache;

export function useGifts() {
  const { lowData } = useApp();
  const [gifts, setGifts] = useState(giftCache || []);
  useEffect(() => {
    if (giftCache) return;
    api('/gifts').then((g) => {
      // live-app server: price (not coins), categories normal/luxury/vip/event/lucky.
      // Map to the panel's IndiFun-style contract: coins + popular/festival tabs.
      const catAlias = { normal: 'popular', event: 'festival' };
      giftCache = g.map((x) => {
        const price = Number(x.price ?? x.coins ?? 0);
        return {
          ...x,
          icon: assetUrl(x.icon),
          animUrl: assetUrl(x.anim_url),
          animType: x.anim_type,
          coins: price,
          category: catAlias[x.category] || x.category,
          tier: x.tier || (price < 100 ? 'small' : price < 1000 ? 'medium' : price < 10000 ? 'large' : 'super'),
        };
      });
      setGifts(giftCache);
      // In low data mode only the small Lottie files are fetched ahead of time; videos load when sent.
      preload(giftCache.map((x) => x.anim_url).filter((u) => !lowData || /\.json$/.test(u)));
    }).catch(() => {});
  }, [lowData]);
  return gifts;
}
export const resetGiftCache = () => { giftCache = null; };

export default function GiftPanel({ open, onClose, roomId, host, seats = [] }) {
  const { wallet, setWallet, toast } = useApp();
  const t = useT();
  const gifts = useGifts();
  const [cat, setCat] = useState('3d');
  const [sel, setSel] = useState(null);
  const [qty, setQty] = useState(1);
  const [to, setTo] = useState(null);
  const [combo, setCombo] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const comboTimer = useRef();
  const nav = useNavigate();

  const receivers = useMemo(() => [host, ...seats.filter((s) => s.user && s.user.id !== host?.id).map((s) => s.user)].filter(Boolean), [host, seats]);
  const list = cat === 'local' ? gifts.filter((g) => g.local) : gifts.filter((g) => g.category === cat);
  const cats = CATS.filter(([k]) => (k === 'local' ? gifts.some((g) => g.local) : gifts.some((g) => g.category === k)));
  useEffect(() => {
    if (gifts.length && !cats.some(([k]) => k === cat) && cats.length) setCat(cats[0][0]);
  }, [gifts, cats, cat]);
  useEffect(() => { if (!sel && gifts.length) setSel(gifts[0]); }, [gifts, sel]);
  useEffect(() => () => clearTimeout(comboTimer.current), []);

  const send = async (isCombo = false, confirmToken = null) => {
    if (!sel || busy) return;
    if (wallet.coins < sel.coins * qty) {
      toast(t('notEnough'));
      return nav('/recharge');
    }
    setBusy(true);
    try {
      const nextCombo = isCombo ? combo + 1 : 1;
      const r = await api('/gifts/send', { method: 'POST', body: { room_id: Number(roomId), gift_id: sel.id, qty, receiver_id: (to || host)?.id, ...(confirmToken ? { confirm_token: confirmToken } : {}) } });
      setWallet((w) => ({ ...(w || {}), coins: r.balance }));
      setCombo(nextCombo);
      clearTimeout(comboTimer.current);
      comboTimer.current = setTimeout(() => setCombo(0), 3000);
      if (sel.tier !== 'small') onClose();
    } catch (e) {
      if (e.code === 'confirm_needed') {
        // bulk send: fetch a one-use server token and show the exact total first
        try {
          const c = await api('/gifts/confirm', { method: 'POST', body: { gift_id: sel.id, qty } });
          setConfirm({ token: c.token, name: c.name, qty: c.qty, coins: c.coins, isCombo });
        } catch (e2) {
          toast(e2.message, 'error');
        }
      } else if (e.code === 'daily_limit') { toast(t('dailyLimitHit'), 'error'); }
      else toast(e.message, 'error');
    }
    setBusy(false);
  };

  return (
    <>
      {combo > 0 && !open && (
        <button className="combo-btn" onClick={() => send(true)} aria-label="Send again">
          <img src={sel?.icon} alt="" /><span>Combo</span><b>x{combo}</b>
        </button>
      )}
      <Sheet open={open} onClose={onClose} className="gift-sheet">
        {receivers.length > 1 && (
          <div className="gift-to">
            <span>{t('sendTo')}</span>
            {receivers.map((u) => (
              <button key={u.id} className={(to || host)?.id === u.id ? 'on' : ''} onClick={() => setTo(u)}><Avatar user={u} size={30} frame={false} /></button>
            ))}
          </div>
        )}
        <div className="gift-cats">
          {cats.map(([k, l]) => <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(k)}>{k === 'local' ? `📍 ${t('local')}` : l}</button>)}
        </div>
        <div className="gift-grid">
          {list.map((g) => (
            <button key={g.id} className={`gift-cell ${sel?.id === g.id ? 'on' : ''} tier-${g.tier}`} onClick={() => setSel(g)}>
              <img src={g.icon} alt="" loading="lazy" />
              <span className="gname">{g.name}</span>
              <span className="gprice"><CoinIcon size={12} />{fmt(g.coins)}</span>
              {g.price && g.coins >= 10 && <span className="glocal">{g.price}</span>}
              {g.global_banner ? <i className="gtag">{t('global')}</i> : g.tier === 'large' ? <i className="gtag">{t('fullScreen')}</i> : null}
            </button>
          ))}
        </div>
        <div className="gift-foot">
          <button className="balance" onClick={() => nav('/recharge')}><CoinIcon size={16} /> {fmt(wallet.coins)} <span>{t('recharge')} ›</span></button>
          <div className="qty">{QTY.map((q) => <button key={q} className={qty === q ? 'on' : ''} onClick={() => setQty(q)}>{q}</button>)}</div>
          <button className="btn primary send" disabled={!sel || busy} onClick={() => send(false)}>{t('send')}</button>
        </div>
      </Sheet>
      {confirm && (
        <div className="gift-confirm-overlay" onClick={() => setConfirm(null)}>
          <div className="gift-confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3>{t('confirmTitle')}</h3>
            <p className="gc-detail">{confirm.qty} × {confirm.name}</p>
            <p className="gc-coins"><CoinIcon size={14} /> {t('confirmBody', { coins: fmt(confirm.coins) })}</p>
            <div className="row" style={{ gap: 10, marginTop: 14 }}>
              <button className="btn ghost" style={{ flex: 1 }} onClick={() => setConfirm(null)}>{t('cancel')}</button>
              <button className="btn primary" style={{ flex: 1 }} disabled={busy}
                onClick={() => { const c = confirm; setConfirm(null); send(c.isCombo, c.token); }}>{t('confirmYes')}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
