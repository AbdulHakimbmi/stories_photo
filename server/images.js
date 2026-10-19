// =============================================================================
//  images.js — turns an uploaded file into safe, bounded display images.
//   1. Looks at the first bytes (magic numbers) — the file name/type the client claims is ignored.
//   2. Decodes it with sharp (libvips). Anything that does not decode is rejected.
//   3. Applies EXIF orientation, flattens transparency, resizes, and RE-ENCODES to WebP.
//      sharp drops metadata (EXIF/GPS/ICC text) unless asked to keep it, so served files carry none.
//   The original upload is never written to disk: only the two derivatives are kept.
// =============================================================================
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './util.js';

sharp.cache(false);       // do not keep decoded files in memory between requests
sharp.concurrency(1);

const ASCII = (buf, from, to) => buf.subarray(from, to).toString('latin1');

/** Identify by content, never by file name. Returns 'jpeg' | 'png' | 'webp' or throws a friendly error. */
export function sniffFormat(buf) {
  if (buf.length < 16) throw new HttpError(400, 'invalid_image', 'That file is empty or too small to be a photograph.');
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (ASCII(buf, 0, 4) === 'RIFF' && ASCII(buf, 8, 12) === 'WEBP') return 'webp';
  const head = ASCII(buf, 0, 512).toLowerCase();
  if (ASCII(buf, 4, 8) === 'ftyp' && /(heic|heix|hevc|mif1|msf1|heim|heis|avif)/.test(ASCII(buf, 8, 32).toLowerCase())) {
    throw new HttpError(415, 'unsupported_heic',
      'HEIC/HEIF/AVIF photos are not supported yet. Please choose a JPEG, PNG or WebP photo (on an iPhone: Settings → Camera → Formats → Most Compatible, or share/export the photo as JPEG).');
  }
  if (head.includes('<svg') || head.startsWith('<?xml')) {
    throw new HttpError(415, 'unsupported_svg', 'SVG files are not accepted. Please choose a JPEG, PNG or WebP photograph.');
  }
  if (ASCII(buf, 0, 3) === 'GIF') throw new HttpError(415, 'unsupported_gif', 'GIF files are not accepted. Please choose a JPEG, PNG or WebP photograph.');
  if (buf[0] === 0x4d && buf[1] === 0x5a) throw new HttpError(415, 'unsupported_type', 'That looks like a program, not a photograph, so it was not accepted.');
  throw new HttpError(415, 'unsupported_type', 'That file type is not supported. Please choose a JPEG, PNG or WebP photograph.');
}

class Gate {
  constructor(n) { this.n = n; this.active = 0; this.queue = []; }
  async run(fn) {
    if (this.active >= this.n) await new Promise((r) => this.queue.push(r));
    this.active++;
    try { return await fn(); } finally { this.active--; const next = this.queue.shift(); if (next) next(); }
  }
}
const gate = new Gate(2); // at most two images decoded at once

/**
 * @returns {{ displayBuf:Buffer, thumbBuf:Buffer, width:number, height:number }}
 */
export async function processImage(buffer, cfg) {
  sniffFormat(buffer);
  return gate.run(async () => {
    try {
      const probe = sharp(buffer, { limitInputPixels: cfg.maxInputPixels, failOn: 'error' });
      const meta = await probe.metadata();
      if (!['jpeg', 'png', 'webp'].includes(meta.format)) {
        throw new HttpError(415, 'unsupported_type', 'That file type is not supported. Please choose a JPEG, PNG or WebP photograph.');
      }
      if (!meta.width || !meta.height || meta.width > cfg.maxInputDimension || meta.height > cfg.maxInputDimension) {
        throw new HttpError(413, 'dimensions_too_large', `That photograph is too large (over ${cfg.maxInputDimension}px on a side). Please choose a smaller photo.`);
      }
      const { data: displayBuf, info } = await sharp(buffer, { limitInputPixels: cfg.maxInputPixels, failOn: 'error' })
        .rotate()                                   // apply EXIF orientation, then forget it
        .flatten({ background: '#fbf4e6' })          // transparent PNGs sit on the cream card colour
        .resize({ width: cfg.displayMax, height: cfg.displayMax, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })                       // no .withMetadata(): EXIF/GPS are not carried over
        .toBuffer({ resolveWithObject: true });
      const thumbBuf = await sharp(displayBuf)
        .resize({ width: cfg.thumbMax, height: cfg.thumbMax, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78 })
        .toBuffer();
      return { displayBuf, thumbBuf, width: info.width, height: info.height };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      throw new HttpError(422, 'decode_failed', 'We could not read that photograph. It may be damaged. Please try another JPEG, PNG or WebP photo.');
    }
  });
}

/** Write both derivatives with server-chosen names. Returns the file names (not paths). */
export async function saveDerivatives(uploadsDir, sessionId, memoryId, { displayBuf, thumbBuf }) {
  const dir = path.join(uploadsDir, sessionId);
  await fs.mkdir(dir, { recursive: true });
  const displayFile = `${memoryId}-d.webp`;
  const thumbFile = `${memoryId}-t.webp`;
  try {
    await fs.writeFile(path.join(dir, displayFile), displayBuf, { flag: 'wx' });
    await fs.writeFile(path.join(dir, thumbFile), thumbBuf, { flag: 'wx' });
  } catch (err) {
    await Promise.allSettled([fs.rm(path.join(dir, displayFile), { force: true }), fs.rm(path.join(dir, thumbFile), { force: true })]);
    throw err;
  }
  return { displayFile, thumbFile };
}

/** Resolve a stored file name inside its session folder; refuses anything that escapes it. */
export function safeUploadPath(uploadsDir, sessionId, fileName) {
  if (!/^[a-f0-9]{8,64}-[dt]\.webp$/.test(fileName) || !/^[a-z0-9]{6,40}$/.test(sessionId)) return null;
  const base = path.resolve(uploadsDir, sessionId);
  const full = path.resolve(base, fileName);
  return full.startsWith(base + path.sep) ? full : null;
}

export async function deleteMemoryFiles(uploadsDir, sessionId, files) {
  for (const f of files) {
    if (!f) continue;
    const p = safeUploadPath(uploadsDir, sessionId, f);
    if (p) await fs.rm(p, { force: true });
  }
}

export async function deleteSessionFiles(uploadsDir, sessionId) {
  if (!/^[a-z0-9]{6,40}$/.test(sessionId)) return;
  await fs.rm(path.join(uploadsDir, sessionId), { recursive: true, force: true });
}
