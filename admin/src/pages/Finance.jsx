import { useState } from 'react';
import { get, post, put, num, money, dt, day, downloadCsv, lastMonth } from '../lib/api.js';
import { useLoad, useAct, Table, Badge, Tabs, FormModal, Stat, Bars, UserCell, Pager, confirmAct, FieldInput } from '../ui.jsx';
import CrudPage from '../crud.jsx';

// ======================= ORDERS =======================
export function Orders() {
  const [status, setStatus] = useState('');
  const [gateway, setGateway] = useState('');
  const [uid, setUid] = useState('');
  const [offset, setOffset] = useState(0);
  const [manual, setManual] = useState(false);
  const qs = new URLSearchParams({ status, gateway, uid, offset, limit: 50 }).toString();
  const { data, loading, reload } = useLoad(`/admin/orders?${qs}`, [qs]);
  const act = useAct();
  return (
    <>
      <div className="head"><h1>Recharge orders</h1><button className="btn" onClick={() => downloadCsv(`/admin/orders?${qs}&format=csv&limit=500`, 'orders')}>Export CSV</button><button className="btn gold" onClick={() => setManual(true)}>Manual recharge</button></div>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="paid">Paid</option><option value="created">Unpaid</option><option value="refunded">Refunded</option><option value="failed">Failed</option></select>
        <select value={gateway} onChange={(e) => setGateway(e.target.value)}><option value="">All gateways</option><option value="razorpay">Razorpay</option><option value="manual">Manual</option><option value="google_play">Google Play</option></select>
        <input placeholder="User ID" value={uid} onChange={(e) => setUid(e.target.value)} />
      </div>
      <Table loading={loading} rows={data} columns={[
        { key: 'id', label: '#' }, { label: 'User', render: (r) => `${r.name} (${r.uid})` }, { label: 'Amount', right: true, render: (r) => money(r.amount, r.currency) },
        { label: 'Coins', right: true, render: (r) => num(r.coins) }, { key: 'gateway', label: 'Gateway' }, { label: 'Reference', render: (r) => <span className="small">{r.gateway_payment_id || r.gateway_order_id || '—'}</span> },
        { label: 'Status', render: (r) => <Badge v={r.status} /> }, { label: 'Created', render: (r) => <span className="small">{dt(r.created_at)}</span> },
        { label: '', render: (r) => (
          <div className="row">
            {r.status === 'created' && <button className="btn sm ok" onClick={async () => { const ref = window.prompt('Payment reference (UTR / bank ref) — confirm you received the money'); if (ref) { await act(() => post(`/admin/orders/${r.id}/mark-paid`, { reference: ref }), 'Coins credited'); reload(); } }}>Mark paid</button>}
            {r.status === 'paid' && <button className="btn sm danger" onClick={async () => { if (confirmAct('Refund this order? Coins are taken back and the wallet is frozen if already spent.')) { await act(() => post(`/admin/orders/${r.id}/refund`), 'Refunded'); reload(); } }}>Refund</button>}
          </div>
        ) },
      ]} />
      <Pager offset={offset} limit={50} count={data?.length || 0} onChange={setOffset} />
      <FormModal open={manual} onClose={() => setManual(false)} title="Manual recharge (money received outside the app)" submitLabel="Credit coins"
        fields={[{ name: 'uid', label: 'User app ID' }, { name: 'amount', label: 'Amount received (₹)', type: 'number' }, { name: 'coins', label: 'Coins to credit', type: 'number' }, { name: 'reference', label: 'Payment reference (UTR)' }]}
        onSubmit={async (v) => { const r = await act(() => post('/admin/recharge/manual', { ...v, coins: Number(v.coins), amount: Number(v.amount) }), 'Coins credited'); if (r) { setManual(false); reload(); } }} />
    </>
  );
}

