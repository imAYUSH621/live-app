import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { one, q } from '../db.js';
import { agencyAuth, signToken } from '../lib/auth.js';
import { need, str, int, monthOf, bad, randomCode } from '../lib/util.js';
import { hostMonth } from '../services/settlement.js';
import { hostRoom } from '../services/roomstate.js';
import { toUser } from '../lib/io.js';
import { pushToUser } from '../lib/push.js';
import { getSettings } from '../lib/settings.js';
import { config } from '../config.js';
import { audit } from '../lib/audit.js';

const r = Router();
const auth = agencyAuth();

r.post('/agency/login', async (req, res) => {
  const a = await one('SELECT * FROM agencies WHERE login_email=$1', [str(req.body.email, 120).toLowerCase()]);
  if (!a || !a.password_hash || !(await bcrypt.compare(String(req.body.password || ''), a.password_hash))) throw bad('Wrong email or password');
  need(a.status === 'active', `Agency is ${a.status}`);
  res.json({ token: signToken('agency', a.id, {}, '7d'), agency: { ...a, password_hash: undefined } });
});

r.get('/agency/me', auth, async (req, res) => {
  const a = req.agency;
  const month = monthOf();
  const hosts = await q(`SELECT user_id FROM hosts WHERE agency_id=$1 AND status='approved'`, [a.id]);
  let income = 0;
  let onTrack = 0;
  let live = 0;
  for (const h of hosts) {
    const m = await hostMonth(h.user_id, month);
    income += m.total;
    if (m.target.met) onTrack++;
    if (await hostRoom(h.user_id)) live++;
  }
  const pending = (await one(`SELECT count(*)::int AS n FROM hosts WHERE agency_id=$1 AND status='pending'`, [a.id])).n;
  const subs = await q(`SELECT id, name, code, status, commission_pct FROM agencies WHERE parent_id=$1`, [a.id]);
  res.json({
    agency: { ...a, password_hash: undefined },
    stats: { hosts: hosts.length, live_now: live, target_met: onTrack, pending_applications: pending, month_host_income: Math.round(income * 100) / 100,
      est_commission: Math.round(income * Number(a.commission_pct)) / 100, currency: (await getSettings()).economy.currency },
    sub_agencies: subs,
    invite: { code: a.code, link: `${config.publicAppUrl}/?agency=${a.code}` },
  });
});

r.get('/agency/hosts', auth, async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : monthOf();
  const rows = await q(
    `SELECT h.user_id, h.level, h.status, h.host_tags, h.approved_at, h.warnings, u.uid, u.name, u.avatar_url, u.country, u.call_rate,
       (SELECT max(started_at) FROM rooms WHERE host_id=h.user_id) AS last_live
     FROM hosts h JOIN users u ON u.id=h.user_id WHERE h.agency_id=$1 AND h.status IN ('approved','suspended') ORDER BY u.name`, [req.agency.id]);
  const s = await getSettings();
  const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();
  for (const h of rows) {
    h.month = await hostMonth(h.user_id, month);
    h.live_now = !!(await hostRoom(h.user_id));
    const needHours = Math.max(0, s.host.target_hours - h.month.live_hours);
    const needDays = Math.max(0, s.host.target_days - h.month.valid_days);
    h.risk = h.month.target.met ? 'met' : needDays > daysLeft || needHours > daysLeft * 4 ? 'at_risk' : 'on_track';
  }
  res.json(rows);
});

r.get('/agency/applications', auth, async (req, res) => {
  res.json(await q(
    `SELECT h.*, u.uid, u.name, u.avatar_url, u.gender, u.dob, u.country, u.phone, u.email FROM hosts h JOIN users u ON u.id=h.user_id
     WHERE h.agency_id=$1 AND h.status IN ('pending','agency_ok','rejected') ORDER BY h.applied_at DESC LIMIT 200`, [req.agency.id]));
});

r.post('/agency/applications/:userId', auth, async (req, res) => {
  const uid = int(req.params.userId);
  const approve = req.body.action === 'approve';
  const h = await one(`UPDATE hosts SET status=$3, reject_reason=$4 WHERE user_id=$1 AND agency_id=$2 AND status='pending' RETURNING *`,
    [uid, req.agency.id, approve ? 'agency_ok' : 'rejected', approve ? null : str(req.body.reason, 200) || 'Rejected by agency']);
  need(h, 'Application not found');
  await audit(req, approve ? 'agency.host_ok' : 'agency.host_reject', 'host', uid);
  toUser(uid, 'notify', { type: 'host_application', status: h.status, reason: h.reject_reason });
  res.json(h);
});

