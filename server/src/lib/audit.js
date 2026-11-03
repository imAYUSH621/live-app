import { q } from '../db.js';
import { clientIp } from './util.js';

export async function audit(req, action, targetType, targetId, details) {
  let actorType = 'system';
  let actorId = null;
  if (req?.admin) { actorType = 'admin'; actorId = req.admin.id; }
  else if (req?.agency) { actorType = 'agency'; actorId = req.agency.id; }
  else if (req?.seller) { actorType = 'seller'; actorId = req.seller.user_id; }
  else if (req?.user) { actorType = 'user'; actorId = req.user.id; }
  try {
    await q(
      `INSERT INTO audit_logs(actor_type, actor_id, action, target_type, target_id, details, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [actorType, actorId, action, targetType || null, targetId == null ? null : String(targetId), details || null, req ? clientIp(req) : null],
    );
  } catch (e) {
    console.error('[audit]', e.message);
  }
}
