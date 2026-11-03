import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { bad } from './util.js';

const KINDS = {
  image: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  video: ['.mp4', '.webm', '.mov'],
  audio: ['.m4a', '.mp3', '.webm', '.ogg', '.aac', '.wav'],
  anim: ['.json', '.svga', '.mp4', '.webp', '.gif', '.png', '.webm'],
};

export const uploadRoot = path.resolve(config.uploadDir);
fs.mkdirSync(uploadRoot, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const dir = path.join(uploadRoot, new Date().toISOString().slice(0, 7));
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase().slice(0, 6);
    cb(null, crypto.randomBytes(12).toString('hex') + ext);
  },
});

export function uploader(kinds = ['image']) {
  const allowed = new Set(kinds.flatMap((k) => KINDS[k] || []));
  return multer({
    storage,
    limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!allowed.has(ext)) return cb(bad(`File type ${ext || '?'} not allowed`));
      cb(null, true);
    },
  });
}

/** Public URL path for a stored file */
export function fileUrl(file) {
  if (!file) return null;
  const rel = path.relative(uploadRoot, file.path).split(path.sep).join('/');
  return `/uploads/${rel}`;
}