r.post('/agency/hosts/:userId/remind', auth, async (req, res) => {
  const uid = int(req.params.userId);
  need(await one(`SELECT 1 FROM hosts WHERE user_id=$1 AND agency_id=$2`, [uid, req.agency.id]), 'Host not in your agency');
  const msg = str(req.body.message, 300) || 'Reminder from your agency: please complete your live hours target this month 💪';
  await q(`INSERT INTO notifications(user_id, title, body) VALUES ($1,$2,$3)`, [uid, req.agency.name, msg]);
  toUser(uid, 'notify', { type: 'agency', text: msg });
  pushToUser(uid, req.agency.name, msg).catch(() => {});
  res.json({ ok: true });
});

r.get('/agency/commissions', auth, async (req, res) => {
  res.json(await q('SELECT * FROM agency_commissions WHERE agency_id=$1 ORDER BY month DESC LIMIT 24', [req.agency.id]));
});

r.get('/agency/commissions/:month', auth, async (req, res) => {
  res.json(await q(
    `SELECT s.*, u.name, u.uid FROM host_settlements s JOIN users u ON u.id=s.host_id WHERE s.agency_id=$1 AND s.month=$2 ORDER BY s.total DESC`,
    [req.agency.id, str(req.params.month, 7)]));
});

r.patch('/agency/payout', auth, async (req, res) => {
  await q('UPDATE agencies SET payout_method=$2, payout_details=$3 WHERE id=$1', [req.agency.id, str(req.body.method, 20), req.body.details || {}]);
  res.json({ ok: true });
});

r.post('/agency/password', auth, async (req, res) => {
  const a = await one('SELECT password_hash FROM agencies WHERE id=$1', [req.agency.id]);
  need(await bcrypt.compare(String(req.body.old_password || ''), a.password_hash), 'Old password is wrong');
  need(String(req.body.new_password || '').length >= 8, 'New password must be 8+ characters');
  await q('UPDATE agencies SET password_hash=$2 WHERE id=$1', [req.agency.id, await bcrypt.hash(String(req.body.new_password), 10)]);
  res.json({ ok: true });
});

// Sub-agents: created as pending, admin approves.
r.post('/agency/sub-agencies', auth, async (req, res) => {
  const email = str(req.body.email, 120).toLowerCase();
  need(email && String(req.body.password || '').length >= 8, 'Email and 8+ char password required');
  if (await one('SELECT 1 FROM agencies WHERE login_email=$1', [email])) throw bad('Email already used');
  const sub = await one(
    `INSERT INTO agencies(code, name, parent_id, login_email, password_hash, phone, country, commission_pct, status, bd_admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9) RETURNING id, code, name, status`,
    [randomCode(6), str(req.body.name, 60), req.agency.id, email, await bcrypt.hash(String(req.body.password), 10), str(req.body.phone, 20),
     req.agency.country, Math.min(Number(req.body.commission_pct) || 5, Number(req.agency.commission_pct)), req.agency.bd_admin_id]);
  await audit(req, 'agency.sub_create', 'agency', sub.id);
  res.json(sub);
});

r.get('/agency/policy', auth, async (_req, res) => {
  res.json(await q(`SELECT slug, title, body FROM cms_pages WHERE slug IN ('host-policy','agency-policy','terms')`));
});

r.get('/agency/tickets', auth, async (req, res) => {
  res.json(await q('SELECT * FROM support_tickets WHERE agency_id=$1 ORDER BY id DESC LIMIT 50', [req.agency.id]));
});
r.post('/agency/tickets', auth, async (req, res) => {
  need(str(req.body.subject) && str(req.body.body), 'Subject and message required');
  res.json(await one('INSERT INTO support_tickets(agency_id, subject, body) VALUES ($1,$2,$3) RETURNING *', [req.agency.id, str(req.body.subject, 100), str(req.body.body, 2000)]));
});

export default r;
