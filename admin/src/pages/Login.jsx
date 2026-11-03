import { useState } from 'react';
import { post, session } from '../lib/api.js';
import { Tabs, useToast } from '../ui.jsx';

export default function Login({ onIn }) {
  const [kind, setKind] = useState('admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [need2fa, setNeed2fa] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      let s;
      if (kind === 'admin') {
        const r = await post('/admin/login', { email, password, otp: otp || undefined });
        s = { kind, token: r.token, name: r.admin.name, role: r.admin.role, modules: r.admin.modules };
      } else if (kind === 'agency') {
        const r = await post('/agency/login', { email, password });
        s = { kind, token: r.token, name: r.agency.name };
      } else {
        const r = await post('/seller/login', { uid: email, password });
        s = { kind, token: r.token, name: `Seller ${email}` };
      }
      session.set(s);
      onIn(s);
    } catch (er) {
      if (er.status === 401 && kind === 'admin') { setNeed2fa(true); toast('Enter your 2FA code'); } else toast(er.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <div className="login">
      <form className="box card" onSubmit={submit}>
        <h1>Control Room</h1>
        <p className="muted" style={{ marginBottom: 16 }}>Sign in to manage the app, your agency or your coin sales.</p>
        <Tabs tabs={[['admin', 'Admin & staff'], ['agency', 'Agency'], ['seller', 'Coin seller']]} value={kind} onChange={(k) => { setKind(k); setNeed2fa(false); }} />
        <div className="field"><label>{kind === 'seller' ? 'Your app ID' : 'Email'}</label><input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></div>
        <div className="field"><label>Password</label><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div>
        {need2fa && <div className="field"><label>2FA code</label><input inputMode="numeric" value={otp} onChange={(e) => setOtp(e.target.value)} /></div>}
        <button className="btn primary" style={{ width: '100%', justifyContent: 'center', height: 40 }} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}