// ======================= ECONOMY =======================
export function Economy() {
  const { data, reload } = useLoad('/admin/settings');
  const act = useAct();
  const [tab, setTab] = useState('packages');
  return (
    <>
      <div className="head"><h1>Economy & pricing</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[['packages', 'Coin packages'], ['rates', 'Rates & prices'], ['lucky', 'Lucky gift'], ['rewards', 'Free coins']]} />
      {tab === 'packages' && (
        <CrudPage path="packages" newLabel="New package" defaults={{ currency: 'INR', platform: 'web', bonus: 0, first_bonus: 0, active: true, sort: 0 }}
          columns={[{ key: 'platform', label: 'Platform' }, { label: 'Coins', right: true, render: (r) => num(r.coins) }, { label: 'Bonus', right: true, render: (r) => num(r.bonus) },
            { label: 'First-time bonus', right: true, render: (r) => num(r.first_bonus) }, { label: 'Price', right: true, render: (r) => money(r.price, r.currency) },
            { label: 'Coins per ₹', right: true, render: (r) => ((r.coins + r.bonus) / r.price).toFixed(1) }, { key: 'product_id', label: 'Store product ID' }, { key: 'country', label: 'Country' },
            { label: 'Active', render: (r) => <Badge v={r.active ? 'on' : 'off'} kind={r.active ? 'green' : 'red'} /> }]}
          fields={[{ name: 'platform', label: 'Platform', type: 'select', options: ['web', 'android', 'ios'] }, { name: 'coins', label: 'Coins', type: 'number' }, { name: 'bonus', label: 'Bonus coins', type: 'number' },
            { name: 'first_bonus', label: 'Extra on first recharge', type: 'number' }, { name: 'price', label: 'Price', type: 'number', step: '0.01' }, { name: 'currency', label: 'Currency', type: 'select', options: ['INR', 'USD', 'AED'] },
            { name: 'country', label: 'Country only (empty = all)' }, { name: 'product_id', label: 'Play/App Store product ID' }, { name: 'sort', label: 'Sort', type: 'number' }, { name: 'active', label: 'Active', type: 'checkbox' }]} />
      )}
      {tab !== 'packages' && data && (
        <SettingsForm
          section={tab === 'lucky' ? 'lucky' : tab === 'rewards' ? 'ads' : 'economy'}
          extraSections={tab === 'rewards' ? ['checkin', 'spin', 'red_packet'] : []}
          settings={data.settings}
          onSave={async (section, value) => { await act(() => put(section === 'economy' ? '/admin/economy' : `/admin/settings/${section}`, value), 'Saved'); reload(); }}
        />
      )}
    </>
  );
}

const LABELS = {
  currency: 'Currency', diamonds_per_unit: 'Diamonds per ₹1 of host salary', diamond_to_coin_rate: 'Coins per diamond on exchange', min_exchange_diamonds: 'Minimum diamonds to exchange',
  global_banner_coins: 'Gift value that triggers an app-wide banner', paid_message_coins: 'Coins per DM after free quota (0 = free)', free_messages_per_day: 'Free DMs per day',
  match_filter_coins: 'Random-match gender filter price', call_min_rate: 'Lowest call rate', call_default_rate: 'Default call rate', call_host_pct: 'Host share of call coins (%)',
  call_min_balance_minutes: 'Minutes of balance needed to start a call', new_user_coins: 'Welcome coins', referral_reward_coins: 'Referral signup reward', referral_recharge_pct: 'Referrer gets % of friend recharges',
  ticket_host_pct: 'Host share of ticket shows (%)', family_create_coins: 'Price to create a family', host_pct: 'Host % on lucky gifts', daily_pool: 'Max coins paid back per day',
  table: 'Win table (multiplier / weight)', reward_coins: 'Coins per ad', daily_limit: 'Ads per day', cooldown_sec: 'Seconds between ads', rewards: 'Coins for day 1–7',
  free_per_day: 'Free spins per day', prizes: 'Prizes', min_coins: 'Minimum lucky bag', max_parts: 'Max shares', expire_sec: 'Seconds before unclaimed refund', delay_sec: 'Seconds before it opens',
};

