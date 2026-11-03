// User wealth level from coins spent; host charm level from diamonds earned.
// Level n needs base * n^2. Max 100.
export function levelFrom(total, base) {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.floor(Math.sqrt(total / base)));
}

export const userLevel = (spent) => levelFrom(spent, 100);
export const charmLevel = (earned) => levelFrom(earned, 200);

export function levelProgress(total, base) {
  const lvl = levelFrom(total, base);
  const cur = base * lvl * lvl;
  const next = base * (lvl + 1) * (lvl + 1);
  return { level: lvl, current: total, levelStart: cur, nextAt: next, pct: Math.round(((total - cur) / (next - cur)) * 100) };
}

/** Attach computed levels to a user row (mutates and returns). */
export function withLevels(u) {
  if (!u) return u;
  u.level = userLevel(u.total_spent || 0);
  u.charm_level = charmLevel(u.total_earned || 0);
  if (u.vip_expires && new Date(u.vip_expires) < new Date()) u.vip_level = 0;
  if (u.noble_expires && new Date(u.noble_expires) < new Date()) u.noble_rank = 0;
  return u;
}
