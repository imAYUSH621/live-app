import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import AnimPlayer from '../components/AnimPlayer.jsx';
import { Icon } from '../components/ui.jsx';

// Initial global countries with codes and dial codes for instant search & zero-lag UX
const DEFAULT_COUNTRIES = [
  { code: 'IN', name: 'India', dial: '91', language: 'en' },
  { code: 'AE', name: 'United Arab Emirates', dial: '971', language: 'en' },
  { code: 'SA', name: 'Saudi Arabia', dial: '966', language: 'en' },
  { code: 'US', name: 'United States', dial: '1', language: 'en' },
  { code: 'GB', name: 'United Kingdom', dial: '44', language: 'en' },
  { code: 'CA', name: 'Canada', dial: '1', language: 'en' },
  { code: 'QA', name: 'Qatar', dial: '974', language: 'en' },
  { code: 'KW', name: 'Kuwait', dial: '965', language: 'en' },
  { code: 'OM', name: 'Oman', dial: '968', language: 'en' },
  { code: 'BH', name: 'Bahrain', dial: '973', language: 'en' },
  { code: 'PK', name: 'Pakistan', dial: '92', language: 'en' },
  { code: 'BD', name: 'Bangladesh', dial: '880', language: 'en' },
  { code: 'NP', name: 'Nepal', dial: '977', language: 'en' },
  { code: 'ID', name: 'Indonesia', dial: '62', language: 'en' },
  { code: 'PH', name: 'Philippines', dial: '63', language: 'en' },
  { code: 'SG', name: 'Singapore', dial: '65', language: 'en' },
  { code: 'MY', name: 'Malaysia', dial: '60', language: 'en' },
  { code: 'AU', name: 'Australia', dial: '61', language: 'en' },
  { code: 'DE', name: 'Germany', dial: '49', language: 'en' },
  { code: 'FR', name: 'France', dial: '33', language: 'en' },
];

const POPULAR_CODES = ['IN', 'AE', 'SA', 'US', 'GB', 'CA', 'PK', 'BD', 'QA'];

