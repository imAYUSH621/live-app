import { useState } from 'react';
import { get, post, patch, num, money, dt, lastMonth } from '../lib/api.js';
import { useLoad, useAct, Table, Badge, Stat, Tabs, FormModal, UserCell, Avatar, PrivateImg, useToast } from '../ui.jsx';

// ======================= AGENCY PANEL =======================
export function AgencyHome() {
  const { data } = useLoad('/agency/me');
  const toast = useToast();
  if (!data) return <p className="muted">Loading…</p>;
  const s = data.stats;
  const copy = (t) => navigator.clipboard?.writeText(t).then(() => toast('Copied', 'success'));
  return (
    <>
      <div className="head"><h1>{data.agency.name}</h1><Badge v={data.agency.status} /></div>
      <div className="grid g5">
        <Stat label="Hosts" value={num(s.hosts)} /><Stat label="Live now" value={num(s.live_now)} />
        <Stat label="Target met this month" value={`${s.target_met} / ${s.hosts}`} />
        <Stat label="Hosts' salary (est.)" value={money(s.month_host_income, s.currency)} />
        <Stat label="Your commission (est.)" kind="money" value={money(s.est_commission, s.currency)} sub={`${data.agency.commission_pct}% of host salaries`} />
      </div>
      {s.pending_applications > 0 && <div className="card mt" style={{ background: 'var(--marigold-soft)', borderColor: 'var(--marigold)' }}><b>{s.pending_applications} new host application(s)</b> waiting for you in Applications.</div>}
      <div className="card mt">
        <h3>Recruit hosts</h3>
        <p className="muted">Hosts enter your agency code when they apply in the app, or open your invite link.</p>
        <div className="row mt">
          <code style={{ fontSize: 22, fontWeight: 700 }}>{data.invite.code}</code>
          <button className="btn sm" onClick={() => copy(data.invite.code)}>Copy code</button>
          <span className="grow small ellipsis">{data.invite.link}</span>
          <button className="btn sm" onClick={() => copy(data.invite.link)}>Copy link</button>
        </div>
      </div>
      {data.sub_agencies.length > 0 && (
        <div className="card mt"><h3>Sub-agencies</h3>
          <Table rows={data.sub_agencies} columns={[{ key: 'name', label: 'Name' }, { key: 'code', label: 'Code' }, { label: 'Commission', render: (r) => `${r.commission_pct}%` }, { label: 'Status', render: (r) => <Badge v={r.status} /> }]} />
        </div>
      )}
    </>
  );
}

export function AgencyHosts() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, loading } = useLoad(`/agency/hosts?month=${month}`, [month]);
  const act = useAct();
  return (
    <>
      <div className="head"><h1>My hosts</h1><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} /></div>
      <Table loading={loading} rows={data} empty="No hosts yet. Share your agency code." columns={[
        { label: 'Host', render: (r) => <UserCell u={r} /> }, { key: 'level', label: 'Level' },
        { label: 'Hours', right: true, render: (r) => `${r.month.live_hours} / ${r.month.target.hours}` },
        { label: 'Valid days', right: true, render: (r) => `${r.month.valid_days} / ${r.month.target.days}` },
        { label: 'Diamonds', right: true, render: (r) => num(r.month.diamonds) },
        { label: 'Est. salary', right: true, render: (r) => money(r.month.total, r.month.currency) },
        { label: 'Target', render: (r) => <Badge v={r.risk.replace('_', ' ')} kind={r.risk === 'met' ? 'green' : r.risk === 'at_risk' ? 'red' : 'gold'} /> },
        { label: 'Status', render: (r) => <>{r.live_now && <Badge v="live" />} <Badge v={r.status} /></> },
        { label: 'Last live', render: (r) => <span className="small">{dt(r.last_live)}</span> },
        { label: '', render: (r) => <button className="btn sm" onClick={async () => { const m = window.prompt('Reminder message (sent as notification)', 'Please complete your live hours this month 💪'); if (m) await act(() => post(`/agency/hosts/${r.user_id}/remind`, { message: m }), 'Reminder sent'); }}>Remind</button> },
      ]} />
    </>
  );
}

