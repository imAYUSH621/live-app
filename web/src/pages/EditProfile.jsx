import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Avatar, Header } from '../components/ui.jsx';
import { UI_LANGS, useT } from '../i18n.js';
import { flag } from './Login.jsx';
import { resetGiftCache } from '../live/GiftPanel.jsx';

export default function EditProfile() {
  const { me, refresh, toast, setLang, lang } = useApp();
  const t = useT();
  const [f, setF] = useState({ name: '', gender: '', dob: '', bio: '', language: 'en', country: 'IN' });
  const [countries, setCountries] = useState([]);
  useEffect(() => { api('/countries').then(setCountries).catch(() => {}); }, []);
  const [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const nav = useNavigate();
  useEffect(() => {
    if (me) setF({ name: me.user.name || '', gender: me.user.gender || '', dob: me.user.dob || '', bio: me.user.bio || '', language: ['hi', 'en', 'ar'].includes(lang) ? lang : (me.user.language || 'en'), country: me.user.country || 'IN' });
  }, [me, lang]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/me', { method: 'PUT', body: f });
      setLang(f.language);
      resetGiftCache(); // prices and local gifts depend on the country
      await refresh();
      toast('Profile saved');
      nav('/me');
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };
  const upload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try { await api('/me/avatar', { method: 'POST', form: fd }); await refresh(); } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <Header title={params.get('welcome') ? 'Welcome! Set up your profile' : 'Edit profile'} />
      <form className="form" onSubmit={save}>
        <label className="avatar-pick"><Avatar user={me?.user} size={90} /><span>Change photo</span><input type="file" accept="image/*" hidden onChange={upload} /></label>
        <label>Name<input className="input" value={f.name} maxLength={24} onChange={set('name')} required /></label>
        <label>Gender
          <select className="input" value={f.gender} onChange={set('gender')}><option value="">Select</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select>
        </label>
        <label>Date of birth (18+ only)<input className="input" type="date" value={f.dob} onChange={set('dob')} max={new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10)} /></label>
        <label>Bio<input className="input" value={f.bio} maxLength={120} onChange={set('bio')} placeholder="Say something about you" /></label>
        <label>{t('language')}
          <select className="input" value={f.language} onChange={set('language')}>{UI_LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label>{t('country')}
          <select className="input" value={f.country} onChange={set('country')}>{countries.map((c) => <option key={c.code} value={c.code}>{flag(c.code)} {c.name}</option>)}</select>
        </label>
        <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : t('save')}</button>
      </form>
    </div>
  );
}
