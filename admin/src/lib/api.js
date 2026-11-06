export const API_URL = import.meta.env.VITE_API_URL || '';
export const session = {
  get: () => JSON.parse(localStorage.getItem('panel') || 'null'),
  set: (s) => (s ? localStorage.setItem('panel', JSON.stringify(s)) : localStorage.removeItem('panel')),
};

export class ApiError extends Error {
  constructor(m, status, data) { super(m); this.status = status; this.data = data; }
}

export async function api(path, { method = 'GET', body, form, raw } = {}) {
  const s = session.get();
  const headers = {};
  if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(`${API_URL}/api${path}`, { method, headers, body: payload });
  if (raw) return res;
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (!res.ok) {
    if (res.status === 401 && !path.endsWith('/login')) { session.set(null); window.location.href = '/'; }
    throw new ApiError(data?.error || `Error ${res.status}`, res.status, data);
  }
  return data;
}
export const get = (p) => api(p);
export const post = (p, b) => api(p, { method: 'POST', body: b || {} });
export const put = (p, b) => api(p, { method: 'PUT', body: b || {} });
export const patch = (p, b) => api(p, { method: 'PATCH', body: b || {} });
export const del = (p) => api(p, { method: 'DELETE' });
export const media = (u) => (!u ? null : /^(https?:|data:|blob:)/.test(u) ? u : `${API_URL}${u}`);

export async function downloadCsv(path, name) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.csv`;
  a.click();
}

export const num = (n) => Number(n || 0).toLocaleString('en-IN');
export const money = (n, c = 'INR') => (c === 'INR' ? '₹' : `${c} `) + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
export const dt = (d) => (d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—');
export const lastMonth = () => new Date(Date.now() - 15 * 864e5).toISOString().slice(0, 7);

// Private uploads (KYC docs, report evidence) need the admin bearer header,
// so <img>/<a> cannot load them directly. Fetch as an authenticated blob and
// hand out an object URL; callers revoke it on unmount.
export async function fetchPrivateMedia(u) {
  const s = session.get();
  const res = await fetch(`${API_URL}${u}`, { headers: s?.token ? { Authorization: `Bearer ${s.token}` } : {} });
  if (!res.ok) throw new ApiError(`Error ${res.status}`, res.status);
  return URL.createObjectURL(await res.blob());
}
