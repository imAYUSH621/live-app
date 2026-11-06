import { useState } from 'react';
import { get, post, put, patch, num, money, dt, media, downloadCsv } from '../lib/api.js';
import { useLoad, useAct, Table, Badge, UserCell, Drawer, Modal, FormModal, Tabs, Pager, Avatar, Stat, confirmAct, PrivateImg } from '../ui.jsx';

// ======================= USERS =======================
export function Users() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(null);
  const qs = new URLSearchParams({ q, status, sort, offset, limit: 50 }).toString();
  const { data, loading, reload } = useLoad(`/admin/users?${qs}`, [qs]);
  return (
    <>
      <div className="head"><h1>Users</h1><button className="btn" onClick={() => downloadCsv('/admin/export/users', 'users')}>Export CSV</button></div>
      <div className="filters">
        <input placeholder="ID, name, email, phone, device, IP" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} style={{ minWidth: 280 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="banned">Banned</option><option value="deleted">Deleted</option></select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}><option value="">Newest</option><option value="recharged">Top recharge</option><option value="spent">Top spenders</option><option value="earned">Top earners</option><option value="coins">Most coins</option></select>
        <span className="muted" style={{ alignSelf: 'center' }}>{data ? `${num(data.total)} users` : ''}</span>
      </div>
      <Table loading={loading} rows={data?.rows} onRow={(r) => setOpen(r.id)} columns={[
        { label: 'User', render: (r) => <UserCell u={r} /> },
        { label: 'Contact', render: (r) => <span className="small">{r.email || r.phone || 'guest'}</span> },
        { key: 'country', label: 'Country' },
        { label: 'Level', render: (r) => `Lv${r.level}${r.vip_level ? ` · VIP${r.vip_level}` : ''}${r.noble_rank ? ` · N${r.noble_rank}` : ''}` },
        { label: 'Coins', right: true, render: (r) => num(r.coins) },
        { label: 'Diamonds', right: true, render: (r) => num(r.diamonds) },
        { label: 'Recharged', right: true, render: (r) => money(r.total_recharged) },
        { label: 'Status', render: (r) => <>{r.is_host && <Badge v="host" kind="" />} <Badge v={r.status} />{r.wallet_frozen && <Badge v="frozen" />}</> },
        { label: 'Joined', render: (r) => <span className="small">{dt(r.created_at)}</span> },
      ]} />
      <Pager offset={offset} limit={50} count={data?.rows?.length || 0} onChange={setOffset} />
      <UserDrawer id={open} onClose={() => { setOpen(null); reload(); }} />
    </>
  );
}

