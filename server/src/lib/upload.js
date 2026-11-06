import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { bad, HttpError } from './util.js';
import { verifyToken, canAccess } from './auth.js';
import { one } from '../db.js';

const KINDS = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  video: ['.mp4', '.webm', '.mov'],
  audio: ['.m4a', '.mp3', '.webm', '.ogg', '.aac', '.wav'],
  anim: ['.json', '.svga', '.mp4', '.webp', '.gif', '.png', '.webm'],
};
const MIME_FAMILY = { image: 'image/', video: 'video/', audio: 'audio/' };

export const uploadRoot = path.resolve(config.uploadDir);
// Sensitive uploads (KYC selfie/ID, report screenshots) land here, split by
// access class, and are served only to panel admins whose role covers that
// class - never via the public /uploads static mount.
export const privateRoot = path.join(uploadRoot, 'private');
export const PRIVATE_CLASSES = ['kyc', 'reports'];
for (const c of PRIVATE_CLASSES) fs.mkdirSync(path.join(privateRoot, c), { recursive: true });

function storageFor(sensitive) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const base = sensitive ? path.join(privateRoot, sensitive) : uploadRoot;
      const dir = path.join(base, new Date().toISOString().slice(0, 7));
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 6);
      cb(null, crypto.randomBytes(12).toString('hex') + ext);
    },
  });
}

export function uploader(kinds = ['image'], { sensitive = null } = {}) {
  const allowed = new Set(kinds.flatMap((k) => KINDS[k] || []));
  const families = kinds.map((k) => MIME_FAMILY[k]).filter(Boolean);
  return multer({
    storage: storageFor(sensitive),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!allowed.has(ext)) return cb(bad(`File type ${ext || '?'} not allowed`));
      // Dual check: extension allowlist above, plus the declared content type
      // must match the kind's family (client-supplied, so not a guarantee,
      // but rejects obvious mismatches like a .jpg sent as text/plain).
      if (families.length && file.mimetype && !families.some((f) => file.mimetype.startsWith(f))) {
        return cb(bad(`Content type ${file.mimetype} not allowed for ${kinds.join('/')} upload`));
      }
      cb(null, true);
    },
  });
}

/** Public URL path for a locally stored file */
export function fileUrl(file) {
  if (!file) return null;
  const rel = path.relative(uploadRoot, file.path).split(path.sep).join('/');
  return `/uploads/${rel}`;
}

function fileUrlPrivate(file) {
  const rel = path.relative(privateRoot, file.path).split(path.sep).join('/');
  return `/uploads-private/${rel}`;
}

