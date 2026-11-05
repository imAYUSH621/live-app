import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { BottomNav, Empty, Icon, LevelBadge, Spinner, VerifiedBadge } from '../components/ui.jsx';
import { useT } from '../i18n.js';

export const CATEGORIES = [['talk', '💬'], ['music', '🎵'], ['bhakti', '🪔'], ['shayari', '✍️'], ['comedy', '😂'], ['astrology', '🔮'], ['study', '📚'], ['dance', '💃'], ['cooking', '🍳'], ['fitness', '💪'], ['games', '🎲']];

const TABS = ['popular', 'new', 'following', 'party'];

export default function Home() {
  const { config, lang, lowData, me } = useApp();
  const t = useT();
  const [tab, setTab] = useState('popular');
  const [cat, setCat] = useState('');
  const [near, setNear] = useState(false);
  const [myLang, setMyLang] = useState(false);
  const [rooms, setRooms] = useState(null);
  const [banners, setBanners] = useState([]);
  const [bi, setBi] = useState(0);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const nav = useNavigate();

  useEffect(() => { api('/banners').then(setBanners).catch(() => {}); }, []);
  useEffect(() => {
    let alive = true;
    setRooms(null);
    const qs = new URLSearchParams({ tab: tab === 'party' ? 'audio' : tab });
    if (cat) qs.set('category', cat);
    if (near) qs.set('near', '1');
    if (myLang) qs.set('lang', lang);
    const load = () => api(`/live?${qs}`).then((r) => alive && setRooms(r)).catch(() => alive && setRooms([]));
    load();
    const timer = setInterval(load, lowData ? 45000 : 15000);
    return () => { alive = false; clearInterval(timer); };
  }, [tab, cat, near, myLang, lang, lowData]);
  useEffect(() => {
    if (banners.length < 2) return undefined;
    const t = setInterval(() => setBi((i) => (i + 1) % banners.length), 4000);
    return () => clearInterval(t);
  }, [banners.length]);
  useEffect(() => {
    if (!q.trim()) return setResults([]);
    const t = setTimeout(() => api(`/search?q=${encodeURIComponent(q)}`).then(setResults).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="page with-nav">
      <header className="home-head">
        <div className="brand">{config.appName || 'Omnistu Live'}</div>
        <div className="row gap">
          <button className="icon-btn" onClick={() => setSearch((s) => !s)} aria-label="Search"><Icon name="search" size={20} /></button>
        </div>
      </header>
      {search && (
        <div className="search-box">
          <input autoFocus placeholder={t('searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
          {results.map((u) => (
            <Link key={u.id} to={`/user/${u.id}`} className="search-row">
              <img src={u.avatar || '/icon.svg'} alt="" /><span>{u.name}</span><small>ID {u.publicId}</small>
            </Link>
          ))}
        </div>
      )}
      {banners.length > 0 && (
        <div className="banner" onClick={() => banners[bi]?.link && nav(banners[bi].link)}>
          <img src={banners[bi]?.image} alt={banners[bi]?.title || ''} />
          <div className="dots">{banners.map((b, i) => <i key={b.id} className={i === bi ? 'on' : ''} />)}</div>
        </div>
      )}
      <div className="tabs">
        {TABS.map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(k)}</button>)}
      </div>
      <div className="cat-row" role="tablist" aria-label="Categories">
        <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>{t('all')}</button>
        {CATEGORIES.map(([k, e]) => <button key={k} className={cat === k ? 'on' : ''} onClick={() => setCat(cat === k ? '' : k)}>{e} {t(`cat_${k}`)}</button>)}
      </div>
      <div className="filter-row">
        <button className={near ? 'on' : ''} onClick={() => setNear(!near)}>📍 {t('nearMe')}{me?.country ? ` · ${me.country.code}` : ''}</button>
        <button className={myLang ? 'on' : ''} onClick={() => setMyLang(!myLang)}>🗣 {t('myLang')}</button>
      </div>
      {!rooms ? <Spinner /> : rooms.length === 0 ? (
        <Empty text={tab === 'following' ? t('noFollowLive') : t('noLive')} />
      ) : (
        <div className="room-grid">
          {rooms.map((r) => (
            <Link key={r.id} to={`/live/${r.id}`} className="room-card">
              <img src={r.cover || r.host.avatar || '/icon.svg'} alt="" loading="lazy" />
              <div className="rc-top">
                <span className="live-dot">{(r.type === 'audio' || r.type === 'party') ? t('partyTag') : t('live')}</span>
                {r.inPk && <span className="pk-tag">PK</span>}
                <span className="cat-tag">{(CATEGORIES.find((c) => c[0] === r.category) || CATEGORIES[0])[1]} {t(`cat_${r.category}`)}</span>
              </div>
              <div className="rc-viewers"><Icon name="eye" size={13} /> {fmt(r.viewers)}</div>
              <div className="rc-bottom">
                <b>{r.host.name} <VerifiedBadge user={r.host} /></b>
                <span>{r.title}</span>
                <LevelBadge level={r.host.hostLevel} vip={r.host.vip} />
              </div>
            </Link>
          ))}
        </div>
      )}
      <BottomNav />
    </div>
  );
}