export function UserDrawer({ id, onClose }) {
  const { data, reload } = useLoad(id ? `/admin/users/${id}` : null, [id]);
  const act = useAct();
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('wallet');
  if (!id) return null;
  const u = data?.user;
  const run = async (fn, msg) => { await act(fn, msg); reload(); };
  return (
    <Drawer open={!!id} onClose={onClose}>
      {!u ? <p>Loading…</p> : (
        <>
          <div className="row" style={{ marginBottom: 14 }}>
            <Avatar src={u.avatar_url} name={u.name} size={56} />
            <div className="grow">
              <h2>{u.name}</h2>
              <div className="muted">ID {u.fancy_id || u.uid} · #{u.id} · {u.country} · Lv{u.level} · charm {u.charm_level}</div>
              <div className="row" style={{ marginTop: 4 }}><Badge v={u.status} />{u.is_host && <Badge v="host" kind="" />}{u.wallet_frozen && <Badge v="frozen" />}{u.tags?.map((t) => <Badge key={t} v={t} kind="" />)}</div>
            </div>
            <button className="btn" onClick={onClose}>Close</button>
          </div>
          <div className="grid g4">
            <Stat label="Coins" value={num(u.coins)} kind="money" />
            <Stat label="Diamonds" value={num(u.diamonds)} />
            <Stat label="Recharged" value={money(u.total_recharged)} />
            <Stat label="Coins spent" value={num(u.total_spent)} />
          </div>
          <div className="row mt">
            {u.status === 'banned'
              ? <button className="btn ok" onClick={() => run(() => post(`/admin/users/${id}/unban`), 'Unbanned')}>Unban</button>
              : <button className="btn danger" onClick={() => setForm('ban')}>Ban</button>}
            <button className="btn" onClick={() => setForm('mute')}>Restrict live/chat</button>
            <button className="btn" onClick={() => run(() => post(`/admin/users/${id}/freeze`, { frozen: !u.wallet_frozen }), u.wallet_frozen ? 'Wallet unfrozen' : 'Wallet frozen')}>{u.wallet_frozen ? 'Unfreeze wallet' : 'Freeze wallet'}</button>
            <button className="btn gold" onClick={() => setForm('balance')}>Add / deduct balance</button>
            <button className="btn" onClick={() => setForm('edit')}>Edit profile</button>
          </div>
          <dl className="kv card mt">
            <dt>Email</dt><dd>{u.email || '—'}</dd><dt>Phone</dt><dd>{u.phone || '—'}</dd>
            <dt>Gender / DOB</dt><dd>{u.gender} · {u.dob ? new Date(u.dob).toLocaleDateString() : '—'}</dd>
            <dt>VIP / Noble</dt><dd>VIP {u.vip_level} {u.vip_expires ? `(till ${dt(u.vip_expires)})` : ''} · Noble {u.noble_rank}</dd>
            <dt>Device / IP</dt><dd className="small">{u.device_id || '—'} · {u.last_ip || '—'}</dd>
            <dt>Last login</dt><dd>{dt(u.last_login)}</dd><dt>Joined</dt><dd>{dt(u.created_at)}</dd>
            {u.ban_reason && <><dt>Ban reason</dt><dd>{u.ban_reason} {u.ban_until ? `(until ${dt(u.ban_until)})` : '(permanent)'}</dd></>}
            <dt>Gifts sent</dt><dd>{num(data.gifts_sent.n)} gifts · {num(data.gifts_sent.coins)} coins</dd>
            <dt>Gifts received</dt><dd>{num(data.gifts_received.n)} gifts · {num(data.gifts_received.diamonds)} diamonds</dd>
            {data.host && <><dt>Host</dt><dd>{data.host.status} · level {data.host.level} · {data.host.agency_name || 'no agency'}</dd></>}
          </dl>
          <Tabs value={tab} onChange={setTab} tabs={[['wallet', 'Ledger'], ['orders', 'Recharges'], ['links', 'Same device'], ['receivers', 'Top receivers'], ['items', 'Items'], ['reports', 'Reports']]} />
          {tab === 'wallet' && <Table rows={data.ledger} columns={[
            { label: 'When', render: (r) => <span className="small">{dt(r.created_at)}</span> }, { key: 'currency', label: '' }, { key: 'type', label: 'Type' },
            { label: 'Amount', right: true, render: (r) => <b style={{ color: r.amount > 0 ? 'var(--teal)' : 'var(--red)' }}>{r.amount > 0 ? '+' : ''}{num(r.amount)}</b> },
            { label: 'Balance', right: true, render: (r) => num(r.balance_after) }, { key: 'note', label: 'Note' }]} />}
          {tab === 'orders' && <Table rows={data.orders} columns={[{ key: 'id', label: '#' }, { label: 'Amount', render: (r) => money(r.amount, r.currency) }, { label: 'Coins', render: (r) => num(r.coins) }, { key: 'gateway', label: 'Gateway' }, { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'When', render: (r) => dt(r.created_at) }]} />}
          {tab === 'links' && <Table rows={data.same_device} empty="No other accounts on this device." columns={[{ key: 'uid', label: 'ID' }, { key: 'name', label: 'Name' }, { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'Joined', render: (r) => dt(r.created_at) }]} />}
          {tab === 'receivers' && <Table rows={data.top_receivers} columns={[{ label: 'Receiver', render: (r) => <UserCell u={r.user} /> }, { label: 'Coins', right: true, render: (r) => num(r.coins) }]} />}
          {tab === 'items' && <Table rows={data.items} columns={[{ key: 'name', label: 'Item' }, { key: 'type', label: 'Type' }, { label: 'Expires', render: (r) => dt(r.expires_at) }, { key: 'source', label: 'Source' }]} />}
          {tab === 'reports' && <Table rows={data.reports} columns={[{ key: 'reason', label: 'Reason' }, { key: 'details', label: 'Details' }, { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'When', render: (r) => dt(r.created_at) }]} />}

          <FormModal open={form === 'ban'} onClose={() => setForm(null)} title="Ban user" submitLabel="Ban"
            fields={[{ name: 'reason', label: 'Reason (shown to user)' }, { name: 'days', label: 'Days (0 = permanent)', type: 'number' }, { name: 'device', label: 'Also ban this device', type: 'checkbox' }, { name: 'ip', label: 'Also ban this IP', type: 'checkbox' }]}
            initial={{ days: 7 }} onSubmit={(v) => run(() => post(`/admin/users/${id}/ban`, { ...v, days: Number(v.days) }), 'Banned').then(() => setForm(null))} />
          <FormModal open={form === 'mute'} onClose={() => setForm(null)} title="Restrict going live & chat" submitLabel="Apply"
            fields={[{ name: 'minutes', label: 'Minutes (0 = lift restriction)', type: 'number' }]} initial={{ minutes: 1440 }}
            onSubmit={(v) => run(() => post(`/admin/users/${id}/mute`, { minutes: Number(v.minutes) }), 'Updated').then(() => setForm(null))} />
          <FormModal open={form === 'balance'} onClose={() => setForm(null)} title="Adjust balance" submitLabel="Apply"
            fields={[{ name: 'currency', label: 'Currency', type: 'select', options: [['coin', 'Coins'], ['diamond', 'Diamonds']] }, { name: 'amount', label: 'Amount (negative to deduct)', type: 'number' }, { name: 'reason', label: 'Reason (saved in audit log)' }]}
            initial={{ currency: 'coin' }} onSubmit={(v) => run(() => post(`/admin/users/${id}/balance`, { ...v, amount: Number(v.amount) }), 'Balance updated').then(() => setForm(null))} />
          <FormModal open={form === 'edit'} onClose={() => setForm(null)} title="Edit user"
            fields={[{ name: 'name', label: 'Name' }, { name: 'country', label: 'Country code' }, { name: 'fancy_id', label: 'Pretty ID (empty = none)' }, { name: 'tags', label: 'Tags (whale, risk, test — "test" hides from rankings)', type: 'tags' },
              { name: 'vip_level', label: 'VIP level', type: 'number' }, { name: 'vip_days', label: 'VIP days', type: 'number' }, { name: 'noble_rank', label: 'Noble rank', type: 'number' }, { name: 'noble_days', label: 'Noble days', type: 'number' },
              { name: 'reset_avatar', label: 'Remove profile photo', type: 'checkbox' }, { name: 'reset_bio', label: 'Clear bio', type: 'checkbox' }]}
            initial={{ name: u.name, country: u.country, fancy_id: u.fancy_id || '', tags: u.tags, vip_level: u.vip_level, vip_days: 30, noble_rank: u.noble_rank, noble_days: 30 }}
            onSubmit={(v) => run(() => patch(`/admin/users/${id}`, { ...v, vip_level: Number(v.vip_level), noble_rank: Number(v.noble_rank) }), 'Saved').then(() => setForm(null))} />
        </>
      )}
    </Drawer>
  );
}

