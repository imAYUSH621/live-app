-- LiveApp database schema (PostgreSQL 14+)
-- Safe to run multiple times: every object uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  uid BIGINT UNIQUE NOT NULL,              -- public numeric ID shown in app
  fancy_id TEXT UNIQUE,                    -- paid pretty ID (e.g. 888888)
  name TEXT NOT NULL DEFAULT 'User',
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  google_sub TEXT UNIQUE,
  password_hash TEXT,
  gender TEXT DEFAULT 'other',             -- male | female | other
  dob DATE,
  country TEXT DEFAULT 'IN',
  language TEXT DEFAULT 'en',
  bio TEXT DEFAULT '',
  avatar_url TEXT,
  coins BIGINT NOT NULL DEFAULT 0,
  diamonds BIGINT NOT NULL DEFAULT 0,
  total_spent BIGINT NOT NULL DEFAULT 0,   -- coins spent -> user level
  total_earned BIGINT NOT NULL DEFAULT 0,  -- diamonds earned -> charm level
  total_recharged NUMERIC(14,2) NOT NULL DEFAULT 0,
  vip_level INT NOT NULL DEFAULT 0,
  vip_expires TIMESTAMPTZ,
  noble_rank INT NOT NULL DEFAULT 0,
  noble_expires TIMESTAMPTZ,
  is_host BOOLEAN NOT NULL DEFAULT false,
  call_rate INT NOT NULL DEFAULT 60,       -- coins / minute for 1v1 calls (hosts)
  call_enabled BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active',   -- active | banned | deleted
  ban_until TIMESTAMPTZ,
  ban_reason TEXT,
  muted_until TIMESTAMPTZ,
  wallet_frozen BOOLEAN NOT NULL DEFAULT false,
  family_id BIGINT,
  referral_code TEXT UNIQUE,
  referred_by BIGINT,
  first_recharge_done BOOLEAN NOT NULL DEFAULT false,
  checkin_streak INT NOT NULL DEFAULT 0,
  last_checkin DATE,
  tags TEXT[] NOT NULL DEFAULT '{}',       -- admin tags: whale, risk, test
  device_id TEXT,
  last_ip TEXT,
  last_login TIMESTAMPTZ,
  online_at TIMESTAMPTZ,
  fcm_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_device_idx ON users(device_id);
CREATE INDEX IF NOT EXISTS users_country_idx ON users(country);

