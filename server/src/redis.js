import { Redis } from 'ioredis';
import { config } from './config.js';

class MemoryRedis {
  constructor() {
    this.store = new Map();
    this.ttls = new Map();
    this.status = 'ready';
    // Bounded memory: lazy expiry only reclaims keys that are read again.
    // Keys never re-accessed (unique chat dedupe ids, one-off locks) would
    // live forever, so sweep expired entries on an interval too.
    this._sweeper = setInterval(() => this._sweep(), 30000);
    this._sweeper.unref?.();
  }

  _sweep() {
    const now = Date.now();
    for (const [key, exp] of this.ttls) {
      if (exp && now > exp) {
        this.store.delete(key);
        this.ttls.delete(key);
      }
    }
  }

  _isExpired(key) {
    const exp = this.ttls.get(key);
    if (exp && Date.now() > exp) {
      this.store.delete(key);
      this.ttls.delete(key);
      return true;
    }
    return false;
  }

  _clean(key) {
    this._isExpired(key);
  }

  on(event, handler) {
    if (event === 'ready' || event === 'connect') {
      setTimeout(() => handler(), 0);
    }
    return this;
  }

  async ping() {
    return 'PONG';
  }

  async get(key) {
    this._clean(key);
    const val = this.store.get(key);
    if (val === undefined || val === null) return null;
    return typeof val === 'string' ? val : String(val);
  }

  async set(key, val, ...args) {
    const strVal = String(val);
    const nx = args.some((a) => String(a).toUpperCase() === 'NX');
    this._clean(key);
    if (nx && this.store.has(key)) {
      return null;
    }
    this.store.set(key, strVal);
    this.ttls.delete(key);

    for (let i = 0; i < args.length; i++) {
      const arg = String(args[i]).toUpperCase();
      if (arg === 'EX' && args[i + 1] !== undefined) {
        const sec = Number(args[i + 1]);
        this.ttls.set(key, Date.now() + sec * 1000);
      } else if (arg === 'PX' && args[i + 1] !== undefined) {
        const ms = Number(args[i + 1]);
        this.ttls.set(key, Date.now() + ms);
      }
    }
    return 'OK';
  }

  async del(...keys) {
    let count = 0;
    const flatKeys = keys.flat();
    for (const k of flatKeys) {
      if (this.store.delete(k)) count++;
      this.ttls.delete(k);
    }
    return count;
  }

  async exists(key) {
    this._clean(key);
    return this.store.has(key) ? 1 : 0;
  }

  async expire(key, seconds) {
    this._clean(key);
    if (!this.store.has(key)) return 0;
    this.ttls.set(key, Date.now() + Number(seconds) * 1000);
    return 1;
  }

  async keys(pattern = '*') {
    const now = Date.now();
    for (const [k, exp] of this.ttls.entries()) {
      if (exp && now > exp) {
        this.store.delete(k);
        this.ttls.delete(k);
      }
    }
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    const regex = new RegExp('^' + escaped + '$');
    return Array.from(this.store.keys()).filter((k) => regex.test(k));
  }

  async incr(key) {
    return this.incrby(key, 1);
  }

  async incrby(key, n) {
    this._clean(key);
    const curr = Number(this.store.get(key)) || 0;
    const next = curr + Number(n);
    this.store.set(key, String(next));
    return next;
  }

  async decr(key) {
    return this.incrby(key, -1);
  }

  async decrby(key, n) {
    return this.incrby(key, -Number(n));
  }

  // Hashes
  _getHash(key) {
    this._clean(key);
    let hash = this.store.get(key);
    if (!hash || !(hash instanceof Map)) {
      hash = new Map();
      this.store.set(key, hash);
    }
    return hash;
  }

  async hget(key, field) {
    const hash = this._getHash(key);
    const v = hash.get(String(field));
    return v !== undefined && v !== null ? String(v) : null;
  }

  async hset(key, field, val) {
    const hash = this._getHash(key);
    hash.set(String(field), String(val));
    return 1;
  }

  async hdel(key, ...fields) {
    const hash = this._getHash(key);
    let count = 0;
    for (const f of fields.flat()) {
      if (hash.delete(String(f))) count++;
    }
    return count;
  }

  async hincrby(key, field, n) {
    const hash = this._getHash(key);
    const curr = Number(hash.get(String(field))) || 0;
    const next = curr + Number(n);
    hash.set(String(field), String(next));
    return next;
  }

  async hgetall(key) {
    const hash = this._getHash(key);
    const obj = {};
    for (const [k, v] of hash.entries()) {
      obj[k] = String(v);
    }
    return obj;
  }

  // Sets
  _getSet(key) {
    this._clean(key);
    let s = this.store.get(key);
    if (!s || !(s instanceof Set)) {
      s = new Set();
      this.store.set(key, s);
    }
    return s;
  }

