import { useState } from 'react';
import QRCode from 'qrcode';
import { get, post, put, dt } from '../lib/api.js';
import { useLoad, useAct, Table, Badge, Tabs, FormModal, Modal } from '../ui.jsx';
import { SettingsForm } from './Finance.jsx';

const ROLE_INFO = {
  super_admin: 'Everything, including staff, settings and audit log',
  ops: 'Users, hosts, agencies, live, content, events',
  moderator: 'Live monitoring, reports, bans, moments, risk',
  finance: 'Orders, salaries, sellers, economy, analytics',
  bd: 'Their own agencies and hosts',
  support: 'User lookup, tickets, reports',
  marketing: 'Banners, events, notifications, pages',
};

export function Staff() {
  const { data, reload } = useLoad('/admin/staff');
  const act = useAct();
  const [edit, setEdit] = useState(null);
  const roles = Object.keys(ROLE_INFO);
  return (
    <>
      <div className="head"><h1>Staff & roles</h1><button className="btn primary" onClick={() => setEdit({ __new: true, role: 'support' })}>Add staff</button></div>
      <Table rows={data?.staff} onRow={setEdit} columns={[
        { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { label: 'Role', render: (r) => <><Badge v={r.role} kind="" /><div className="small muted">{ROLE_INFO[r.role]}</div></> },
        { key: 'country', label: 'Region' }, { label: '2FA', render: (r) => (r.twofa ? <Badge v="on" kind="green" /> : <Badge v="off" kind="gold" />) },
        { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'Last login', render: (r) => dt(r.last_login) },
      ]} />
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={edit?.__new ? 'Add staff member' : `Edit ${edit?.name}`}
        fields={[
          { name: 'name', label: 'Name' }, ...(edit?.__new ? [{ name: 'email', label: 'Email' }] : []),
          { name: 'password', label: edit?.__new ? 'Password (8+)' : 'New password (optional)', type: 'password' },
          { name: 'role', label: 'Role', type: 'select', options: roles.map((r) => [r, `${r} — ${ROLE_INFO[r]}`]) },
          { name: 'country', label: 'Region (for BD managers)' },
          ...(!edit?.__new ? [{ name: 'status', label: 'Status', type: 'select', options: ['active', 'disabled'] }, { name: 'reset_2fa', label: 'Reset 2FA', type: 'checkbox' }] : []),
        ]}
        initial={edit ? { ...edit, password: '' } : {}}
        onSubmit={async (v) => { const r = await act(() => (edit.__new ? post('/admin/staff', v) : put(`/admin/staff/${edit.id}`, v)), 'Saved'); if (r) { setEdit(null); reload(); } }} />
    </>
  );
}

export function Audit() {
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const { data, loading } = useLoad(`/admin/audit?action=${encodeURIComponent(action)}&target_id=${encodeURIComponent(target)}`, [action, target]);
  return (
    <>
      <div className="head"><h1>Audit log</h1></div>
      <div className="filters"><input placeholder="Action contains (ban, wallet, settlement…)" value={action} onChange={(e) => setAction(e.target.value)} /><input placeholder="Target ID" value={target} onChange={(e) => setTarget(e.target.value)} /></div>
      <Table loading={loading} rows={data} columns={[
        { label: 'When', render: (r) => <span className="small">{dt(r.created_at)}</span> }, { label: 'Who', render: (r) => `${r.actor_type} ${r.admin_email || r.actor_id || ''}` },
        { key: 'action', label: 'Action' }, { label: 'Target', render: (r) => `${r.target_type || ''} ${r.target_id || ''}` },
        { label: 'Details', render: (r) => <code className="small" style={{ wordBreak: 'break-all' }}>{r.details ? JSON.stringify(r.details).slice(0, 160) : ''}</code> }, { key: 'ip', label: 'IP' },
      ]} />
    </>
  );
}

export function Settings() {
  const { data, reload } = useLoad('/admin/settings');
  const act = useAct();
  const [tab, setTab] = useState('app');
  if (!data) return <p className="muted">Loading…</p>;
  const info = {
    app: 'Name, maintenance mode, force-update version, support WhatsApp for coin purchases.',
    features: 'Switch whole features on/off instantly for every user. Lucky gift is off by default — get legal advice first.',
    host: 'Monthly host target and whether salary is paid when the target is missed.',
    pk: 'PK battle length and punishment time (seconds).',
    room: 'Seats, thumbnail interval for moderation, chat slow-mode.',
    moderation: 'Banned words (auto-masked in chat, names, posts), reports needed to auto-flag a live, minimum age.',
  };
  return (
    <>
      <div className="head"><h1>App settings</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={Object.keys(info).map((k) => [k, k[0].toUpperCase() + k.slice(1)])} />
      <p className="muted" style={{ marginBottom: 12 }}>{info[tab]}</p>
      <SettingsForm key={tab} section={tab} settings={data.settings} onSave={async (s, v) => { await act(() => put(`/admin/settings/${s}`, v), 'Saved — live for all users within 30 seconds'); reload(); }} />
    </>
  );
}

export function Support() {
  const [status, setStatus] = useState('open');
  const { data, reload } = useLoad(`/admin/support?status=${status}`, [status]);
  const act = useAct();
  const [reply, setReply] = useState(null);
  return (
    <>
      <div className="head"><h1>Support tickets</h1></div>
      <div className="filters"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Open</option><option value="closed">Answered</option></select></div>
      <Table rows={data} onRow={setReply} columns={[
        { key: 'id', label: '#' }, { label: 'From', render: (r) => (r.user_name ? `${r.user_name} (${r.uid})` : `Agency: ${r.agency_name}`) },
        { key: 'subject', label: 'Subject' }, { label: 'Message', render: (r) => <span className="small">{r.body.slice(0, 120)}</span> },
        { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'When', render: (r) => dt(r.created_at) },
      ]} />
      <FormModal open={!!reply} onClose={() => setReply(null)} title={reply?.subject} submitLabel="Send reply"
        fields={[{ name: 'body', label: 'Their message', type: 'textarea' }, { name: 'reply', label: 'Your reply (sent as an in-app notification)', type: 'textarea' }]}
        initial={reply ? { body: reply.body, reply: reply.reply || '' } : {}}
        onSubmit={async (v) => { await act(() => post(`/admin/support/${reply.id}/reply`, { reply: v.reply }), 'Reply sent'); setReply(null); reload(); }} />
    </>
  );
}

export function Account() {
  const { data, reload } = useLoad('/admin/me');
  const act = useAct();
  const [qr, setQr] = useState(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState(false);
  const setup = async () => {
    const r = await act(() => post('/admin/2fa/setup'));
    if (r) setQr({ ...r, img: await QRCode.toDataURL(r.uri) });
  };
  return (
    <>
      <div className="head"><h1>My account</h1></div>
      <div className="card">
        <dl className="kv"><dt>Name</dt><dd>{data?.name}</dd><dt>Email</dt><dd>{data?.email}</dd><dt>Role</dt><dd>{data?.role}</dd>
          <dt>Two-factor login</dt><dd>{data?.twofa ? <Badge v="on" kind="green" /> : <Badge v="off" kind="gold" />}</dd></dl>
        <div className="row mt">
          <button className="btn primary" onClick={setup}>{data?.twofa ? 'Reset 2FA' : 'Turn on 2FA'}</button>
          <button className="btn" onClick={() => setPw(true)}>Change password</button>
        </div>
      </div>
      <Modal open={!!qr} onClose={() => setQr(null)} title="Scan with Google Authenticator">
        {qr && (
          <>
            <img src={qr.img} alt="2FA QR code" style={{ display: 'block', margin: '0 auto' }} />
            <p className="muted small" style={{ textAlign: 'center', wordBreak: 'break-all' }}>Or type: {qr.secret}</p>
            <div className="field"><label>6-digit code from the app</label><input value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <button className="btn primary" onClick={async () => { const r = await act(() => post('/admin/2fa/enable', { otp: code }), '2FA is on'); if (r) { setQr(null); reload(); } }}>Turn on</button>
          </>
        )}
      </Modal>
      <FormModal open={pw} onClose={() => setPw(false)} title="Change password" fields={[{ name: 'old_password', label: 'Current password', type: 'password' }, { name: 'new_password', label: 'New password (8+)', type: 'password' }]}
        onSubmit={async (v) => { const r = await act(() => post('/admin/password', v), 'Password changed'); if (r) setPw(false); }} />
    </>
  );
}

export { get };
