import { Link } from 'react-router-dom';
import { num, money, day } from '../lib/api.js';
import { useLoad, Stat, Bars, Table, UserCell } from '../ui.jsx';

export default function Dashboard() {
  const { data: d, reload } = useLoad('/admin/dashboard');
  if (!d) return <p className="muted">Loading…</p>;
  const c = d.currency;
  const a = d.alerts;
  const alertItems = [
    [a.flagged_lives, 'flagged lives', '/live?flagged=1'], [a.open_reports, 'open reports', '/reports'], [a.pending_hosts, 'host applications', '/hosts'],
    [a.pending_settlements, 'settlements to approve', '/settlement'], [a.stuck_orders, 'unpaid orders > 1h', '/orders'], [a.risk_flags, 'risk flags', '/risk'],
    [a.open_tickets, 'support tickets', '/support'], [a.pending_agencies, 'agencies to approve', '/agencies'],
  ].filter(([n]) => n > 0);
  return (
    <>
      <div className="head"><h1>Dashboard</h1><button className="btn" onClick={reload}>Refresh</button></div>
      <div className="grid g5">
        <Stat label="Live rooms now" value={num(d.realtime.live_rooms)} sub={d.realtime.flagged ? `${d.realtime.flagged} flagged` : null} kind={d.realtime.flagged ? 'alert' : ''} />
        <Stat label="Online users" value={num(d.realtime.online)} />
        <Stat label="PK battles" value={num(d.realtime.pk)} />
        <Stat label="Calls in progress" value={num(d.realtime.calls)} />
        <Stat label="MAU (30 days)" value={num(d.today.mau)} />
      </div>
      {alertItems.length > 0 && (
        <div className="card mt" style={{ borderColor: 'var(--marigold)', background: 'var(--marigold-soft)' }}>
          <b>Needs attention:</b>{' '}
          {alertItems.map(([n, l, to], i) => <span key={l}>{i > 0 && ' · '}<Link to={to}>{n} {l}</Link></span>)}
        </div>
      )}
      <h2 className="mt" style={{ margin: '20px 0 10px' }}>Today</h2>
      <div className="grid g5">
        <Stat kind="money" label="Revenue" value={money(d.today.revenue, c)} sub={`${d.today.payers} payers · ARPPU ${money(d.today.arppu, c)}`} />
        <Stat label="New users" value={num(d.today.new_users)} />
        <Stat label="Active users" value={num(d.today.dau)} />
        <Stat label="Coins spent on gifts" value={num(d.today.gift_coins)} sub={`${num(d.today.coins_consumed)} coins consumed total`} />
        <Stat label="Diamonds issued" value={num(d.today.diamonds_issued)} sub={`Seller top-ups: ${num(d.today.seller_coins)} coins`} />
      </div>
      <div className="grid g2 mt">
        <div className="card"><h3>Revenue · last 14 days</h3><Bars data={d.series.map((x) => ({ label: day(x.day), value: x.revenue }))} color="var(--marigold)" format={(v) => money(v, c)} /></div>
        <div className="card"><h3>Active users · last 14 days</h3><Bars data={d.series.map((x) => ({ label: day(x.day), value: x.dau }))} /></div>
      </div>
      <div className="grid g3 mt">
        <div className="card"><h3>Top gifters today</h3>
          <Table columns={[{ label: 'User', render: (r) => <UserCell u={r.user} /> }, { label: 'Coins', right: true, render: (r) => num(r.coins) }]} rows={d.top_gifters} empty="No gifts yet today" />
        </div>
        <div className="card"><h3>Top hosts today</h3>
          <Table columns={[{ label: 'Host', render: (r) => <UserCell u={r.user} /> }, { label: 'Diamonds', right: true, render: (r) => num(r.diamonds) }]} rows={d.top_hosts} empty="No income yet today" />
        </div>
        <div className="card"><h3>Top agencies today</h3>
          <Table columns={[{ label: 'Agency', render: (r) => `${r.name} (${r.code})` }, { label: 'Diamonds', right: true, render: (r) => num(r.diamonds) }]} rows={d.top_agencies} empty="No agency income yet" />
        </div>
      </div>
      <div className="grid g2 mt">
        <div className="card"><h3>Revenue by gateway · 30 days</h3>
          <Table columns={[{ key: 'gateway', label: 'Gateway' }, { label: 'Orders', right: true, render: (r) => num(r.orders) }, { label: 'Amount', right: true, render: (r) => money(r.amount, c) }]} rows={d.revenue_by_gateway} />
        </div>
        <div className="card"><h3>Revenue by country · 30 days</h3>
          <Table columns={[{ key: 'country', label: 'Country' }, { label: 'Amount', right: true, render: (r) => money(r.amount, c) }]} rows={d.revenue_by_country} />
        </div>
      </div>
    </>
  );
}
