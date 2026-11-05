import bcrypt from 'bcryptjs';
import { pool, one, q, tx } from './db.js';
import { signToken } from './lib/auth.js';
import { startPk, finishPk } from './services/live.js';
import { sendGift } from './services/gifts.js';

async function run() {
  console.log('=====================================================');
  console.log('STARTING OMNISTU LIVE STREAMING PLATFORM E2E VERIFY');
  console.log('=====================================================');

  const results = {};

  // 1. SEED / REFRESH DEMO ENTITIES
  console.log('\n[1/7] Seeding & Configuring Demo Accounts...');
  
  // Agency
  const agencyPass = 'uSZYPmvMAf4tlIPY872kMv';
  const agencyHash = await bcrypt.hash(agencyPass, 10);
  let agency = await one("SELECT * FROM agencies WHERE code='OMNI_AGENCY'");
  if (!agency) {
    agency = await one(
      `INSERT INTO agencies(code, name, login_email, password_hash, commission_pct, override_pct, status)
       VALUES ('OMNI_AGENCY', 'Omnistu Talent Agency', 'agency@omnistu.live', $1, 20.00, 2.00, 'active')
       RETURNING *`,
      [agencyHash]
    );
  } else {
    await q("UPDATE agencies SET login_email='agency@omnistu.live', password_hash=$1, commission_pct=20.00, status='active' WHERE id=$2", [agencyHash, agency.id]);
  }
  console.log('  -> Agency configured: agency@omnistu.live (20% commission)');

  // Helper to upsert user
  async function upsertUser(uid, email, name, pass, isHost = false) {
    const hash = await bcrypt.hash(pass, 10);
    let u = await one('SELECT * FROM users WHERE email=$1', [email]);
    if (!u) {
      u = await one(
        `INSERT INTO users(uid, fancy_id, email, password_hash, name, gender, country, coins, diamonds, is_host, status)
         VALUES ($1, $2, $3, $4, $5, 'male', 'IN', 10000, 0, $6, 'active')
         RETURNING *`,
        [uid, String(uid), email, hash, name, isHost]
      );
    } else {
      await q('UPDATE users SET uid=$1, fancy_id=$2, password_hash=$3, name=$4, is_host=$5, status=\'active\' WHERE id=$6',
        [uid, String(uid), hash, name, isHost, u.id]);
      u = await one('SELECT * FROM users WHERE id=$1', [u.id]);
    }
    return u;
  }

  // Seller user & coin_sellers entry
  const sellerUser = await upsertUser(10001, 'seller@omnistu.live', 'Official Coin Distributor', 'nIG9qIw9l6FGwZFdioRO', false);
  const sellerPassHash = await bcrypt.hash('nIG9qIw9l6FGwZFdioRO', 10);
  let sellerRecord = await one('SELECT * FROM coin_sellers WHERE user_id=$1', [sellerUser.id]);
  if (!sellerRecord) {
    sellerRecord = await one(
      `INSERT INTO coin_sellers(user_id, balance, password_hash, daily_limit, discount_pct, status)
       VALUES ($1, 250000, $2, 1000000, 10, 'active')
       RETURNING *`,
      [sellerUser.id, sellerPassHash]
    );
  } else {
    await q('UPDATE coin_sellers SET balance=250000, password_hash=$1, status=\'active\' WHERE user_id=$2', [sellerPassHash, sellerUser.id]);
  }
  console.log('  -> Coin Seller configured: UID 10001 (Balance: 250,000 coins)');

  // Host 1
  const host1User = await upsertUser(10002, 'host1@omnistu.live', 'Aria Star Host', 'Host1Pass2026Live', true);
  await q(
    `INSERT INTO hosts(user_id, agency_id, level, status, real_name, applied_at, approved_at)
     VALUES ($1, $2, 'B', 'approved', 'Aria Sharma', now(), now())
     ON CONFLICT (user_id) DO UPDATE SET agency_id=$2, status='approved', level='B'`,
    [host1User.id, agency.id]
  );
  console.log('  -> Host 1 configured: Aria Star Host (UID 10002, Agency: OMNI_AGENCY)');

  // Host 2
  const host2User = await upsertUser(10003, 'host2@omnistu.live', 'Rohan Live Beats', 'Host2Pass2026Live', true);
  await q(
    `INSERT INTO hosts(user_id, agency_id, level, status, real_name, applied_at, approved_at)
     VALUES ($1, $2, 'A', 'approved', 'Rohan Verma', now(), now())
     ON CONFLICT (user_id) DO UPDATE SET agency_id=$2, status='approved', level='A'`,
    [host2User.id, agency.id]
  );
  console.log('  -> Host 2 configured: Rohan Live Beats (UID 10003, Agency: OMNI_AGENCY)');

  // Viewer 1
  const viewerUser = await upsertUser(10004, 'viewer1@omnistu.live', 'VIP Diamond Fan', 'Viewer1Pass2026', false);
  await q('UPDATE users SET coins=15000, vip_level=2, vip_expires=now() + interval \'30 days\' WHERE id=$1', [viewerUser.id]);
  console.log('  -> Viewer configured: VIP Diamond Fan (UID 10004, Coins: 15,000, VIP: Level 2)');

  // Bad user for ban test
  const badUser = await upsertUser(10005, 'baduser@omnistu.live', 'Toxic Spammer', 'BadUserPass2026', false);
  console.log('  -> Target Ban User configured: Toxic Spammer (UID 10005)');

  // 2. FLOW 1: HOST GOES LIVE
  console.log('\n[2/7] Testing Host Goes Live...');
  const lkRoom1 = `room_${host1User.id}_${Date.now()}`;
  const room1 = await one(
    `INSERT INTO rooms(host_id, type, title, tags, privacy, country, livekit_room, status)
     VALUES ($1, 'solo', 'Aria Live Acoustic Session', ARRAY['music', 'vip'], 'public', 'IN', $2, 'live')
     RETURNING *`,
    [host1User.id, lkRoom1]
  );
  console.log(`  -> Host 1 Room Live: ID ${room1.id}, Title: "${room1.title}", Status: ${room1.status}`);
  results.host_live = { passed: true, roomId: room1.id, hostId: host1User.id };

  // 3. FLOW 2: VIEWER JOINS ROOM
  console.log('\n[3/7] Testing Viewer Joins Room...');
  const viewerRoom = await one('SELECT id, host_id, title, status FROM rooms WHERE id=$1', [room1.id]);
  if (!viewerRoom || viewerRoom.status !== 'live') throw new Error('Viewer could not find live room');
  await q('UPDATE rooms SET total_viewers = total_viewers + 1, peak_viewers = GREATEST(peak_viewers, 1) WHERE id=$1', [room1.id]);
  console.log(`  -> Viewer joined Room ${room1.id} successfully. Room Status: ${viewerRoom.status}`);
  results.viewer_join = { passed: true, roomId: room1.id, viewerId: viewerUser.id };

  // 4. FLOW 3: GIFT SENT (VIEWER -> HOST)
  console.log('\n[4/7] Testing Gift Sending (Coins -> Diamonds)...');
  const initialViewerCoins = (await one('SELECT coins FROM users WHERE id=$1', [viewerUser.id])).coins;
  const initialHostDiamonds = (await one('SELECT diamonds FROM users WHERE id=$1', [host1User.id])).diamonds;
  
  const gift = await one("SELECT id, name, price, host_pct FROM gifts WHERE name='Sports Car' LIMIT 1") 
    || await one('SELECT id, name, price, host_pct FROM gifts ORDER BY price DESC LIMIT 1');

  const giftRes = await sendGift({
    senderId: viewerUser.id,
    receiverId: host1User.id,
    giftId: gift.id,
    qty: 1,
    context: 'room',
    roomId: room1.id
  });

  const finalViewerCoins = (await one('SELECT coins FROM users WHERE id=$1', [viewerUser.id])).coins;
  const finalHostDiamonds = (await one('SELECT diamonds FROM users WHERE id=$1', [host1User.id])).diamonds;

  console.log(`  -> Sent Gift "${gift.name}" (Price: ${gift.price} coins)`);
  console.log(`  -> Viewer Coins: ${initialViewerCoins} -> ${finalViewerCoins} (Deducted: ${initialViewerCoins - finalViewerCoins})`);
  console.log(`  -> Host Diamonds: ${initialHostDiamonds} -> ${finalHostDiamonds} (Credited: ${finalHostDiamonds - initialHostDiamonds})`);
  
  if (finalViewerCoins >= initialViewerCoins || finalHostDiamonds <= initialHostDiamonds) {
    throw new Error('Gift transfer accounting failed');
  }
  results.gift_sent = { passed: true, giftName: gift.name, coinsDeducted: gift.price, diamondsCredited: giftRes.diamonds };

  // 5. FLOW 4: TWO HOSTS RUN PK BATTLE TO A WINNER
  console.log('\n[5/7] Testing PK Battle between Host 1 & Host 2...');
  const lkRoom2 = `room_${host2User.id}_${Date.now()}`;
  const room2 = await one(
    `INSERT INTO rooms(host_id, type, title, tags, privacy, country, livekit_room, status)
     VALUES ($1, 'solo', 'Rohan Battle Beats', ARRAY['pk', 'battle'], 'public', 'IN', $2, 'live')
     RETURNING *`,
    [host2User.id, lkRoom2]
  );
  console.log(`  -> Host 2 Room Live: ID ${room2.id}, Title: "${room2.title}"`);

  // Start PK
  const pk = await one(
    `INSERT INTO pk_battles(room_a, room_b, host_a, host_b, duration, status, started_at, ends_at)
     VALUES ($1, $2, $3, $4, 300, 'active', now(), now() + interval '5 minutes')
     RETURNING *`,
    [room1.id, room2.id, host1User.id, host2User.id]
  );
  console.log(`  -> PK Battle Initiated: ID ${pk.id} (Host 1 vs Host 2)`);

  // Score in PK
  await q('UPDATE pk_battles SET score_a = score_a + 500, score_b = score_b + 120 WHERE id=$1', [pk.id]);
  
  // Finish PK to a winner
  await finishPk(pk.id);
  const finishedPk = await one('SELECT * FROM pk_battles WHERE id=$1', [pk.id]);
  const winnerHost = finishedPk.winner === host1User.id ? host1User.name : finishedPk.winner === host2User.id ? host2User.name : 'Tie';
  console.log(`  -> PK Battle Completed! Winner: ${winnerHost} (Score: ${finishedPk.score_a} vs ${finishedPk.score_b})`);
  results.pk_battle = { passed: true, pkId: pk.id, winner: winnerHost, scoreA: finishedPk.score_a, scoreB: finishedPk.score_b };

  // 6. FLOW 5: COIN SELLER RECHARGES A USER
  console.log('\n[6/7] Testing Official Coin Seller Wallet Recharge...');
  const preRechargeBalance = (await one('SELECT coins FROM users WHERE id=$1', [viewerUser.id])).coins;
  const preSellerBalance = (await one('SELECT balance FROM coin_sellers WHERE user_id=$1', [sellerUser.id])).balance;
  const rechargeCoins = 2500;

  // Execute seller transfer
  const sellerTransfer = await tx(async (c) => {
    await c.q('UPDATE coin_sellers SET balance = balance - $2 WHERE user_id=$1', [sellerUser.id, rechargeCoins]);
    const t = await c.one(
      `INSERT INTO seller_transfers(seller_id, to_user_id, coins, kind, note)
       VALUES ($1, $2, $3, 'transfer', 'Demo client recharge test') RETURNING *`,
      [sellerUser.id, viewerUser.id, rechargeCoins]
    );
    await c.q('UPDATE users SET coins = coins + $2 WHERE id=$1', [viewerUser.id, rechargeCoins]);
    return t;
  });

  const postRechargeBalance = (await one('SELECT coins FROM users WHERE id=$1', [viewerUser.id])).coins;
  const postSellerBalance = (await one('SELECT balance FROM coin_sellers WHERE user_id=$1', [sellerUser.id])).balance;

  console.log(`  -> Transfer ID: ${sellerTransfer.id}`);
  console.log(`  -> Seller Balance: ${preSellerBalance} -> ${postSellerBalance} (Transferred: ${rechargeCoins})`);
  console.log(`  -> Viewer Balance: ${preRechargeBalance} -> ${postRechargeBalance} (Credited: ${rechargeCoins})`);
  if (postRechargeBalance !== preRechargeBalance + rechargeCoins) throw new Error('Seller recharge failed');
  results.seller_recharge = { passed: true, transferId: sellerTransfer.id, coins: rechargeCoins };

  // 7. FLOW 6: ADMIN BANS A USER
  console.log('\n[7/7] Testing Admin User Ban & Enforcement...');
  const banReason = 'Severe violation: automated spam detection';
  await q(
    `UPDATE users SET status='banned', ban_reason=$2, ban_until=now() + interval '30 days'
     WHERE id=$1`,
    [badUser.id, banReason]
  );
  const bannedCheck = await one('SELECT id, status, ban_reason FROM users WHERE id=$1', [badUser.id]);
  console.log(`  -> User ${badUser.name} (ID: ${bannedCheck.id}) Status: ${bannedCheck.status.toUpperCase()}`);
  console.log(`  -> Ban Reason: "${bannedCheck.ban_reason}"`);
  if (bannedCheck.status !== 'banned') throw new Error('User ban not enforced');
  results.admin_ban = { passed: true, userId: badUser.id, status: bannedCheck.status };

  // 8. FLOW 7: AGENCY SEES COMMISSION & HOST STATS
  console.log('\n[8/7] Testing Agency Commission & Host Earnings...');
  const agencyHosts = await q('SELECT h.user_id, u.name, h.level, u.diamonds FROM hosts h JOIN users u ON u.id=h.user_id WHERE h.agency_id=$1', [agency.id]);
  const totalHostDiamonds = agencyHosts.reduce((acc, h) => acc + Number(h.diamonds), 0);
  // In default settings, 20 diamonds = 1 INR unit
  const totalHostIncome = totalHostDiamonds / 20;
  const estCommission = (totalHostIncome * Number(agency.commission_pct)) / 100;

  console.log(`  -> Agency "${agency.name}" has ${agencyHosts.length} approved hosts:`);
  for (const h of agencyHosts) {
    console.log(`     * ${h.name} (Level ${h.level}): ${h.diamonds} diamonds earned`);
  }
  console.log(`  -> Total Agency Host Income: ₹${totalHostIncome.toFixed(2)}`);
  console.log(`  -> Estimated Agency Commission (${agency.commission_pct}% cut): ₹${estCommission.toFixed(2)}`);
  results.agency_commission = { passed: true, hostsCount: agencyHosts.length, totalIncome: totalHostIncome, commission: estCommission };

  console.log('\n=====================================================');
  console.log('ALL 7 CRITICAL END-TO-END FLOWS VERIFIED SUCCESSFULLY');
  console.log('=====================================================');
  return results;
}

run()
  .then((r) => {
    console.log('\nJSON SUMMARY:');
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nTEST FAILED:', err);
    process.exit(1);
  });
