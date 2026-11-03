import { one, q } from '../db.js';
import { redis } from '../redis.js';
import { withLevels } from '../lib/levels.js';

/**
 * Small profile used everywhere in realtime (chat lines, entry effects, seats, viewer list).
 * Cached 60s in Redis; call invalidateProfile(userId) after changes.
 */
export async function miniProfile(userId) {
  const key = `mp:${userId}`;
  const hit = await redis.get(key);
  if (hit) return JSON.parse(hit);
  const u = await one(
    `SELECT u.id, u.uid, u.fancy_id, u.name, u.avatar_url, u.gender, u.country, u.vip_level, u.vip_expires,
            u.noble_rank, u.noble_expires, u.is_host, u.total_spent, u.total_earned, u.family_id,
            f.name AS family_name, f.badge AS family_badge
     FROM users u LEFT JOIN families f ON f.id = u.family_id WHERE u.id=$1`,
    [userId],
  );
  if (!u) return null;
  withLevels(u);
  const items = await q(
    `SELECT s.type, s.name, s.preview, s.anim_url FROM user_items ui JOIN store_items s ON s.id=ui.item_id
     WHERE ui.user_id=$1 AND ui.equipped AND (ui.expires_at IS NULL OR ui.expires_at > now())`,
    [userId],
  );
  const eq = {};
  for (const it of items) eq[it.type] = { name: it.name, preview: it.preview, anim_url: it.anim_url };
  const p = {
    id: u.id, uid: u.fancy_id || u.uid, name: u.name, avatar_url: u.avatar_url, gender: u.gender,
    country: u.country, level: u.level, charm_level: u.charm_level, vip: u.vip_level, noble: u.noble_rank,
    is_host: u.is_host, family: u.family_id ? { id: u.family_id, name: u.family_name, badge: u.family_badge } : null,
    frame: eq.frame || null, mount: eq.mount || null, bubble: eq.bubble || null, entry: eq.entry || null, badge: eq.badge || null,
  };
  await redis.set(key, JSON.stringify(p), 'EX', 60);
  return p;
}

export const invalidateProfile = (userId) => redis.del(`mp:${userId}`);

export async function miniProfiles(ids) {
  const out = [];
  for (const id of ids) {
    const p = await miniProfile(id);
    if (p) out.push(p);
  }
  return out;
}
