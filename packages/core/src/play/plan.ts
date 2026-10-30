// The take's sound plan (AUDIO-DESIGN §1.2, B21): the body of the web scheduler's setInterval (src/play/player.ts)
// as a pure function. Every event time is the HEARD time on the Clock, computed as zero + beat × beatMs (by
// multiplication, never accumulation), so a take planned in 4 s chunks gets exactly the events of one big plan.
import type { AudioEvent, SoundId } from './audioPort.ts';
import { DRUM_PAD, beatsPerBar, type Chart } from '../engine/chart.ts';
import { bandNotes, type BandNote, type BandSpec } from '../engine/band.ts';
import { inFreeBar } from '../engine/jam.ts';
import type { PadId } from '../engine/kit.ts';
import { clickOnBeat } from '../engine/lesson.ts';
import { groupStarts, isOdd8 } from '../engine/meter.ts';
import type { Run, RunNote } from '../engine/run.ts';

/** The count-in words by beat (or 8th, in an odd /8 meter): the web's NUMBERS (src/voice/voice.ts). */
export const COUNT_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen'];

export type ClickFeel = 'quarters' | '8ths' | '2and4';

/** A note the app plays (layered practice lanes, a demo, the guide): run beat, pad and velocity 1–127. */
export type PlanNote = { t: number; pad: PadId; velocity: number };

/** Everything planEvents needs. Beats are run beats (0 = the first beat after the count-in; negative in it). */
export type PlanSpec = {
  /** The heard Clock time (ms) of run beat 0. */
  zero: number;
  beatMs: number;
  timeSignature: readonly [number, number];
  /** Beats of count-in before beat 0 (they always click; their words come with `countVoice`). */
  countInBeats: number;
  /** False: the count-in only (in an odd /8 meter, only its words). App-played notes, the band and countAloud still play. */
  metronome: boolean;
  /** Clicks per beat. An odd /8 meter clicks every 8th; clickOn '8ths' clicks 8ths. */
  subdivision: 1 | 2 | 4;
  clickOn?: ClickFeel;
  /** The click (and the band) is silent on every n-th bar. */
  gapBars?: number;
  /** The click (and the band) fades to silence over this many bars. */
  fadeClick?: number;
  /** The run's length in beats: clicks stop here (Infinity: a metronome that never ends). */
  endBeat: number;
  /** Speak the count-in numbers (COUNT_WORDS). */
  countVoice?: boolean;
  /** App-played notes, sorted by t. */
  notes?: readonly PlanNote[];
  /** Band notes (engine/band.ts bandNotes), sorted by t. */
  band?: readonly BandNote[];
  /** Words spoken per bar, one per slot ('' = silent): engine/lesson.ts countPlan. */
  countAloud?: readonly (readonly string[])[];
  /** Words prepareWords reported missing: left out, as the web's sayAt skips a word that isn't ready. */
  missingWords?: ReadonlySet<string>;
};

const word = (w: string): SoundId => `word.${w}`;

/**
 * The sounds heard in run beats [fromBeat, toBeat): clicks (bar / beat / subdivision, gap and fade bars, clickOn),
 * count-in words, app-played notes, band notes and countAloud words, as the web's scheduler plays them, sorted by
 * time. Adjacent ranges never share or skip an event, so a plan can be built in chunks.
 */