export function AgencyApplications() {
  const { data, loading, reload } = useLoad('/agency/applications');
  const act = useAct();
  return (
    <>
      <div className="head"><h1>Host applications</h1></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>Check the selfie matches the person you recruited. After you approve, the platform does a final review.</p>
      <Table loading={loading} rows={data} columns={[
        { label: 'Selfie', render: (r) => (r.selfie_url?.startsWith('/uploads-private/') ? <PrivateImg url={r.selfie_url} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} /> : <Avatar src={r.selfie_url} name={r.name} size={48} />) },
        { label: 'Applicant', render: (r) => <><b>{r.real_name}</b><div className="muted small">{r.name} · ID {r.uid} · {r.gender} · {r.country}</div></> },
        { label: 'Contact', render: (r) => <span className="small">{r.phone || r.email || '—'}</span> },
        { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'Applied', render: (r) => dt(r.applied_at) },
        { label: '', render: (r) => r.status === 'pending' && (
          <div className="row">
            <button className="btn sm ok" onClick={async () => { await act(() => post(`/agency/applications/${r.user_id}`, { action: 'approve' }), 'Approved — sent for final review'); reload(); }}>Approve</button>
            <button className="btn sm danger" onClick={async () => { const reason = window.prompt('Reason'); if (reason) { await act(() => post(`/agency/applications/${r.user_id}`, { action: 'reject', reason }), 'Rejected'); reload(); } }}>Reject</button>
          </div>
        ) },
      ]} />
    </>
  );
}

export function AgencyMoney() {
  const { data } = useLoad('/agency/commissions');
  const [month, setMonth] = useState(null);
  const { data: detail } = useLoad(month ? `/agency/commissions/${month}` : null, [month]);
  const act = useAct();
  const [payout, setPayout] = useState(false);
  return (
    <>
      <div className="head"><h1>Commission statements</h1><button className="btn" onClick={() => setPayout(true)}>Payout account</button></div>
      <Table rows={data} onRow={(r) => setMonth(r.month)} empty="Your first statement appears after the month's host salaries are calculated." columns={[
        { key: 'month', label: 'Month' }, { label: 'Hosts', right: true, render: (r) => r.hosts_count }, { label: 'Host salaries', right: true, render: (r) => money(r.host_income) },
        { label: 'Commission', right: true, render: (r) => money(r.commission) }, { label: 'Override', right: true, render: (r) => money(r.override_income) },
        { label: 'Total', right: true, render: (r) => <b>{money(r.total)}</b> }, { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'Paid', render: (r) => dt(r.paid_at) },
      ]} />
      {month && (
        <div className="card mt"><h3>Host-wise breakup · {month}</h3>
          <Table rows={detail} columns={[{ label: 'Host', render: (r) => `${r.name} (${r.uid})` }, { label: 'Diamonds', right: true, render: (r) => num(r.diamonds) }, { label: 'Hours', right: true, render: (r) => r.live_hours }, { label: 'Salary', right: true, render: (r) => money(r.total) }, { label: 'Status', render: (r) => <Badge v={r.status} /> }]} />
        </div>
      )}
      <FormModal open={payout} onClose={() => setPayout(false)} title="Where we send your commission"
        fields={[{ name: 'method', label: 'Method', type: 'select', options: ['upi', 'bank', 'payoneer', 'paypal'] }, { name: 'upi', label: 'UPI ID' }, { name: 'account', label: 'Bank account no.' }, { name: 'ifsc', label: 'IFSC' }, { name: 'name', label: 'Account holder' }, { name: 'email', label: 'Payoneer / PayPal email' }]}
        initial={{ method: 'upi' }}
        onSubmit={async (v) => { const { method, ...details } = v; await act(() => patch('/agency/payout', { method, details }), 'Saved'); setPayout(false); }} />
    </>
  );
}

