import { useState } from 'react';
import { useApp } from '../store.jsx';
import { api } from '../api.js';

export default function DesktopNav() {
  // Compile-time flag: Vite inlines VITE_STAGING_DEMO, so demo chrome is dead
  // code (dropped by the minifier) in client builds.
  const stagingDemo = import.meta.env.VITE_STAGING_DEMO === 'true';
  const { me, login, refresh, config } = useApp();
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
    <header className="desktop-top-header">
      <div className="desktop-header-left">
        <div className="desktop-logo-pill">
          <span className="live-pulse-dot" />
          <span className="desktop-brand-name">{(config.appName || 'Omnistu Live').toUpperCase()}</span>
          {stagingDemo && <span className="desktop-edition-badge">ENTERPRISE STAGING DEMO</span>}
        </div>
      </div>

      {stagingDemo && (
        <div className="desktop-header-right" style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn-desktop-creds" disabled={loggingIn} onClick={() => quickLogin('aria')}>
            🌟 Demo: Host
          </button>
          <button type="button" className="btn-desktop-creds" disabled={loggingIn} onClick={() => quickLogin('fan')}>
            💎 Demo: Fan
          </button>
        </div>
      )}
    </header>
  );
}
