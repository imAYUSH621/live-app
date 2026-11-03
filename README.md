# LiveApp — Mico/MIKA jaisi live streaming app (WebRTC, free stack)

Ek hi VPS par chalne wala poora system:

| Part | Folder | Kya hai |
|---|---|---|
| Backend API | `server/` | Node.js + Express + Socket.io + PostgreSQL + Redis |
| Live video (WebRTC) | Docker `livekit` | LiveKit open-source SFU — live, PK, multi-guest, party rooms |
| 1v1 calls (WebRTC P2P) | Docker `coturn` | Phone-to-phone video/voice; coturn sirf tab relay karta hai jab network block kare |
| User app | `web/` | React PWA (mobile browser me chalti hai, "Add to home screen") |
| Android APK | `mobile/` | Capacitor wrapper — wahi app, Play Store ke liye |
| Admin + Agency + Coin-seller panel | `admin/` | React, role-based |
| Deploy | `docker-compose.yml`, `deploy/` | Caddy (free auto-HTTPS), one-command installer |

Saare tools open-source / free hain. Paid sirf: domain (~₹800/saal), Google Play account ($25 ek baar).

---

## 1. VPS par deploy (15 minute)

**VPS chahiye:** Ubuntu 22.04/24.04, kam se kam 2 vCPU / 4 GB RAM, public IPv4, UDP ports open kar sakein.
(Oracle Always Free ARM bhi chalega — 2 OCPU / 12 GB.)

```bash
# 1. Code VPS par daalo (GitHub se clone karo ya zip upload karke unzip)
git clone https://github.com/<you>/liveapp.git && cd liveapp

# 2. Ek command
sudo bash deploy/install.sh
```

Installer poochega: domain, app name, email. Phir khud:
- Docker install, secrets generate, `.env` banata hai
- Firewall ports kholta hai (80, 443, 7881/tcp, 50000-50200/udp, 3478, 49160-49250/udp)
- Sab build + start karta hai, daily database backup lagata hai
- Aakhir me **admin login email + password** print karta hai

**DNS:** apne domain me 3 "A" records banao → VPS IP
`app.yourdomain.com`, `admin.yourdomain.com`, `live.yourdomain.com`
(Cloudflare use kar rahe ho to **grey cloud / DNS only** rakho — WebRTC proxy se nahi chalta.)

**Oracle / AWS / GCP:** cloud console ke firewall (Oracle: VCN → Security List) me bhi wahi ports kholne padte hain.

Kholo:
- User app: `https://app.yourdomain.com`
- Admin panel: `https://admin.yourdomain.com` (Admin & staff / Agency / Coin seller — teeno ka login yahin)

Update: `git pull && docker compose up -d --build` · Logs: `docker compose logs -f api`

---

## 2. Optional services (`.env` me bharo, phir `docker compose up -d`)

| Feature | Kya chahiye | Free? |
|---|---|---|
| Google login | `GOOGLE_CLIENT_ID` (console.cloud.google.com → OAuth Web client, origin `https://app.yourdomain.com`) | Free |
| Phone OTP | `OTP_PROVIDER=2factor` + `TWOFACTOR_API_KEY` (2factor.in). Bina iske `console` mode = OTP sirf logs me (testing) | ~₹0.15/SMS |
| Online recharge (UPI/card) | Razorpay keys + webhook `https://app.yourdomain.com/api/webhooks/razorpay` (event: payment.captured) | Per-transaction fee |
| Push notifications | Firebase service account JSON (ek line me) | Free |
| AI moderation of lives | Sightengine user/secret | Free tier |
| Chat translate | Apna LibreTranslate URL + Settings → Features → translate ON | Free (self-host) |

Bina Razorpay ke bhi coins bik sakte hain: **Coin sellers** (admin panel → Coin sellers) aur **Manual recharge** (UPI aaya → admin me credit).

---

## 3. Android APK (free, GitHub Actions se)

