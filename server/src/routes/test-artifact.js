import { Router } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { one, q } from '../db.js';
import { adminAuth } from '../lib/auth.js';
import { privateRoot } from '../lib/upload.js';
import { bad, notFound } from '../lib/util.js';
import { config } from '../config.js';

// Test-artifact delivery: lets a panel admin hand one private binary (e.g. a
// test APK) to a specific person without putting it in the repo, a public
// static mount, or any shared credential. The admin uploads the bytes, mints
// a short-lived random-token link, and shares that link. Only the token hash
// is stored; unknown or expired tokens all get the same 404. Files live under
// the private upload root, which is never served by the public static mounts.
const r = Router();

// Entire capability is staging-only and fail-closed: without the explicit
// TEST_ARTIFACTS_ENABLED=true flag every route here answers with the same
// generic 404 as an unknown path, so production exposes nothing.
r.use((req, res, next) => (config.testArtifactsEnabled ? next() : res.status(404).json({ error: 'Not found' })));
const artifactRoot = path.join(privateRoot, 'artifacts');
fs.mkdirSync(artifactRoot, { recursive: true });

const MAX_BYTES = 80 * 1024 * 1024;
// Only install/test archive types may be uploaded, matched on both the
// declared content type and the filename extension.
const ALLOWED_TYPES = {
  'application/vnd.android.package-archive': ['.apk'],
  'application/zip': ['.zip'],
  'application/octet-stream': ['.apk', '.zip', '.bin'],
};
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// Admin-only upload. Raw binary body (any content type the global JSON parser
// would skip); optional X-SHA256 / X-Filename headers describe the payload.
r.post('/admin/test-artifacts', adminAuth(), express.raw({ type: '*/*', limit: MAX_BYTES }), async (req, res) => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) throw bad('Raw binary body required');
  const claimed = String(req.headers['x-sha256'] || '').toLowerCase();
  const actual = sha(body);
  if (claimed && claimed !== actual) throw bad('Checksum mismatch');
  const filename = (String(req.headers['x-filename'] || 'artifact.bin').replace(/[^\w.\-]/g, '_') || 'artifact.bin').slice(0, 120);
  const mime = String(req.headers['content-type'] || 'application/octet-stream').split(';')[0].slice(0, 120);
  const exts = ALLOWED_TYPES[mime];
  if (!exts) throw bad(`Content type ${mime} not allowed`);
  const ext = ('.' + filename.split('.').pop()).toLowerCase();
  if (!exts.includes(ext)) throw bad(`Extension ${ext} not allowed for ${mime}`);
  const rel = path.join('artifacts', crypto.randomBytes(12).toString('hex') + '.bin');
  fs.writeFileSync(path.join(privateRoot, rel), body);
  const row = await one(
    'INSERT INTO test_artifacts(filename, mime, size, sha256, storage_path) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at',
    [filename, mime, body.length, actual, rel]);
  res.json({ id: row.id, filename, size: body.length, sha256: actual, createdAt: row.created_at });
});

// Mint a short-lived download link (default 48h, capped 72h). Token goes in
// the URL path so it stays out of query-string logs; only its hash is stored.
r.post('/admin/test-artifacts/:id/link', adminAuth(), async (req, res) => {
  const id = Number(req.params.id);
  const art = await one('SELECT id FROM test_artifacts WHERE id=$1', [id]);
  if (!art) throw notFound('Artifact not found');
  const ttlH = Math.min(Math.max(Number(req.body?.ttlHours) || 48, 1), 72);
  const token = crypto.randomBytes(24).toString('base64url');
  const row = await one(
    `INSERT INTO test_artifact_links(artifact_id, token_hash, expires_at)
     VALUES ($1,$2, now() + ($3 || ' hours')::interval) RETURNING expires_at`,
    [id, sha(Buffer.from(token)), String(ttlH)]);
  res.json({ path: `/api/test-artifacts/t/${token}`, expiresAt: row.expires_at, ttlHours: ttlH });
});

// Token-gated download. Public but unguessable (192-bit token, hash stored);
// expired and unknown tokens are indistinguishable. Rate-limited, no-store.
r.get('/test-artifacts/t/:token', rateLimit({ windowMs: 60_000, limit: 30 }), async (req, res) => {
  const deny = () => { throw notFound('Not found'); };
  const token = String(req.params.token || '');
  if (token.length < 20) deny();
  const link = await one(
    `SELECT l.id, l.expires_at, a.filename, a.mime, a.size, a.sha256, a.storage_path
     FROM test_artifact_links l JOIN test_artifacts a ON a.id = l.artifact_id
     WHERE l.token_hash=$1`, [sha(Buffer.from(token))]);
  if (!link || new Date(link.expires_at) < new Date()) deny();
  const file = path.join(privateRoot, link.storage_path);
  if (!file.startsWith(artifactRoot) || !fs.existsSync(file)) deny();
  await q('UPDATE test_artifact_links SET downloads=downloads+1 WHERE id=$1', [link.id]);
  res.set({
    'Content-Type': link.mime || 'application/octet-stream',
    'Content-Length': String(link.size),
    'Content-Disposition': `attachment; filename="${String(link.filename).replace(/"/g, '')}"`,
    'X-SHA256': link.sha256,
    'Cache-Control': 'private, no-store',
  });
  fs.createReadStream(file).pipe(res);
});

export default r;
