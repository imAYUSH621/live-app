import { config } from '../config.js';
import { q } from '../db.js';

// Firebase Cloud Messaging (HTTP v1). Free. Set FIREBASE_SERVICE_ACCOUNT_JSON to the service account JSON.
let sa = null;
let client = null;

async function getClient() {
  if (client) return client;
  if (!config.firebaseServiceAccount) return null;
  try {
    sa = JSON.parse(config.firebaseServiceAccount);
    const { JWT } = await import('google-auth-library');
    client = new JWT({ email: sa.client_email, key: sa.private_key, scopes: ['https://www.googleapis.com/auth/firebase.messaging'] });
    return client;
  } catch (e) {
    console.warn('[push] invalid FIREBASE_SERVICE_ACCOUNT_JSON', e.message);
    return null;
  }
}

export async function pushToTokens(tokens, title, body, data = {}) {
  const c = await getClient();
  if (!c || !tokens.length) return 0;
  const { token } = await c.getAccessToken();
  let sent = 0;
  for (const t of tokens) {
    try {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: t, notification: { title, body }, data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) } }),
      });
      if (r.ok) sent++;
    } catch { /* ignore single failures */ }
  }
  return sent;
}

export async function pushToUser(userId, title, body, data) {
  const rows = await q('SELECT fcm_token FROM users WHERE id=$1 AND fcm_token IS NOT NULL', [userId]);
  return pushToTokens(rows.map((r) => r.fcm_token), title, body, data);
}
