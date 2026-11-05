import { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import AnimPlayer from '../components/AnimPlayer.jsx';
import { Avatar, CoinIcon, Header, Icon, Spinner } from '../components/ui.jsx';

const TABS = [['vip', 'VIP'], ['entry', 'Entry effects'], ['frame', 'Frames'], ['bubble', 'Chat bubbles']];

export default function Store({ vipFirst }) {
  const { wallet, setWallet, toast, refresh, me } = useApp();
  const [tab, setTab] = useState(vipFirst ? 'vip' : 'entry');
  const [data, setData] = useState(null);
  const [preview, setPreview] = useState(null);
  const load = () => api('/store').then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const owned = (id) => data?.mine.find((m) => m.item_id === id);
  const buy = async (item) => {
    if (!window.confirm(`Buy ${item.name} for ${fmt(item.price)} coins (${item.days} days)?`)) return;
    try { const r = await api('/store/buy', { method: 'POST', body: { itemId: item.id } }); setWallet(r.wallet); toast('Purchased and equipped'); load(); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const equip = async (item, on) => {
    try { await api('/store/equip', { method: 'POST', body: { itemId: item.id, equip: on } }); load(); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const buyVip = async (t) => {
    if (!window.confirm(`Buy VIP ${t.name} for ${fmt(t.price)} coins (${t.days} days)?`)) return;
    try { const r = await api('/vip/buy', { method: 'POST', body: { level: t.level } }); setWallet(r.wallet); toast(`You are now VIP ${t.name}!`); load(); refresh(); }
    catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="page">
      <Header title="Store" right={<span className="coin-pill"><CoinIcon size={14} /> {fmt(wallet.coins)}</span>} />
      <div className="tabs scroll">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {!data ? <Spinner /> : tab === 'vip' ? (
        <div className="vip-list">
          {data.myVip.level > 0 && <p className="pill">Your VIP: level {data.myVip.level}, valid till {new Date(Number(data.myVip.expiry)).toLocaleDateString('en-IN')}</p>}
          {data.vip.map((t) => (
            <div key={t.level} className="vip-card" style={{ '--vc': t.color }}>
              <div className="vip-top"><Icon name="crown" size={26} /><h3>VIP{t.level} · {t.name}</h3></div>
              <ul>{t.perks.map((p) => <li key={p}>{p}</li>)}</ul>
              <button className="btn primary" onClick={() => buyVip(t)}><CoinIcon size={14} /> {fmt(t.price)} / {t.days} days</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="store-grid">
          {data.items.filter((i) => i.type === tab).map((item) => {
            const o = owned(item.id);
            return (
              <div key={item.id} className={`store-item ${item.type}`}>
                <div className="si-preview" onClick={() => item.type !== 'bubble' && setPreview(item)}>
                  {item.type === 'frame' && <div className="frame-demo"><Avatar user={me?.user} size={70} frame={false} /><AnimPlayer src={item.anim_url} loop className="avatar-frame" /></div>}
                  {item.type === 'entry' && <img src={item.preview} alt="" />}
                  {item.type === 'bubble' && <div className={`chat-msg ${item.anim_url}`}><b>You:</b> <span>Hello!</span></div>}
                </div>
                <b>{item.name}</b>
                {item.vip_only ? <span className="tag">VIP only</span> : null}
                {o ? (
                  <button className={`btn small ${o.equipped ? '' : 'primary'}`} onClick={() => equip(item, !o.equipped)}>{o.equipped ? 'Unequip' : 'Equip'}</button>
                ) : (
                  <button className="btn small primary" onClick={() => buy(item)}><CoinIcon size={12} /> {fmt(item.price)}</button>
                )}
                {o && <small className="muted">till {new Date(Number(o.expires_at)).toLocaleDateString('en-IN')}</small>}
              </div>
            );
          })}
        </div>
      )}
      {preview && (
        <div className="modal-wrap" onClick={() => setPreview(null)}>
          <div className="entry-preview">
            <AnimPlayer key={preview.id} src={preview.anim_url} loop className="entry-anim" />
            <div className="entry-who"><Avatar user={me?.user} size={46} frame={false} /><div><b>{me?.user?.name}</b><span>joined the room</span></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
