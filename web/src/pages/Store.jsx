import { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import AnimPlayer from '../components/AnimPlayer.jsx';
import { Avatar, CoinIcon, Header, Icon, Spinner } from '../components/ui.jsx';

const TABS = [['vip', 'VIP'], ['entry', 'Entry effects'], ['frame', 'Frames'], ['bubble', 'Chat bubbles'], ['badge', 'Badges']];
const PERK_LABELS = {
  badge: 'VIP badge', colored_name: 'Colored name', see_visitors: 'See profile visitors',
  vip_gifts: 'VIP-only gifts', entry_effect: 'Entry effect', anti_kick: 'Cannot be kicked from rooms',
  frame: 'Profile frame', hide_level: 'Hide level', hide_online: 'Hide online status',
};
const perkList = (perks) => Object.keys(perks || {}).filter((k) => perks[k]).map((k) => PERK_LABELS[k] || k.replace(/_/g, ' '));

export default function Store({ vipFirst }) {
  const { setWallet, toast, refresh, me } = useApp();
  const [tab, setTab] = useState(vipFirst ? 'vip' : 'entry');
  const [items, setItems] = useState(null);
  const [vip, setVip] = useState(null);
  const [preview, setPreview] = useState(null);
  const load = () => {
    api('/store').then(setItems).catch(() => {});
    api('/vip').then(setVip).catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const mine = (me && (me.user || me).items) || [];
  const owned = (itemId) => mine.find((m) => m.item_id === itemId);
  const applyMe = (d) => { if (d && typeof d.coins === 'number') setWallet({ coins: d.coins, diamonds: d.diamonds ?? 0 }); refresh(); };

  const buy = async (item) => {
    if (!window.confirm(`Buy ${item.name} for ${fmt(item.price)} coins (${item.duration_days} days)?`)) return;
    try { const r = await api('/store/buy', { method: 'POST', body: { item_id: item.id } }); applyMe(r); toast('Purchased and equipped'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const equip = async (row, on) => {
    try { const r = await api('/store/equip', { method: 'POST', body: { user_item_id: row.id, equip: on } }); applyMe(r); load(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const buyVip = async (t) => {
    if (!window.confirm(`Buy ${t.name} for ${fmt(t.price)} coins (${t.duration_days} days)?`)) return;
    try { const r = await api('/vip/buy', { method: 'POST', body: { level: t.level } }); applyMe(r); toast('VIP activated'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const vipActive = vip && vip.expires && new Date(vip.expires) > new Date();

  return (
    <div className="page">
      <Header title="Store" right={<span className="coin-pill"><CoinIcon size={14} /> {fmt((me && (me.user || me).coins) || 0)}</span>} />
      <div className="tabs scroll">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'vip' ? (
        !vip ? <Spinner /> : (
          <div className="vip-list">
            {vipActive && <p className="pill">Your VIP: level {vip.current}, valid till {new Date(vip.expires).toLocaleDateString('en-IN')}</p>}
            {(vip.levels || []).map((t) => (
              <div key={t.level} className="vip-card">
                <div className="vip-top"><Icon name="crown" size={26} /><h3>{t.name}</h3></div>
                <ul>{perkList(t.perks).map((p) => <li key={p}>{p}</li>)}</ul>
                <button className="btn primary" onClick={() => buyVip(t)}><CoinIcon size={14} /> {fmt(t.price)} / {t.duration_days} days</button>
              </div>
            ))}
          </div>
        )
      ) : (
        !items ? <Spinner /> : (
          <div className="store-grid">
            {items.filter((i) => i.type === tab).map((item) => {
              const o = owned(item.id);
              return (
                <div key={item.id} className={`store-item ${item.type}`}>
                  <div className="si-preview" onClick={() => item.type !== 'bubble' && setPreview(item)}>
                    {item.type === 'frame' && <div className="frame-demo"><Avatar user={me?.user} size={70} frame={false} /><AnimPlayer src={item.anim_url} loop className="avatar-frame" /></div>}
                    {item.type === 'entry' && (/^(\/|https?:)/.test(item.preview || '') ? <img src={item.preview} alt="" /> : <div style={{ fontSize: 44 }}>{item.preview}</div>)}
                    {item.type === 'bubble' && <div className={`chat-msg ${item.anim_url}`}><b>You:</b> <span>Hello!</span></div>}
                    {item.type === 'badge' && <div className="badge-demo" style={{ fontSize: 44 }}>{item.preview}</div>}
                  </div>
                  <b>{item.name}</b>
                  {item.vip_level > 0 ? <span className="tag">VIP {item.vip_level}+</span> : null}
                  {o ? (
                    <button className="btn" onClick={() => equip(o, !o.equipped)}>{o.equipped ? 'Unequip' : 'Equip'}</button>
                  ) : (
                    <button className="btn primary" onClick={() => buy(item)}><CoinIcon size={14} /> {fmt(item.price)}</button>
                  )}
                </div>
              );
            })}
            {items.filter((i) => i.type === tab).length === 0 && <p className="muted">No {tab} items yet.</p>}
          </div>
        )
      )}
      {preview && (
        <div className="sheet" onClick={() => setPreview(null)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            <h3>{preview.name}</h3>
            {preview.type === 'entry' && (/^(\/|https?:)/.test(preview.preview || '') ? <img src={preview.preview} alt="" style={{ width: '100%' }} /> : <div style={{ fontSize: 64, textAlign: 'center' }}>{preview.preview}</div>)}
            {preview.type === 'frame' && <AnimPlayer src={preview.anim_url} loop style={{ width: 160, height: 160 }} />}
            {preview.type === 'badge' && <div style={{ fontSize: 64, textAlign: 'center' }}>{preview.preview}</div>}
            <button className="btn" onClick={() => setPreview(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
