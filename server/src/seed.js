import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool, one, q } from './db.js';
import { config } from './config.js';

// Default data. Each block only runs when its table is empty, so re-running is safe.
const empty = async (table) => !(await one(`SELECT 1 FROM ${table} LIMIT 1`));

export async function seed() {
  if (await empty('admin_users')) {
    await q(`INSERT INTO admin_users(name, email, password_hash, role) VALUES ('Super Admin',$1,$2,'super_admin')`,
      [config.adminEmail.toLowerCase(), await bcrypt.hash(config.adminPassword, 10)]);
    console.log(`[seed] super admin: ${config.adminEmail}`);
  }

  if (await empty('agencies')) {
    await q(`INSERT INTO agencies(code, name, commission_pct, override_pct, status) VALUES ('OFFICIAL','Official Agency',0,0,'active')`);
  }

  if (await empty('host_levels')) {
    // 20 diamonds = ₹1 by default. Bonus paid only when monthly hours/days target is met.
    const levels = [
      ['N', 'New', 0, 0, 0, 0, 60, 0],
      ['D', 'Level D', 20000, 10, 7, 200, 80, 1],
      ['C', 'Level C', 60000, 25, 12, 800, 120, 2],
      ['B', 'Level B', 150000, 40, 18, 2500, 200, 3],
      ['A', 'Level A', 400000, 60, 20, 8000, 300, 4],
      ['S', 'Level S', 1000000, 80, 22, 25000, 500, 5],
    ];
    for (const l of levels) await q(`INSERT INTO host_levels(code, name, min_diamonds, min_hours, min_days, bonus_amount, max_call_rate, sort) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, l);
  }

  if (await empty('gifts')) {
    // [name, icon, effect, price, host%, category, vip]
    const gifts = [
      ['Rose', '🌹', 'css:float', 1, 50, 'normal', 0], ['Heart', '❤️', 'css:hearts', 5, 50, 'normal', 0],
      ['Kiss', '💋', 'css:float', 10, 55, 'normal', 0], ['Lollipop', '🍭', 'css:float', 15, 55, 'normal', 0],
      ['Chocolate', '🍫', 'css:float', 20, 55, 'normal', 0], ['Ice Cream', '🍦', 'css:float', 30, 55, 'normal', 0],
      ['Teddy', '🧸', 'css:bounce', 50, 60, 'normal', 0], ['Balloon', '🎈', 'css:balloons', 66, 60, 'normal', 0],
      ['Perfume', '🧴', 'css:sparkle', 99, 60, 'normal', 0], ['Bouquet', '💐', 'css:petals', 199, 60, 'normal', 0],
      ['Diamond Ring', '💍', 'css:sparkle', 299, 60, 'normal', 0], ['Champagne', '🍾', 'css:fireworks', 499, 60, 'normal', 0],
      ['Crown', '👑', 'css:crown', 520, 60, 'luxury', 0], ['Love Letter', '💌', 'css:hearts', 999, 60, 'luxury', 0],
      ['Sports Car', '🏎️', 'css:car', 1314, 60, 'luxury', 0], ['Motorbike', '🏍️', 'css:car', 1500, 60, 'luxury', 0],
      ['Private Jet', '🛩️', 'css:fly', 3000, 60, 'luxury', 0], ['Yacht', '🛥️', 'css:wave', 3999, 60, 'luxury', 0],
      ['Castle', '🏰', 'css:castle', 5200, 60, 'luxury', 0], ['Rocket', '🚀', 'css:rocket', 9999, 60, 'luxury', 0],
      ['Lion King', '🦁', 'css:roar', 13140, 60, 'luxury', 0], ['Dragon', '🐉', 'css:dragon', 19999, 60, 'luxury', 0],
      ['Planet', '🪐', 'css:galaxy', 52000, 60, 'luxury', 0], ['Universe', '🌌', 'css:galaxy', 99999, 60, 'luxury', 0],
      ['Lucky Clover', '🍀', 'css:float', 10, 10, 'lucky', 0], ['Lucky Star', '⭐', 'css:sparkle', 50, 10, 'lucky', 0],
      ['VIP Crown', '🫅', 'css:crown', 2000, 60, 'vip', 3], ['VIP Phoenix', '🐦‍🔥', 'css:dragon', 30000, 60, 'vip', 5],
      ['Diya', '🪔', 'css:sparkle', 101, 60, 'event', 0], ['Fireworks', '🎆', 'css:fireworks', 1001, 60, 'event', 0],
    ];
    let sort = 0;
    for (const g of gifts) await q(`INSERT INTO gifts(name, icon, anim_type, anim_url, price, host_pct, category, vip_level, sort) VALUES ($1,$2,'css',$3,$4,$5,$6,$7,$8)`, [...g, sort++]);
  }

  if (await empty('recharge_packages')) {
    const packs = [
      [100, 0, 10, 100], [500, 20, 50, 500], [1000, 50, 99, 1000], [2000, 150, 199, 0], [5000, 500, 499, 0],
      [10000, 1200, 999, 0], [20000, 3000, 1999, 0], [50000, 10000, 4999, 0],
    ];
    let s = 0;
    for (const [coins, bonus, price, first] of packs) {
      await q(`INSERT INTO recharge_packages(coins, bonus, price, currency, platform, first_bonus, sort) VALUES ($1,$2,$3,'INR','web',$4,$5)`, [coins, bonus, price, first, s]);
      await q(`INSERT INTO recharge_packages(coins, bonus, price, currency, platform, first_bonus, product_id, sort) VALUES ($1,$2,$3,'INR','android',$4,$5,$6)`, [coins, bonus, price, first, `coins_${coins}`, s++]);
    }
  }

  if (await empty('vip_levels')) {
    const vip = [
      [1, 'VIP 1', 300, { badge: true, colored_name: true }],
      [2, 'VIP 2', 1000, { badge: true, colored_name: true, see_visitors: true }],
      [3, 'VIP 3', 3000, { badge: true, colored_name: true, see_visitors: true, vip_gifts: true, entry_effect: true }],
      [4, 'VIP 4', 6000, { badge: true, colored_name: true, see_visitors: true, vip_gifts: true, entry_effect: true, anti_kick: true }],
      [5, 'VIP 5', 12000, { badge: true, colored_name: true, see_visitors: true, vip_gifts: true, entry_effect: true, anti_kick: true, special_frame: true }],
      [6, 'VIP 6', 30000, { badge: true, colored_name: true, see_visitors: true, vip_gifts: true, entry_effect: true, anti_kick: true, special_frame: true, top_of_list: true }],
      [7, 'VIP 7', 60000, { badge: true, colored_name: true, see_visitors: true, vip_gifts: true, entry_effect: true, anti_kick: true, special_frame: true, top_of_list: true, global_entry: true }],
    ];
    for (const [l, n, p, perks] of vip) await q(`INSERT INTO vip_levels(level, name, price, duration_days, perks) VALUES ($1,$2,$3,30,$4)`, [l, n, p, perks]);
  }

  if (await empty('noble_ranks')) {
    const nobles = [
      [1, 'Knight', 6000, 3000], [2, 'Baron', 18000, 9000], [3, 'Viscount', 50000, 25000],
      [4, 'Earl', 120000, 60000], [5, 'Duke', 300000, 150000], [6, 'King', 1000000, 500000],
    ];
    for (const [r, n, p, cb] of nobles) {
      await q(`INSERT INTO noble_ranks(rank, name, price, duration_days, cashback, perks) VALUES ($1,$2,$3,30,$4,$5)`,
        [r, n, p, cb, { throne_seat: r >= 2, anti_kick: r >= 3, global_entry: r >= 4, exclusive_gifts: r >= 5, monthly_cashback: cb }]);
    }
  }

  if (await empty('store_items')) {
    const items = [
      ['frame', 'Golden Ring', 'frame-gold', 300, 30, 0], ['frame', 'Neon Glow', 'frame-neon', 600, 30, 0], ['frame', 'Angel Wings', 'frame-wings', 1500, 30, 2],
      ['frame', 'Royal Crown', 'frame-crown', 5000, 30, 4],
      ['mount', 'Scooty', '🛵', 500, 7, 0], ['mount', 'Sports Car', '🏎️', 2000, 7, 0], ['mount', 'Lion', '🦁', 5000, 7, 2], ['mount', 'Dragon', '🐉', 15000, 7, 4], ['mount', 'Private Jet', '🛩️', 30000, 7, 5],
      ['bubble', 'Pink Love', 'bubble-pink', 200, 30, 0], ['bubble', 'Galaxy', 'bubble-galaxy', 800, 30, 1], ['bubble', 'Gold', 'bubble-gold', 2000, 30, 3],
      ['entry', 'Sparkle Entry', '✨', 800, 30, 0], ['entry', 'Fire Entry', '🔥', 2000, 30, 1], ['entry', 'Royal Entry', '👑', 6000, 30, 3],
      ['badge', 'Rich Kid', '💰', 1000, 30, 0], ['badge', 'Night Owl', '🦉', 300, 30, 0], ['badge', 'Top Fan', '⭐', 600, 30, 0],
    ];
    let s = 0;
    for (const it of items) await q(`INSERT INTO store_items(type, name, preview, price, duration_days, vip_level, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [...it, s++]);
  }

  if (await empty('fancy_ids')) {
    for (const [n, p] of [['888888', 50000], ['666666', 40000], ['999999', 40000], ['100000', 20000], ['520520', 15000], ['1314520', 15000], ['777777', 30000], ['123456', 10000], ['786786', 25000], ['108108', 12000]]) {
      await q(`INSERT INTO fancy_ids(number, price) VALUES ($1,$2)`, [n, p]);
    }
  }

  if (await empty('tasks')) {
    const t = [
      ['watch10', 'Watch lives for 10 minutes', 'watch_minutes', 10, 5, false],
      ['gift1', 'Send 1 gift', 'send_gift', 1, 10, false],
      ['follow3', 'Follow 3 people', 'follow', 3, 5, false],
      ['chat5', 'Send 5 messages', 'chat', 5, 5, false],
      ['moment1', 'Post a moment', 'post_moment', 1, 10, false],
      ['live60', 'Go live for 60 minutes', 'live_minutes', 60, 50, true],
    ];
    let s = 0;
    for (const x of t) await q(`INSERT INTO tasks(key, title, metric, target, reward_coins, for_hosts, sort) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [...x, s++]);
  }

  if (await empty('banners')) {
    await q(`INSERT INTO banners(title, color, link, position, sort) VALUES ('Welcome! Go live and say hi 🎥','#7c3aed','/host/apply','home',0),
             ('Welcome to the demo community 🎁','#db2777','/','home',1), ('First recharge bonus on small packs','#db2777',NULL,'recharge',0)`);
  }

  if (await empty('cms_pages')) {
    const pages = [
      ['terms', 'Terms of Service', 'By using this app you agree to: be 18 years or older; not post nudity, violence, hate or illegal content; not share personal contact details to move deals off the platform. Coins are a virtual currency, are non-refundable and cannot be exchanged for cash by users. We may suspend accounts that break these rules.\n\n(Replace this text with terms reviewed by your lawyer.)'],
      ['privacy', 'Privacy Policy', 'We collect your profile details, device ID, IP address and in-app activity to run the service, keep it safe and prevent fraud. Live streams may be monitored for safety. We do not sell your personal data. You can delete your account from Settings.\n\n(Replace with a DPDP-Act compliant policy reviewed by your lawyer.)'],
      ['host-policy', 'Host Policy', '1. Hosts must be 18+ and pass face verification.\n2. Monthly target: 25 live hours across 12 valid days (1 valid day = 60+ minutes live).\n3. Salary = income diamonds ÷ 20 (₹) + level bonus when the target is met.\n4. Not allowed: nudity, sleeping on live, showing no face, playing pre-recorded video, asking for money outside the app, fake gifting.\n5. Violations: warning → diamond deduction → suspension.'],
      ['agency-policy', 'Agency Policy', '1. Agencies recruit, train and manage hosts.\n2. Commission is a % of your hosts\' monthly approved salary (set per agency).\n3. Super agencies earn an override % on sub-agencies.\n4. Hosts may not be poached from other agencies.\n5. Commission is paid monthly after host settlements are approved.'],
      ['faq', 'FAQ', 'How do I get coins? Recharge in the wallet or buy from an official coin seller.\nHow do hosts get paid? Monthly, after the settlement is approved, to the payout account in Host Center.\nHow do I become a host? Profile → Become a Host → selfie + agency code.'],
    ];
    for (const p of pages) await q(`INSERT INTO cms_pages(slug, title, body) VALUES ($1,$2,$3)`, p);
  }

  if (await empty('events')) {
    const rose = await one(`SELECT id FROM gifts WHERE name='Rose'`);
    await q(`INSERT INTO events(title, type, description, gift_id, starts_at, ends_at, rewards)
             VALUES ('Rose Queen of the Week','gift_collect','Collect the most Roses this week. Top 3 hosts win coins!',$1, date_trunc('week', now()), date_trunc('week', now()) + interval '7 days', $2)`,
      [rose?.id || null, JSON.stringify([{ rank_from: 1, rank_to: 1, coins: 5000 }, { rank_from: 2, rank_to: 2, coins: 3000 }, { rank_from: 3, rank_to: 3, coins: 1000 }])]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { migrate } = await import('./migrate.js');
  migrate().then(seed).then(() => { console.log('Seed done'); return pool.end(); }).catch((e) => { console.error(e); process.exit(1); });
}
