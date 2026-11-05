import { Link, useNavigate } from 'react-router-dom';
import { fmt } from '../api.js';
import { useApp } from '../store.jsx';
import { Avatar, BottomNav, CoinIcon, GemIcon, Icon, LevelBadge, Spinner, VerifiedBadge } from '../components/ui.jsx';
import { useT } from '../i18n.js';

export default function Me() {
  const { me, wallet, logout } = useApp();
  const t = useT();
  const nav = useNavigate();
  if (!me) return <div className="page with-nav"><Spinner /><BottomNav /></div>;
  const u = me.user;
  const rows = [
    ['/recharge', 'coin', t('rechargeCoins')],
    ['/store', 'store', t('store')],
    ['/vip', 'crown', t('vip')],
    ['/host', 'gem', u.isHost && u.verified ? t('hostCentre') : t('becomeHost')],
    ['/verify', 'shield', u.verified ? 'Host Verified ✓' : u.hostStatus === 'pending' ? 'Host Verification Pending…' : u.hostStatus === 'suspended' ? 'Host Suspended ⛔' : t('verifyId')],
    ['/agency', 'agency', me.ownedAgency ? 'My agency' : me.agency ? `${t('agency')}: ${me.agency.name}` : t('agency')],
    ['/safety', 'lock', t('safety')],
    ['/me/edit', 'edit', t('editProfile')],
    ['/admin', 'lock', 'Admin Panel'],
  ];
  const copyId = () => {
    try {
      navigator.clipboard?.writeText(u.publicId);
      toast(`Copied ID ${u.publicId}`);
    } catch {
      toast(`ID: ${u.publicId}`);
    }
  };

  return (
    <div className="page with-nav">
      <div className="me-head">
        <Avatar user={u} size={84} />
        <div className="grow">
          <h2>{u.name} <VerifiedBadge user={u} size={18} /></h2>
          <p className="muted" onClick={copyId} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            ID: {u.publicId} <span style={{ fontSize: 11, background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4, color: 'var(--text-secondary)' }}>Copy</span>
          </p>
          <div><LevelBadge level={u.level} vip={u.vip} /></div>
        </div>
        <Link to={`/user/${u.id}`} className="icon-btn" aria-label="My profile"><Icon name="eye" /></Link>
      </div>
      <div className="me-stats">
        <Link to="/user/me?tab=following"><b>{me.following || 0}</b><span>Following</span></Link>
        <Link to="/user/me?tab=followers"><b>{me.followers || 0}</b><span>Fans</span></Link>
      </div>
      <div className="wallet-tiles">
        <button onClick={() => nav('/recharge')}><CoinIcon size={26} /><b>{fmt(wallet.coins)}</b><span>Coins (Recharge)</span></button>
        <button onClick={() => nav('/host')}><GemIcon size={26} /><b>{fmt(wallet.diamonds)}</b><span>Diamonds (Earnings)</span></button>
      </div>
      <div className="menu">
        {rows.map(([to, icon, label]) => <Link key={to} to={to} className="menu-row"><Icon name={icon} /> {label}<span className="chev">›</span></Link>)}
        <button className="menu-row danger" onClick={logout}><Icon name="logout" /> {t('logout')}</button>
      </div>
      <BottomNav />
    </div>
  );
}
