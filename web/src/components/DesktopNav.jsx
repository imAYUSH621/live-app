import { useState } from 'react';
import { useApp } from '../store.jsx';
import { api } from '../api.js';

export default function DesktopNav() {
  const { me, login, refresh } = useApp();
  const [showCreds, setShowCreds] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const quickLogin = async (role) => {
    setLoggingIn(true);
    try {
      const r = await api('/auth/demo-login', { method: 'POST', body: { role } });
      if (r.token) {
        login(r.token);
        window.location.href = '/';
      }
    } catch (e) {
      console.error('Quick login error:', e);
    }
    setLoggingIn(false);
  };

  const copyText = (text) => {
    navigator.clipboard?.writeText(text);
  };

  return (
    <>
      <header className="desktop-top-header">
        <div className="desktop-header-left">
          <div className="desktop-logo-pill">
            <span className="live-pulse-dot" />
            <span className="desktop-brand-name">OMNISTU LIVE</span>
            <span className="desktop-edition-badge">ENTERPRISE STAGING DEMO</span>
          </div>
        </div>

        <nav className="desktop-header-nav">
          <a href="/" className="desktop-nav-link active">
            <span className="nav-icon">📱</span> User & Streamer App
          </a>
          <a href="https://admin.omnistu.com" target="_blank" rel="noopener noreferrer" className="desktop-nav-link">
            <span className="nav-icon">👑</span> Super Admin Console ↗
          </a>
          <a href="https://admin.omnistu.com" target="_blank" rel="noopener noreferrer" className="desktop-nav-link">
            <span className="nav-icon">🏢</span> Agency Partner Portal ↗
          </a>
          <a href="https://admin.omnistu.com/seller" target="_blank" rel="noopener noreferrer" className="desktop-nav-link">
            <span className="nav-icon">💎</span> Wholesale Coin Seller ↗
          </a>
        </nav>

        <div className="desktop-header-right">
          <button 
            type="button" 
            className="btn-desktop-creds"
            onClick={() => setShowCreds(true)}
          >
            🔑 Test Credentials & Portals
          </button>
        </div>
      </header>

      {/* Credentials Modal */}
      {showCreds && (
        <div className="creds-modal-overlay" onClick={() => setShowCreds(false)}>
          <div className="creds-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="creds-modal-header">
              <div>
                <h3>Enterprise Demo Credentials</h3>
                <p className="creds-modal-subtitle">All roles and testing accounts pre-configured for evaluation</p>
              </div>
              <button type="button" className="creds-close-btn" onClick={() => setShowCreds(false)}>✕</button>
            </div>

            <div className="creds-grid">
              {/* Super Admin */}
              <div className="creds-box">
                <div className="creds-box-title">
                  <span>👑 Super Admin Console</span>
                  <a href="https://admin.omnistu.com" target="_blank" rel="noreferrer" className="creds-link">Launch ↗</a>
                </div>
                <div className="creds-detail">
                  <div><strong>Portal:</strong> <code>https://admin.omnistu.com</code></div>
                  <div><strong>Email:</strong> <code>admin@omnistu.live</code></div>
                  <div><strong>Password:</strong> <code>nAZQmzuLxFnqqNJb1ii1p98</code></div>
                </div>
                <p className="creds-desc">Platform metrics, gift catalog, bans, host approvals, financial ledgers.</p>
              </div>

              {/* Agency Partner */}
              <div className="creds-box">
                <div className="creds-box-title">
                  <span>🏢 Agency Partner Portal</span>
                  <a href="https://admin.omnistu.com" target="_blank" rel="noreferrer" className="creds-link">Launch ↗</a>
                </div>
                <div className="creds-detail">
                  <div><strong>Portal:</strong> <code>https://admin.omnistu.com</code></div>
                  <div><strong>Email:</strong> <code>agency@omnistu.live</code></div>
                  <div><strong>Password:</strong> <code>uSZYPmvMAf4tlIPY872kMv</code></div>
                </div>
                <p className="creds-desc">Manage agency hosts, track live hours, 20% commission settlements.</p>
              </div>

              {/* Coin Seller */}
              <div className="creds-box">
                <div className="creds-box-title">
                  <span>💎 Wholesale Coin Distributor</span>
                  <a href="https://admin.omnistu.com/seller" target="_blank" rel="noreferrer" className="creds-link">Launch ↗</a>
                </div>
                <div className="creds-detail">
                  <div><strong>Portal:</strong> <code>https://admin.omnistu.com/seller</code></div>
                  <div><strong>Seller ID:</strong> <code>10001</code></div>
                  <div><strong>Password:</strong> <code>nIG9qIw9l6FGwZFdioRO</code></div>
                </div>
                <p className="creds-desc">Wholesale coin transfers directly to user UIDs with real-time settlement.</p>
              </div>

              {/* Instant App Roles */}
              <div className="creds-box highlight-box">
                <div className="creds-box-title">
                  <span>⚡ 1-Click Instant App Login</span>
                  <span className="creds-tag">No SMS Required</span>
                </div>
                <div className="persona-quick-btns">
                  <button 
                    type="button" 
                    className="persona-btn aria"
                    disabled={loggingIn}
                    onClick={() => { quickLogin('aria'); setShowCreds(false); }}
                  >
                    🌟 Aria (Star Host)
                  </button>
                  <button 
                    type="button" 
                    className="persona-btn rohan"
                    disabled={loggingIn}
                    onClick={() => { quickLogin('rohan'); setShowCreds(false); }}
                  >
                    🎵 Rohan (Live Beats Host)
                  </button>
                  <button 
                    type="button" 
                    className="persona-btn fan"
                    disabled={loggingIn}
                    onClick={() => { quickLogin('fan'); setShowCreds(false); }}
                  >
                    💎 VIP Fan (10K Coins)
                  </button>
                </div>
                <p className="creds-desc">Or login via OTP with phone <code>9999990002</code> / OTP <code>123456</code>.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