export function SettingsForm({ section, settings, onSave, extraSections = [] }) {
  return [section, ...extraSections].map((s) => <SectionForm key={s} section={s} value={settings[s]} onSave={onSave} />);
}

function SectionForm({ section, value, onSave }) {
  const [v, setV] = useState(value || {});
  return (
    <form className="card" onSubmit={(e) => { e.preventDefault(); onSave(section, v); }}>
      <h3 style={{ textTransform: 'capitalize' }}>{section.replace('_', ' ')}</h3>
      <div className="grid g2">
        {Object.entries(v).map(([k, val]) => {
          const label = LABELS[k] || k.replace(/_/g, ' ');
          if (typeof val === 'boolean') return <FieldInput key={k} f={{ name: k, label, type: 'checkbox' }} value={val} onChange={(x) => setV({ ...v, [k]: x })} />;
          if (typeof val === 'number') return <FieldInput key={k} f={{ name: k, label, type: 'number', step: 'any' }} value={val} onChange={(x) => setV({ ...v, [k]: x === '' ? '' : Number(x) })} />;
          if (typeof val === 'object') {
            return (
              <div key={k} className="field" style={{ gridColumn: '1 / -1' }}>
                <label>{label}</label>
                <textarea rows={5} style={{ fontFamily: 'monospace', fontSize: 12 }} defaultValue={JSON.stringify(val, null, 1)}
                  onBlur={(e) => { try { setV({ ...v, [k]: JSON.parse(e.target.value) }); } catch { window.alert(`${label}: invalid JSON`); } }} />
              </div>
            );
          }
          return <FieldInput key={k} f={{ name: k, label }} value={val} onChange={(x) => setV({ ...v, [k]: x })} />;
        })}
      </div>
      <button className="btn primary">Save {section.replace('_', ' ')}</button>
    </form>
  );
}

