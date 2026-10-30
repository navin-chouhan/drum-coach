// Gate 0 probe core: everything that happens to a native MIDI event in JavaScript, as one pure, testable object.
// framing → classify (counters, log) → parseMidiMessage → bounce/crosstalk filter → hit.
// New for the spike; the hit path (parseMidiMessage + the filter) is the web app's, copied unchanged.

import { classify, toHex, type Classified, type MsgKind } from './classify';
import { createFramer } from './framing';
import { createHitFilter, type Hit, type KitCalibration } from './hitFilter';
import { DEFAULT_NOTE_MAP, type NoteMap } from './kit';
import { parseMidiMessage } from './midi';
import { Samples } from './stats';

/** What the native module sends per CoreMIDI packet. All times are DrumMidi.nowMs() milliseconds. */
export type NativeMidiEvent = { bytes: number[]; hostTimeMs: number; nativeReceivedMs: number };

export type Counters = {
  /** Native events (one per CoreMIDI packet). */
  events: number;
  messages: number;
  clock: number;
  activeSensing: number;
  otherRealtime: number;
  polyAftertouch: number;
  /** Poly aftertouch 127 on a hi-hat note (the pedal choke). */
  choke: number;
  /** Real Note Off (0x8n) plus Note On velocity 0. */
  noteOff: number;
  /** The Note On velocity 0 part of noteOff. */
  noteOnVel0: number;
  /** Note On with velocity > 0, before the bounce/crosstalk filter. */
  noteOn: number;
  /** Note On / Off / poly AT on a channel other than 10. */
  offChannel: number;
  /** Hits after the filter: what the app would score. */
  hits: number;
  /** Note Ons the filter dropped as bounce or crosstalk. */
  filtered: number;
  controlChange: number;
  sysex: number;
  other: number;
  droppedBytes: number;
  /** Packets whose hostTimeMs was earlier than the previous packet's. */
  timeWentBack: number;
};

export type LogEntry = {
  seq: number;
  hostTimeMs: number;
  hex: string;
  kind: MsgKind;
  channel?: number;
  note?: number;
  velocity?: number;
  value?: number;
  padName?: string;
  verdict?: 'hit' | 'filtered' | 'choke';
};

export const emptyCounters = (): Counters => ({
  events: 0, messages: 0, clock: 0, activeSensing: 0, otherRealtime: 0, polyAftertouch: 0, choke: 0, noteOff: 0,
  noteOnVel0: 0, noteOn: 0, offChannel: 0, hits: 0, filtered: 0, controlChange: 0, sysex: 0, other: 0, droppedBytes: 0,
  timeWentBack: 0,
});

export type ProbeOptions = {
  noteMap?: () => NoteMap;
  padCal?: () => KitCalibration;
  logSize?: number;
  /** Raw messages kept for "Copy results" / "Save as fixture". */
  captureSize?: number;
  /** Non-realtime messages kept for "Copy results" (clock would push the pad notes out of the capture in seconds). */
  noteLogSize?: number;
  /** Clock and active sensing in the log too (they arrive ~40×/s, so off by default; always counted). */
  logRealtime?: () => boolean;
};

export type Probe = ReturnType<typeof createProbe>;

