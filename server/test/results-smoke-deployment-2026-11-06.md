# Smoke run vs approved test deployment (2026-11-06)

- Target: https://liveapp-server-ksvy.onrender.com (commit 3739cfd)
- Command: `API=https://liveapp-server-ksvy.onrender.com ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=<from env> USE_PASSWORD_AUTH=1 node test/smoke.mjs`
- Result: 35 passed, 0 failed.
- Auth note: run used USE_PASSWORD_AUTH=1 (synthetic smoke users via /auth/register + /auth/login) because the dev OTP path does not exist in production.
- Cash-out note: the exchange check passes on HTTP 400 as well, so it does not prove exchange executed; the suite never calls /host/withdraw. Settlement "paid" marking is admin bookkeeping with a dummy reference, not a real payout.
- No real user data, IDs, payments or payouts involved; all accounts synthetic.
