// Server-sent events, read from a streamed response body (POST /api/coach/session answers `event: say|reply|error`
// with one JSON `data:` line each). Pure: the parser takes text in any chunking, the decoder bytes in any chunking.
// Follows the HTML spec's event-stream parsing: CR, LF or CRLF line ends, `:` comments, multi-line data joined with
// "\n", one optional space after the colon, an event dispatched on a blank line, nothing for a block without data.

export type SseEvent = {
  /** The `event:` name ('message' when none was given). */
  event: string;
  data: string;
  id?: string;
};

export type SseParser = {
  push(text: string): void;
  /** The stream ended: an unfinished last block (no blank line after it) is dropped, as the spec says. */
  end(): void;
};

export function createSseParser(onEvent: (e: SseEvent) => void): SseParser {
  let buffer = '';
  let crPending = false; // the last chunk ended in CR: a LF at the start of the next one belongs to it
  let event = '';
  let data: string[] = [];
  let id: string | undefined;
  let lastId: string | undefined;

  const line = (l: string) => {
    if (l === '') {
      if (data.length) onEvent({ event: event || 'message', data: data.join('\n'), ...(lastId !== undefined && { id: lastId }) });
      event = '';
      data = [];
      return;
    }
    if (l.startsWith(':')) return;
    const colon = l.indexOf(':');
    const field = colon < 0 ? l : l.slice(0, colon);
    let value = colon < 0 ? '' : l.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id' && !value.includes('\0')) { id = value; lastId = id; }
    // retry and unknown fields: ignored
  };

  return {
    push(text) {
      let s = text;
      if (crPending && s.startsWith('\n')) s = s.slice(1);
      crPending = false;
      buffer += s;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const c = buffer[i];
        if (c !== '\n' && c !== '\r') continue;
        line(buffer.slice(start, i));
        if (c === '\r') {
          if (i + 1 === buffer.length) crPending = true;
          else if (buffer[i + 1] === '\n') i++;
        }
        start = i + 1;
      }
      buffer = buffer.slice(start);
    },
    end() {
      buffer = '';
      event = '';
      data = [];
    },
  };
}

/** A streaming UTF-8 decoder: a character split across chunks comes out whole. Uses TextDecoder when there is one. */
export function createUtf8Decoder(useNative = typeof TextDecoder === 'function'): { decode(bytes: Uint8Array, final?: boolean): string } {
  if (useNative) {
    const d = new TextDecoder('utf-8');
    return { decode: (bytes, final = false) => d.decode(bytes, { stream: !final }) };
  }
  let pending: number[] = [];
  return {
    decode(bytes, final = false) {
      const all = pending.length ? [...pending, ...bytes] : Array.from(bytes);
      pending = [];
      let out = '';
      let i = 0;
      while (i < all.length) {
        const b = all[i];
        const need = b < 0x80 ? 0 : b < 0xc0 ? -1 : b < 0xe0 ? 1 : b < 0xf0 ? 2 : b < 0xf8 ? 3 : -1;
        if (need < 0) { out += '�'; i++; continue; }
        if (i + need >= all.length) { // the character's last bytes are in the next chunk
          if (!final) { pending = all.slice(i); break; }
          out += '�';
          break;
        }
        let cp = need === 0 ? b : b & (0xff >> (need + 2));
        let ok = true;
        for (let k = 1; k <= need; k++) {
          const c = all[i + k];
          if ((c & 0xc0) !== 0x80) { ok = false; break; }
          cp = (cp << 6) | (c & 0x3f);
        }
        if (!ok) { out += '�'; i++; continue; }
        out += String.fromCodePoint(cp);
        i += need + 1;
      }
      return out;
    },
  };
}