export function createProbe(opts: ProbeOptions = {}) {
  const noteMap = opts.noteMap ?? (() => DEFAULT_NOTE_MAP);
  const logSize = opts.logSize ?? 50, captureSize = opts.captureSize ?? 5000, noteLogSize = opts.noteLogSize ?? 300;
  const framer = createFramer(), filter = createHitFilter(noteMap, opts.padCal);
  let counters = emptyCounters();
  let log: LogEntry[] = []; // newest first
  let capture: number[][] = []; // [hostTimeMs, ...bytes], oldest first
  let noteLog: LogEntry[] = []; // every message but clock and active sensing, oldest first
  let seq = 0, lastHost = -Infinity, droppedBase = 0;
  const bridge = new Samples(), native = new Samples();
  const hitListeners = new Set<(h: Hit) => void>();

  const count = (c: Classified) => {
    switch (c.kind) {
      case 'clock': counters.clock++; break;
      case 'activeSensing': counters.activeSensing++; break;
      case 'otherRealtime': counters.otherRealtime++; break;
      case 'polyAftertouch': counters.polyAftertouch++; if (c.choke) counters.choke++; break;
      case 'noteOff': counters.noteOff++; if ((c.status & 0xf0) === 0x90) counters.noteOnVel0++; break;
      case 'noteOn': counters.noteOn++; break;
      case 'controlChange': counters.controlChange++; break;
      case 'sysex': counters.sysex++; break;
      default: counters.other++;
    }
    if (c.channel !== undefined && c.note !== undefined && c.channel !== 10) counters.offChannel++;
  };

  return {
    /** One native event, with the JS receive time read from DrumMidi.nowMs() in the handler. Returns the hits. */
    ingest(ev: NativeMidiEvent, jsReceivedMs: number): Hit[] {
      counters.events++;
      bridge.add(jsReceivedMs - ev.hostTimeMs);
      native.add(ev.nativeReceivedMs - ev.hostTimeMs);
      if (ev.hostTimeMs < lastHost) counters.timeWentBack++;
      lastHost = ev.hostTimeMs;
      const hits: Hit[] = [];
      for (const msg of framer.push(ev.bytes)) {
        counters.messages++;
        const c = classify(msg, noteMap());
        count(c);
        capture.push([ev.hostTimeMs, ...msg]);
        if (capture.length > captureSize) capture.splice(0, capture.length - captureSize);
        let verdict: LogEntry['verdict'];
        const n = parseMidiMessage(msg); // the web app's hit decision, unchanged
        if (n) {
          const hit = filter.push(n.note, n.velocity, ev.hostTimeMs);
          if (hit) { counters.hits++; hits.push(hit); verdict = 'hit'; } else { counters.filtered++; verdict = 'filtered'; }
        } else if (c.choke) verdict = 'choke';
        const realtime = c.kind === 'clock' || c.kind === 'activeSensing';
        const entry = (): LogEntry => ({ seq: ++seq, hostTimeMs: ev.hostTimeMs, hex: toHex(msg), kind: c.kind, channel: c.channel,
          note: c.note, velocity: c.velocity, value: c.value, padName: c.padName, verdict });
        if (!realtime) {
          noteLog.push(entry());
          if (noteLog.length > noteLogSize) noteLog.splice(0, noteLog.length - noteLogSize);
        }
        if (!realtime || opts.logRealtime?.()) {
          log.unshift(realtime ? entry() : noteLog[noteLog.length - 1]);
          if (log.length > logSize) log.length = logSize;
        }
      }
      counters.droppedBytes = framer.stats.droppedBytes - droppedBase;
      hits.forEach(h => hitListeners.forEach(l => l(h)));
      return hits;
    },
    onHit(fn: (h: Hit) => void) { hitListeners.add(fn); return () => { hitListeners.delete(fn); }; },
    get counters(): Readonly<Counters> { return counters; },
    get log(): readonly LogEntry[] { return log; },
    get capture(): readonly number[][] { return capture; },
    /** Pad notes, note-offs, aftertouch etc. (no clock/active sensing), oldest first. */
    get noteLog(): readonly LogEntry[] { return noteLog; },
    /** jsReceivedMs − hostTimeMs per event. */
    bridge,
    /** nativeReceivedMs − hostTimeMs per event (CoreMIDI → our receive block). */
    native,
    resetCounters() { counters = emptyCounters(); droppedBase = framer.stats.droppedBytes; log = []; capture = []; noteLog = []; filter.reset(); },
    resetDelay() { bridge.reset(); native.reset(); },
  };
}
