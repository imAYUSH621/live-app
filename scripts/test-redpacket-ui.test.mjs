// Red packet (lucky bag) web UI: room rail button gated on the feature flag,
// send + grab flows wired to the server routes, i18n keys in all languages.
// Run: node scripts/test-redpacket-ui.test.mjs
import { readFileSync } from 'node:fs';
let failures = 0;
function check(name, cond) { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) failures++; }

const room = readFileSync(new URL('../web/src/live/Room.jsx', import.meta.url), 'utf8');
check('room listens for room:redpacket broadcasts', room.includes("'room:redpacket': (p) => setBag(p)"));
check('rail button is gated on the red_packet feature flag', room.includes("config?.features?.red_packet && <span className=\"ra-item\"><button className=\"round-btn bag\""));
check('drop posts to the room redpacket route', room.includes("api(`/live/${id}/redpacket`, { method: 'POST', body: { coins, parts } })"));
check('grab posts to the redpacket grab route', room.includes("api(`/redpacket/${bag.id}/grab`, { method: 'POST' })"));
check('grab button waits for opens_at', room.includes("bagNow >= Date.parse(bag.opens_at)"));
check('bag card dismisses at expiry', room.includes("Date.parse(bag.expires_at) <= Date.now()"));
check('send form enforces min coins and max parts from config', room.includes('cfg.min_coins') && room.includes('cfg.max_parts'));

const i18n = readFileSync(new URL('../web/src/i18n.js', import.meta.url), 'utf8');
for (const key of ['luckyBag', 'bagCoins', 'bagParts', 'bagDrop', 'bagGrab', 'bagSent']) {
  check(`i18n key ${key} in en+hi+ar`, (i18n.match(new RegExp(key + ':', 'g')) || []).length === 3);
}

const live = readFileSync(new URL('../server/src/routes/live.js', import.meta.url), 'utf8');
const services = readFileSync(new URL('../server/src/services/live.js', import.meta.url), 'utf8');
check('server broadcast room:redpacket on drop', live.includes("toRoom(room.id, 'room:redpacket'"));
check('server grab is one-per-user', live.includes('You already grabbed this one'));
check('server grab fails closed when exhausted', live.includes('All gone!'));

// Spend-confirmation and terms (parent acceptance criteria)
check('send form shows delay/expiry/refund terms', room.includes("t('bagTerms', { delay, expire })"));
check('drop requires an explicit confirm step', room.includes('if (!confirming) { setConfirming(true); return; }'));
check('double submit is guarded while sending', room.includes('if (!ok || sending) return') && room.includes('disabled={!ok || sending}'));
check('editing amounts resets the confirm step', room.includes('setConfirming(false); }}'));
check('server enforces min coins and parts bounds', live.includes('Minimum') && live.includes('Parts must be 1-'));
check('server refund claims each packet atomically once', services.includes('SET refunded=true WHERE id=$1 AND NOT refunded RETURNING'));
for (const key of ['bagTerms', 'bagConfirm', 'bagConfirmBtn']) {
  check(`i18n key ${key} in en+hi+ar`, (i18n.match(new RegExp(key + ':', 'g')) || []).length === 3);
}

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
