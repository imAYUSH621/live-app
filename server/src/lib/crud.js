import { q, one } from '../db.js';
import { adminAuth } from './auth.js';
import { notFound, need } from './util.js';
import { audit } from './audit.js';
import { uploader, fileUrl } from './upload.js';

/**
 * Generic admin CRUD for simple config tables.
 * cols: { colName: 'text' | 'int' | 'num' | 'bool' | 'json' | 'date' | 'array' }
 * files: { colName: ['image'|'anim'|...] } -> multipart uploads saved into that column
 */
export function crud(router, path, table, { pk = 'id', module, cols, order = `${pk}`, files = {}, afterChange } = {}) {
  const auth = adminAuth(module);
  const fileFields = Object.keys(files);
  const up = fileFields.length
    ? uploader([...new Set(Object.values(files).flat())]).fields(fileFields.map((name) => ({ name, maxCount: 1 })))
    : (_req, _res, next) => next();

  const cast = (type, v) => {
    if (v === undefined) return undefined;
    if (v === '' || v === null) return type === 'bool' ? false : null;
    switch (type) {
      case 'int': return parseInt(v, 10);
      case 'num': return Number(v);
      case 'bool': return v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
      case 'json': return typeof v === 'string' ? JSON.parse(v) : v;
      case 'array': return Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean);
      default: return String(v);
    }
  };

  const collect = (req) => {
    const data = {};
    for (const [c, t] of Object.entries(cols)) {
      const v = cast(t, req.body[c]);
      if (v !== undefined) data[c] = t === 'json' && v !== null ? JSON.stringify(v) : v;
    }
    for (const f of fileFields) if (req.files?.[f]?.[0]) data[f] = fileUrl(req.files[f][0]);
    return data;
  };

  router.get(`/admin/${path}`, auth, async (_req, res) => res.json(await q(`SELECT * FROM ${table} ORDER BY ${order}`)));

  router.post(`/admin/${path}`, auth, up, async (req, res) => {
    const data = collect(req);
    if (req.body[pk] !== undefined && pk !== 'id') data[pk] = cast(cols[pk] || 'text', req.body[pk]);
    const keys = Object.keys(data);
    need(keys.length, 'No data');
    const row = await one(`INSERT INTO ${table}(${keys.join(',')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, keys.map((k) => data[k]));
    await audit(req, `${path}.create`, table, row[pk], data);
    afterChange?.();
    res.json(row);
  });

  router.put(`/admin/${path}/:pk`, auth, up, async (req, res) => {
    const data = collect(req);
    delete data[pk];
    const keys = Object.keys(data);
    need(keys.length, 'No data');
    const row = await one(`UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE ${pk}=$1 RETURNING *`, [req.params.pk, ...keys.map((k) => data[k])]);
    if (!row) throw notFound();
    await audit(req, `${path}.update`, table, req.params.pk, data);
    afterChange?.();
    res.json(row);
  });

  router.delete(`/admin/${path}/:pk`, auth, async (req, res) => {
    try {
      await q(`DELETE FROM ${table} WHERE ${pk}=$1`, [req.params.pk]);
    } catch (e) {
      // referenced rows (e.g. a gift already sent) can't be deleted -> deactivate instead
      if (e.code === '23503' && cols.active) await q(`UPDATE ${table} SET active=false WHERE ${pk}=$1`, [req.params.pk]);
      else throw e;
    }
    await audit(req, `${path}.delete`, table, req.params.pk);
    afterChange?.();
    res.json({ ok: true });
  });
}
