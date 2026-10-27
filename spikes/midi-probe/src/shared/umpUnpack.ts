// Reference model of modules/drum-midi/ios/UmpUnpack.swift, line for line, so its logic is unit-tested here (the
// Swift can't be compiled in this container). Not used by the app at runtime. Keep the two in sync by hand.

export function wordCount(mt: number): number {
  switch (mt) {
    case 0x0: case 0x1: case 0x2: case 0x6: case 0x7: return 1;
    case 0x3: case 0x4: case 0x8: case 0x9: case 0xa: return 2;
    case 0xb: case 0xc: return 3;
    default: return 4;
  }
}

export function systemDataCount(status: number): number {
  return status === 0xf1 || status === 0xf3 ? 1 : status === 0xf2 ? 2 : 0;
}

export function unpack(words: readonly number[]): number[] {
  const out: number[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i] >>> 0, mt = w >>> 28;
    switch (mt) {
      case 0x1: {
        const status = (w >>> 16) & 0xff;
        out.push(status);
        const n = systemDataCount(status);
        if (n >= 1) out.push((w >>> 8) & 0x7f);
        if (n >= 2) out.push(w & 0x7f);
        break;
      }
      case 0x2: {
        const status = (w >>> 16) & 0xff;
        out.push(status, (w >>> 8) & 0x7f);
        const type = status & 0xf0;
        if (type !== 0xc0 && type !== 0xd0) out.push(w & 0x7f);
        break;
      }
      case 0x3: {
        if (i + 1 >= words.length) break;
        const w2 = words[i + 1] >>> 0;
        const kind = (w >>> 20) & 0xf, count = Math.min(6, (w >>> 16) & 0xf);
        const data = [(w >>> 8) & 0x7f, w & 0x7f, (w2 >>> 24) & 0x7f, (w2 >>> 16) & 0x7f, (w2 >>> 8) & 0x7f, w2 & 0x7f];
        if (kind === 0x0 || kind === 0x1) out.push(0xf0);
        out.push(...data.slice(0, count));
        if (kind === 0x0 || kind === 0x3) out.push(0xf7);
        break;
      }
      default:
        break;
    }
    i += wordCount(mt);
  }
  return out;
}
