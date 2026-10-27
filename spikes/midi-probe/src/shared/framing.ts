// MIDI 1.0 byte-stream framing: splits a run of bytes into complete messages. New for Gate 0 (the web app gets framed
// messages from Web MIDI); moves to @drum-coach/core in A1.
//
// The iOS module forwards one CoreMIDI packet as one byte run. A packet can hold several messages, with realtime
// bytes (0xF8 clock, 0xFE active sensing) interleaved, possibly inside another message, and a source may use running
// status. Framing lives here, in tested TypeScript, so the native side only forwards bytes and a timestamp.

/** Data bytes after a status byte; undefined for statuses that are not a framed message here (sysex, F4/F5, F7). */
export function dataLength(status: number): number | undefined {
  if (status >= 0x80 && status < 0xf0) return (status & 0xf0) === 0xc0 || (status & 0xf0) === 0xd0 ? 1 : 2;
  switch (status) {
    case 0xf1: case 0xf3: return 1;
    case 0xf2: return 2;
    case 0xf6: return 0;
    default: return undefined;
  }
}

export const isRealtime = (b: number) => b >= 0xf8;

export type FramerStats = { messages: number; droppedBytes: number; sysex: number };

export type Framer = {
  /** Bytes in arrival order; returns every message completed by them (earlier incomplete bytes are kept). */
  push(bytes: ArrayLike<number>): number[][];
  reset(): void;
  readonly stats: FramerStats;
};

export const MAX_SYSEX = 4096;

export function createFramer(): Framer {
  let running = 0; // channel running status, 0 = none
  let pending: number[] = []; // a message being assembled: [status, ...data]
  let need = 0; // data bytes still missing for `pending`
  let sysex: number[] | null = null;
  const stats: FramerStats = { messages: 0, droppedBytes: 0, sysex: 0 };

  const emit = (out: number[][], msg: number[]) => { out.push(msg); stats.messages++; };
  const dropPending = () => {
    if (pending.length) stats.droppedBytes += pending.length;
    pending = []; need = 0;
  };

  return {
    stats,
    reset() {
      running = 0; pending = []; need = 0; sysex = null;
    },
    push(bytes) {
      const out: number[][] = [];
      for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i] & 0xff;
        if (isRealtime(b)) { emit(out, [b]); continue; } // never touches running status or a message in progress
        if (sysex) {
          if (b === 0xf7) { sysex.push(b); stats.sysex++; emit(out, sysex); sysex = null; continue; }
          if (b < 0x80) { if (sysex.length < MAX_SYSEX) sysex.push(b); else stats.droppedBytes++; continue; }
          stats.droppedBytes += sysex.length; sysex = null; // unterminated sysex: a new status ends it, then is handled below
        }
        if (b >= 0x80) {
          dropPending(); // a status before the previous message completed: the old bytes are lost
          if (b === 0xf0) { running = 0; sysex = [b]; continue; }
          const len = dataLength(b);
          if (b >= 0xf0) running = 0; // system common clears running status (MIDI 1.0 spec)
          if (len === undefined) { stats.droppedBytes++; continue; } // F4, F5, stray F7
          if (b < 0xf0) running = b;
          if (len === 0) { emit(out, [b]); continue; }
          pending = [b]; need = len;
          continue;
        }
        // data byte
        if (!need) {
          if (!running) { stats.droppedBytes++; continue; } // no status to belong to
          pending = [running]; need = dataLength(running)!; // running status
        }
        pending.push(b);
        if (--need === 0) { emit(out, pending); pending = []; }
      }
      return out;
    },
  };
}
