// Writes the dotted-ground tile next to this file: `node src/ui/assets/makeDots.mjs` (from apps/mobile).
// The mockups' ground (docs/mockups/ipad/ipad.css --dots: radial-gradient(#ffffff66 1.6px, transparent 1.8px)
// 0 0 / 12px 12px): a white dot at 40% alpha centred in a 12 pt cell, at 1x, 2x and 3x. Screen tiles it.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = buf => {
  let c = 0xffffffff;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};

for (const scale of [1, 2, 3]) {
  const size = 12 * scale, inner = 1.6 * scale, outer = 1.8 * scale, c = size / 2, S = 8;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = [0]; // filter: none
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) {
        const d = Math.hypot(x + (i + 0.5) / S - c, y + (j + 0.5) / S - c);
        cover += d <= inner ? 1 : d >= outer ? 0 : (outer - d) / (outer - inner);
      }
      row.push(255, 255, 255, Math.round((cover / (S * S)) * 0x66));
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0))]);
  writeFileSync(join(here, `dots${scale > 1 ? `@${scale}x` : ''}.png`), png);
}