// ======================= SETTLEMENT =======================
export function Settlement() {
  const [month, setMonth] = useState(lastMonth());
  const [status, setStatus] = useState('');
  const { data, loading, reload } = useLoad(`/admin/settlements?month=${month}&status=${status}`, [month, status]);
  const act = useAct();
  const [sel, setSel] = useState([]);
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const rows = data?.rows || [];
  const one = async (id, action, body, m) => { await act(() => post(`/admin/settlements/${id}/${action}`, body), m); reload(); };
  return (
    <>
      <div className="head">
        <h1>Host salary settlement</h1>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ width: 170 }} />
        <button className="btn primary" onClick={async () => { const r = await act(() => post('/admin/settlement/run', { month }), null); if (r) { window.alert(`${r.settlements} settlements drafted for ${r.month} (${r.hosts} hosts with activity)`); reload(); } }}>Calculate month</button>
        <button className="btn" onClick={() => downloadCsv(`/admin/settlements?month=${month}&format=csv`, `settlements-${month}`)}>Payout CSV</button>
      </div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>
        1. Calculate (safe to re-run while drafts) → 2. Review & approve (diamonds leave host balances) → 3. Pay via UPI/bank using the CSV → 4. Mark paid with the UTR.
      </p>
      <div className="grid g4" style={{ marginBottom: 12 }}>
        <Stat label="Hosts" value={num(rows.length)} />
        <Stat label="Total payable" kind="money" value={money(data?.totals?.total)} />
        <Stat label="Diamonds settled" value={num(data?.totals?.diamonds)} />
        <Stat label="Approved / paid" value={`${rows.filter((r) => r.status === 'approved').length} / ${rows.filter((r) => r.status === 'paid').length}`} />
      </div>
      <div className="filters">
        <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option><option value="draft">Draft</option><option value="approved">Approved</option><option value="paid">Paid</option><option value="rejected">Rejected</option></select>
        {sel.length > 0 && (
          <>
            <button className="btn ok" onClick={async () => { await act(() => post('/admin/settlements/bulk', { ids: sel, action: 'approve' }), 'Approved'); setSel([]); reload(); }}>Approve {sel.length}</button>
            <button className="btn gold" onClick={async () => { const ref = window.prompt('Payout batch reference'); if (ref) { await act(() => post('/admin/settlements/bulk', { ids: sel, action: 'paid', payout_ref: ref }), 'Marked paid'); setSel([]); reload(); } }}>Mark {sel.length} paid</button>
          </>
        )}
      </div>
      <Table loading={loading} rows={rows} empty="No settlements. Pick a month and click Calculate." columns={[
        { label: <input type="checkbox" onChange={(e) => setSel(e.target.checked ? rows.map((r) => r.id) : [])} />, render: (r) => <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r.id)} onClick={(e) => e.stopPropagation()} /> },
        { label: 'Host', render: (r) => <><b>{r.name}</b><div className="muted small">{r.uid} · {r.real_name}</div></> },
        { label: 'Agency', render: (r) => r.agency_code || '—' },
        { label: 'Diamonds', right: true, render: (r) => num(r.diamonds) }, { label: 'Hours', right: true, render: (r) => r.live_hours }, { label: 'Days', right: true, render: (r) => r.valid_days },
        { label: 'Level', render: (r) => r.level || '—' }, { label: 'Target', render: (r) => (r.target_met ? <Badge v="met" kind="green" /> : <Badge v="missed" kind="red" />) },
        { label: 'Base', right: true, render: (r) => money(r.base_amount) }, { label: 'Bonus', right: true, render: (r) => money(r.bonus) }, { label: 'Deduct', right: true, render: (r) => money(r.deduction) },
        { label: 'Total', right: true, render: (r) => <b>{money(r.total, r.currency)}</b> },
        { label: 'Payout to', render: (r) => <span className="small">{r.payout_method || '—'} {r.payout_details?.upi || r.payout_details?.account || r.payout_details?.email || ''}</span> },
        { label: 'Status', render: (r) => <><Badge v={r.status} />{r.note && <div className="small muted">{r.note}</div>}{r.payout_ref && <div className="small muted">{r.payout_ref}</div>}</> },
        { label: '', render: (r) => (
          <div className="row">
            {r.status === 'draft' && <button className="btn sm ok" onClick={() => one(r.id, 'approve', {}, 'Approved')}>Approve</button>}
            {r.status === 'draft' && <button className="btn sm" onClick={() => { const a = window.prompt('Adjust total by (₹, negative to reduce)'); const n = a && window.prompt('Note'); if (a) one(r.id, 'adjust', { amount: Number(a), note: n }, 'Adjusted'); }}>Adjust</button>}
            {r.status === 'draft' && <button className="btn sm ghost" onClick={() => { const n = window.prompt('Reason'); if (n) one(r.id, 'reject', { note: n }, 'Rejected'); }}>Reject</button>}
            {r.status === 'approved' && <button className="btn sm gold" onClick={() => { const ref = window.prompt('UTR / payout reference'); if (ref) one(r.id, 'paid', { payout_ref: ref }, 'Marked paid'); }}>Mark paid</button>}
          </div>
        ) },
      ]} />
      <Commissions month={month} />
    </>
  );
}

