import { useState } from 'react';
import { post, del, num, dt, media, fetchPrivateMedia } from '../lib/api.js';
import { useLoad, useAct, Table, Badge, UserCell, Tabs, Pager, Modal } from '../ui.jsx';
import { UserDrawer } from './People.jsx';

export function Reports() {
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const { data, loading, reload } = useLoad(`/admin/reports?status=${status}&type=${type}`, [status, type]);
  const act = useAct();
  const [user, setUser] = useState(null);
  const set = async (id, body, m) => { await act(() => post(`/admin/reports/${id}`, body), m); reload(); };
  return (
    <>
      <div className="head"><h1>Reports</h1></div>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Open</option><option value="in_review">In review</option><option value="actioned">Actioned</option><option value="dismissed">Dismissed</option><option value="">All</option></select>
        <select value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option><option value="room">Live rooms</option><option value="user">Users</option><option value="moment">Moments</option><option value="message">Messages</option></select>
      </div>
      <Table loading={loading} rows={data} columns={[
        { key: 'id', label: '#' },
        { label: 'Target', render: (r) => (
          <div>
            <Badge v={r.target_type} kind="" />{' '}
            {r.target_type === 'user' && r.target && <a onClick={() => setUser(r.target.id)}>{r.target.name} ({r.target.uid})</a>}
            {r.target_type === 'room' && r.target && <span>Live #{r.target.id} · {r.target.title} <Badge v={r.target.status} /></span>}
            {r.target_type === 'moment' && r.target && <span>{r.target.body?.slice(0, 40)} {r.target.media_url && <a href={media(r.target.media_url)} target="_blank" rel="noreferrer">media</a>}</span>}
            {r.target_type === 'message' && r.target && <span>“{r.target.body?.slice(0, 50)}”</span>}
          </div>
        ) },
        { label: 'Reason', render: (r) => <><b>{r.reason}</b><div className="muted small">{r.details}</div></> },
        { label: 'Evidence', render: (r) => (r.screenshot_url ? (r.screenshot_url.startsWith('/uploads-private/')
        ? <a href="#" onClick={(e) => { e.preventDefault(); fetchPrivateMedia(r.screenshot_url).then((b) => window.open(b, '_blank')); }}>screenshot</a>
        : <a href={media(r.screenshot_url)} target="_blank" rel="noreferrer">screenshot</a>) : '—') },
        { label: 'By', render: (r) => r.reporter?.name || 'System' },
        { label: 'Status', render: (r) => <><Badge v={r.status} />{r.assignee && <div className="small muted">{r.assignee}</div>}</> },
        { label: 'When', render: (r) => <span className="small">{dt(r.created_at)}</span> },
        { label: '', render: (r) => (
          <div className="row">
            {r.status === 'open' && <button className="btn sm" onClick={() => set(r.id, { status: 'in_review', assign_to_me: true }, 'Assigned to you')}>Take</button>}
            <button className="btn sm ok" onClick={() => { const a = window.prompt('Action taken (e.g. warned, banned 7d, live cut)'); if (a) set(r.id, { status: 'actioned', action: a }, 'Closed'); }}>Action</button>
            <button className="btn sm ghost" onClick={() => set(r.id, { status: 'dismissed' }, 'Dismissed')}>Dismiss</button>
            {r.target_type === 'moment' && <button className="btn sm danger" onClick={async () => { await act(() => post(`/admin/moments/${r.target_id}`, { status: 'hidden' }), 'Moment hidden'); set(r.id, { status: 'actioned', action: 'moment hidden' }); }}>Hide post</button>}
          </div>
        ) },
      ]} />
      <UserDrawer id={user} onClose={() => setUser(null)} />
    </>
  );
}

export function Risk() {
  const [status, setStatus] = useState('open');
  const { data, loading, reload } = useLoad(`/admin/risk?status=${status}`, [status]);
  const act = useAct();
  const [user, setUser] = useState(null);
  const labels = { multi_account: 'Many accounts on one device', self_gift: 'Gifting to own alt account', gift_loop: 'One sender = most of host income', rapid_recharge: 'Rapid recharges (card fraud?)' };
  return (
    <>
      <div className="head"><h1>Risk & fraud</h1><button className="btn primary" onClick={async () => { const r = await act(() => post('/admin/risk/scan'), null); if (r) { reload(); window.alert(`${r.new_flags} new flags`); } }}>Run scan now</button></div>
      <div className="filters"><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="open">Open</option><option value="resolved">Resolved</option><option value="false_positive">False positive</option></select></div>
      <Table loading={loading} rows={data} empty="No risk flags. The scan runs every hour." columns={[
        { label: 'User', render: (r) => <UserCell u={r.user} onClick={() => setUser(r.user_id)} /> },
        { label: 'Signal', render: (r) => labels[r.kind] || r.kind },
        { label: 'Score', render: (r) => <Badge v={r.score} kind={r.score >= 80 ? 'red' : r.score >= 60 ? 'gold' : ''} /> },
        { label: 'Details', render: (r) => <code className="small">{JSON.stringify(r.details)}</code> },
        { label: 'When', render: (r) => dt(r.created_at) },
        { label: '', render: (r) => r.status === 'open' && (
          <div className="row">
            <button className="btn sm" onClick={async () => { await act(() => post(`/admin/users/${r.user_id}/freeze`, { frozen: true }), 'Wallet frozen'); }}>Freeze wallet</button>
            <button className="btn sm ok" onClick={async () => { await act(() => post(`/admin/risk/${r.id}`, { status: 'resolved' }), 'Resolved'); reload(); }}>Resolve</button>
            <button className="btn sm ghost" onClick={async () => { await act(() => post(`/admin/risk/${r.id}`, { status: 'false_positive' }), 'Marked OK'); reload(); }}>False alarm</button>
          </div>
        ) },
      ]} />
      <UserDrawer id={user} onClose={() => setUser(null)} />
    </>
  );
}

export function MomentsMod() {
  const [status, setStatus] = useState('visible');
  const [offset, setOffset] = useState(0);
  const { data, reload } = useLoad(`/admin/moments?status=${status}&offset=${offset}`, [status, offset]);
  const act = useAct();
  const set = async (id, s) => { await act(() => post(`/admin/moments/${id}`, { status: s }), `Moment ${s}`); reload(); };
  return (
    <>
      <div className="head"><h1>Moments</h1></div>
      <div className="filters"><select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }}><option value="visible">Visible</option><option value="hidden">Hidden</option><option value="deleted">Deleted</option></select></div>
      <div className="live-grid">
        {(data || []).map((m) => (
          <div key={m.id} className="live-tile">
            {m.media_url && (m.media_type === 'video' ? <video src={media(m.media_url)} controls style={{ width: '100%' }} /> : <div className="thumb" style={{ aspectRatio: '1', backgroundImage: `url(${media(m.media_url)})` }} />)}
            <div className="meta">
              <b>{m.user?.name}</b> <span className="muted small">{dt(m.created_at)}</span>
              <p className="small">{m.body}</p>
              <div className="muted small">❤️ {num(m.likes)} · 💬 {num(m.comments)}</div>
              <div className="row" style={{ marginTop: 6 }}>
                {status !== 'visible' && <button className="btn sm ok" onClick={() => set(m.id, 'visible')}>Restore</button>}
                {status === 'visible' && <button className="btn sm danger" onClick={() => set(m.id, 'hidden')}>Hide</button>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <Pager offset={offset} limit={50} count={data?.length || 0} onChange={setOffset} />
    </>
  );
}

export function BannedDevices() {
  const { data, reload } = useLoad('/admin/banned-devices');
  const act = useAct();
  const lift = async (id) => { await act(() => del(`/admin/banned-devices/${encodeURIComponent(id)}`), 'Lifted'); reload(); };
  return (
    <>
      <div className="head"><h1>Banned devices & IPs</h1></div>
      <Tabs value="d" onChange={() => {}} tabs={[['d', 'Devices and IPs']]} />
      <div className="grid g2">
        <Table rows={data?.devices} columns={[{ key: 'device_id', label: 'Device' }, { key: 'reason', label: 'Reason' }, { label: 'When', render: (r) => dt(r.created_at) }, { label: '', render: (r) => <button className="btn sm" onClick={() => lift(r.device_id)}>Lift</button> }]} />
        <Table rows={data?.ips} columns={[{ key: 'ip', label: 'IP' }, { key: 'reason', label: 'Reason' }, { label: 'When', render: (r) => dt(r.created_at) }, { label: '', render: (r) => <button className="btn sm" onClick={() => lift(r.ip)}>Lift</button> }]} />
      </div>
    </>
  );
}

export function Appeals() {
  const [status, setStatus] = useState('open');
  const { data, reload } = useLoad(`/admin/appeals${status ? `?status=${status}` : ''}`, [status]);
  const act = useAct();
  const [deciding, setDeciding] = useState(null); // { appeal, action }
  const [note, setNote] = useState('');
  const decide = async () => {
    await act(() => post(`/admin/appeals/${deciding.appeal.id}/decide`, { action: deciding.action, note }), 'Decision saved');
    setDeciding(null); setNote(''); reload();
  };
  return (
    <>
      <div className="head"><h1>Appeals</h1></div>
      <Tabs value={status} onChange={setStatus} tabs={[['open', 'Open'], ['resolved', 'Resolved'], ['rejected', 'Rejected'], ['', 'All']]} />
      <Table rows={data?.appeals} columns={[
        { label: 'User', render: (r) => <UserCell u={{ id: r.user_id, uid: r.uid, name: r.name }} /> },
        { key: 'text', label: 'Appeal' },
        { label: 'Ban reason', render: (r) => r.ban_reason || '—' },
        { label: 'Status', render: (r) => <Badge v={r.status} /> },
        { label: 'When', render: (r) => dt(r.created_at) },
        { label: 'Note', render: (r) => r.note || '—' },
        { label: '', render: (r) => r.status === 'open' && (
          <>
            <button className="btn sm" onClick={() => { setDeciding({ appeal: r, action: 'resolve' }); setNote(''); }}>Resolve</button>{' '}
            <button className="btn sm danger" onClick={() => { setDeciding({ appeal: r, action: 'reject' }); setNote(''); }}>Reject</button>
          </>
        ) },
      ]} />
      <Modal open={!!deciding} onClose={() => setDeciding(null)} title={deciding?.action === 'resolve' ? 'Resolve appeal' : 'Reject appeal'}>
        <p className="muted small">{deciding?.appeal?.text}</p>
        <textarea className="input" rows={3} placeholder="Decision note (shown to the user)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn primary block" style={{ marginTop: 10 }} onClick={decide}>{deciding?.action === 'resolve' ? 'Resolve' : 'Reject'}</button>
      </Modal>
    </>
  );
}
