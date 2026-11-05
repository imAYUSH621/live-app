import cron from 'node-cron';
import { q, tx } from './db.js';
import { redis } from './redis.js';
import { callTicker } from './services/calls.js';
import { endRoom, recoverPkTimers } from './services/live.js';
import { runRiskScan } from './services/risk.js';
import { changeCoins } from './lib/wallet.js';
import { toRoom } from './lib/io.js';

let running = {};
const guard = (name, fn) => async () => {
  if (running[name]) return;
  running[name] = true;
  try { await fn(); } catch (e) { console.error(`[job:${name}]`, e.message); } finally { running[name] = false; }
};

export async function startJobs() {
  // Fresh boot: every client reconnects, so presence is rebuilt from scratch.
  await redis.del('online', 'sockets');
  await recoverPkTimers();

  setInterval(guard('calls', callTicker), 5000);

  // End lives whose host app stopped sending heartbeats (app killed, phone died)
  cron.schedule('* * * * *', guard('stale-lives', async () => {
    const rooms = await q(`SELECT id FROM rooms WHERE status='live' AND started_at < now() - interval '2 minutes' AND id NOT IN (101, 102)`);
    for (const r of rooms) {
      if (!(await redis.exists(`hb:room:${r.id}`))) await endRoom(r.id, 'host_left');
    }
  }));

  // Refund unclaimed lucky-bag coins
  cron.schedule('* * * * *', guard('red-packets', async () => {
    const rows = await q(`SELECT * FROM red_packets WHERE NOT refunded AND expires_at < now()`);
    for (const p of rows) {
      await tx(async (c) => {
        const u = await c.one('UPDATE red_packets SET refunded=true WHERE id=$1 AND NOT refunded RETURNING remaining_coins', [p.id]);
        if (u && u.remaining_coins > 0) await changeCoins(c, p.sender_id, u.remaining_coins, 'red_packet_refund', { refType: 'red_packet', refId: p.id });
      });
      toRoom(p.room_id, 'room:redpacket:end', { id: p.id });
    }
  }));

  cron.schedule('17 * * * *', guard('risk', runRiskScan));

  // Daily housekeeping + metrics snapshot (00:05 server time)
  cron.schedule('5 0 * * *', guard('daily', async () => {
    await q(`DELETE FROM otp_codes WHERE expires_at < now()`);
    await q(`UPDATE users SET vip_level=0 WHERE vip_level>0 AND vip_expires < now()`);
    await q(`UPDATE users SET noble_rank=0 WHERE noble_rank>0 AND noble_expires < now()`);
    await q(`UPDATE users SET status='active', ban_until=NULL WHERE status='banned' AND ban_until IS NOT NULL AND ban_until < now()`);
    await q(`UPDATE user_items SET equipped=false WHERE equipped AND expires_at < now()`);
    await q(`UPDATE hosts SET host_tags = array_remove(host_tags,'new') WHERE 'new' = ANY(host_tags) AND approved_at < now() - interval '30 days'`);
    await q(`INSERT INTO daily_metrics(day, new_users, dau, recharge_amount, paying_users, coins_consumed, diamonds_issued, live_sessions, live_hours)
      SELECT d, (SELECT count(*) FROM users WHERE created_at::date=d), (SELECT count(*) FROM user_active_days WHERE day=d),
        (SELECT coalesce(sum(amount),0) FROM recharge_orders WHERE status='paid' AND paid_at::date=d),
        (SELECT count(DISTINCT user_id) FROM recharge_orders WHERE status='paid' AND paid_at::date=d),
        (SELECT coalesce(sum(-amount),0) FROM ledger WHERE currency='coin' AND amount<0 AND created_at::date=d),
        (SELECT coalesce(sum(amount),0) FROM ledger WHERE currency='diamond' AND amount>0 AND created_at::date=d),
        (SELECT count(*) FROM rooms WHERE started_at::date=d),
        (SELECT coalesce(sum(live_seconds)/3600.0,0) FROM host_daily_stats WHERE day=d)
      FROM (SELECT CURRENT_DATE - 1 AS d) x
      ON CONFLICT (day) DO NOTHING`);
  }));
}