function Commissions({ month }) {
  const { data, reload } = useLoad(`/admin/commissions?month=${month}`, [month]);
  const act = useAct();
  return (
    <div className="mt">
      <div className="row" style={{ margin: '24px 0 10px' }}><h2 className="grow">Agency commissions · {month}</h2><button className="btn" onClick={() => downloadCsv(`/admin/commissions?month=${month}&format=csv`, `commissions-${month}`)}>CSV</button></div>
      <Table rows={data} empty="Commissions appear after host salaries are calculated." columns={[
        { label: 'Agency', render: (r) => `${r.name} (${r.code})` }, { label: 'Hosts', right: true, render: (r) => r.hosts_count },
        { label: 'Host salaries', right: true, render: (r) => money(r.host_income) }, { label: '%', right: true, render: (r) => `${r.pct}%` },
        { label: 'Commission', right: true, render: (r) => money(r.commission) }, { label: 'Override', right: true, render: (r) => money(r.override_income) },
        { label: 'Total', right: true, render: (r) => <b>{money(r.total)}</b> }, { label: 'Payout', render: (r) => <span className="small">{r.payout_method || '—'}</span> },
        { label: 'Status', render: (r) => <Badge v={r.status} /> },
        { label: '', render: (r) => (
          <>
            {r.status === 'draft' && <button className="btn sm ok" onClick={async () => { await act(() => post(`/admin/commissions/${r.id}/approve`), 'Approved'); reload(); }}>Approve</button>}
            {r.status === 'approved' && <button className="btn sm gold" onClick={async () => { const ref = window.prompt('Payout reference'); if (ref) { await act(() => post(`/admin/commissions/${r.id}/paid`, { payout_ref: ref }), 'Paid'); reload(); } }}>Mark paid</button>}
          </>
        ) },
      ]} />
    </div>
  );
}

// ======================= COIN SELLERS =======================
export function Sellers() {
  const { data, reload } = useLoad('/admin/sellers');
  const act = useAct();
  const [form, setForm] = useState(null);
  const [hist, setHist] = useState(null);
  return (
    <>
      <div className="head"><h1>Coin sellers</h1><button className="btn primary" onClick={() => setForm({ kind: 'new' })}>Add seller</button></div>
      <p className="muted" style={{ marginTop: -8, marginBottom: 12 }}>Resellers buy coins from you in bulk (at a discount), then top up users by ID from their seller panel. Issue coins only after you receive payment.</p>
      <Table rows={data} columns={[
        { label: 'Seller', render: (r) => `${r.name} (${r.uid})` }, { label: 'Balance', right: true, render: (r) => `🪙 ${num(r.balance)}` },
        { label: 'Sold this month', right: true, render: (r) => num(r.month_sold) }, { label: 'Daily limit', right: true, render: (r) => num(r.daily_limit) },
        { label: 'Discount', right: true, render: (r) => `${r.discount_pct}%` }, { label: 'Status', render: (r) => <Badge v={r.status} /> },
        { label: '', render: (r) => (
          <div className="row">
            <button className="btn sm gold" onClick={() => setForm({ kind: 'topup', r })}>Issue coins</button>
            <button className="btn sm" onClick={() => setForm({ kind: 'edit', r })}>Edit</button>
            <button className="btn sm ghost" onClick={async () => setHist(await get(`/admin/sellers/${r.user_id}/transfers`))}>History</button>
          </div>
        ) },
      ]} />
      <FormModal open={form?.kind === 'new'} onClose={() => setForm(null)} title="Add coin seller"
        fields={[{ name: 'uid', label: 'Seller app ID (they must have an app account)' }, { name: 'password', label: 'Seller panel password', type: 'password' }, { name: 'daily_limit', label: 'Daily transfer limit (coins)', type: 'number' }, { name: 'discount_pct', label: 'Wholesale discount %', type: 'number' }]}
        initial={{ daily_limit: 1000000, discount_pct: 10 }} onSubmit={async (v) => { await act(() => post('/admin/sellers', v), 'Seller added'); setForm(null); reload(); }} />
      <FormModal open={form?.kind === 'topup'} onClose={() => setForm(null)} title={`Issue coins to ${form?.r?.name}`} submitLabel="Issue"
        fields={[{ name: 'coins', label: 'Coins (negative to take back)', type: 'number' }, { name: 'amount_paid', label: 'Amount they paid you' }, { name: 'note', label: 'Payment reference / note' }]}
        onSubmit={async (v) => { await act(() => post(`/admin/sellers/${form.r.user_id}/topup`, { ...v, coins: Number(v.coins) }), 'Coins issued'); setForm(null); reload(); }} />
      <FormModal open={form?.kind === 'edit'} onClose={() => setForm(null)} title="Edit seller"
        fields={[{ name: 'status', label: 'Status', type: 'select', options: ['active', 'suspended'] }, { name: 'daily_limit', label: 'Daily limit', type: 'number' }, { name: 'discount_pct', label: 'Discount %', type: 'number' }, { name: 'password', label: 'New password (optional)', type: 'password' }]}
        initial={form?.r ? { status: form.r.status, daily_limit: form.r.daily_limit, discount_pct: form.r.discount_pct } : {}}
        onSubmit={async (v) => { await act(() => put(`/admin/sellers/${form.r.user_id}`, v), 'Saved'); setForm(null); reload(); }} />
      {hist && (
        <div className="card mt">
          <div className="row"><h3 className="grow">Transfer history</h3><button className="btn sm" onClick={() => setHist(null)}>Close</button></div>
          <Table rows={hist} columns={[{ label: 'When', render: (r) => dt(r.created_at) }, { key: 'kind', label: 'Kind' }, { label: 'To', render: (r) => (r.uid ? `${r.name} (${r.uid})` : '—') }, { label: 'Coins', right: true, render: (r) => num(r.coins) }, { key: 'note', label: 'Note' }]} />
        </div>
      )}
    </>
  );
}