export default function Login() {
  const { token, login, toast, config, setLang } = useApp();
  const [phone, setPhone] = useState('');
  const [countries, setCountries] = useState(DEFAULT_COUNTRIES);
  const [cc, setCc] = useState('IN');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('phone');
  const [busy, setBusy] = useState(false);
  const [agree, setAgree] = useState(true);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [resendSec, setResendSec] = useState(0);

  const phoneInputRef = useRef(null);
  const otpInputRef = useRef(null);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    api('/countries')
      .then((c) => {
        if (Array.isArray(c) && c.length) {
          // Merge unique by code
          const map = new Map();
          c.forEach((item) => map.set(item.code, { ...item, dial: String(item.dial || item.dial_code || '') }));
          DEFAULT_COUNTRIES.forEach((item) => {
            if (!map.has(item.code)) map.set(item.code, item);
          });
          setCountries(Array.from(map.values()));
        }
      })
      .catch(() => {});
  }, []);

  // Timer for OTP resend countdown
  useEffect(() => {
    if (resendSec <= 0) return undefined;
    const t = setInterval(() => setResendSec((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [resendSec]);

  if (token) return <Navigate to={loc.state?.from || '/'} replace />;

  const c = countries.find((x) => x.code === cc) || countries[0];
  const valid = phone.length >= 8 && phone.length <= 12;

  // Filter countries by Country Code (e.g. IN, US, AE), Dial Code (91, 1, 971), or Country Name
  const filteredCountries = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return countries;
    const cleanNum = q.replace('+', '');
    return countries.filter((item) => {
      const name = (item.name || '').toLowerCase();
      const code = (item.code || '').toLowerCase();
      const dial = String(item.dial || item.dial_code || '').replace('+', '');
      return name.includes(q) || code.includes(q) || dial.includes(cleanNum);
    });
  }, [countries, countrySearch]);

  const selectCountry = (codeSelected) => {
    setCc(codeSelected);
    setShowCountryModal(false);
    setCountrySearch('');
    setTimeout(() => phoneInputRef.current?.focus(), 150);
  };

  const send = async (e) => {
    e?.preventDefault();
    if (!agree) return toast('Please confirm you are 18+ and accept the terms', 'error');
    setBusy(true);
    try {
      const r = await api('/auth/otp/send', { method: 'POST', body: { phone, country: cc } });
      setStep('otp');
      setCode('');
      setResendSec(45);
      if (r.dev) toast(r.dev);
      setTimeout(() => otpInputRef.current?.focus(), 200);
    } catch (err) {
      toast(err.message, 'error');
    }
    setBusy(false);
  };

  const verify = async (e) => {
    e?.preventDefault();
    if (code.length !== 6) return;
    setBusy(true);
    try {
      const r = await api('/auth/otp/verify', { method: 'POST', body: { phone, code, country: cc } });
      // Keep default language as English for new users
      if (r.isNew) setLang('en');
      login(r.token);
      nav(r.isNew ? '/me/edit?welcome=1' : loc.state?.from || '/', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
    }
    setBusy(false);
  };

  const directDemoLogin = async (role) => {
    setBusy(true);
    try {
      const r = await api('/auth/demo-login', { method: 'POST', body: { role } });
      login(r.token);
      nav(loc.state?.from || '/', { replace: true });
    } catch (err) {
      toast(err.message || 'Login failed', 'error');
    }
    setBusy(false);
  };

  const autofillDemo = (demoPhone) => {
    setCc('IN');
    setPhone(demoPhone);
    setTimeout(() => phoneInputRef.current?.focus(), 100);
  };

  const fillTestOtp = async () => {
    setCode('123456');
    setBusy(true);
    try {
      const r = await api('/auth/otp/verify', { method: 'POST', body: { phone, code: '123456', country: cc } });
      login(r.token);
      nav(loc.state?.from || '/', { replace: true });
    } catch (err) {
      toast(err.message || 'Verification failed', 'error');
    }
    setBusy(false);
  };

  return (
    <div className="login-page">
      {/* Ambient background glow */}
      <div className="login-ambient" />

      <div className="login-container">
        {/* Mika Brand Hero */}
        <div className="login-brand-hero">
          <div className="login-avatar-glow">
            <AnimPlayer src="/anims/heart.json" loop className="login-anim" />
          </div>
          <h1 className="login-app-title">{config.appName || 'Omnistu Live'}</h1>
          <p className="login-tagline">Go live · Make friends · Share gifts</p>
        </div>

        {/* Auth Card */}
        <div className="login-card-mika">
          {step === 'phone' ? (
            <form onSubmit={send} className="auth-form-content">
              <div className="auth-card-header">
                <h2>Welcome to Omnistu Live</h2>
                <p>Login or create an account with your phone number</p>
              </div>

              {/* Phone Input with Country Code Picker */}
              <div className="auth-field-group">
                <label htmlFor="phone-input-field">Phone number or 8-digit ID</label>
                <div className="mika-phone-wrapper">
                  <button
                    type="button"
                    className="country-picker-btn"
                    onClick={() => setShowCountryModal(true)}
                    title="Select country"
                    aria-label="Select Country"
                  >
                    <span className="country-flag">{flag(c.code)}</span>
                    <span className="country-dial">+{c.dial}</span>
                    <span className="caret-arrow">▾</span>
                  </button>
                  <div className="phone-divider" />
                  <input
                    id="phone-input-field"
                    ref={phoneInputRef}
                    inputMode="numeric"
                    maxLength={12}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="10-digit mobile or 8-digit ID"
                    autoFocus
                    autoComplete="tel"
                    className="mika-phone-text-input"
                  />
                  {phone.length > 0 && (
                    <button
                      type="button"
                      className="clear-phone-btn"
                      onClick={() => setPhone('')}
                      aria-label="Clear input"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {import.meta.env.DEV && (<>
              {/* Demo 1-Click Instant Login */}
              <div className="demo-shortcuts" style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(255, 42, 109, 0.05)', padding: '12px', borderRadius: '12px', border: '1px solid rgba(255, 42, 109, 0.15)', marginTop: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#ff2a6d', textTransform: 'uppercase', letterSpacing: '0.5px' }}>⚡ 1-Click Instant Login (No OTP)</span>
                  <span style={{ fontSize: '10.5px', color: '#10b981', fontWeight: '600' }}>Active</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                  <button type="button" className="demo-chip" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '6px 8px', borderRadius: '8px', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }} onClick={() => directDemoLogin('aria')}>
                    🌟 Aria (Star Host)
                  </button>
                  <button type="button" className="demo-chip" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '6px 8px', borderRadius: '8px', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }} onClick={() => directDemoLogin('rohan')}>
                    🎵 Rohan (Live Beats)
                  </button>
                  <button type="button" className="demo-chip" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '6px 8px', borderRadius: '8px', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }} onClick={() => directDemoLogin('fan')}>
                    💎 VIP Fan (10K Coins)
                  </button>
                  <button type="button" className="demo-chip" style={{ background: '#ffffff', border: '1px solid #e2e8f0', padding: '6px 8px', borderRadius: '8px', fontWeight: '600', fontSize: '12px', cursor: 'pointer' }} onClick={() => directDemoLogin('seller')}>
                    🏢 Coin Distributor
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
                  Or enter any mobile number. Demo OTP is <b>123456</b>.
                </div>
              </div>
              </>)}

              {/* Terms Checkbox */}
              <label className="mika-check-label">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mika-custom-checkbox"
                />
                <span>
                  I confirm I am <b>18+ years old</b> and accept the Terms of Service & Privacy Policy
                </span>
              </label>

              {/* Submit Button */}
              <button
                type="submit"
                className="btn primary block mika-main-btn"
                disabled={busy || !valid}
              >
                {busy ? (
                  <span className="btn-loading">
                    <span className="btn-spinner" /> Sending OTP…
                  </span>
                ) : (
                  'Get OTP'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="auth-form-content">
              {/* Back / Change button */}
              <div className="otp-head-row">
                <button
                  type="button"
                  className="icon-btn-back"
                  onClick={() => setStep('phone')}
                  aria-label="Back"
                >
                  <Icon name="back" size={20} />
                </button>
                <h2>Verification Code</h2>
                <span style={{ width: 36 }} />
              </div>

              <div className="otp-subtitle-wrap">
                <p className="otp-subtitle">
                  We've sent a 6-digit verification code to
                </p>
                <div className="otp-phone-badge">
                  <span>{flag(c.code)} +{c.dial} {phone}</span>
                  <button type="button" onClick={() => setStep('phone')} className="edit-num-link">
                    Edit
                  </button>
                </div>
              </div>

              {/* 6-Digit OTP Box Grid */}
              <div className="otp-boxes-container" onClick={() => otpInputRef.current?.focus()}>
                {[0, 1, 2, 3, 4, 5].map((index) => {
                  const digit = code[index] || '';
                  const isActive = code.length === index || (code.length === 6 && index === 5);
                  return (
                    <div
                      key={index}
                      className={`otp-digit-box ${digit ? 'filled' : ''} ${isActive ? 'focused' : ''}`}
                    >
                      {digit}
                    </div>
                  );
                })}
              </div>

              {/* Real hidden input handling numeric input & paste */}
              <input
                id="otp"
                ref={otpInputRef}
                className="hidden-otp-input"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                autoComplete="one-time-code"
              />

              {/* 1-Tap Test OTP shortcut */}
              <div className="test-otp-helper">
                <button type="button" className="test-otp-btn" onClick={fillTestOtp}>
                  ⚡ Auto-Fill 123456 & Login
                </button>
              </div>

              {/* Verify Button */}
              <button
                type="submit"
                className="btn primary block mika-main-btn"
                disabled={busy || code.length !== 6}
              >
                {busy ? (
                  <span className="btn-loading">
                    <span className="btn-spinner" /> Verifying…
                  </span>
                ) : (
                  'Verify & Login'
                )}
              </button>

              {/* Resend OTP */}
              <div className="otp-resend-row">
                {resendSec > 0 ? (
                  <span className="resend-countdown">Resend code in <b>{resendSec}s</b></span>
                ) : (
                  <button
                    type="button"
                    className="resend-btn"
                    onClick={() => send()}
                    disabled={busy}
                  >
                    Resend Code
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Searchable Country Picker Modal / Bottom Sheet */}
      {showCountryModal && (
        <div className="country-modal-overlay" onClick={() => setShowCountryModal(false)}>
          <div className="country-modal-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="country-modal-header">
              <h3>Select Country / Region</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowCountryModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Realtime Search Input */}
            <div className="country-search-bar">
              <span className="search-icon"><Icon name="search" size={18} /></span>
              <input
                type="text"
                autoFocus
                value={countrySearch}
                onChange={(e) => setCountrySearch(e.target.value)}
                placeholder="Search country name, code (IN, US) or dial (+91)..."
                className="country-search-input"
              />
              {countrySearch.length > 0 && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setCountrySearch('')}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Quick Popular Chips */}
            {!countrySearch && (
              <div className="popular-countries-row">
                <span className="pop-label">Popular:</span>
                <div className="pop-chips">
                  {POPULAR_CODES.map((pCode) => {
                    const pop = countries.find((x) => x.code === pCode);
                    if (!pop) return null;
                    return (
                      <button
                        key={pCode}
                        type="button"
                        className={`pop-chip ${cc === pCode ? 'active' : ''}`}
                        onClick={() => selectCountry(pCode)}
                      >
                        {flag(pCode)} +{pop.dial} {pop.name.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Filtered Country List */}
            <div className="country-list-scroll">
              {filteredCountries.length === 0 ? (
                <div className="country-empty-state">
                  <p>No countries found matching "{countrySearch}"</p>
                  <small>Try searching by country code like "IN", "US", "AE" or dial code like "91", "971"</small>
                </div>
              ) : (
                filteredCountries.map((item) => {
                  const isSelected = item.code === cc;
                  return (
                    <button
                      key={item.code}
                      type="button"
                      className={`country-item-row ${isSelected ? 'selected' : ''}`}
                      onClick={() => selectCountry(item.code)}
                    >
                      <span className="country-row-flag">{flag(item.code)}</span>
                      <div className="country-row-info">
                        <span className="country-row-name">{item.name}</span>
                        <span className="country-row-code">{item.code}</span>
                      </div>
                      <span className="country-row-dial">+{item.dial}</span>
                      {isSelected && <span className="country-check-mark">✓</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Country code -> flag emoji (regional indicator letters)
export const flag = (cc) => {
  const code = String(cc || '').toUpperCase();
  if (code.length !== 2) return '🌐';
  try {
    return code.replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0)));
  } catch {
    return '🌐';
  }
};
