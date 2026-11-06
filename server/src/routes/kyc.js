import { Router } from 'express';
import { one, q } from '../db.js';
import { userAuth } from '../lib/auth.js';
import { config } from '../config.js';

const r = Router();

// Staging/demo convenience only. In production this is always false and
// real database status is used, regardless of the flag.
// Staging/demo convenience only: requires BOTH a non-production NODE_ENV and the
// explicit ALLOW_KYC_BYPASS=true opt-in. Production always fails closed.
import { kycBypassEnabled } from '../services/demo.js';
const stagingMode = kycBypassEnabled;

// GET /api/kyc/me - Current user's KYC / Host verification state
r.get('/kyc/me', userAuth(), async (req, res) => {
  const userId = req.user.id;
  const u = await one('SELECT is_host, phone FROM users WHERE id=$1', [userId]);
  const host = await one('SELECT status, real_name, applied_at, approved_at FROM hosts WHERE user_id=$1', [userId]);

  if (stagingMode()) {
    return res.json({
      verified: true,
      hostStatus: 'approved',
      isHost: true,
      canLive: true,
      kyc: {
        status: 'approved',
        doc_type: 'demo',
        legal_name: 'Demo User',
        created_at: new Date().toISOString(),
        decided_at: null,
        note: 'Auto-approved for testing (staging only)',
      },
    });
  }

  const status = host?.status || (u?.is_host ? 'approved' : 'none');
  const approved = status === 'approved';
  res.json({
    verified: approved,
    hostStatus: status,
    isHost: approved,
    canLive: approved,
    kyc: host ? {
      status: host.status,
      legal_name: host.real_name,
      created_at: host.applied_at,
      decided_at: host.approved_at,
    } : { status: 'none' },
  });
});

// No automated liveness challenge: verification is manual admin review of ID + selfie.

// POST /api/kyc - Submit document and live selfie
r.post('/kyc', userAuth(), async (req, res) => {
  const userId = req.user.id;

  if (stagingMode()) {
    await q('UPDATE users SET is_host=true WHERE id=$1', [userId]);
    await q(
      `INSERT INTO hosts (user_id, level, status, real_name, approved_at)
       VALUES ($1, 'A', 'approved', 'Verified Streamer', now())
       ON CONFLICT (user_id) DO UPDATE SET status='approved', approved_at=now()`,
      [userId]
    );
    return res.json({
      ok: true,
      status: 'approved',
      verified: true,
      hostStatus: 'approved',
      message: 'Identity and host privileges verified successfully (staging auto-approval)',
    });
  }

  // Production: submission enters the review queue; an admin approves via
  // POST /api/admin/hosts/:userId/approve in the admin panel.
  const existing = await one('SELECT status FROM hosts WHERE user_id=$1', [userId]);
  if (existing?.status === 'approved') {
    return res.json({ ok: true, status: 'approved', verified: true, hostStatus: 'approved', message: 'Already verified' });
  }
  await q(
    `INSERT INTO hosts (user_id, level, status, real_name)
     VALUES ($1, 'N', 'pending', $2)
     ON CONFLICT (user_id) DO UPDATE SET status='pending', reject_reason=NULL`,
    [userId, req.body.legal_name || req.body.name || null]
  );
  res.json({
    ok: true,
    status: 'pending',
    verified: false,
    hostStatus: 'pending',
    message: 'Verification submitted and pending admin review',
  });
});

export default r;
