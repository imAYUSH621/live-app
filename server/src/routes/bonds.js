// CP (couple) and Fan club — relationship features like MIKA/Mico.
import { Router } from 'express';
import { one, q, tx } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { need, int, notFound, forbidden } from '../lib/util.js';
import { getSettings } from '../lib/settings.js';
import { changeCoins, changeDiamonds } from '../lib/wallet.js';
import { toUser } from '../lib/io.js';
import { miniProfile, miniProfiles, invalidateProfile } from '../services/profile.js';

const r = Router();
const auth = userAuth();

export const fanLevel = (intimacy) => 1 + Math.floor(Math.sqrt(Number(intimacy || 0) / 1000));

// ---------- CP ----------
r.post('/cp/propose', auth, async (req, res) => {
  const s = await getSettings();
  need(s.features.cp, 'CP is turned off');
  const to = int(req.body.user_id);
  need(to && to !== req.user.id, 'Choose someone else');
  const row = await tx(async (c) => {
    // Serialize proposals/acceptance touching these users before checking state.
    const both = await c.q('SELECT id, cp_user_id FROM users WHERE id = ANY($1) ORDER BY id FOR UPDATE', [[req.user.id, to]]);
    need(both.length === 2, 'User not found');
    need(both.every((u) => !u.cp_user_id), 'One of you already has a CP');
    need(!(await c.one(`SELECT 1 FROM cp_requests WHERE from_id=$1 AND to_id=$2 AND status='pending'`, [req.user.id, to])), 'Proposal already sent');
    await changeCoins(c, req.user.id, -s.economy.cp_coins, 'cp_propose', { refType: 'user', refId: to });
    return c.one('INSERT INTO cp_requests(from_id, to_id, coins) VALUES ($1,$2,$3) RETURNING *', [req.user.id, to, s.economy.cp_coins]);
  });
  toUser(to, 'cp:proposal', { request: row, from: await miniProfile(req.user.id) });
  res.json(row);
});

r.get('/cp/requests', auth, async (req, res) => {
  const rows = await q(`SELECT * FROM cp_requests WHERE to_id=$1 AND status='pending' ORDER BY id DESC`, [req.user.id]);
  const ps = await miniProfiles(rows.map((x) => x.from_id));
  res.json(rows.map((x) => ({ ...x, from: ps.find((p) => p.id === x.from_id) })));
});

r.post('/cp/requests/:id', auth, async (req, res) => {
  const rq = await tx(async (c) => {
    // A pending request can settle once. Hold its row lock through the refund
    // or pairing write so a racing retry cannot repeat either side effect.
    const rq = await c.one(`SELECT * FROM cp_requests WHERE id=$1 AND to_id=$2 AND status='pending' FOR UPDATE`, [int(req.params.id), req.user.id]);
    if (!rq) throw notFound('Proposal not found');
    if (req.body.accept) {
      await c.q('SELECT id FROM users WHERE id IN ($1,$2) ORDER BY id FOR UPDATE', [rq.from_id, rq.to_id]);
      const ok = await c.q(
        'UPDATE users SET cp_user_id = CASE WHEN id=$1 THEN $2 ELSE $1 END, cp_since=now() WHERE id IN ($1,$2) AND cp_user_id IS NULL RETURNING id',
        [rq.from_id, rq.to_id]);
      need(ok.length === 2, 'One of you already has a CP');
      await c.q(`UPDATE cp_requests SET status='accepted' WHERE id=$1`, [rq.id]);
    } else {
      await c.q(`UPDATE cp_requests SET status='rejected' WHERE id=$1`, [rq.id]);
      await changeCoins(c, rq.from_id, rq.coins, 'refund', { note: 'CP proposal declined' });
    }
    return rq;
  });
  if (req.body.accept) {
    invalidateProfile(rq.from_id);
    invalidateProfile(rq.to_id);
    toUser(rq.from_id, 'cp:accepted', { user: await miniProfile(req.user.id) });
  } else {
    toUser(rq.from_id, 'cp:declined', { user: await miniProfile(req.user.id) });
  }
  res.json({ ok: true });
});

r.delete('/cp', auth, async (req, res) => {
  const me = await one('SELECT cp_user_id FROM users WHERE id=$1', [req.user.id]);
  if (me?.cp_user_id) {
    await q('UPDATE users SET cp_user_id=NULL, cp_since=NULL WHERE id IN ($1,$2)', [req.user.id, me.cp_user_id]);
    await q(`UPDATE cp_requests SET status='ended' WHERE status='accepted' AND ((from_id=$1 AND to_id=$2) OR (from_id=$2 AND to_id=$1))`, [req.user.id, me.cp_user_id]);
    invalidateProfile(req.user.id);
    invalidateProfile(me.cp_user_id);
    toUser(me.cp_user_id, 'cp:ended', { by: req.user.id });
  }
  res.json({ ok: true });
});

// ---------- Fan club ----------
r.get('/fan-club/:hostId', auth, async (req, res) => {
  const hostId = int(req.params.hostId);
  const rows = await q('SELECT user_id, intimacy, joined_at FROM fan_clubs WHERE host_id=$1 ORDER BY intimacy DESC LIMIT 100', [hostId]);
  const ps = await miniProfiles(rows.map((x) => x.user_id));
  const me = await one('SELECT intimacy FROM fan_clubs WHERE host_id=$1 AND user_id=$2', [hostId, req.user.id]);
  const total = await one('SELECT count(*)::int AS n FROM fan_clubs WHERE host_id=$1', [hostId]);
  const s = await getSettings();
  res.json({
    members: total.n,
    price: s.economy.fan_club_coins,
    me: me ? { intimacy: me.intimacy, level: fanLevel(me.intimacy) } : null,
    top: rows.map((x) => ({ user: ps.find((p) => p.id === x.user_id), intimacy: x.intimacy, level: fanLevel(x.intimacy) })),
  });
});

r.post('/fan-club/:hostId/join', auth, async (req, res) => {
  const s = await getSettings();
  need(s.features.fan_club, 'Fan club is turned off');
  const hostId = int(req.params.hostId);
  need(hostId !== req.user.id, 'This is your own fan club');
  const host = await one('SELECT id, is_host FROM users WHERE id=$1', [hostId]);
  if (!host?.is_host) throw forbidden('Only hosts have fan clubs');
  if (await one('SELECT 1 FROM fan_clubs WHERE host_id=$1 AND user_id=$2', [hostId, req.user.id])) return res.json({ ok: true, already: true });
  await tx(async (c) => {
    const price = s.economy.fan_club_coins;
    await changeCoins(c, req.user.id, -price, 'fan_club', { refType: 'user', refId: hostId });
    await changeDiamonds(c, hostId, Math.floor(price / 2), 'gift_receive', { refType: 'fan_club', refId: req.user.id, note: 'Fan club join' });
    await c.q('INSERT INTO fan_clubs(host_id, user_id) VALUES ($1,$2)', [hostId, req.user.id]);
  });
  toUser(hostId, 'notify', { type: 'fan', title: 'New fan club member', from: await miniProfile(req.user.id) });
  res.json({ ok: true });
});

r.get('/fan-clubs/mine', auth, async (req, res) => {
  const rows = await q('SELECT host_id, intimacy FROM fan_clubs WHERE user_id=$1 ORDER BY intimacy DESC', [req.user.id]);
  const ps = await miniProfiles(rows.map((x) => x.host_id));
  res.json(rows.map((x) => ({ host: ps.find((p) => p.id === x.host_id), intimacy: x.intimacy, level: fanLevel(x.intimacy) })));
});

export default r;
