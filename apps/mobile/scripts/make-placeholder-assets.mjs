#!/usr/bin/env node
// Writes the placeholder app icon and splash image (assets/icon.png, assets/splash-icon.png): a drum head seen from
// above. No dependencies (a tiny PNG encoder). Re-run after changing the colours: node scripts/make-placeholder-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
/** @param {Buffer} buf */
const crc32 = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
/** @param {string} type @param {Buffer} data */
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/**
 * @param {number} size
 * @param {boolean} alpha  RGBA (splash) or RGB (iOS app icons must not have an alpha channel)
 * @param {(x: number, y: number) => number[]} pixel  [r, g, b, a]
 */
function png(size, alpha, pixel) {
  const ch = alpha ? 4 : 3;
  const raw = Buffer.alloc((size * ch + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * ch + 1);
    for (let x = 0; x < size; x++) {
      const p = pixel(x, y);
      for (let i = 0; i < ch; i++) raw[row + 1 + x * ch + i] = p[i];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const NAVY = [31, 58, 95];
const HEAD = [246, 244, 239];
const RIM = [214, 92, 54];

/** A drum head: rim ring, head, and a small centre dot. r is 0..1 of the half size. */
function drum(r) {
  if (r > 0.78) return null;
  if (r > 0.66) return RIM;
  if (r < 0.07) return NAVY;
  return HEAD;
}

mkdirSync(out, { recursive: true });
const ICON = 1024;
writeFileSync(join(out, 'icon.png'), png(ICON, false, (x, y) => {
  const r = Math.hypot(x + 0.5 - ICON / 2, y + 0.5 - ICON / 2) / (ICON / 2);
  return drum(r) ?? NAVY;
}));
const SPLASH = 512;
writeFileSync(join(out, 'splash-icon.png'), png(SPLASH, true, (x, y) => {
  const r = Math.hypot(x + 0.5 - SPLASH / 2, y + 0.5 - SPLASH / 2) / (SPLASH / 2);
  const c = r > 0.78 ? null : r < 0.07 ? NAVY : r > 0.66 ? RIM : NAVY.map((v, i) => Math.round(v * 0.15 + HEAD[i] * 0.85));
  return c ? [...c, 255] : [0, 0, 0, 0];
}));
console.log(`wrote ${join(out, 'icon.png')} and ${join(out, 'splash-icon.png')}`);
