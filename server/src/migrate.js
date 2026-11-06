import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.js';

const dir = path.dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  await pool.query(sql);
  await relocatePrivateUploads();
}

// One-time, idempotent data migration: KYC and report files uploaded before
// the private mount (or before the class split) sit at public /uploads/... or
// classless /uploads-private/... paths. Move them into
// uploads/private/<class>/ and repoint the DB references. Copy-verify-delete:
// the original is removed only after the copy is confirmed on disk with the
// same byte size. Safe to run on every boot.
async function relocatePrivateUploads() {
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const jobs = [
    { table: 'hosts', pk: 'user_id', cols: ['selfie_url', 'id_doc_url'], cls: 'kyc' },
    { table: 'reports', pk: 'id', cols: ['screenshot_url'], cls: 'reports' },
  ];
  const relocateOne = async (job, col, row) => {
    const url = row.url;
    let rel; // path relative to uploadRoot
    if (url.startsWith('/uploads/')) {
      rel = url.slice('/uploads/'.length);
      if (rel.startsWith('private/')) return; // already inside the private tree
    } else if (url.startsWith('/uploads-private/')) {
      const r = url.slice('/uploads-private/'.length);
      if (r.startsWith(job.cls + '/')) return; // already in the right class
      if (r.includes('/') && ['kyc', 'reports'].includes(r.split('/')[0])) return; // other class: not ours to move
      rel = path.join('private', r);
    } else {
      return;
    }
    if (rel.includes('..')) return;
    const from = path.join(uploadRoot, rel);
    const monthRel = url.split('/').slice(-2).join('/'); // <month>/<file>
    if (monthRel.includes('..')) return;
    const to = path.join(uploadRoot, 'private', job.cls, monthRel);
    try {
      const size = fs.statSync(from).size;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      if (fs.statSync(to).size !== size) throw new Error('size mismatch after copy');
    } catch { return; } // missing/unreadable source or unverified copy: leave the reference untouched
    await pool.query(`UPDATE ${job.table} SET ${col}=$2 WHERE ${job.pk}=$1`, [row.pk, `/uploads-private/${job.cls}/${monthRel}`]);
    fs.unlink(from, () => {});
    console.log(`[migrate] moved ${job.table}.${col} #${row.pk} to private/${job.cls}`);
  };
  for (const job of jobs) {
    for (const col of job.cols) {
      let rows;
      try {
        rows = (await pool.query(
          `SELECT ${job.pk} AS pk, ${col} AS url FROM ${job.table}
           WHERE ${col} LIKE '/uploads/%' OR ${col} LIKE '/uploads-private/%'`)).rows;
      } catch (e) {
        console.warn(`[migrate] relocation scan skipped for ${job.table}.${col}:`, e.message);
        continue;
      }
      for (const row of rows) await relocateOne(job, col, row);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => { console.log('Schema ready'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
