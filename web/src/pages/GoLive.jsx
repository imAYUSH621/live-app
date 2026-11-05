import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Header, Icon } from '../components/ui.jsx';
import { useT } from '../i18n.js';
import { CATEGORIES } from './Home.jsx';

const ROOM_LANGS = [['hi', 'हिन्दी'], ['en', 'English'], ['ar', 'العربية'], ['bho', 'भोजपुरी'], ['bn', 'বাংলা'], ['ta', 'தமிழ்'], ['te', 'తెలుగు'], ['mr', 'मराठी'], ['gu', 'ગુજરાતી'], ['pa', 'ਪੰਜਾਬੀ'], ['ml', 'മലയാളം'], ['kn', 'ಕನ್ನಡ'], ['ur', 'اردو'], ['id', 'Bahasa'], ['tl', 'Filipino']];

export default function GoLive() {
  const { me, toast, refresh, lang } = useApp();
  const t = useT();
  const [type, setType] = useState('video');
  const [category, setCategory] = useState('talk');
  const [roomLang, setRoomLang] = useState(lang || 'en');
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState(null);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  const user = me?.user;

  if (user && user.hostStatus === 'suspended') {
    return (
      <div className="page">
        <Header title={t('goLive')} />
        <div className="card center-text">
          <div style={{ fontSize: '48px', color: '#ef4444', marginBottom: '8px' }}>⛔</div>
          <h2 style={{ color: '#ef4444' }}>Host Account Suspended</h2>
          <p className="muted">Your host broadcasting privileges have been suspended by Admin.</p>
          <Link to="/safety" className="btn primary block">View Safety & Appeals</Link>
        </div>
      </div>
    );
  }

  const start = async () => {
    setBusy(true);
    try {
      const f = new FormData();
      f.append('type', type);
      f.append('title', title);
      f.append('category', category);
      f.append('language', roomLang);
      if (cover) f.append('cover', cover);
      const r = await api('/live/start', { method: 'POST', form: f });
      nav(`/live/${r.room.id}`, { replace: true });
    } catch (e) { toast(e.message, 'error'); if (e.code === 'need_kyc') nav('/verify'); if (e.code === 'need_age') nav('/me/edit'); }
    setBusy(false);
  };

  return (
    <div className="page">
      <Header title={t('goLive')} />
      <div className="golive">
        <div className="pill success" style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', fontWeight: '500' }}>
          <Icon name="shield" size={16} /> Verified Host • Live Streaming Authorized (Staging Demo)
        </div>
        <div className="seg">
          <button className={type === 'video' ? 'on' : ''} onClick={() => setType('video')}><Icon name="cam" /> {t('videoLive')}</button>
          <button className={type === 'audio' ? 'on' : ''} onClick={() => setType('audio')}><Icon name="mic" /> {t('partyRoom')}</button>
        </div>
        <label className="field-label">{t('category')}</label>
        <div className="chips">{CATEGORIES.map(([k, e]) => <button key={k} type="button" className={category === k ? 'on' : ''} onClick={() => setCategory(k)}>{e} {t(`cat_${k}`)}</button>)}</div>
        <label className="field-label">{t('roomLang')}
          <select className="input" value={roomLang} onChange={(e) => setRoomLang(e.target.value)}>{ROOM_LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="cover-pick">
          {cover ? <img src={URL.createObjectURL(cover)} alt="" /> : <span><Icon name="plus" /> Add cover</span>}
          <input type="file" accept="image/*" hidden onChange={(e) => setCover(e.target.files[0])} />
        </label>
        <input className="input" maxLength={60} placeholder="Title (e.g. Late night gaana)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <p className="muted small">By going live you agree to the community rules. Nudity, violence, minors on camera, and betting are not allowed and lead to a permanent ban.</p>
        <p className="muted small">Betting, real-money games and asking viewers for money outside the app are not allowed.</p>
        <button className="btn primary block big" disabled={busy} onClick={start}>{busy ? 'Starting…' : t('goLive')}</button>
      </div>
    </div>
  );
}
