import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Header, Icon } from '../components/ui.jsx';

export default function Agency() {
  const { me, toast, refresh } = useApp();
  const [code, setCode] = useState('');
  const [invites, setInvites] = useState([]);
  const [form, setForm] = useState({ name: '', city: '', phone: '' });
  const [showApply, setShowApply] = useState(false);
  const load = () => api('/agency/invites').then(setInvites).catch(() => {});
  useEffect(() => { load(); }, []);

  const join = async (e) => {
    e.preventDefault();
    try { const r = await api('/agency/join', { method: 'POST', body: { code } }); toast(`Joined ${r.agency.name}`); refresh(); }
    catch (err) { toast(err.message, 'error'); }
  };
  const answer = async (id, action) => {
    try { await api(`/agency/invites/${id}/${action}`, { method: 'POST' }); toast(action === 'accept' ? 'Joined agency' : 'Declined'); load(); refresh(); }
    catch (err) { toast(err.message, 'error'); }
  };
  const leave = async () => {
    if (!window.confirm('Leave your agency?')) return;
    try { await api('/agency/leave', { method: 'POST' }); refresh(); } catch (err) { toast(err.message, 'error'); }
  };
  const apply = async (e) => {
    e.preventDefault();
    try { await api('/agency/apply', { method: 'POST', body: form }); toast('Application sent. We will contact you.'); refresh(); setShowApply(false); }
    catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="page">
      <Header title="Agency" />
      {me?.ownedAgency && (
        <div className="card">
          <h3><Icon name="agency" /> {me.ownedAgency.name}</h3>
          <p>Status: <b>{me.ownedAgency.status}</b> · Level {me.ownedAgency.level}</p>
          <p>Agency code: <b className="code">{me.ownedAgency.code}</b></p>
          <p className="muted small">Share this code with hosts. Manage hosts and earnings in the agency web panel (ask admin for your login).</p>
        </div>
      )}
      {me?.agency ? (
        <div className="card">
          <h3>Your agency</h3>
          <p><b>{me.agency.name}</b> (code {me.agency.code})</p>
          <button className="btn ghost" onClick={leave}>Leave agency</button>
          <p className="muted small">You can leave 30 days after joining.</p>
        </div>
      ) : (
        <>
          {invites.map((i) => (
            <div key={i.id} className="card row gap">
              <div className="grow"><b>{i.name}</b> invited you to join</div>
              <button className="btn small ghost" onClick={() => answer(i.id, 'decline')}>No</button>
              <button className="btn small primary" onClick={() => answer(i.id, 'accept')}>Join</button>
            </div>
          ))}
          <form className="card form" onSubmit={join}>
            <h3>Join an agency</h3>
            <p className="muted small">Agencies help hosts grow and pay extra bonuses. Your earnings stay the same.</p>
            <input className="input" inputMode="numeric" maxLength={6} placeholder="6-digit agency code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            <button className="btn primary block" disabled={code.length !== 6}>Join</button>
          </form>
        </>
      )}
      {!me?.ownedAgency && (
        showApply ? (
          <form className="card form" onSubmit={apply}>
            <h3>Open your own agency</h3>
            <input className="input" placeholder="Agency name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="input" placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <input className="input" placeholder="Contact number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <button className="btn primary block">Submit application</button>
          </form>
        ) : <button className="btn ghost block" onClick={() => setShowApply(true)}>Want to start an agency? Apply here</button>
      )}
    </div>
  );
}