export function AgencyMore() {
  const [tab, setTab] = useState('sub');
  const act = useAct();
  const { data: tickets, reload } = useLoad('/agency/tickets');
  const { data: policy } = useLoad('/agency/policy');
  const [sub, setSub] = useState(false);
  const [ticket, setTicket] = useState(false);
  const [pw, setPw] = useState(false);
  return (
    <>
      <div className="head"><h1>More</h1><button className="btn" onClick={() => setPw(true)}>Change password</button></div>
      <Tabs value={tab} onChange={setTab} tabs={[['sub', 'Sub-agents'], ['help', 'Help from your BD manager'], ['policy', 'Policies']]} />
      {tab === 'sub' && (
        <div className="card">
          <p className="muted">Add a sub-agent who recruits hosts under you. You earn an override on their hosts. The platform approves new sub-agents.</p>
          <button className="btn primary mt" onClick={() => setSub(true)}>Add sub-agent</button>
        </div>
      )}
      {tab === 'help' && (
        <>
          <button className="btn primary" onClick={() => setTicket(true)} style={{ marginBottom: 12 }}>New request</button>
          <Table rows={tickets} columns={[{ key: 'subject', label: 'Subject' }, { key: 'body', label: 'Message' }, { label: 'Reply', render: (r) => r.reply || '—' }, { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'When', render: (r) => dt(r.created_at) }]} />
        </>
      )}
      {tab === 'policy' && (policy || []).map((p) => <div key={p.slug} className="card"><h3>{p.title}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{p.body}</p></div>)}
      <FormModal open={sub} onClose={() => setSub(false)} title="Add sub-agent"
        fields={[{ name: 'name', label: 'Name' }, { name: 'email', label: 'Login email' }, { name: 'password', label: 'Password (8+)', type: 'password' }, { name: 'phone', label: 'Phone' }, { name: 'commission_pct', label: 'Their commission % (≤ yours)', type: 'number' }]}
        onSubmit={async (v) => { const r = await act(() => post('/agency/sub-agencies', v), 'Sent for approval'); if (r) setSub(false); }} />
      <FormModal open={ticket} onClose={() => setTicket(false)} title="New request" fields={[{ name: 'subject', label: 'Subject' }, { name: 'body', label: 'Message', type: 'textarea' }]}
        onSubmit={async (v) => { await act(() => post('/agency/tickets', v), 'Sent'); setTicket(false); reload(); }} />
      <FormModal open={pw} onClose={() => setPw(false)} title="Change password" fields={[{ name: 'old_password', label: 'Current password', type: 'password' }, { name: 'new_password', label: 'New password (8+)', type: 'password' }]}
        onSubmit={async (v) => { const r = await act(() => post('/agency/password', v), 'Password changed'); if (r) setPw(false); }} />
    </>
  );
}

// ======================= COIN SELLER PANEL =======================
export function SellerHome() {
  const { data, reload } = useLoad('/seller/me');
  const { data: hist, reload: rh } = useLoad('/seller/transfers');
  const act = useAct();
  const [uid, setUid] = useState('');
  const [coins, setCoins] = useState('');
  const [note, setNote] = useState('');
  const [found, setFound] = useState(null);
  const lookup = async () => setFound(await act(() => get(`/seller/lookup/${uid}`)));
  const send = async () => {
    if (!window.confirm(`Send ${num(coins)} coins to ${found.name} (${found.uid})?`)) return;
    const r = await act(() => post('/seller/transfer', { uid, coins: Number(coins), note }), 'Coins sent');
    if (r) { setFound(null); setUid(''); setCoins(''); setNote(''); reload(); rh(); }
  };
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="head"><h1>Coin seller</h1></div>
      <div className="grid g4">
        <Stat kind="money" label="Your coin balance" value={`🪙 ${num(data.seller.balance)}`} />
        <Stat label="Sold today" value={num(data.today.coins)} sub={`${data.today.n} transfers · limit ${num(data.seller.daily_limit)}`} />
        <Stat label="Sold this month" value={num(data.month.coins)} />
        <Stat label="Wholesale discount" value={`${data.seller.discount_pct}%`} />
      </div>
      <div className="card mt" style={{ maxWidth: 520 }}>
        <h3>Send coins to a user</h3>
        <div className="row"><input placeholder="User app ID" value={uid} onChange={(e) => { setUid(e.target.value); setFound(null); }} style={{ flex: 1 }} /><button className="btn" onClick={lookup}>Find</button></div>
        {found && (
          <>
            <div className="row mt"><Avatar src={found.avatar_url} name={found.name} size={44} /><div><b>{found.name}</b><div className="muted small">ID {found.uid} · Lv{found.level} · {found.country}</div></div></div>
            <div className="field mt"><label>Coins</label><input type="number" value={coins} onChange={(e) => setCoins(e.target.value)} /></div>
            <div className="field"><label>Note (payment ref, optional)</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
            <button className="btn gold" disabled={!coins} onClick={send}>Send {num(coins)} coins</button>
          </>
        )}
      </div>
      <h2 style={{ margin: '24px 0 10px' }}>History</h2>
      <Table rows={hist} columns={[{ label: 'When', render: (r) => dt(r.created_at) }, { key: 'kind', label: 'Type' }, { label: 'User', render: (r) => (r.uid ? `${r.name} (${r.uid})` : '—') }, { label: 'Coins', right: true, render: (r) => num(r.coins) }, { key: 'note', label: 'Note' }]} />
    </>
  );
}

export { lastMonth };