// ======================= HOSTS =======================
export function Hosts() {
  const [status, setStatus] = useState('pending');
  const [q, setQ] = useState('');
  const { data, loading, reload } = useLoad(`/admin/hosts?status=${status}&q=${encodeURIComponent(q)}&with_stats=${status === 'approved' ? 1 : ''}`, [status, q]);
  const { data: agencies } = useLoad('/admin/agencies');
  const act = useAct();
  const [view, setView] = useState(null);
  const [edit, setEdit] = useState(null);
  const [user, setUser] = useState(null);
  const run = async (fn, m) => { await act(fn, m); reload(); setView(null); };
  return (
    <>
      <div className="head"><h1>Hosts</h1></div>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="pending">New applications</option><option value="agency_ok">Agency approved — final review</option><option value="approved">Approved hosts</option>
          <option value="suspended">Suspended</option><option value="rejected">Rejected</option><option value="">All</option>
        </select>
        <input placeholder="Search name / ID" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <Table loading={loading} rows={data} onRow={setView} columns={[
        { label: 'Host', render: (r) => <UserCell u={r} /> },
        { key: 'real_name', label: 'Real name' },
        { label: 'Agency', render: (r) => r.agency_name ? `${r.agency_name} (${r.agency_code})` : '—' },
        { key: 'level', label: 'Level' },
        ...(status === 'approved' ? [
          { label: 'Month hours', right: true, render: (r) => r.month?.live_hours },
          { label: 'Valid days', right: true, render: (r) => r.month?.valid_days },
          { label: 'Month diamonds', right: true, render: (r) => num(r.month?.diamonds) },
        ] : []),
        { label: 'Status', render: (r) => <><Badge v={r.status} />{r.recommended && <Badge v="boosted" kind="green" />}{r.host_tags?.map((t) => <Badge key={t} v={t} kind="" />)}</> },
        { label: 'Applied', render: (r) => <span className="small">{dt(r.applied_at)}</span> },
      ]} />
      <Modal open={!!view} onClose={() => setView(null)} title={view ? `${view.name} — ${view.real_name || ''}` : ''} wide>
        {view && (
          <>
            <div className="grid g2">
              <div><div className="muted small">Live selfie</div>{view.selfie_url ? <PrivateImg url={view.selfie_url} style={{ width: '100%', borderRadius: 10 }} /> : '—'}</div>
              <div><div className="muted small">ID document</div>{view.id_doc_url ? <PrivateImg url={view.id_doc_url} style={{ width: '100%', borderRadius: 10 }} /> : <p className="muted">Not provided</p>}</div>
            </div>
            <dl className="kv mt">
              <dt>App ID</dt><dd>{view.uid}</dd><dt>Gender / DOB</dt><dd>{view.gender} · {view.dob ? new Date(view.dob).toLocaleDateString() : '—'}</dd>
              <dt>Agency</dt><dd>{view.agency_name || '—'}</dd><dt>Payout</dt><dd>{view.payout_method || '—'} {JSON.stringify(view.payout_details || {})}</dd>
              <dt>Warnings</dt><dd>{view.warnings}</dd>{view.reject_reason && <><dt>Reject reason</dt><dd>{view.reject_reason}</dd></>}
            </dl>
            <div className="row mt">
              {view.status !== 'approved' && <button className="btn ok" onClick={() => run(() => post(`/admin/hosts/${view.user_id}/approve`), 'Host approved')}>Approve</button>}
              {view.status !== 'rejected' && view.status !== 'approved' && <button className="btn danger" onClick={() => { const reason = window.prompt('Reason for rejection'); if (reason) run(() => post(`/admin/hosts/${view.user_id}/reject`, { reason }), 'Rejected'); }}>Reject</button>}
              {view.status === 'approved' && <button className="btn danger" onClick={() => confirmAct('Suspend this host? Their live ends and they stop earning salary.') && run(() => post(`/admin/hosts/${view.user_id}/suspend`), 'Suspended')}>Suspend</button>}
              {view.status === 'suspended' && <button className="btn ok" onClick={() => run(() => post(`/admin/hosts/${view.user_id}/approve`), 'Reinstated')}>Reinstate</button>}
              <button className="btn" onClick={() => { const m = window.prompt('Warning message to host'); if (m) run(() => post(`/admin/hosts/${view.user_id}/warn`, { message: m }), 'Warning sent'); }}>Warn</button>
              <button className="btn" onClick={() => { const d = window.prompt('Diamonds to deduct as penalty'); const r = d && window.prompt('Reason'); if (d && r) run(() => post(`/admin/hosts/${view.user_id}/deduct`, { diamonds: Number(d), reason: r }), 'Deducted'); }}>Deduct diamonds</button>
              <button className="btn" onClick={() => setEdit(view)}>Edit level / tags</button>
              <button className="btn ghost" onClick={() => setUser(view.user_id)}>Open user</button>
            </div>
          </>
        )}
      </Modal>
      <FormModal open={!!edit} onClose={() => setEdit(null)} title="Edit host"
        fields={[
          { name: 'level', label: 'Level code (N, D, C, B, A, S)' },
          { name: 'host_tags', label: 'Tags (supreme, star, official, new)', type: 'tags' },
          { name: 'recommended', label: 'Boost on home feed', type: 'checkbox' },
          { name: 'agency_id', label: 'Agency', type: 'select', options: [['', '— none —'], ...(agencies || []).map((a) => [a.id, `${a.name} (${a.code})`])] },
          { name: 'call_rate', label: 'Call rate (coins/min)', type: 'number' },
        ]}
        initial={edit ? { level: edit.level, host_tags: edit.host_tags, recommended: edit.recommended, agency_id: edit.agency_id || '', call_rate: edit.call_rate } : {}}
        onSubmit={async (v) => { await act(() => patch(`/admin/hosts/${edit.user_id}`, { ...v, host_tags: typeof v.host_tags === 'string' ? v.host_tags.split(',').map((s) => s.trim()).filter(Boolean) : v.host_tags, call_rate: Number(v.call_rate) }), 'Saved'); setEdit(null); setView(null); reload(); }} />
      <UserDrawer id={user} onClose={() => setUser(null)} />
    </>
  );
}