  async sadd(key, ...members) {
    const s = this._getSet(key);
    let added = 0;
    for (const m of members.flat()) {
      const sm = String(m);
      if (!s.has(sm)) {
        s.add(sm);
        added++;
      }
    }
    return added;
  }

  async srem(key, ...members) {
    const s = this._getSet(key);
    let rem = 0;
    for (const m of members.flat()) {
      if (s.delete(String(m))) rem++;
    }
    return rem;
  }

  async smembers(key) {
    const s = this._getSet(key);
    return Array.from(s);
  }

  async sismember(key, member) {
    const s = this._getSet(key);
    return s.has(String(member)) ? 1 : 0;
  }

  async scard(key) {
    const s = this._getSet(key);
    return s.size;
  }

  // Sorted Sets
  _getZSet(key) {
    this._clean(key);
    let z = this.store.get(key);
    if (!z || !(z instanceof Map)) {
      z = new Map();
      this.store.set(key, z);
    }
    return z;
  }

  async zadd(key, score, member) {
    const z = this._getZSet(key);
    const sm = String(member);
    const isNew = !z.has(sm);
    z.set(sm, Number(score));
    return isNew ? 1 : 0;
  }

  async zrem(key, member) {
    const z = this._getZSet(key);
    return z.delete(String(member)) ? 1 : 0;
  }

  async zincrby(key, increment, member) {
    const z = this._getZSet(key);
    const sm = String(member);
    const curr = z.get(sm) || 0;
    const next = curr + Number(increment);
    z.set(sm, next);
    return String(next);
  }

  async zrange(key, start, stop) {
    const z = this._getZSet(key);
    const entries = Array.from(z.entries()).sort((a, b) => a[1] - b[1]);
    const len = entries.length;
    let s = start < 0 ? Math.max(0, len + start) : start;
    let e = stop < 0 ? len + stop : stop;
    return entries.slice(s, e + 1).map((x) => x[0]);
  }

  async zrevrange(key, start, stop, ...opts) {
    const z = this._getZSet(key);
    const entries = Array.from(z.entries()).sort((a, b) => b[1] - a[1]);
    const len = entries.length;
    let s = start < 0 ? Math.max(0, len + start) : start;
    let e = stop < 0 ? len + stop : stop;
    const slice = entries.slice(s, e + 1);
    const withScores = opts.some((o) => String(o).toUpperCase() === 'WITHSCORES');
    if (withScores) {
      const res = [];
      for (const [m, sc] of slice) {
        res.push(m, String(sc));
      }
      return res;
    }
    return slice.map((x) => x[0]);
  }

  // Lists
  _getList(key) {
    this._clean(key);
    let l = this.store.get(key);
    if (!l || !Array.isArray(l)) {
      l = [];
      this.store.set(key, l);
    }
    return l;
  }

  async rpush(key, ...elements) {
    const l = this._getList(key);
    for (const el of elements.flat()) {
      l.push(String(el));
    }
    return l.length;
  }

  async lpop(key) {
    const l = this._getList(key);
    if (!l.length) return null;
    return l.shift();
  }

  async lrem(key, count, element) {
    const l = this._getList(key);
    const target = String(element);
    let removed = 0;
    for (let i = l.length - 1; i >= 0; i--) {
      if (l[i] === target) {
        l.splice(i, 1);
        removed++;
      }
    }
    return removed;
  }
}

// Decide client type:
// If REDIS_URL is 'memory' or empty, use in-memory store.
// If REDIS_URL starts with rediss:// or redis:// (and is not localhost during non-dev), connect to real Redis.
function createClient() {
  const url = config.redisUrl || '';
  const useMemory =
    !url ||
    url === 'memory' ||
    url.startsWith('memory://') ||
    (process.env.NODE_ENV === 'production' && url.includes('localhost'));

  if (useMemory) {
    console.log('[redis] Using built-in high-performance in-memory store');
    return new MemoryRedis();
  }

  try {
    const client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      tls: url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
      retryStrategy(times) {
        if (times > 3) return null; // stop reconnecting and let fallback handle
        return Math.min(times * 100, 1000);
      },
    });

    client.on('error', (e) => {
      console.warn('[redis] connection warning:', e.message);
    });

    return client;
  } catch (e) {
    console.warn('[redis] Failed to init ioredis, falling back to in-memory:', e.message);
    return new MemoryRedis();
  }
}

export { MemoryRedis };

export const redis = createClient();

export async function getJSON(key) {
  const v = await redis.get(key);
  return v ? JSON.parse(v) : null;
}

export async function setJSON(key, val, ttlSec) {
  if (ttlSec) await redis.set(key, JSON.stringify(val), 'EX', ttlSec);
  else await redis.set(key, JSON.stringify(val));
}

/** Simple cache wrapper */
export async function cached(key, ttlSec, fn) {
  const hit = await getJSON(key);
  if (hit !== null) return hit;
  const val = await fn();
  await setJSON(key, val, ttlSec);
  return val;
}
