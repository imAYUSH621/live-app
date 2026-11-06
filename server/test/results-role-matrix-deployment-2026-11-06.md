# Role-matrix results - test deployment (2026-11-06)

Suite: server/test/role-matrix.mjs (ORIGINAL role/capability matrix, 23 executed checks: 12 access-denied + 11 functional; recovered verbatim from the earlier run artifact and adapted).

Target: https://liveapp-server-ksvy.onrender.com (Render free test deployment, dummy data only).

Adaptations vs the original script (each intentional, no checks added or removed):
1. API base URL from env (API) instead of hardcoded localhost.
2. Admin credentials from env (ADMIN_EMAIL / ADMIN_PASSWORD) instead of a hardcoded password.
3. USE_PASSWORD_AUTH=1 path for creating synthetic users via /auth/register + /auth/login (OTP dev_code is correctly absent in production).
4. Recipient balance reads use GET /api/me (the app's actual profile endpoint, same one the smoke suite uses) instead of /api/users/me, which does not exist in this codebase (returns the JSON 404 not_found handler).

Result: 23 PASSED, 0 FAILED.

Coverage: role isolation (user/agency/seller/admin tokens cannot cross into each other's routes; unauthenticated access rejected), agency + seller setup, seller coin top-up by admin, seller -> user coin transfer (1200 coins credited to recipient, seller stock debited, overspend and negative amounts rejected, transfer history recorded), agency commissions and host lists.

Contains no credentials. Synthetic matrix-*@example.com users only.
