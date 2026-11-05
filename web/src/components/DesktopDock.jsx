import { useState } from 'react';
import { useApp } from '../store.jsx';
import { api } from '../api.js';

export default function DesktopDock() {
  const { me, login, user } = useApp();
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

  return (
    <aside className="desktop-side-dock">
      <div className="dock-card">
        <div className="dock-header">
          <div className="dock-title">⚡ 1-Click Test Personas</div>
          <div className="dock-sub">Instant login • Bypasses SMS OTP</div>
        </div>

        <div className="dock-actions">
          <button 
            type="button" 
            className="dock-persona-btn aria-btn"
            disabled={loggingIn}
            onClick={() => quickLogin('aria')}
          >
            <div className="persona-info">
              <span className="persona-emoji">🌟</span>
              <div>
                <div className="persona-name">Aria (Star Host)</div>
                <div className="persona-role">Approved Host • Ready to Stream</div>
              </div>
            </div>
            <span className="persona-badge">Switch</span>
          </button>

          <button 
            type="button" 
            className="dock-persona-btn rohan-btn"
            disabled={loggingIn}
            onClick={() => quickLogin('rohan')}
          >
            <div className="persona-info">
              <span className="persona-emoji">🎵</span>
              <div>
                <div className="persona-name">Rohan (Live Beats)</div>
                <div className="persona-role">Audio & Video Broadcaster</div>
              </div>
            </div>
            <span className="persona-badge">Switch</span>
          </button>

          <button 
            type="button" 
            className="dock-persona-btn fan-btn"
            disabled={loggingIn}
            onClick={() => quickLogin('fan')}
          >
            <div className="persona-info">
              <span className="persona-emoji">💎</span>
              <div>
                <div className="persona-name">VIP Diamond Fan</div>
                <div className="persona-role">10,000 Coins • Gifting Ready</div>
              </div>
            </div>
            <span className="persona-badge">Switch</span>
          </button>
        </div>
      </div>

      <div className="dock-card">
        <div className="dock-header">
          <div className="dock-title">👑 Dedicated Portals</div>
          <div className="dock-sub">Full desktop widescreen suites</div>
        </div>

        <div className="dock-portals-list">
          <a href="https://admin.omnistu.com" target="_blank" rel="noreferrer" className="dock-portal-item">
            <div className="portal-left">
              <span className="portal-icon">👑</span>
              <div>
                <div className="portal-name">Super Admin Console</div>
                <div className="portal-sub">admin@omnistu.live</div>
              </div>
            </div>
            <span className="portal-arrow">↗</span>
          </a>

          <a href="https://admin.omnistu.com" target="_blank" rel="noreferrer" className="dock-portal-item">
            <div className="portal-left">
              <span className="portal-icon">🏢</span>
              <div>
                <div className="portal-name">Agency Partner Portal</div>
                <div className="portal-sub">agency@omnistu.live</div>
              </div>
            </div>
            <span className="portal-arrow">↗</span>
          </a>

          <a href="https://admin.omnistu.com/seller" target="_blank" rel="noreferrer" className="dock-portal-item">
            <div className="portal-left">
              <span className="portal-icon">💎</span>
              <div>
                <div className="portal-name">Wholesale Coin Seller</div>
                <div className="portal-sub">ID: 10001</div>
              </div>
            </div>
            <span className="portal-arrow">↗</span>
          </a>
        </div>
      </div>

      <div className="dock-card system-health-card">
        <div className="dock-header">
          <div className="dock-title">🟢 Demo Engine Status</div>
        </div>
        <div className="health-items">
          <div className="health-row">
            <span>LiveKit SFU (WebRTC)</span>
            <span className="health-ok">Operational (&lt;300ms)</span>
          </div>
          <div className="health-row">
            <span>KYC Verification Gate</span>
            <span className="health-ok">Auto-Approved (Staging)</span>
          </div>
          <div className="health-row">
            <span>PostgreSQL Database</span>
            <span className="health-ok">Connected</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