CREATE TABLE IF NOT EXISTS otp_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS admin_users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'support',    -- super_admin | ops | moderator | finance | bd | support | marketing
  country TEXT,                            -- for BD managers
  totp_secret TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agencies (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  owner_user_id BIGINT REFERENCES users(id),
  parent_id BIGINT REFERENCES agencies(id),   -- super agency
  bd_admin_id BIGINT REFERENCES admin_users(id),
  login_email TEXT UNIQUE,
  password_hash TEXT,
  phone TEXT,
  country TEXT DEFAULT 'IN',
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  override_pct NUMERIC(5,2) NOT NULL DEFAULT 2,   -- paid to parent on this agency's host income
  status TEXT NOT NULL DEFAULT 'active',          -- pending | active | frozen | terminated
  payout_method TEXT,
  payout_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hosts (
  user_id BIGINT PRIMARY KEY REFERENCES users(id),
  agency_id BIGINT REFERENCES agencies(id),
  level TEXT NOT NULL DEFAULT 'N',
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | agency_ok | approved | rejected | suspended
  real_name TEXT,
  selfie_url TEXT,
  id_doc_url TEXT,
  liveness_ok BOOLEAN DEFAULT false,
  reject_reason TEXT,
  payout_method TEXT,                       -- upi | bank | payoneer | paypal
  payout_details JSONB DEFAULT '{}'::jsonb,
  host_tags TEXT[] NOT NULL DEFAULT '{}',   -- supreme | star | official | new
  recommended BOOLEAN NOT NULL DEFAULT false,
  warnings INT NOT NULL DEFAULT 0,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS host_levels (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_diamonds BIGINT NOT NULL DEFAULT 0,
  min_hours INT NOT NULL DEFAULT 0,
  min_days INT NOT NULL DEFAULT 0,
  bonus_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_call_rate INT NOT NULL DEFAULT 60,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS host_daily_stats (
  host_id BIGINT NOT NULL REFERENCES users(id),
  day DATE NOT NULL,
  live_seconds INT NOT NULL DEFAULT 0,
  game_seconds INT NOT NULL DEFAULT 0,
  diamonds BIGINT NOT NULL DEFAULT 0,
  reward_diamonds BIGINT NOT NULL DEFAULT 0,
  call_seconds INT NOT NULL DEFAULT 0,
  pk_wins INT NOT NULL DEFAULT 0,
  PRIMARY KEY (host_id, day)
);

CREATE TABLE IF NOT EXISTS host_settlements (
  id BIGSERIAL PRIMARY KEY,
  month TEXT NOT NULL,                       -- YYYY-MM
  host_id BIGINT NOT NULL REFERENCES users(id),
  agency_id BIGINT REFERENCES agencies(id),
  diamonds BIGINT NOT NULL DEFAULT 0,
  live_hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  valid_days INT NOT NULL DEFAULT 0,
  level TEXT,
  target_met BOOLEAN NOT NULL DEFAULT false,
  base_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
  deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | agency_ok | approved | paid | rejected
  note TEXT,
  approved_by BIGINT,
  paid_at TIMESTAMPTZ,
  payout_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, host_id)
);

CREATE TABLE IF NOT EXISTS agency_commissions (
  id BIGSERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  agency_id BIGINT NOT NULL REFERENCES agencies(id),
  host_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  override_income NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  hosts_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  paid_at TIMESTAMPTZ,
  payout_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, agency_id)
);

CREATE TABLE IF NOT EXISTS coin_sellers (
  user_id BIGINT PRIMARY KEY REFERENCES users(id),
  balance BIGINT NOT NULL DEFAULT 0,
  password_hash TEXT,
  daily_limit BIGINT NOT NULL DEFAULT 1000000,
  discount_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seller_transfers (
  id BIGSERIAL PRIMARY KEY,
  seller_id BIGINT NOT NULL REFERENCES users(id),
  to_user_id BIGINT REFERENCES users(id),
  coins BIGINT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'transfer',     -- transfer | wholesale_in | admin_adjust
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledger (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  currency TEXT NOT NULL,                    -- coin | diamond
  amount BIGINT NOT NULL,
  balance_after BIGINT NOT NULL,
  type TEXT NOT NULL,
  ref_type TEXT,
  ref_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_user_idx ON ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_type_idx ON ledger(type, created_at);

CREATE TABLE IF NOT EXISTS recharge_packages (
  id BIGSERIAL PRIMARY KEY,
  coins BIGINT NOT NULL,
  bonus BIGINT NOT NULL DEFAULT 0,
  price NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  platform TEXT NOT NULL DEFAULT 'web',      -- web | android | ios
  country TEXT,                              -- null = all
  first_bonus BIGINT NOT NULL DEFAULT 0,
  product_id TEXT,                           -- Play/App store product id
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS recharge_orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  package_id BIGINT REFERENCES recharge_packages(id),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  coins BIGINT NOT NULL,
  gateway TEXT NOT NULL,                     -- razorpay | manual | admin | google_play
  gateway_order_id TEXT,
  gateway_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',    -- created | paid | failed | refunded
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS recharge_orders_status_idx ON recharge_orders(status, created_at);

CREATE TABLE IF NOT EXISTS gifts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL,                        -- emoji or image url
  anim_type TEXT NOT NULL DEFAULT 'css',     -- none | css | lottie | svga | mp4
  anim_url TEXT,
  price BIGINT NOT NULL,
  host_pct NUMERIC(5,2) NOT NULL DEFAULT 60, -- % of coins given to receiver as diamonds
  category TEXT NOT NULL DEFAULT 'normal',   -- normal | luxury | lucky | event | exclusive | vip
  vip_level INT NOT NULL DEFAULT 0,
  countries TEXT[],
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  host_id BIGINT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL DEFAULT 'solo',         -- solo | multi | party | game
  title TEXT NOT NULL DEFAULT '',
  cover_url TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  privacy TEXT NOT NULL DEFAULT 'public',    -- public | password | vip | ticket
  password TEXT,
  ticket_price INT NOT NULL DEFAULT 0,
  seats INT NOT NULL DEFAULT 0,
  announcement TEXT DEFAULT '',
  theme TEXT DEFAULT 'default',
  country TEXT,
  status TEXT NOT NULL DEFAULT 'live',       -- live | ended | cut
  livekit_room TEXT UNIQUE NOT NULL,
  thumbnail_url TEXT,
  thumb_at TIMESTAMPTZ,
  flagged BOOLEAN NOT NULL DEFAULT false,
  peak_viewers INT NOT NULL DEFAULT 0,
  total_viewers INT NOT NULL DEFAULT 0,
  likes BIGINT NOT NULL DEFAULT 0,
  diamonds BIGINT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT
);
CREATE INDEX IF NOT EXISTS rooms_status_idx ON rooms(status, started_at DESC);
CREATE INDEX IF NOT EXISTS rooms_host_idx ON rooms(host_id, started_at DESC);

CREATE TABLE IF NOT EXISTS room_admins (
  host_id BIGINT NOT NULL REFERENCES users(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  PRIMARY KEY (host_id, user_id)
);

CREATE TABLE IF NOT EXISTS pk_battles (
  id BIGSERIAL PRIMARY KEY,
  room_a BIGINT NOT NULL REFERENCES rooms(id),
  room_b BIGINT NOT NULL REFERENCES rooms(id),
  host_a BIGINT NOT NULL REFERENCES users(id),
  host_b BIGINT NOT NULL REFERENCES users(id),
  score_a BIGINT NOT NULL DEFAULT 0,
  score_b BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'invited',    -- invited | active | punishment | ended | declined
  duration INT NOT NULL DEFAULT 300,
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  winner BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_transactions (
  id BIGSERIAL PRIMARY KEY,
  sender_id BIGINT NOT NULL REFERENCES users(id),
  receiver_id BIGINT NOT NULL REFERENCES users(id),
  gift_id BIGINT NOT NULL REFERENCES gifts(id),
  qty INT NOT NULL DEFAULT 1,
  coins BIGINT NOT NULL,
  diamonds BIGINT NOT NULL,
  context TEXT NOT NULL DEFAULT 'room',      -- room | call | chat | moment
  room_id BIGINT,
  pk_id BIGINT,
  lucky_win BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gift_tx_sender_idx ON gift_transactions(sender_id, created_at);
CREATE INDEX IF NOT EXISTS gift_tx_receiver_idx ON gift_transactions(receiver_id, created_at);
CREATE INDEX IF NOT EXISTS gift_tx_created_idx ON gift_transactions(created_at);
CREATE INDEX IF NOT EXISTS gift_tx_room_idx ON gift_transactions(room_id);

CREATE TABLE IF NOT EXISTS calls (
  id BIGSERIAL PRIMARY KEY,
  caller_id BIGINT NOT NULL REFERENCES users(id),
  host_id BIGINT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'video',        -- video | audio
  mode TEXT NOT NULL DEFAULT 'direct',       -- direct | random
  rate INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ringing',    -- ringing | active | ended | rejected | missed
  livekit_room TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  seconds INT NOT NULL DEFAULT 0,
  coins BIGINT NOT NULL DEFAULT 0,
  diamonds BIGINT NOT NULL DEFAULT 0,
  rating INT,
  end_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  from_id BIGINT NOT NULL REFERENCES users(id),
  to_id BIGINT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'text',         -- text | image | voice | gift | sticker
  body TEXT,
  media_url TEXT,
  gift_id BIGINT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_pair_idx ON messages(LEAST(from_id,to_id), GREATEST(from_id,to_id), created_at DESC);
CREATE INDEX IF NOT EXISTS messages_to_idx ON messages(to_id, read_at);

CREATE TABLE IF NOT EXISTS follows (
  follower_id BIGINT NOT NULL REFERENCES users(id),
  followee_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS follows_followee_idx ON follows(followee_id);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id BIGINT NOT NULL REFERENCES users(id),
  blocked_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE IF NOT EXISTS profile_visits (
  user_id BIGINT NOT NULL REFERENCES users(id),
  visitor_id BIGINT NOT NULL REFERENCES users(id),
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS moments (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  body TEXT DEFAULT '',
  media_url TEXT,
  media_type TEXT,                           -- image | video
  likes INT NOT NULL DEFAULT 0,
  comments INT NOT NULL DEFAULT 0,
  gifts_coins BIGINT NOT NULL DEFAULT 0,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'visible',    -- visible | hidden | deleted
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moments_created_idx ON moments(created_at DESC);

CREATE TABLE IF NOT EXISTS moment_likes (
  moment_id BIGINT NOT NULL REFERENCES moments(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  PRIMARY KEY (moment_id, user_id)
);

CREATE TABLE IF NOT EXISTS moment_comments (
  id BIGSERIAL PRIMARY KEY,
  moment_id BIGINT NOT NULL REFERENCES moments(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS families (
  id BIGSERIAL PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  badge TEXT NOT NULL DEFAULT '🔥',
  owner_id BIGINT NOT NULL REFERENCES users(id),
  notice TEXT DEFAULT '',
  level INT NOT NULL DEFAULT 1,
  exp BIGINT NOT NULL DEFAULT 0,
  max_members INT NOT NULL DEFAULT 50,
  join_mode TEXT NOT NULL DEFAULT 'open',    -- open | approval
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS family_members (
  family_id BIGINT NOT NULL REFERENCES families(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',       -- owner | elder | member | pending
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);

CREATE TABLE IF NOT EXISTS family_messages (
  id BIGSERIAL PRIMARY KEY,
  family_id BIGINT NOT NULL REFERENCES families(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS store_items (
  id BIGSERIAL PRIMARY KEY,
  type TEXT NOT NULL,                        -- frame | mount | bubble | entry | badge
  name TEXT NOT NULL,
  preview TEXT NOT NULL,                     -- emoji / css token / image url
  anim_url TEXT,
  price BIGINT NOT NULL,
  duration_days INT NOT NULL DEFAULT 30,
  vip_level INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_items (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  item_id BIGINT NOT NULL REFERENCES store_items(id),
  expires_at TIMESTAMPTZ,
  equipped BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'purchase',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_items_user_idx ON user_items(user_id);

CREATE TABLE IF NOT EXISTS vip_levels (
  level INT PRIMARY KEY,
  name TEXT NOT NULL,
  price BIGINT NOT NULL,
  duration_days INT NOT NULL DEFAULT 30,
  perks JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS noble_ranks (
  rank INT PRIMARY KEY,
  name TEXT NOT NULL,
  price BIGINT NOT NULL,
  duration_days INT NOT NULL DEFAULT 30,
  cashback BIGINT NOT NULL DEFAULT 0,
  perks JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS fancy_ids (
  id BIGSERIAL PRIMARY KEY,
  number TEXT UNIQUE NOT NULL,
  price BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'available',  -- available | sold | reserved
  owner_id BIGINT REFERENCES users(id),
  sold_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS banners (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  image_url TEXT,
  color TEXT DEFAULT '#7c3aed',
  link TEXT,
  position TEXT NOT NULL DEFAULT 'home',     -- home | live | recharge
  countries TEXT[],
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT NOT NULL,                        -- gift_collect | gift_send | recharge | pk | live_hours
  description TEXT DEFAULT '',
  banner_url TEXT,
  gift_id BIGINT REFERENCES gifts(id),
  countries TEXT[],
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  rewards JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{rank_from,rank_to,coins,item_id}]
  rewarded BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tasks (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  metric TEXT NOT NULL,                      -- watch_minutes | send_gift | follow | live_minutes | chat | share
  target INT NOT NULL DEFAULT 1,
  reward_coins INT NOT NULL DEFAULT 0,
  for_hosts BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  sort INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS task_progress (
  user_id BIGINT NOT NULL REFERENCES users(id),
  task_key TEXT NOT NULL REFERENCES tasks(key),
  day DATE NOT NULL,
  progress INT NOT NULL DEFAULT 0,
  claimed BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, task_key, day)
);

CREATE TABLE IF NOT EXISTS ad_rewards (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  coins INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spins (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  prize TEXT NOT NULL,
  coins INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT REFERENCES users(id),
  target_type TEXT NOT NULL,                 -- user | room | moment | message | auto
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  details TEXT,
  screenshot_url TEXT,
  status TEXT NOT NULL DEFAULT 'open',       -- open | in_review | actioned | dismissed
  assigned_to BIGINT REFERENCES admin_users(id),
  action TEXT,
  handled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),       -- null = broadcast
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  segment JSONB,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id BIGINT NOT NULL REFERENCES notifications(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  PRIMARY KEY (notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS cms_pages (
  slug TEXT PRIMARY KEY,                     -- terms | privacy | host-policy | agency-policy | faq
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  agency_id BIGINT REFERENCES agencies(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  reply TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replied_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL,                  -- admin | agency | seller | system
  actor_id BIGINT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details JSONB,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS risk_flags (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id),
  kind TEXT NOT NULL,                        -- multi_account | gift_loop | rapid_recharge | self_gift
  score INT NOT NULL DEFAULT 50,
  details JSONB,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_metrics (
  day DATE PRIMARY KEY,
  new_users INT NOT NULL DEFAULT 0,
  dau INT NOT NULL DEFAULT 0,
  recharge_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  paying_users INT NOT NULL DEFAULT 0,
  coins_consumed BIGINT NOT NULL DEFAULT 0,
  diamonds_issued BIGINT NOT NULL DEFAULT 0,
  live_sessions INT NOT NULL DEFAULT 0,
  live_hours NUMERIC(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_active_days (
  user_id BIGINT NOT NULL REFERENCES users(id),
  day DATE NOT NULL,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS banned_devices (
  device_id TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS banned_ips (
  ip TEXT PRIMARY KEY,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS red_packets (
  id BIGSERIAL PRIMARY KEY,
  room_id BIGINT NOT NULL REFERENCES rooms(id),
  sender_id BIGINT NOT NULL REFERENCES users(id),
  coins BIGINT NOT NULL,
  parts INT NOT NULL,
  remaining_coins BIGINT NOT NULL,
  remaining_parts INT NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  refunded BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS red_packet_grabs (
  packet_id BIGINT NOT NULL REFERENCES red_packets(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  coins BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (packet_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_tickets (
  room_id BIGINT NOT NULL REFERENCES rooms(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  coins BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);

-- ---------- CP (couple) & Fan club ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS cp_user_id BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cp_since TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS cp_requests (
  id BIGSERIAL PRIMARY KEY,
  from_id BIGINT NOT NULL REFERENCES users(id),
  to_id BIGINT NOT NULL REFERENCES users(id),
  coins BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | accepted | rejected | ended
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cp_requests_to ON cp_requests(to_id, status);
CREATE TABLE IF NOT EXISTS fan_clubs (
  host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  intimacy BIGINT NOT NULL DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (host_id, user_id)
);
CREATE INDEX IF NOT EXISTS fan_clubs_user ON fan_clubs(user_id);

-- ---------- User safety: spend limits, recharge refunds, host withdrawals, agency invites ----------
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_limit_coins BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_limit_coins BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_limit_at TIMESTAMPTZ;
ALTER TABLE hosts ADD COLUMN IF NOT EXISTS agency_joined_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS refund_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  order_id BIGINT NOT NULL REFERENCES recharge_orders(id) UNIQUE,  -- one refund per order (idempotency)
  coins BIGINT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',        -- open | approved | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by BIGINT
);
CREATE INDEX IF NOT EXISTS refund_requests_user ON refund_requests(user_id, created_at);

CREATE TABLE IF NOT EXISTS withdrawals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  diamonds BIGINT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  method TEXT NOT NULL,
  account TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested',   -- requested | paid | rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  note TEXT
);
CREATE INDEX IF NOT EXISTS withdrawals_user ON withdrawals(user_id, created_at);

CREATE TABLE IF NOT EXISTS agency_invites (
  id BIGSERIAL PRIMARY KEY,
  agency_id BIGINT NOT NULL REFERENCES agencies(id),
  user_id BIGINT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'invited',     -- invited | accepted | declined
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS agency_invites_open ON agency_invites(agency_id, user_id) WHERE status = 'invited';

-- Test-artifact delivery: admin-uploaded binaries reachable only through
-- short-lived random-token links (hash stored, token never persisted).
CREATE TABLE IF NOT EXISTS test_artifacts (
  id BIGSERIAL PRIMARY KEY,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  size BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE test_artifacts ADD COLUMN IF NOT EXISTS data BYTEA;
ALTER TABLE test_artifacts ADD COLUMN IF NOT EXISTS parts JSONB;
ALTER TABLE test_artifacts ALTER COLUMN storage_path DROP NOT NULL;

CREATE TABLE IF NOT EXISTS test_artifact_links (
  id BIGSERIAL PRIMARY KEY,
  artifact_id BIGINT NOT NULL REFERENCES test_artifacts(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  downloads INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS appeals (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  payout_method TEXT,
  payout_account TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS appeals_user ON appeals(user_id, created_at DESC);