export function planEvents(spec: PlanSpec, fromBeat: number, toBeat: number): AudioEvent[] {
  const { zero, beatMs, timeSignature: ts, metronome, gapBars, fadeClick, clickOn } = spec;
  const out: AudioEvent[] = [];
  if (!(toBeat > fromBeat)) return out;
  const at = (beat: number) => zero + beat * beatMs;
  const missing = spec.missingWords;
  const say = (w: string, beat: number) => {
    if (!missing || !(missing.has(w) || missing.has(w.trim().toLowerCase()))) out.push({ kind: 'sound', at: at(beat), sound: word(w), gain: 1 });
  };
  const click = (beat: number, level: 0 | 1 | 2, gain: number) => {
    out.push({ kind: 'sound', at: at(beat), sound: level === 0 ? 'click.bar' : level === 1 ? 'click.beat' : 'click.sub', gain });
  };

  // Clicks: k counts clicks from beat 0 (negative in the count-in), as the web's scheduler does.
  const odd8 = isOdd8(ts), n8 = ts[0], starts = groupStarts(ts), bpb = beatsPerBar({ timeSignature: ts });
  const sub = odd8 ? 2 : clickOn === '8ths' ? 2 : spec.subdivision;
  const firstK = -spec.countInBeats * sub, lastK = metronome ? spec.endBeat * sub : 0;
  const countVoice = !!spec.countVoice;
  for (let k = Math.max(firstK, Math.ceil(fromBeat * sub)); k < lastK && k < toBeat * sub; k++) {
    const beat = k / sub;
    if (odd8) {
      const p = ((k % n8) + n8) % n8, bar8 = Math.floor(k / n8);
      if (k < 0 && countVoice) say(COUNT_WORDS[p], beat);
      const gap8 = gapBars && k >= 0 && (bar8 + 1) % gapBars === 0, vol8 = fadeClick && k >= 0 ? Math.max(0, 1 - bar8 / fadeClick) : 1;
      if (!gap8 && vol8 > 0 && metronome) click(beat, p === 0 ? 0 : starts.has(p) ? 1 : 2, vol8);
      continue;
    }
    const onBeat = k % sub === 0;
    if (!onBeat && !metronome) continue;
    const barStart = onBeat && (((k / sub) % bpb) + bpb) % bpb < 1e-6;
    if (k < 0 && onBeat && countVoice) say(COUNT_WORDS[Math.floor((((k / sub) % bpb) + bpb) % bpb + 1e-6)], beat); // "one, two, three, four"
    const gap = gapBars && k >= 0 && (Math.floor(k / sub / bpb + 1e-6) + 1) % gapBars === 0;
    const vol = fadeClick && k >= 0 ? Math.max(0, 1 - Math.floor(k / sub / bpb + 1e-6) / fadeClick) : 1; // keep time alone
    const feel = k < 0 || !onBeat || clickOnBeat(Math.round(((k / sub) % bpb + bpb) % bpb), clickOn); // the count-in always clicks
    if (!gap && vol > 0 && feel) click(beat, !onBeat ? 2 : barStart ? 0 : 1, vol);
  }

  // App-played notes: the web's playDrum(pad, velocity, at), gain = velocity / 127.
  for (const n of spec.notes ?? []) {
    if (n.t >= fromBeat && n.t < toBeat) out.push({ kind: 'sound', at: at(n.t), sound: `drum.${n.pad}`, gain: n.velocity / 127 });
  }

  // The band goes quiet with the gap click and fades with the click.
  for (const n of spec.band ?? []) {
    if (n.t < fromBeat || n.t >= toBeat) continue;
    const bar = Math.floor(n.t / bpb + 1e-6);
    const vol = fadeClick ? Math.max(0, 1 - bar / fadeClick) : 1;
    if (vol > 0 && !(gapBars && (bar + 1) % gapBars === 0)) out.push({ kind: 'band', at: at(n.t), part: n.part, midi: n.midi, durMs: n.dur * beatMs, vel: n.vel * vol });
  }

  // countAloud: perBar slots per bar, never past the take's end.
  const plan = spec.countAloud;
  const perBar = plan?.[0]?.length ?? 1;
  if (plan?.length && perBar > 0) {
    const slots = Math.min(plan.length, Math.ceil(spec.endBeat / bpb)) * perBar;
    const slotBeat = (w: number) => (w * bpb) / perBar;
    for (let w = Math.max(0, Math.floor((fromBeat * perBar) / bpb) - 1); w < slots && slotBeat(w) < toBeat; w++) {
      const text = plan[Math.floor(w / perBar)][w % perBar];
      if (text && slotBeat(w) >= fromBeat) say(text, slotBeat(w));
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** The words a spec can speak (to prepare before the take): count-in numbers and countAloud words. */
export function planWords(spec: Pick<PlanSpec, 'timeSignature' | 'countInBeats' | 'countVoice' | 'countAloud'>): string[] {
  const words = new Set<string>();
  if (spec.countVoice && spec.countInBeats > 0) {
    const n = isOdd8(spec.timeSignature) ? spec.timeSignature[0] : Math.ceil(beatsPerBar(spec) - 1e-6);
    COUNT_WORDS.slice(0, n).forEach(w => words.add(w));
  }
  spec.countAloud?.forEach(bar => bar.forEach(w => { if (w) words.add(w); }));
  return [...words];
}

/** What planSpecFor reads from a take's options (src/play/player.ts PlayOptions). */
export type PlanOptions = {
  fromBar: number; toBar: number;
  metronome: boolean; subdivision: 1 | 2 | 4; countInBars: number;
  wait?: boolean; demo?: boolean; guide?: boolean;
  clickOn?: ClickFeel; gapBars?: number; fadeClick?: number;
  countAloud?: readonly (readonly string[])[];
  freeBars?: readonly number[];
  band?: BandSpec;
};

/**
 * The plan of a take, as the web's start() sets its scheduler up: count-in (none in wait mode), the notes the app
 * plays (`auto`; every note at half velocity with the guide), the band (free bars get one hit on beat 1).
 */
export function planSpecFor(chart: Chart, run: Run, auto: readonly RunNote[], o: PlanOptions, t: { zero: number; beatMs: number; countVoice: boolean; missingWords?: ReadonlySet<string> }): PlanSpec {
  const bpb = beatsPerBar(chart);
  const sounding = o.guide ? run.notes : auto;
  const runBars = Math.ceil(run.beats / bpb - 1e-9), sectionBars = o.toBar - o.fromBar + 1, free = o.freeBars;
  const fillBars = free ? Array.from({ length: runBars }, (_, b) => b).filter(b => inFreeBar(b * bpb, bpb, o.fromBar, sectionBars, free)) : [];
  return {
    zero: t.zero, beatMs: t.beatMs, timeSignature: chart.timeSignature,
    countInBeats: o.wait ? 0 : o.countInBars * bpb,
    metronome: o.metronome, subdivision: o.subdivision, clickOn: o.clickOn, gapBars: o.gapBars, fadeClick: o.fadeClick,
    endBeat: run.beats, countVoice: t.countVoice,
    notes: sounding.map(n => ({ t: n.t, pad: DRUM_PAD[n.drum][0], velocity: (n.accent ? 110 : n.ghost ? 40 : 80) * (o.guide ? 0.5 : 1) })),
    band: o.band && !o.wait ? bandNotes({ ...o.band, fillBars }, run) : [],
    countAloud: o.countAloud, missingWords: t.missingWords,
  };
}
