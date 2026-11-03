import { one, q, tx } from '../db.js';
import { getSettings } from '../lib/settings.js';
import { changeDiamonds } from '../lib/wallet.js';
import { monthRange } from '../lib/util.js';

/** Month stats for one host: hours, valid days, diamonds, level reached and estimated salary. */
export async function hostMonth(hostId, month) {
  const s = await getSettings();
  const { start, end } = monthRange(month);
  const st = await one(
    `SELECT coalesce(sum(live_seconds),0)::bigint AS live_s, coalesce(sum(game_seconds),0)::bigint AS game_s,
            coalesce(sum(diamonds),0)::bigint AS diamonds, coalesce(sum(reward_diamonds),0)::bigint AS reward_diamonds,
            coalesce(sum(call_seconds),0)::bigint AS call_s, coalesce(sum(pk_wins),0)::int AS pk_wins,
            count(*) FILTER (WHERE live_seconds + game_seconds >= $4 * 60)::int AS valid_days
     FROM host_daily_stats WHERE host_id=$1 AND day >= $2 AND day < $3`, [hostId, start, end, s.host.valid_day_minutes]);
  const liveHours = Math.round(((st.live_s + st.game_s) / 3600) * 100) / 100;
  const gameHours = Math.round((st.game_s / 3600) * 100) / 100;
  const levels = await q('SELECT * FROM host_levels ORDER BY min_diamonds DESC');
  const targetMet = liveHours >= s.host.target_hours && st.valid_days >= s.host.target_days && gameHours >= (s.host.target_game_hours || 0);
  let level = levels.find((l) => st.diamonds >= l.min_diamonds && liveHours >= l.min_hours && st.valid_days >= l.min_days) || null;
  const base = Math.floor((st.diamonds / s.economy.diamonds_per_unit) * 100) / 100;
  const bonus = targetMet && level ? Number(level.bonus_amount) : 0;
  let total = base + bonus;
  if (s.host.require_target_for_salary && !targetMet) total = 0;
  return {
    month, diamonds: st.diamonds, reward_diamonds: st.reward_diamonds, live_hours: liveHours, game_hours: gameHours,
    call_minutes: Math.round(st.call_s / 60), pk_wins: st.pk_wins, valid_days: st.valid_days,
    target: { hours: s.host.target_hours, days: s.host.target_days, game_hours: s.host.target_game_hours || 0, met: targetMet },
    level: level ? { code: level.code, name: level.name, bonus: Number(level.bonus_amount) } : null,
    next_level: levels.filter((l) => !level || l.min_diamonds > level.min_diamonds).sort((a, b) => a.min_diamonds - b.min_diamonds)[0] || null,
    base, bonus, total: Math.round(total * 100) / 100, currency: s.economy.currency,
    require_target: s.host.require_target_for_salary,
  };
}

/** Create/refresh draft settlements for all hosts with income in a month. Re-runnable while status=draft. */
export async function runSettlement(month) {
  const { start, end } = monthRange(month);
  const hosts = await q(
    `SELECT DISTINCT s.host_id, h.agency_id, u.diamonds AS balance FROM host_daily_stats s
     JOIN hosts h ON h.user_id=s.host_id JOIN users u ON u.id=s.host_id
     WHERE s.day >= $1 AND s.day < $2 AND h.status='approved'`, [start, end]);
  let created = 0;
  for (const h of hosts) {
    const m = await hostMonth(h.host_id, month);
    if (m.diamonds <= 0 && m.live_hours <= 0) continue;
    // Can't pay out more diamonds than the host still holds (exchanged-to-coins diamonds are gone)
    const s = await getSettings();
    const payable = Math.min(m.diamonds, h.balance);
    const deduction = Math.round(((m.diamonds - payable) / s.economy.diamonds_per_unit) * 100) / 100;
    const total = Math.max(0, Math.round((m.total - deduction) * 100) / 100);
    const row = await one(
      `INSERT INTO host_settlements(month, host_id, agency_id, diamonds, live_hours, valid_days, level, target_met, base_amount, bonus, deduction, total, currency, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (month, host_id) DO UPDATE SET agency_id=$3, diamonds=$4, live_hours=$5, valid_days=$6, level=$7, target_met=$8,
         base_amount=$9, bonus=$10, deduction=$11, total=$12, note=$14
       WHERE host_settlements.status='draft' RETURNING id`,
      [month, h.host_id, h.agency_id, payable, m.live_hours, m.valid_days, m.level?.code || null, m.target.met, m.base, m.bonus, deduction, total, m.currency,
       !m.target.met && m.require_target ? 'Target not met' : null]);
    if (row) created++;
  }
  await runAgencyCommissions(month);
  return { hosts: hosts.length, settlements: created };
}

export async function runAgencyCommissions(month) {
  const ags = await q(
    `SELECT a.id, a.commission_pct, a.parent_id, a.override_pct, coalesce(sum(s.total),0)::numeric AS host_income, count(s.id)::int AS n
     FROM agencies a JOIN host_settlements s ON s.agency_id=a.id AND s.month=$1 AND s.status <> 'rejected'
     GROUP BY a.id`, [month]);
  const overrides = {};
  for (const a of ags) {
    if (a.parent_id) overrides[a.parent_id] = (overrides[a.parent_id] || 0) + (Number(a.host_income) * Number(a.override_pct)) / 100;
  }
  for (const a of ags) {
    const commission = Math.round(Number(a.host_income) * Number(a.commission_pct)) / 100;
    const ov = Math.round((overrides[a.id] || 0) * 100) / 100;
    await q(
      `INSERT INTO agency_commissions(month, agency_id, host_income, pct, commission, override_income, total, hosts_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (month, agency_id) DO UPDATE SET host_income=$3, pct=$4, commission=$5, override_income=$6, total=$7, hosts_count=$8
       WHERE agency_commissions.status='draft'`,
      [month, a.id, a.host_income, a.commission_pct, commission, ov, commission + ov, a.n]);
    delete overrides[a.id];
  }
  // parents whose own hosts earned nothing still get their override
  for (const [pid, ov] of Object.entries(overrides)) {
    await q(
      `INSERT INTO agency_commissions(month, agency_id, override_income, total) VALUES ($1,$2,$3,$3)
       ON CONFLICT (month, agency_id) DO UPDATE SET override_income=$3, total=agency_commissions.commission+$3 WHERE agency_commissions.status='draft'`,
      [month, Number(pid), Math.round(ov * 100) / 100]);
  }
}

/** Approve a settlement: diamonds leave the host balance now (they become cash). */
export async function approveSettlement(id, adminId) {
  return tx(async (c) => {
    const st = await c.one(`SELECT * FROM host_settlements WHERE id=$1 AND status IN ('draft','agency_ok') FOR UPDATE`, [id]);
    if (!st) return null;
    if (st.diamonds > 0) await changeDiamonds(c, st.host_id, -st.diamonds, 'settlement', { refType: 'settlement', refId: st.id, note: st.month });
    return c.one(`UPDATE host_settlements SET status='approved', approved_by=$2 WHERE id=$1 RETURNING *`, [id, adminId]);
  });
}
