import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { one } from '../db.js';
import { HttpError } from './util.js';

// Token kinds: user (app), admin (panel staff), agency (agency owner panel), seller (coin seller panel)
export function signToken(kind, id, extra = {}, expiresIn = '30d') {
  return jwt.sign({ k: kind, id, ...extra }, config.jwtSecret, { expiresIn });
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : req.query.token || null;
}

/** App user auth. Loads the user row onto req.user and blocks banned users. */
export function userAuth({ optional = false, allowBanned = false } = {}) {
  return async (req, _res, next) => {
    const p = verifyToken(bearer(req));
    if (!p || p.k !== 'user') {
      if (optional) return next();
      throw new HttpError(401, 'Please login', 'unauthorized');
    }
    const u = await one('SELECT * FROM users WHERE id=$1', [p.id]);
    if (!u || u.status === 'deleted') throw new HttpError(401, 'Account not found', 'unauthorized');
    if (!allowBanned && u.status === 'banned' && (!u.ban_until || new Date(u.ban_until) > new Date())) {
      throw new HttpError(403, `Account banned${u.ban_reason ? ': ' + u.ban_reason : ''}`, 'banned');
    }
    req.user = u;
    next();
  };
}

// Panel roles -> which admin modules they can use
export const ROLE_MODULES = {
  super_admin: ['*'],
  ops: ['dashboard', 'users', 'hosts', 'agencies', 'live', 'reports', 'gifts', 'events', 'banners', 'rankings', 'families', 'notifications', 'cms', 'pk', 'tasks', 'store', 'analytics', 'support'],
  moderator: ['dashboard', 'live', 'reports', 'users.view', 'users.ban', 'moments', 'risk'],
  finance: ['dashboard', 'finance', 'settlement', 'sellers', 'economy', 'analytics', 'users.view', 'users.wallet'],
  bd: ['dashboard', 'agencies', 'hosts', 'analytics'],
  support: ['dashboard', 'users.view', 'support', 'reports'],
  marketing: ['dashboard', 'banners', 'events', 'notifications', 'cms', 'analytics', 'tasks'],
};

export function canAccess(role, module) {
  const mods = ROLE_MODULES[role] || [];
  if (mods.includes('*')) return true;
  if (mods.includes(module)) return true;
  const base = module.split('.')[0];
  return mods.includes(base);
}

export function adminAuth(module) {
  return async (req, _res, next) => {
    const p = verifyToken(bearer(req));
    if (!p || p.k !== 'admin') throw new HttpError(401, 'Admin login required', 'unauthorized');
    const a = await one('SELECT id, name, email, role, country, status FROM admin_users WHERE id=$1', [p.id]);
    if (!a || a.status !== 'active') throw new HttpError(401, 'Admin disabled', 'unauthorized');
    if (module && !canAccess(a.role, module)) throw new HttpError(403, 'Your role cannot access this module');
    req.admin = a;
    next();
  };
}

export function agencyAuth() {
  return async (req, _res, next) => {
    const p = verifyToken(bearer(req));
    if (!p || p.k !== 'agency') throw new HttpError(401, 'Agency login required', 'unauthorized');
    const a = await one('SELECT * FROM agencies WHERE id=$1', [p.id]);
    if (!a || a.status === 'terminated') throw new HttpError(401, 'Agency not active', 'unauthorized');
    req.agency = a;
    next();
  };
}

export function sellerAuth() {
  return async (req, _res, next) => {
    const p = verifyToken(bearer(req));
    if (!p || p.k !== 'seller') throw new HttpError(401, 'Seller login required', 'unauthorized');
    const s = await one(
      'SELECT s.*, u.name, u.uid, u.avatar_url FROM coin_sellers s JOIN users u ON u.id=s.user_id WHERE s.user_id=$1',
      [p.id],
    );
    if (!s || s.status !== 'active') throw new HttpError(401, 'Seller not active', 'unauthorized');
    req.seller = s;
    next();
  };
}
