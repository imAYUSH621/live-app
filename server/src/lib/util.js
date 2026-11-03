import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const bad = (msg, code) => new HttpError(400, msg, code);
export const forbidden = (msg = 'Not allowed') => new HttpError(403, msg, 'forbidden');
export const notFound = (msg = 'Not found') => new HttpError(404, msg, 'not_found');

export function need(cond, msg, status = 400) {
  if (!cond) throw new HttpError(status, msg);
}

export const int = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

export const str = (v, max = 500) => (v === undefined || v === null ? '' : String(v).trim().slice(0, max));

export function page(req, defLimit = 20, maxLimit = 100) {
  const limit = Math.min(Math.max(int(req.query.limit, defLimit), 1), maxLimit);
  const offset = Math.max(int(req.query.offset, 0), 0);
  return { limit, offset };
}

export const randomCode = (len = 8, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789') =>
  Array.from(crypto.randomBytes(len), (b) => alphabet[b % alphabet.length]).join('');

export const randomDigits = (len) => Array.from(crypto.randomBytes(len), (b) => b % 10).join('');

export const today = () => new Date().toISOString().slice(0, 10);

export const monthOf = (d = new Date()) => d.toISOString().slice(0, 7);

export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
}

/** Public user fields safe to show other users */
export const PUBLIC_USER_COLS = `u.id, u.uid, u.fancy_id, u.name, u.avatar_url, u.gender, u.country, u.bio,
  u.vip_level, u.noble_rank, u.is_host, u.total_spent, u.total_earned, u.family_id, u.created_at`;
