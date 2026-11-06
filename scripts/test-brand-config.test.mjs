// Repeatable test: admin-set brand name flows /admin/settings/app -> /api/config
// -> web store (appName) -> login/home/desktop nav/tab title surfaces.
// Run: node scripts/test-brand-config.test.mjs
import { readFileSync } from 'node:fs';
let failures = 0;
function check(name, cond, extra='') { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' [' + extra + ']' : ''}`); if (!cond) failures++; }

const store = readFileSync(new URL('../web/src/store.jsx', import.meta.url), 'utf8');
check('store maps server app.name to appName', store.includes('cfg?.app?.name') && store.includes('appName'));
check('store sets the browser tab title from the brand', store.includes('document.title = appName'));

const nav = readFileSync(new URL('../web/src/components/DesktopNav.jsx', import.meta.url), 'utf8');
check('desktop nav brand reads config (not hardcoded)', nav.includes('config.appName') && !nav.includes('>OMNISTU LIVE<'));

const login = readFileSync(new URL('../web/src/pages/Login.jsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../web/src/pages/Home.jsx', import.meta.url), 'utf8');
check('login + home consume config.appName', login.includes('config.appName') && home.includes('config.appName'));

const discover = readFileSync(new URL('../server/src/routes/discover.js', import.meta.url), 'utf8');
check('server /config emits admin-set app.name', /app:\s*{[^}]*name:\s*s\.app\.name/.test(discover));

const admin = readFileSync(new URL('../server/src/routes/admin.js', import.meta.url), 'utf8');
check('admin settings write route exists for the app section', admin.includes("r.put('/admin/settings/:section'"));

// Login page welcome + create-account copy follow the brand too (no hardcoded name)
const loginPage = readFileSync(new URL('../web/src/pages/Login.jsx', import.meta.url), 'utf8');
check('Login welcome heading follows the brand', !loginPage.includes('Welcome to Omnistu Live</h2>') && loginPage.includes("Welcome to {config.appName || 'Omnistu Live'}"));
check('Login create-account copy follows the brand', !loginPage.includes('New to Omnistu Live?') && loginPage.includes("New to ${config.appName || 'Omnistu Live'}"));

console.log(failures ? `${failures} FAILED` : 'ALL PASS');
process.exit(failures ? 1 : 0);