// ======================= LEDGER & P&L =======================
export function Ledger() {
  const [uid, setUid] = useState('');
  const [type, setType] = useState('');
  const [currency, setCurrency] = useState('');
  const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams({ uid, type, currency, offset, limit: 100 }).toString();
  const { data, loading } = useLoad(`/admin/ledger?${qs}`, [qs]);
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  const [to, setTo] = useState(today);
  const { data: sum } = useLoad(`/admin/finance/summary?from=${from}&to=${to}`, [from, to]);
  return (
    <>
      <div className="head"><h1>Ledger & P&L</h1>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} /> <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
      </div>
      {sum && (
        <>
          <div className="grid g4">
            <Stat kind="money" label="Revenue (paid orders)" value={money(sum.revenue.reduce((a, r) => a + Number(r.amount), 0), sum.currency)} sub={sum.revenue.map((r) => `${r.gateway}: ${money(r.amount)}`).join(' · ')} />
            <Stat label="Coins held by users (liability)" value={num(sum.liability.coins)} sub={`+ ${num(sum.liability.seller_coins)} with sellers`} />
            <Stat label="Diamonds held (salary liability)" value={num(sum.liability.diamonds)} sub={`≈ ${money(sum.liability.diamonds_value, sum.currency)}`} />
            <Stat label="Salaries & commissions" value={money([...sum.salaries, ...sum.commissions].reduce((a, r) => a + Number(r.amount), 0), sum.currency)} sub={sum.salaries.map((s) => `${s.status}: ${money(s.amount)}`).join(' · ')} />
          </div>
          <div className="card mt">
            <h3>Coin & diamond movements by type</h3>
            <Table rows={sum.by_type} columns={[{ key: 'currency', label: '' }, { key: 'type', label: 'Type' }, { label: 'Entries', right: true, render: (r) => num(r.n) }, { label: 'Net amount', right: true, render: (r) => <b style={{ color: r.amount > 0 ? 'var(--teal)' : 'var(--red)' }}>{num(r.amount)}</b> }]} />
          </div>
        </>
      )}
      <h2 style={{ margin: '24px 0 10px' }}>All ledger entries</h2>
      <div className="filters">
        <input placeholder="User ID" value={uid} onChange={(e) => setUid(e.target.value)} />
        <input placeholder="Type (gift_send, recharge…)" value={type} onChange={(e) => setType(e.target.value)} />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="">Coins & diamonds</option><option value="coin">Coins</option><option value="diamond">Diamonds</option></select>
        <button className="btn" onClick={() => downloadCsv(`/admin/ledger?${qs}&format=csv&limit=1000`, 'ledger')}>CSV</button>
      </div>
      <Table loading={loading} rows={data} columns={[
        { key: 'id', label: '#' }, { label: 'When', render: (r) => <span className="small">{dt(r.created_at)}</span> }, { label: 'User', render: (r) => `${r.name} (${r.uid})` },
        { key: 'currency', label: '' }, { key: 'type', label: 'Type' }, { label: 'Amount', right: true, render: (r) => <b style={{ color: r.amount > 0 ? 'var(--teal)' : 'var(--red)' }}>{num(r.amount)}</b> },
        { label: 'Balance', right: true, render: (r) => num(r.balance_after) }, { key: 'note', label: 'Note' },
      ]} />
      <Pager offset={offset} limit={100} count={data?.length || 0} onChange={setOffset} />
    </>
  );
}

