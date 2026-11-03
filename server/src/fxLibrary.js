// Premium animation library (server/assets/fx): 40 SVGA gifts, 10 SVGA entry/mount effects,
// 20 small gifts with 3D icons. Synced into the database once per library version, so existing
// installs get it on update and admins can still edit or disable any item afterwards.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, one } from './db.js';

export const FX_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fx');
const VERSION = 'fx-2026-11-v2';

export async function syncFxLibrary() {
  const file = path.join(FX_DIR, 'manifest.json');
  if (!fs.existsSync(file)) return;
  const done = await one(`SELECT value FROM settings WHERE key='fx_library'`).catch(() => null);
  if (done?.value?.version === VERSION) return;
  const m = JSON.parse(fs.readFileSync(file, 'utf8'));
  const icon = (f) => `/fx/icons/${f}`;
  let sort = 0;
  const upsertGift = async (name, iconUrl, animType, animUrl, price, category) => {
    const ex = await one('SELECT id FROM gifts WHERE lower(name)=lower($1) ORDER BY id LIMIT 1', [name]);
    if (ex) await q('UPDATE gifts SET icon=$2, anim_type=$3, anim_url=$4, sort=$5 WHERE id=$1', [ex.id, iconUrl, animType, animUrl, sort++]);
    else await q(`INSERT INTO gifts(name, icon, anim_type, anim_url, price, host_pct, category, sort) VALUES ($1,$2,$3,$4,$5,60,$6,$7)`, [name, iconUrl, animType, animUrl, price, category, sort++]);
  };
  for (const g of m.small) await upsertGift(g.name, icon(g.icon), 'css', 'css:pop', g.price, 'normal');
  for (const g of m.gifts) await upsertGift(g.name, icon(g.icon), 'svga', `/fx/svga/${g.svga}`, g.price, 'luxury');
  // old emoji catalogue: give the remaining lucky / vip / event gifts 3D icons too
  const extra = { 'Lucky Clover': 'lucky-clover', 'Lucky Star': 'lucky-star', 'VIP Crown': 'vip-crown', 'VIP Phoenix': 'vip-phoenix', Diya: 'diya' };
  for (const [n, f] of Object.entries(extra)) await q('UPDATE gifts SET icon=$2 WHERE name=$1', [n, icon(`${f}.webp`)]);
  // old emoji-only gifts that the library replaces under a new name
  await q(`UPDATE gifts SET active=false WHERE anim_type='css' AND icon NOT LIKE '/fx/%' AND category IN ('normal','luxury')`);
  // entry & mount effects for the store
  for (const [i, e] of m.entries.entries()) {
    const type = /arrival/i.test(e.name) ? 'entry' : 'mount';
    const ex = await one('SELECT id FROM store_items WHERE lower(name)=lower($1)', [e.name]);
    if (ex) await q('UPDATE store_items SET preview=$2, anim_url=$3 WHERE id=$1', [ex.id, icon(e.icon), `/fx/svga/${e.svga}`]);
    else await q(`INSERT INTO store_items(type, name, preview, anim_url, price, duration_days, vip_level, sort) VALUES ($1,$2,$3,$4,$5,7,0,$6)`, [type, e.name, icon(e.icon), `/fx/svga/${e.svga}`, e.price, 100 + i]);
  }
  await q(`UPDATE store_items SET active=false WHERE type='mount' AND anim_url IS NULL`);
  // luxe theme colours for the default promo banners
  await q(`UPDATE banners SET color = CASE WHEN position='home' AND sort=0 THEN '#8a6420' WHEN position='home' THEN '#5b2340' ELSE '#6b4a16' END WHERE color IN ('#7c3aed','#db2777')`);
  await q(`INSERT INTO settings(key, value) VALUES ('fx_library', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [JSON.stringify({ version: VERSION, at: new Date().toISOString() })]);
  console.log(`[fx] premium animation library synced (${m.gifts.length + m.entries.length} SVGA, ${m.small.length} small gifts)`);
}
