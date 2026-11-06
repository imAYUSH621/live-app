import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { Header, Icon } from '../components/ui.jsx';

export default function Agency() {
  const { me, toast } = useApp();
  const [form, setForm] = useState({ name: '', city: '', phone: '' });
  const [showApply, setShowApply] = useState(false);
  const host = me?.user?.host;

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
      {host?.agency_name ? (
        <div className="card">
          <h3><Icon name="agency" /> {host.agency_name}</h3>
          <p>Agency code: <b className="code">{host.agency_code}</b></p>
          <p className="muted small">Agencies are assigned by the platform. For any change, contact support.</p>
        </div>
      ) : (
        <div className="card">
          <h3>Your agency</h3>
          {host ? (
            <p className="muted">You are not part of an agency. Host agencies are assigned by the platform team.</p>
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
