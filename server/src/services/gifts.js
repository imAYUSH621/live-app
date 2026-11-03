import { tx, one } from '../db.js';
import { redis } from '../redis.js';
import { changeCoins, changeDiamonds, addHostDiamondStat } from '../lib/wallet.js';
import { getSettings } from '../lib/settings.js';
import { bad, notFound, need } from '../lib/util.js';
import { toRoom, toUser, toAll } from '../lib/io.js';
import { miniProfile, invalidateProfile } from './profile.js';
import * as rs from './roomstate.js';
import { bumpTask } from './tasks.js';

function pickWeighted(table) {
  const total = table.reduce((s, r) => s + Number(r.weight), 0);
  let x = Math.random() * total;
  for (const r of table) {
    x -= Number(r.weight);
    if (x <= 0) return r;
  }
  return table[0];
}

/**
 * Send a gift. context: room | call | chat | moment
 * One DB transaction: debit sender coins -> credit receiver diamonds -> ledger -> stats.
 * Then realtime broadcast (gift animation, global banner, PK score).
 */
export async function sendGift({ senderId, receiverId, giftId, qty = 1, context = 'room', roomId = null, momentId = null, callId = null }) {
  qty = Math.max(1, Math.min(9999, parseInt(qty, 10) || 1));
  need(senderId !== receiverId, 'You cannot send a gift to yourself');
  const settings = await getSettings();
  const gift = await one('SELECT * FROM gifts WHERE id=$1 AND active', [giftId]);
  if (!gift) throw notFound('Gift not available');
  const now = new Date();
  if ((gift.starts_at && new Date(gift.starts_at) > now) || (gift.ends_at && new Date(gift.ends_at) < now)) throw bad('This gift is not available now');
  if (gift.category === 'lucky' && !settings.features.lucky_gift) throw bad('Lucky gifts are disabled');

  const sender = await one('SELECT id, vip_level, vip_expires, family_id, country FROM users WHERE id=$1', [senderId]);
  const vipActive = sender.vip_expires && new Date(sender.vip_expires) > now ? sender.vip_level : 0;
  if (gift.vip_level > vipActive) throw bad(`VIP ${gift.vip_level} required for this gift`);
  if (gift.countries?.length && !gift.countries.includes(sender.country)) throw bad('Gift not available in your country');
  const receiver = await one('SELECT id, is_host, status FROM users WHERE id=$1', [receiverId]);
  if (!receiver || receiver.status !== 'active') throw notFound('Receiver not found');

  let room = null;
  if (roomId) {
    room = await one('SELECT id, host_id, status FROM rooms WHERE id=$1', [roomId]);
    need(room && room.status === 'live', 'Live has ended');
  }

  const coins = gift.price * qty;
  let hostPct = Number(gift.host_pct);
  let luckyWin = 0;
  let luckyMult = 0;
  if (gift.category === 'lucky') {
    hostPct = Number(settings.lucky.host_pct);
    // each unit rolls separately (combo x10 = 10 rolls), capped by today's pool
    for (let i = 0; i < Math.min(qty, 99); i++) {
      const r = pickWeighted(settings.lucky.table);
      if (r.mult > 0) { luckyWin += gift.price * r.mult; luckyMult = Math.max(luckyMult, r.mult); }
    }
    if (luckyWin > 0) {
      const poolKey = `luckypool:${new Date().toISOString().slice(0, 10)}`;
      const used = await redis.incrby(poolKey, luckyWin);
      await redis.expire(poolKey, 172800);
      if (used > settings.lucky.daily_pool) { await redis.decrby(poolKey, luckyWin); luckyWin = 0; luckyMult = 0; }
    }
  }
  const diamonds = Math.floor((coins * hostPct) / 100);

  let pkId = room ? await rs.getPk(room.id) : null;

  const result = await tx(async (c) => {
    const balance = await changeCoins(c, senderId, -coins, 'gift_send', { refType: 'gift', refId: gift.id, note: `${gift.name} x${qty}` });
    await changeDiamonds(c, receiverId, diamonds, 'gift_receive', { refType: 'gift', refId: gift.id, note: `${gift.name} x${qty}` });
    if (receiver.is_host) await addHostDiamondStat(c, receiverId, diamonds);
    let finalBalance = balance;
    if (luckyWin > 0) finalBalance = await changeCoins(c, senderId, luckyWin, 'lucky_win', { refType: 'gift', refId: gift.id, note: `x${luckyMult}` });
    const t = await c.one(
      `INSERT INTO gift_transactions(sender_id, receiver_id, gift_id, qty, coins, diamonds, context, room_id, pk_id, lucky_win)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, created_at`,
      [senderId, receiverId, gift.id, qty, coins, diamonds, context, room?.id || null, pkId, luckyWin],
    );
    if (room) await c.q('UPDATE rooms SET diamonds = diamonds + $2 WHERE id=$1', [room.id, room.host_id === receiverId ? diamonds : 0]);
    if (momentId) await c.q('UPDATE moments SET gifts_coins = gifts_coins + $2 WHERE id=$1', [momentId, coins]);
    if (callId) await c.q('UPDATE calls SET diamonds = diamonds + $2 WHERE id=$1', [callId, diamonds]);
    if (sender.family_id) await c.q('UPDATE families SET exp = exp + $2, level = GREATEST(level, 1 + floor(sqrt((exp + $2) / 10000.0))::int) WHERE id=$1', [sender.family_id, coins]);
    // fan club intimacy grows with every coin spent on the host
    await c.q('UPDATE fan_clubs SET intimacy = intimacy + $3 WHERE host_id=$1 AND user_id=$2', [receiverId, senderId, coins]);
    if (context === 'chat') {
      await c.q(`INSERT INTO messages(from_id, to_id, kind, body, gift_id) VALUES ($1,$2,'gift',$3,$4)`, [senderId, receiverId, `${gift.name} x${qty}`, gift.id]);
    }
    return { txId: t.id, balance: finalBalance };
  });

  invalidateProfile(senderId);
  invalidateProfile(receiverId);
  bumpTask(senderId, 'send_gift', 1);

  const from = await miniProfile(senderId);
  const to = await miniProfile(receiverId);
  const payload = {
    id: result.txId, gift: { id: gift.id, name: gift.name, icon: gift.icon, anim_type: gift.anim_type, anim_url: gift.anim_url, price: gift.price, category: gift.category },
    qty, coins, from, to, lucky: luckyWin ? { win: luckyWin, mult: luckyMult } : null, room_id: room?.id || null,
  };

  if (room) {
    await rs.addContribution(room.id, senderId, coins);
    toRoom(room.id, 'room:gift', payload);
    if (pkId) await addPkScore(pkId, room.id, coins);
  }
  if (coins >= settings.economy.global_banner_coins) {
    toAll('global:banner', { kind: 'gift', ...payload });
  }
  toUser(receiverId, 'gift:received', payload);
  toUser(senderId, 'wallet:update', { coins: result.balance });
  return { ...payload, balance: result.balance };
}

export async function addPkScore(pkId, roomId, coins) {
  const pk = await one(`SELECT * FROM pk_battles WHERE id=$1 AND status='active'`, [pkId]);
  if (!pk) return;
  const col = Number(pk.room_a) === Number(roomId) ? 'score_a' : 'score_b';
  const upd = await one(`UPDATE pk_battles SET ${col} = ${col} + $2 WHERE id=$1 RETURNING id, score_a, score_b, room_a, room_b, ends_at, status`, [pkId, coins]);
  const ev = { pk_id: upd.id, score_a: upd.score_a, score_b: upd.score_b, room_a: upd.room_a, room_b: upd.room_b, ends_at: upd.ends_at };
  toRoom(upd.room_a, 'pk:score', ev);
  toRoom(upd.room_b, 'pk:score', ev);
}
