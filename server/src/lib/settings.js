import { q, one } from '../db.js';
import { redis } from '../redis.js';

// Every tunable business rule lives here. Admin panel edits these (Settings / Economy).
export const DEFAULT_SETTINGS = {
  app: {
    name: 'LiveApp',
    maintenance: false,
    maintenance_message: 'We are upgrading. Back soon!',
    min_version: '1.0.0',
    latest_version: '1.0.0',
    force_update: false,
    support_whatsapp: '',
    admob_rewarded_id: '',      // AdMob rewarded ad unit id for the Android app
    default_country: 'IN',
    languages: ['en', 'hi'],
  },
  features: {
    live: true, pk: true, multi_guest: true, party_rooms: true, game_live: true,
    calls: true, random_match: true, moments: true, families: true, dm: true,
    lucky_gift: false,        // keep OFF until you take legal advice (chance-based)
    red_packet: true, spin_wheel: true, ad_rewards: true, guest_login: true,
    phone_login: true, email_login: true, google_login: true, translate: false,
    cp: true, fan_club: true,
  },
  economy: {
    currency: 'INR',
    diamonds_per_unit: 20,            // 20 diamonds = ₹1 host salary
    diamond_to_coin_rate: 1,          // 1 diamond -> 1 coin on exchange
    min_exchange_diamonds: 100,
    global_banner_coins: 5000,        // gift worth >= this shows banner across app
    paid_message_coins: 0,            // 0 = free DMs
    free_messages_per_day: 1000,
    match_filter_coins: 10,           // gender filter for random match
    call_min_rate: 30,
    call_default_rate: 60,
    call_host_pct: 60,                // % of call coins to host as diamonds
    call_min_balance_minutes: 1,
    new_user_coins: 50,
    referral_reward_coins: 100,
    referral_recharge_pct: 5,         // inviter gets % of invitee recharges in coins
    ticket_host_pct: 70,
    family_create_coins: 0,
    cp_coins: 1314,                  // cost to propose a CP (refunded if declined)
    fan_club_coins: 99,               // cost to join a host's fan club (half goes to the host)
  },
  host: {
    require_target_for_salary: false, // MIKA style = true (no target, no salary)
    target_hours: 25,
    target_days: 12,
    valid_day_minutes: 60,
    target_game_hours: 0,
    new_host_bonus: 0,
    allow_without_agency: true,
    official_agency_code: 'OFFICIAL',
  },
  pk: { duration: 300, punishment: 60, min_level: 0 },
  room: {
    host_only_live: false,     // true = only approved hosts can go live
    multi_seats: [3, 6, 9], party_seats: 8, max_title: 60,
    thumbnail_interval_sec: 60, idle_end_minutes: 10,
    chat_slow_ms: 800, like_batch_ms: 1500,
  },
  checkin: { rewards: [5, 10, 15, 20, 30, 40, 80] },
  ads: { reward_coins: 5, daily_limit: 10, cooldown_sec: 60 },
  spin: { free_per_day: 1, prizes: [
    { label: '5 coins', coins: 5, weight: 40 }, { label: '10 coins', coins: 10, weight: 25 },
    { label: '20 coins', coins: 20, weight: 15 }, { label: '50 coins', coins: 50, weight: 8 },
    { label: '100 coins', coins: 100, weight: 2 }, { label: 'Try again', coins: 0, weight: 10 } ] },
  lucky: {
    host_pct: 10, daily_pool: 500000,
    table: [ { mult: 0, weight: 70 }, { mult: 1, weight: 18 }, { mult: 2, weight: 7 },
             { mult: 5, weight: 3 }, { mult: 10, weight: 1.5 }, { mult: 50, weight: 0.45 }, { mult: 500, weight: 0.05 } ],
  },
  red_packet: { min_coins: 100, max_parts: 50, expire_sec: 120, delay_sec: 5 },
  moderation: {
    banned_words: ['nude', 'sex', 'porn', 'paytm number', 'whatsapp number'],
    auto_flag_reports: 3,
    min_age: 18,
  },
};

const CACHE_KEY = 'settings:all';

export async function getSettings() {
  const hit = await redis.get(CACHE_KEY);
  if (hit) return JSON.parse(hit);
  const rows = await q('SELECT key, value FROM settings');
  const merged = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) merged[r.key] = { ...(merged[r.key] || {}), ...r.value };
  await redis.set(CACHE_KEY, JSON.stringify(merged), 'EX', 30);
  return merged;
}

export async function getSetting(section) {
  return (await getSettings())[section];
}

export async function saveSetting(section, value) {
  await one(
    `INSERT INTO settings(key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now() RETURNING key`,
    [section, value],
  );
  await redis.del(CACHE_KEY);
}
