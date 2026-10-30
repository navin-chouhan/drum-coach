import { describe, expect, it } from 'vitest';
import { createSseParser, createUtf8Decoder, type SseEvent } from './sse';

const parse = (chunks: string[]) => {
  const out: SseEvent[] = [];
  const p = createSseParser(e => out.push(e));
  for (const c of chunks) p.push(c);
  p.end();
  return out;
};
// What server/index.ts writes for /api/coach/session
const SERVER = 'event: say\ndata: "Nice and even"\n\nevent: reply\ndata: {"say":"Nice and even","screen":"Relax"}\n\n';

describe('createSseParser', () => {
  it('reads the server session stream', () => {
    expect(parse([SERVER])).toEqual([
      { event: 'say', data: '"Nice and even"' },
      { event: 'reply', data: '{"say":"Nice and even","screen":"Relax"}' },
    ]);
  });

  it('gives the same events however the text is split', () => {
    const whole = parse([SERVER]);
    for (let size = 1; size <= 7; size++) {
      const chunks = SERVER.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g'))!;
      expect(parse(chunks), String(size)).toEqual(whole);
    }
  });

  it('handles CRLF and CR line ends, also split between chunks', () => {
    const crlf = SERVER.replace(/\n/g, '\r\n');
    expect(parse([crlf])).toEqual(parse([SERVER]));
    expect(parse(crlf.split(''))).toEqual(parse([SERVER]));
    expect(parse([SERVER.replace(/\n/g, '\r')])).toEqual(parse([SERVER]));
  });

  it('follows the spec for comments, multi-line data, the default name, spaces and ids', () => {
    expect(parse([': keep-alive\n\ndata: a\ndata:b\ndata:  c\n\nid: 7\nevent: x\ndata\n\nretry: 10\nfoo: bar\n\n'])).toEqual([
      { event: 'message', data: 'a\nb\n c' },
      { event: 'x', data: '', id: '7' },
    ]);
  });

  it('drops an unfinished last block and a block without data', () => {
    expect(parse(['event: say\n\n', 'event: reply\ndata: {"say":"cut'])).toEqual([]);
  });
});

describe('createUtf8Decoder', () => {
  const text = 'Groove ✓ é 🥁 done';
  const bytes = new TextEncoder().encode(text);
  for (const native of [true, false]) {
    it(`${native ? 'native' : 'fallback'}: decodes characters split across chunks`, () => {
      for (let size = 1; size <= 5; size++) {
        const d = createUtf8Decoder(native);
        let out = '';
        for (let i = 0; i < bytes.length; i += size) out += d.decode(bytes.subarray(i, i + size));
        out += d.decode(new Uint8Array(), true);
        expect(out, String(size)).toBe(text);
      }
    });
    it(`${native ? 'native' : 'fallback'}: replaces bad bytes and a cut-off end`, () => {
      const d = createUtf8Decoder(native);
      expect(d.decode(new Uint8Array([0x61, 0xff, 0x62]))).toBe('a�b');
      expect(d.decode(new Uint8Array([0xe2, 0x9c]), true)).toBe('�');
    });
  }
});
