import { Redis } from 'ioredis';
import { config } from './config.js';

export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 20,
  retryStrategy(times) {
    return Math.min(times * 100, 2000);
  },
});
redis.on('error', (e) => console.error('[redis]', e.message));

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
