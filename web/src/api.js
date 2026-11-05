// API helper: JSON requests with the saved login token.
const TOKEN_KEY = 'liveapp_token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

export function getApiBase() {
  if (typeof window !== 'undefined') {
    if (window.__API_URL__) return window.__API_URL__.replace(/\/$/, '');
    try {
      const stored = localStorage.getItem('liveapp_api_url');
      if (stored) return stored.replace(/\/$/, '');
    } catch { /* private mode */ }
  }
  try {
    if (import.meta?.env?.VITE_API_URL) return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  } catch { /* ignore */ }
  return '';
}

export function assetUrl(url) {
  if (!url) return url;
  if (/^https?:\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  const base = getApiBase();
  if (base && url.startsWith('/')) return `${base}${url}`;
  return url;
}

export class ApiErr extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  const base = getApiBase();
  const res = await fetch(`${base}/api${path}`, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    if (res.status === 401 && t) { setToken(null); window.dispatchEvent(new Event('liveapp:logout')); }
    if (res.status === 403 && data?.error === 'banned') window.dispatchEvent(new Event('liveapp:banned'));
    const err = new ApiErr(res.status, data?.error, data?.message || 'Something went wrong');
    err.data = data;
    throw err;
  }
  return data;
}

export const fmt = (n) => {
  n = Number(n || 0);
  if (n >= 1e7) return `${(n / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
};
export const rupees = (paise) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
export const uidKey = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