// Byte-level content check for image uploads: the client-supplied MIME header
// and filename are not proof of content, so image files must carry the magic
// bytes of their declared format.
const IMAGE_MAGIC = {
  '.png': [0x89, 0x50, 0x4e, 0x47],
  '.jpg': [0xff, 0xd8, 0xff],
  '.jpeg': [0xff, 0xd8, 0xff],
  '.gif': [0x47, 0x49, 0x46, 0x38],
};
function imageBytesOk(absPath, ext) {
  try {
    const fd = fs.openSync(absPath, 'r');
    const head = Buffer.alloc(12);
    fs.readSync(fd, head, 0, 12, 0);
    fs.closeSync(fd);
    if (ext === '.webp') {
      return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    const magic = IMAGE_MAGIC[ext];
    if (!magic) return true; // not an image extension; no check here
    return magic.every((b, i) => head[i] === b);
  } catch {
    return false;
  }
}

// ---- Cloudinary backend (optional) -------------------------------------
// Enabled only with STORAGE_BACKEND=cloudinary AND all three CLOUDINARY_*
// env vars. Secrets stay in env; nothing about them is logged or returned.
export function cloudinaryEnabled() {
  const c = config.cloudinary || {};
  return config.storageBackend === 'cloudinary' && !!(c.cloudName && c.apiKey && c.apiSecret);
}

async function cloudinaryRequest(action, formFields, signFields) {
  const c = config.cloudinary;
  const timestamp = Math.floor(Date.now() / 1000);
  const toSign = { ...signFields, timestamp };
  const base = Object.keys(toSign).sort().map((k) => `${k}=${toSign[k]}`).join('&');
  const signature = crypto.createHash('sha1').update(base + c.apiSecret).digest('hex');
  const fd = new FormData();
  for (const [k, v] of Object.entries(formFields)) fd.append(k, v);
  fd.append('api_key', c.apiKey);
  fd.append('timestamp', String(timestamp));
  fd.append('signature', signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${c.cloudName}/image/${action}`, { method: 'POST', body: fd });
  if (!res.ok) throw new Error(`cloudinary ${action} failed: HTTP ${res.status}`);
  return res.json();
}

async function cloudinaryUpload(absPath, folder) {
  const data = await cloudinaryRequest('upload',
    { file: new Blob([fs.readFileSync(absPath)]), folder },
    { folder });
  return data.secure_url;
}

async function cloudinaryDestroy(publicId) {
  await cloudinaryRequest('destroy', { public_id: publicId }, { public_id: publicId });
}

function cloudinaryPublicId(url) {
  // https://res.cloudinary.com/<cloud>/image/upload/v123/<folder>/<name>.<ext>
  const m = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i.exec(url || '');
  return m ? m[1] : null;
}

/**
 * Final resting place for an uploaded file. Sensitive files stay on local
 * disk under the admin-only /uploads-private mount. keepLocal files (live
 * thumbnails fed to local moderation) stay local too. Everything else goes
 * to Cloudinary when configured; if Cloudinary is not configured or the
 * upload fails, the file stays on local disk (ephemeral on some hosts) so
 * availability never depends on the remote service.
 */
export async function storeUpload(file, { sensitive = null, keepLocal = false } = {}) {
  if (!file) return null;
  const ext = path.extname(file.originalname || '').toLowerCase();
  if ((ext in IMAGE_MAGIC || ext === '.webp') && !imageBytesOk(file.path, ext)) {
    fs.unlink(file.path, () => {});
    throw bad('File content does not match its image type');
  }
  if (sensitive) return fileUrlPrivate(file);
  if (keepLocal) return fileUrl(file);
  if (cloudinaryEnabled()) {
    try {
      const url = await cloudinaryUpload(file.path, 'liveapp/' + new Date().toISOString().slice(0, 7));
      fs.unlink(file.path, () => {});
      return url;
    } catch (e) {
      console.warn('[storage] cloudinary upload failed, keeping local copy:', e.message);
    }
  }
  return fileUrl(file);
}

/** Best-effort delete of a previously stored upload (local or Cloudinary). */
export async function removeUpload(url) {
  if (!url) return;
  try {
    if (url.startsWith('/uploads-private/')) {
      const abs = path.resolve(privateRoot, url.slice('/uploads-private/'.length));
      if (abs.startsWith(privateRoot + path.sep)) fs.unlink(abs, () => {});
    } else if (url.startsWith('/uploads/')) {
      const abs = path.resolve(uploadRoot, url.slice('/uploads/'.length));
      if (abs.startsWith(uploadRoot + path.sep) && !abs.startsWith(privateRoot + path.sep)) fs.unlink(abs, () => {});
    } else if (url.startsWith('https://res.cloudinary.com/') && cloudinaryEnabled()) {
      const pid = cloudinaryPublicId(url);
      if (pid) await cloudinaryDestroy(pid);
    }
  } catch (e) {
    console.warn('[storage] removeUpload failed:', e.message);
  }
}

/** Panel-admin gate for one private upload class. Header-only bearer auth:
 *  query-string tokens are deliberately not accepted (URLs leak into logs,
 *  history, referrers and shares). Class-to-module mapping keeps a
 *  hosts-only admin out of report evidence and vice versa. */
export function privateUploadAuth(privClass) {
  const module = privClass === 'kyc' ? 'hosts' : 'reports';
  return async (req, _res, next) => {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    const p = verifyToken(token);
    if (!p || p.k !== 'admin') throw new HttpError(401, 'Admin login required', 'unauthorized');
    const a = await one('SELECT id, role, status FROM admin_users WHERE id=$1', [p.id]);
    if (!a || a.status !== 'active') throw new HttpError(401, 'Admin login required', 'unauthorized');
    if (!canAccess(a.role, module)) {
      throw new HttpError(403, 'Your role cannot access these files', 'forbidden');
    }
    next();
  };
}
