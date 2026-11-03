import { q } from '../db.js';
import { cached } from '../redis.js';
import { miniProfile } from './profile.js';

function since(period) {
  if (period === 'daily') return `date_trunc('day', now())`;
  if (period === 'weekly') return `date_trunc('week', now())`;
  if (period === 'monthly') return `date_trunc('month', now())`;
  return `'1970-01-01'::timestamptz`;
}

/**
 * type: rich (top gifters) | charm (top receiving hosts) | family | pk (most PK wins)
 * period: daily | weekly | monthly | all
 */
export async function ranking(type = 'rich', period = 'daily', country = null, limit = 50) {
  const key = `rank:${type}:${period}:${country || 'all'}:${limit}`;
  return cached(key, 60, async () => {
    const params = [limit];
    const cf = country ? (params.push(country), `AND u.country = $${params.length}`) : '';
    let rows;
    if (type === 'rich') {
      rows = await q(`SELECT t.sender_id AS id, sum(t.coins)::bigint AS score FROM gift_transactions t JOIN users u ON u.id=t.sender_id
        WHERE t.created_at >= ${since(period)} AND u.status='active' AND NOT ('test' = ANY(u.tags)) ${cf}
        GROUP BY t.sender_id ORDER BY score DESC LIMIT $1`, params);
    } else if (type === 'charm') {
      rows = await q(`SELECT t.receiver_id AS id, sum(t.diamonds)::bigint AS score FROM gift_transactions t JOIN users u ON u.id=t.receiver_id
        WHERE t.created_at >= ${since(period)} AND u.status='active' AND NOT ('test' = ANY(u.tags)) ${cf}
        GROUP BY t.receiver_id ORDER BY score DESC LIMIT $1`, params);
    } else if (type === 'pk') {
      rows = await q(`SELECT s.host_id AS id, sum(s.pk_wins)::bigint AS score FROM host_daily_stats s JOIN users u ON u.id=s.host_id
        WHERE s.day >= (${since(period)})::date ${cf} GROUP BY s.host_id HAVING sum(s.pk_wins) > 0 ORDER BY score DESC LIMIT $1`, params);
    } else if (type === 'family') {
      const fam = await q(`SELECT f.id, f.name, f.badge, f.level, coalesce(sum(t.coins),0)::bigint AS score
        FROM families f JOIN users u ON u.family_id=f.id JOIN gift_transactions t ON t.sender_id=u.id AND t.created_at >= ${since(period)}
        WHERE f.status='active' GROUP BY f.id ORDER BY score DESC LIMIT $1`, [limit]);
      return fam.map((f, i) => ({ rank: i + 1, family: f, score: f.score }));
    } else {
      return [];
    }
    const out = [];
    for (let i = 0; i < rows.length; i++) out.push({ rank: i + 1, user: await miniProfile(rows[i].id), score: rows[i].score });
    return out;
  });
}

/** Leaderboard for an event (gift_collect = hosts receiving the event gift, gift_send = senders, recharge = recharge amount). */
export async function eventBoard(ev, limit = 50) {
  let rows = [];
  if (ev.type === 'gift_collect') {
    rows = await q(`SELECT receiver_id AS id, sum(qty)::bigint AS score FROM gift_transactions
      WHERE created_at BETWEEN $1 AND $2 ${ev.gift_id ? 'AND gift_id=$4' : ''} GROUP BY receiver_id ORDER BY score DESC LIMIT $3`,
      ev.gift_id ? [ev.starts_at, ev.ends_at, limit, ev.gift_id] : [ev.starts_at, ev.ends_at, limit]);
  } else if (ev.type === 'gift_send') {
    rows = await q(`SELECT sender_id AS id, sum(${ev.gift_id ? 'qty' : 'coins'})::bigint AS score FROM gift_transactions
      WHERE created_at BETWEEN $1 AND $2 ${ev.gift_id ? 'AND gift_id=$4' : ''} GROUP BY sender_id ORDER BY score DESC LIMIT $3`,
      ev.gift_id ? [ev.starts_at, ev.ends_at, limit, ev.gift_id] : [ev.starts_at, ev.ends_at, limit]);
  } else if (ev.type === 'recharge') {
    rows = await q(`SELECT user_id AS id, sum(amount)::numeric AS score FROM recharge_orders WHERE status='paid' AND paid_at BETWEEN $1 AND $2
      GROUP BY user_id ORDER BY score DESC LIMIT $3`, [ev.starts_at, ev.ends_at, limit]);
  } else if (ev.type === 'pk') {
    rows = await q(`SELECT winner AS id, count(*)::bigint AS score FROM pk_battles WHERE winner IS NOT NULL AND started_at BETWEEN $1 AND $2
      GROUP BY winner ORDER BY score DESC LIMIT $3`, [ev.starts_at, ev.ends_at, limit]);
  } else if (ev.type === 'live_hours') {
    rows = await q(`SELECT host_id AS id, round(sum(live_seconds)/3600.0, 1) AS score FROM host_daily_stats WHERE day BETWEEN $1::date AND $2::date
      GROUP BY host_id ORDER BY score DESC LIMIT $3`, [ev.starts_at, ev.ends_at, limit]);
  }
  const out = [];
  for (let i = 0; i < rows.length; i++) out.push({ rank: i + 1, user: await miniProfile(rows[i].id), score: Number(rows[i].score) });
  return out;
}
