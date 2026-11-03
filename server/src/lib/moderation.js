import { config } from '../config.js';
import { getSetting } from './settings.js';
import { q } from '../db.js';

/** Replace banned words with *** (case-insensitive). Returns { text, hit }. */
export async function filterText(text) {
  const m = await getSetting('moderation');
  let hit = false;
  let out = String(text || '');
  for (const w of m.banned_words || []) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    if (re.test(out)) {
      hit = true;
      out = out.replace(re, '*'.repeat(Math.min(w.length, 6)));
    }
  }
  // phone numbers (stop hosts/users moving deals off-platform)
  out = out.replace(/(\+?\d[\d\s-]{8,}\d)/g, (s) => { hit = true; return '*'.repeat(6); });
  return { text: out, hit };
}

/**
 * Optional AI check on a live thumbnail using Sightengine (set SIGHTENGINE_USER/SECRET).
 * Returns { flagged, reason }. Without keys it returns not flagged.
 */
export async function checkImage(absPath) {
  const { user, secret } = config.sightengine;
  if (!user || !secret) return { flagged: false, reason: null };
  try {
    const fs = await import('node:fs');
    const form = new FormData();
    form.append('media', new Blob([fs.readFileSync(absPath)]), 'frame.jpg');
    form.append('models', 'nudity-2.1,weapon,offensive');
    form.append('api_user', user);
    form.append('api_secret', secret);
    const r = await fetch('https://api.sightengine.com/1.0/check.json', { method: 'POST', body: form });
    const j = await r.json();
    const n = j.nudity || {};
    const nude = Math.max(n.sexual_activity || 0, n.sexual_display || 0, n.erotica || 0);
    if (nude > 0.6) return { flagged: true, reason: 'nudity' };
    if ((j.weapon?.classes?.firearm || 0) > 0.8) return { flagged: true, reason: 'weapon' };
    return { flagged: false, reason: null };
  } catch (e) {
    console.warn('[moderation] check failed', e.message);
    return { flagged: false, reason: null };
  }
}

export async function autoReport(targetType, targetId, reason, details) {
  await q(
    `INSERT INTO reports(reporter_id, target_type, target_id, reason, details) VALUES (NULL,$1,$2,$3,$4)`,
    [targetType, String(targetId), reason, details || 'Auto-flagged by system'],
  );
}
