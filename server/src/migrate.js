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
// the private mount existed sit under the public /uploads tree. Move them
// into uploads/private/<class>/ and repoint the DB references. Safe to run
// on every boot: it only touches rows whose URLs still start with /uploads/.
async function relocatePrivateUploads() {
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const jobs = [
    { table: 'hosts', pk: 'user_id', cols: ['selfie_url', 'id_doc_url'], cls: 'kyc' },
    { table: 'reports', pk: 'id', cols: ['screenshot_url'], cls: 'reports' },
  ];
  for (const job of jobs) {
    for (const col of job.cols) {
      let rows;
      try {
        rows = (await pool.query(`SELECT ${job.pk} AS pk, ${col} AS url FROM ${job.table} WHERE ${col} LIKE '/uploads/%'`)).rows;
      } catch (e) {
        console.warn(`[migrate] relocation scan skipped for ${job.table}.${col}:`, e.message);
        continue;
      }
      for (const row of rows) {
        const rel = row.url.slice('/uploads/'.length);
        if (rel.startsWith('private/') || rel.includes('..')) continue;
        const from = path.join(uploadRoot, rel);
        const to = path.join(uploadRoot, 'private', job.cls, rel);
        try {
          fs.mkdirSync(path.dirname(to), { recursive: true });
          fs.renameSync(from, to);
        } catch { continue; } // missing file: leave the reference untouched
        await pool.query(`UPDATE ${job.table} SET ${col}=$2 WHERE ${job.pk}=$1`, [row.pk, `/uploads-private/${job.cls}/${rel}`]);
        console.log(`[migrate] moved ${job.table}.${col} #${row.pk} to private/${job.cls}`);
      }
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => { console.log('Schema ready'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
