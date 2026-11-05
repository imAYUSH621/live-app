import { useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import AnimPlayer from './AnimPlayer.jsx';
import { useT } from '../i18n.js';
import { assetUrl } from '../api.js';

// ---------- icons (inline SVG, no icon font needed) ----------
const P = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  chat: 'M4 4h16v12H8l-4 4z',
  user: 'M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm-8 10a8 8 0 0 1 16 0z',
  plus: 'M12 5v14M5 12h14',
  gift: 'M3 9h18v4H3zM5 13h14v8H5zM12 9v12M12 9c-2-4-6-4-6-1s6 1 6 1zm0 0c2-4 6-4 6-1s-6 1-6 1z',
  heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z',
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm5-2l5 5',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8',
  share: 'M18 8a3 3 0 1 0-3-3l-7 4a3 3 0 1 0 0 6l7 4a3 3 0 1 0 1-2l-7-4 7-4a3 3 0 0 0 2 1z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  micOff: 'M3 3l18 18M9 9v3a3 3 0 0 0 5 2M15 10V6a3 3 0 0 0-6 0M5 11a7 7 0 0 0 11 5M19 11a7 7 0 0 1-1 3M12 18v3',
  cam: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  flip: 'M4 12a8 8 0 0 1 14-5l2-2v6h-6l2-2a5 5 0 0 0-9 3M20 12a8 8 0 0 1-14 5l-2 2v-6h6l-2 2a5 5 0 0 0 9-3',
  sparkle: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z',
  coin: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9 9.5c0-1 1.3-1.5 3-1.5s3 .7 3 1.7-1.3 1.6-3 1.8-3 .8-3 1.8 1.3 1.7 3 1.7 3-.5 3-1.5',
  gem: 'M6 3h12l3 6-9 12L3 9zM3 9h18M9 3l3 18 3-18',
  vs: 'M4 5l4 14 4-14M20 7a3 3 0 0 0-3-2c-2 0-3 1-3 3s6 2 6 5-1 4-3 4a3 3 0 0 1-3-2',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-2-4-2 1-2-1-1-2h-4L9 6 7 7 5 6 3 10l2 1v2l-2 1 2 4 2-1 2 1 1 2h4l1-2 2-1 2 1 2-4-2-1z',
  crown: 'M3 18h18M4 16l-1-9 5 4 4-7 4 7 5-4-1 9z',
  store: 'M4 9h16l-1-5H5zM5 9v11h14V9M9 20v-6h6v6',
  wallet: 'M3 7h18v13H3zM3 7l13-4v4M16 13h3',
  agency: 'M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  send: 'M3 11l18-8-8 18-2-8z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  beauty: 'M12 3c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  translate: 'M4 5h9M8.5 3v2M6 5c1 4 4 7 7 8M11 5c-1 4-4 7-7 8M13 21l4-10 4 10M14.5 17h5',
  badge: 'M12 2l3 3h4v4l3 3-3 3v4h-4l-3 3-3-3H5v-4l-3-3 3-3V5h4z',
};
export function Icon({ name, size = 22, fill = false, stroke = 2, className, style }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'}
      stroke={fill ? 'none' : 'currentColor'} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] || P.sparkle} />
    </svg>
  );
}

export function CoinIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffe27a" /><stop offset="1" stopColor="#f5a300" /></linearGradient></defs>
      <circle cx="12" cy="12" r="10" fill="url(#cg)" stroke="#c77c00" strokeWidth="1.5" />
      <text x="12" y="16.5" textAnchor="middle" fontSize="12" fontWeight="800" fill="#9a5b00">C</text>
    </svg>
  );
}
export function GemIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h12l4 6-10 12L2 9z" fill="#7dd3fc" stroke="#0284c7" strokeWidth="1.2" />
      <path d="M2 9h20M9 3l3 18 3-18" stroke="#e0f2fe" strokeWidth="1" fill="none" />
    </svg>
  );
}

// ---------- avatar with optional animated frame ----------
export function Avatar({ user, size = 44, frame = true, onClick }) {
  const src = assetUrl(user?.avatar);
  const initials = (user?.name || '?').slice(0, 1).toUpperCase();
  const hue = [...(user?.id || 'x')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const f = frame && user?.frame;
  return (
    <div className="avatar" style={{ width: size, height: size }} onClick={onClick}>
      {src ? <img src={src} alt="" /> : <div className="avatar-fallback" style={{ background: `linear-gradient(135deg,hsl(${hue} 80% 60%),hsl(${(hue + 50) % 360} 80% 45%))`, fontSize: size * 0.42 }}>{initials}</div>}
      {f && <AnimPlayer src={assetUrl(f.url)} type={f.type} loop className="avatar-frame" />}
    </div>
  );
}

export function LevelBadge({ level, vip }) {
  return (
    <span className="badges">
      <span className="lv" style={{ background: level >= 30 ? 'linear-gradient(90deg,#ff7b00,#ff3d77)' : level >= 10 ? 'linear-gradient(90deg,#7b2cff,#c026d3)' : 'linear-gradient(90deg,#0ea5e9,#22c55e)' }}>Lv{level || 1}</span>
      {vip > 0 && <span className="vip">VIP{vip}</span>}
    </span>
  );
}

export function Header({ title, right, back = true }) {
  const nav = useNavigate();
  return (
    <header className="page-head">
      {back ? <button className="icon-btn" onClick={() => nav(-1)} aria-label="Back"><Icon name="back" /></button> : <span style={{ width: 36 }} />}
      <h1>{title}</h1>
      <div className="head-right">{right}</div>
    </header>
  );
}

export function Sheet({ open, onClose, children, title, className = '' }) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className={`sheet ${className}`} onClick={(e) => e.stopPropagation()}>
        {title && <div className="sheet-title">{title}<button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button></div>}
        {children}
      </div>
    </div>
  );
}

export function BottomNav() {
  const nav = useNavigate();
  const t = useT();
  return (
    <nav className="bottom-nav">
      <NavLink to="/" end><Icon name="home" /><span>{t('home')}</span></NavLink>
      <NavLink to="/rank"><Icon name="trophy" /><span>{t('rank')}</span></NavLink>
      <button className="go-live-btn" onClick={() => nav('/golive')} aria-label={t('goLive')}><Icon name="plus" size={28} stroke={3} /></button>
      <NavLink to="/messages"><Icon name="chat" /><span>{t('chats')}</span></NavLink>
      <NavLink to="/me"><Icon name="user" /><span>{t('me')}</span></NavLink>
    </nav>
  );
}

// Blue tick for hosts who passed ID + live selfie verification.
export function VerifiedBadge({ user, size = 14 }) {
  if (!user?.verified) return null;
  return (
    <svg className="verified-badge" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Verified">
      <path fill="#1d9bf0" d="M12 1l2.6 2.2 3.4-.4 1 3.3 3 1.7-1 3.2 1 3.2-3 1.7-1 3.3-3.4-.4L12 23l-2.6-2.2-3.4.4-1-3.3-3-1.7 1-3.2-1-3.2 3-1.7 1-3.3 3.4.4z" />
      <path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Empty({ text, icon = 'sparkle' }) {
  return <div className="empty"><Icon name={icon} size={40} /><p>{text}</p></div>;
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}
