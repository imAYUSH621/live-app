import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Header, Icon } from '../components/ui.jsx';

export default function Agency() {
  const { me, toast } = useApp();
  const [form, setForm] = useState({ name: '', city: '', phone: '' });
  const [showApply, setShowApply] = useState(false);
  const [code, setCode] = useState('');
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState(false);
  const host = me?.user?.host;
  const isHost = me?.user?.isHost && me?.user?.hostStatus === 'approved';

  const loadInvites = () => { if (me?.user) api('/agency/invites').then(setInvites).catch(() => {}); };
  useEffect(loadInvites, [me?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/agency/join', { method: 'POST', body: { code } });
      toast(`Joined ${r.agency.name}`);
      window.location.reload();
    } catch (err) { toast(err.message, 'error'); }
    setBusy(false);
  };

  const answer = async (inv, action) => {
    try {
      await api(`/agency/invites/${inv.id}/${action}`, { method: 'POST', body: {} });
      toast(action === 'accept' ? `Joined ${inv.name}` : 'Invite declined');
      if (action === 'accept') window.location.reload(); else loadInvites();
    } catch (err) { toast(err.message, 'error'); }
  };

  const leave = async () => {
    if (!window.confirm('Leave this agency? You can leave 30 days after joining.')) return;
    try {
      await api('/host/leave-agency', { method: 'POST', body: {} });
      toast('You left the agency');
      window.location.reload();
    } catch (err) { toast(err.message, 'error'); }
  };

  const apply = async (e) => {
    e.preventDefault();
    try {
      await api('/support', { method: 'POST', body: { subject: `Agency application: ${form.name}`, body: `Agency name: ${form.name}\nCity: ${form.city}\nContact number: ${form.phone}` } });
      toast('Application sent. The team will contact you.');
      setShowApply(false);
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <Header title="Agency" />
      {invites.length > 0 && (
        <div className="card">
          <h3>Agency invites</h3>
          <div className="list compact">{invites.map((inv) => (
            <div key={inv.id} className="list-row">
              <div className="grow"><b>{inv.name}</b><small>code {inv.code}</small></div>
              <button className="btn primary small" onClick={() => answer(inv, 'accept')}>Accept</button>
              <button className="btn ghost small" onClick={() => answer(inv, 'decline')}>Decline</button>
            </div>
          ))}</div>
        </div>
      )}
      {host?.agency_name ? (
        <div className="card">
          <h3><Icon name="agency" /> {host.agency_name}</h3>
          <p>Agency code: <b className="code">{host.agency_code}</b></p>
          <p className="muted small">You can leave an agency 30 days after joining.</p>
          <button className="btn ghost block" onClick={leave}>Leave agency</button>
        </div>
      ) : (
        <div className="card">
          <h3>Your agency</h3>
          {isHost ? (
            <form className="form" onSubmit={join}>
              <p className="muted small">Have an agency code? Enter it to join.</p>
              <input className="input" placeholder="Agency code (e.g. OFFICIAL)" value={code} maxLength={20} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
              <button className="btn primary block" disabled={busy}>{busy ? 'Joining…' : 'Join agency'}</button>
            </form>
          ) : host ? (
            <p className="muted">Your host verification is still under review. You can join an agency once approved.</p>
          ) : (
            <>
              <p className="muted">Agencies work with verified hosts. Become a verified host first.</p>
              <Link to="/verify" className="btn primary block">Verify to become a host</Link>
            </>
          )}
        </div>
      )}
      {showApply ? (
        <form className="card form" onSubmit={apply}>
          <h3>Open your own agency</h3>
          <input className="input" placeholder="Agency name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className="input" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <input className="input" placeholder="Contact number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <button className="btn primary block">Submit application</button>
        </form>
      ) : <button className="btn ghost block" onClick={() => setShowApply(true)}>Want to start an agency? Apply here</button>}
    </div>
  );
}