// ======================= AGENCIES =======================
export function Agencies() {
  const { data, loading, reload } = useLoad('/admin/agencies');
  const { data: staff } = useLoad('/admin/staff');
  const act = useAct();
  const [edit, setEdit] = useState(null);
  const [transfer, setTransfer] = useState(null);
  const bds = (staff?.staff || []).filter((s) => s.role === 'bd');
  const fields = [
    { name: 'name', label: 'Agency name' }, { name: 'code', label: 'Invite code (empty = auto)' },
    { name: 'login_email', label: 'Panel login email' }, { name: 'password', label: 'Panel password (leave empty to keep)', type: 'password' },
    { name: 'phone', label: 'Phone / WhatsApp' }, { name: 'country', label: 'Country code' },
    { name: 'commission_pct', label: 'Commission % of host salaries', type: 'number', step: '0.1' },
    { name: 'override_pct', label: 'Override % paid to parent (super agency)', type: 'number', step: '0.1' },
    { name: 'parent_id', label: 'Parent / super agency', type: 'select', options: [['', '— none —'], ...(data || []).map((a) => [a.id, `${a.name} (${a.code})`])] },
    { name: 'bd_admin_id', label: 'BD manager', type: 'select', options: [['', '— none —'], ...bds.map((b) => [b.id, b.name])] },
    { name: 'owner_uid', label: 'Owner app ID (optional)' },
    { name: 'status', label: 'Status', type: 'select', options: ['active', 'pending', 'frozen', 'terminated'] },
    { name: 'payout_method', label: 'Payout method', type: 'select', options: ['', 'upi', 'bank', 'payoneer', 'paypal'] },
  ];
  const save = async (v) => {
    const body = { ...v, parent_id: v.parent_id || null, bd_admin_id: v.bd_admin_id || null };
    const r = await act(() => (edit.__new ? post('/admin/agencies', body) : put(`/admin/agencies/${edit.id}`, body)), 'Saved');
    if (r) { setEdit(null); reload(); }
  };
  return (
    <>
      <div className="head"><h1>Agencies</h1><button className="btn primary" onClick={() => setEdit({ __new: true, commission_pct: 10, override_pct: 2, country: 'IN', status: 'active' })}>New agency</button></div>
      <Table loading={loading} rows={data} onRow={setEdit} columns={[
        { label: 'Agency', render: (r) => <><b>{r.name}</b><div className="muted small">{r.code} · {r.login_email || 'no login'}</div></> },
        { label: 'Parent', render: (r) => r.parent_name || '—' }, { label: 'BD', render: (r) => r.bd_name || '—' },
        { key: 'country', label: 'Country' }, { label: 'Hosts', right: true, render: (r) => num(r.hosts) },
        { label: 'Commission', right: true, render: (r) => `${r.commission_pct}%` },
        { label: 'This month 💎', right: true, render: (r) => num(r.month_diamonds) },
        { label: 'Growth', right: true, render: (r) => (r.last_month_diamonds ? `${Math.round(((r.month_diamonds - r.last_month_diamonds) / r.last_month_diamonds) * 100)}%` : '—') },
        { label: 'Status', render: (r) => <Badge v={r.status} /> },
        { label: '', render: (r) => <button className="btn sm" onClick={(e) => { e.stopPropagation(); setTransfer(r); }}>Move host here</button> },
      ]} />
      <FormModal open={!!edit} onClose={() => setEdit(null)} title={edit?.__new ? 'New agency' : `Edit ${edit?.name}`} fields={fields}
        initial={edit ? { ...edit, password: '', parent_id: edit.parent_id || '', bd_admin_id: edit.bd_admin_id || '' } : {}} onSubmit={save} />
      <FormModal open={!!transfer} onClose={() => setTransfer(null)} title={`Move a host to ${transfer?.name}`} fields={[{ name: 'uid', label: 'Host app ID' }]}
        onSubmit={async (v) => {
          const u = await act(() => get(`/admin/users?q=${v.uid}`));
          const host = u?.rows?.[0];
          if (!host) return;
          await act(() => post(`/admin/agencies/${transfer.id}/transfer-host`, { host_user_id: host.id }), `${host.name} moved`);
          setTransfer(null); reload();
        }} />
    </>
  );
}