// ======================= ANALYTICS =======================
export function Analytics() {
  const [days, setDays] = useState(30);
  const { data } = useLoad(`/admin/analytics?days=${days}`, [days]);
  if (!data) return <p className="muted">Loading…</p>;
  const f = data.funnel;
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  return (
    <>
      <div className="head"><h1>Analytics</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 140 }}><option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option></select>
      </div>
      <div className="grid g2">
        <div className="card"><h3>Revenue</h3><Bars data={data.daily.map((d) => ({ label: day(d.day), value: d.revenue }))} color="var(--marigold)" format={(v) => money(v)} /></div>
        <div className="card"><h3>New users</h3><Bars data={data.daily.map((d) => ({ label: day(d.day), value: d.new_users }))} color="var(--teal)" /></div>
        <div className="card"><h3>Daily active users</h3><Bars data={data.daily.map((d) => ({ label: day(d.day), value: d.dau }))} /></div>
        <div className="card"><h3>Live hours</h3><Bars data={data.daily.map((d) => ({ label: day(d.day), value: d.live_hours }))} color="#d63a72" /></div>
      </div>
      <div className="card mt">
        <h3>Funnel · users who joined in the last {days} days</h3>
        <div className="grid g4">
          <Stat label="Registered" value={num(f.registered)} />
          <Stat label="Came back another day" value={num(f.returned)} sub={pct(f.returned, f.registered)} />
          <Stat label="Sent a gift" value={num(f.gifted)} sub={pct(f.gifted, f.registered)} />
          <Stat label="Recharged" kind="money" value={num(f.paid)} sub={pct(f.paid, f.registered)} />
        </div>
      </div>
      <div className="grid g2 mt">
        <div className="card"><h3>Retention by signup week</h3>
          <Table rows={data.retention} columns={[{ label: 'Week of', render: (r) => day(r.cohort) }, { label: 'Users', right: true, render: (r) => num(r.users) }, { label: 'Day 1', right: true, render: (r) => `${r.d1}%` }, { label: 'Day 7', right: true, render: (r) => `${r.d7}%` }, { label: 'Day 30', right: true, render: (r) => `${r.d30}%` }]} />
        </div>
        <div className="card"><h3>Gift sales</h3>
          <Table rows={data.gift_sales} columns={[{ label: 'Gift', render: (r) => `${r.icon} ${r.name}` }, { label: 'Sold', right: true, render: (r) => num(r.qty) }, { label: 'Coins', right: true, render: (r) => num(r.coins) }]} />
        </div>
        <div className="card"><h3>Countries</h3>
          <Table rows={data.countries} columns={[{ key: 'country', label: 'Country' }, { label: 'Users', right: true, render: (r) => num(r.users) }, { label: 'Revenue', right: true, render: (r) => money(r.revenue) }]} />
        </div>
        <div className="card"><h3>Top hosts</h3>
          <Table rows={data.hosts} columns={[{ label: 'Host', render: (r) => `${r.name} (${r.uid})` }, { label: 'Hours', right: true, render: (r) => r.hours }, { label: 'Diamonds', right: true, render: (r) => num(r.diamonds) }]} />
        </div>
      </div>
    </>
  );
}

export { UserCell };