1. Code GitHub par push karo.
2. Repo → Settings → Secrets and variables → Actions → **Variables**: `APP_URL=https://app.yourdomain.com`, `APP_ID=com.yourbrand.live`, `APP_NAME=YourBrand`, (optional) `ADMOB_APP_ID`.
3. Actions → **Build Android APK** → Run workflow → ~8 minute baad APK/AAB download.
4. Play Store ke liye signing secrets add karo (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`) — workflow file me details.
5. Push notifications ke liye Firebase project ka `google-services.json` ka poora text secret `GOOGLE_SERVICES_JSON` me daalo (bina iske APK chalega, bas push band rahega).

Note: Google apne login ko app ke WebView me block karta hai, isliye APK me **phone OTP** login dikhta hai; Google login website (browser) par chalta hai.

Local build (Android Studio ho to): `cd mobile && APP_URL=https://app.yourdomain.com npm install && npm run setup && npm run apk:debug`

APK me: camera/mic permissions, AdMob rewarded ads ("ad dekho coins pao"), push notifications already wired hain.
AdMob ad unit ID admin → App settings → `admob_rewarded_id` me daalo (default Google test ad hai).

---

## 4. Features — kya kya bana hai

**User app**
- Login: phone OTP, Google, email, guest (device se); referral code, agency invite link
- Home: Popular / Nearby / New / Following / PK / Multi / Party / Game tabs, banners, quick links
- **Live room**: solo, multi-guest (3/6/9 seats, video), audio party room (8 seats), game/screen-share live
- Password / VIP-only / ticket show lives; beauty filter; flip camera; mic/cam toggle
- Chat (slow-mode, banned-word + phone-number filter), likes with floating hearts, entry effects (VIP/noble/ride), viewer list, top-3 contributors
- **Gifts**: 30 default gifts (normal, luxury, lucky, VIP, event), combos, full-screen animations, app-wide banner for big gifts; admin se Lottie/SVGA/MP4 3D animations upload
- **PK battles**: invite or random match, split screen, live score bar, timer, winner/punishment, top supporters
- Seats: request / accept / invite / lock / mute / remove; room admins; kick & mute (VIP4+/Noble3+ anti-kick)
- **Lucky bag (red packet)** in rooms
- **1v1 paid video/voice calls** (P2P WebRTC), per-minute billing, random match with gender filter, low-balance warning, gifts in call, rating
- Messages: text, photo, voice note, gift in chat, typing indicator
- Moments feed: photo/video posts, likes, comments, gifts on posts
- Profile, followers/following/friends, visitors (VIP2+), block, report, gift wall, pretty ID
- Wallet: coin packs (first-recharge bonus), Razorpay, diamonds → coins exchange, full history
- Store: VIP 1–7, Noble (Knight → King, cashback), frames, rides, chat bubbles, entry effects, badges, pretty IDs, bag/equip
- Rewards: 7-day check-in, lucky wheel, watch-ad coins, daily tasks, invite & earn %
- Rankings: rich / charm / PK / family — daily / weekly / monthly; events with leaderboards
- Families: create/join, roles, approvals, family chat, family ranking
- **Host Center**: monthly target tracker, estimated salary, level progress, daily income, fans analytics, call rate, payout account (UPI/bank/Payoneer), salary history
- Become a host: live selfie (camera only), ID photo, agency code
- Notifications, support tickets, Hindi/English, account delete, maintenance & force-update support

**Admin panel (role-based: super admin, ops, moderator, finance, BD, support, marketing)**
- Dashboard: real-time lives/online/PK/calls, today revenue/DAU/ARPPU, 14-day charts, top gifters/hosts/agencies, alerts
- Live monitoring: thumbnail grid (har 60s), auto-flag (AI + reports), invisible watch, warn host, stop live + block, PK & calls control, past lives
- Reports queue, risk & fraud scan (multi-account, self-gifting, gift loops, rapid recharge), moments moderation, banned devices/IPs
- Users: search by ID/phone/email/device/IP, full profile + ledger + recharges + same-device accounts, ban (device/IP), restrict, freeze wallet, add/deduct coins/diamonds, VIP/noble/pretty ID
- Hosts: application queue (selfie + ID), approve/reject/suspend/warn/deduct, levels, tags, boost, agency move
- Agencies: hierarchy (super agency → agency → sub-agent), commission %, override %, BD manager, performance & growth
- Money: recharge orders (mark paid / refund), manual recharge, **monthly salary settlement** (calculate → approve → pay → CSV), agency commissions, coin sellers (wholesale issue, limits, history), ledger & P&L, economy settings, coin packages
- Content: gifts (with animation upload), store items, VIP, noble, pretty IDs, events (+ auto reward distribution), banners, daily tasks, rankings (exclude cheaters), notifications (segmented + push), flash banner, CMS pages, host level salary sheet, families
- System: staff & roles, 2FA (Google Authenticator), audit log of every action, app settings & feature switches, support tickets, analytics (retention cohorts, funnel, gift sales, countries)

**Agency panel**: overview, invite code/link, hosts with target risk (on track / at risk), host application approval, reminders, commission statements, payout account, sub-agents, help tickets, policies.

**Coin-seller panel**: balance, find user by ID, transfer coins, daily limit, history.

---

## 5. Gift animations (3D)

Default gifts emoji + built-in animations use karte hain. Ultra-realistic 3D ke liye:
1. Designer se **Lottie (.json)**, **SVGA (.svga)** ya transparent **MP4** banwao (LottieFiles par free/paid bhi milte hain).
2. Admin → Gifts → Edit → Animation type chuno → file upload.
3. Turant sab users ko dikhne lagega.

---

## 6. Kitne users free VPS par?

Video bandwidth asli limit hai. ~0.6–1 Mbps per viewer (480p). 1 Gbps port + 10 TB/month par roughly 300–500 viewers ek saath.
Badhne par: LiveKit ke aur nodes jodo (wahi Redis), ya LiveKit Cloud — code same rahega.
1v1 calls P2P hain to server bandwidth almost zero (sirf TURN relay waale calls).

---

## 7. Zaroori — launch se pehle

- **Lucky gift by default OFF hai** (chance-based). India ke online gaming kanoon ke wajah se lawyer se poochkar hi ON karo (Admin → Settings → Features). Coin-bet wale casino games (Teen Patti, Greedy) jaan-boojhkar shamil **nahi** kiye.
- **Google Play policy:** app ke andar digital coins Play Billing se bechne hote hain. Abhi Razorpay web recharge + coin sellers hain; Play par publish karne se pehle Play Billing plugin lagana padega (packages me `android` platform + product IDs already hain).
- Terms, Privacy (DPDP Act), Host & Agency policy ka text admin → Pages me hai — lawyer se review karwao.
- 18+ check, report/block, moderation queue already hai — Play Store UGC policy ke liye zaroori.
- iOS ke liye Capacitor iOS + Apple developer account ($99/saal) chahiye.
- "Ad dekho, coins pao" ka reward app khud confirm karta hai; daily limit + cooldown (Admin → Settings → Ads) se misuse control hota hai. Coins ka reward chhota rakho.

---

## 8. Local development

```bash
# Postgres + Redis chahiye (ya: docker compose up -d postgres redis)
cd server && cp ../.env.example .env   # DATABASE_URL, REDIS_URL local wale set karo
npm install && npm run dev             # http://localhost:4000 (schema + default data khud ban jata hai)
cd ../web && npm install && npm run dev       # http://localhost:5173
cd ../admin && npm install && npm run dev     # http://localhost:5174
# LiveKit local: docker run --rm -p 7880:7880 -p 7881:7881 -p 50000-50200:50000-50200/udp livekit/livekit-server --dev
```

Default admin (local): `admin@example.com` / `Admin@12345` (env se change).

**Test:** server chalu ho to `cd server && API=http://localhost:4000 ADMIN_EMAIL=... ADMIN_PASSWORD=... npm test` — 32 end-to-end checks (login, host apply, live, chat, gifts, seats, red packet, PK, kick, 1v1 call billing, DMs, moments, VIP/store, family, rewards, settlement, coin seller, reports, admin pages, ban).
