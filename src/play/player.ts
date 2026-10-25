import { beatsPerBar, DRUM_PAD, padMatches, type Chart, type ChartDrum } from '../engine/chart';
import { buildRun, splitRun, beatMs as toBeatMs, type Run, type RunNote, type RunOptions } from '../engine/run';
import { inFreeBar } from '../engine/jam';
import { computeStats, createMatcher, minGapBeats, reactingToClick, toResult, windowsFor, type Judgement, type NoteResult, type PlayedHit, type RunStats } from '../engine/scoring';
import { onHit } from '../input/hits';
import { getSettings } from '../input/settings';
import { createLiveCoach, type Cue } from '../engine/liveCoach';
import { hush, NUMBERS, sayAt } from '../voice/voice';
import { applyTip, loadTips } from '../coach/aiTips';
import { audio, audioToPerf, click, playBuffer, playDrum, whenRunning } from './audio';

export type PlayOptions = RunOptions & {
  speed: number; // 0.5–1
  metronome: boolean;
  subdivision: 1 | 2 | 4;
  countInBars: number;
  wait: boolean;
  backing?: { buffer: AudioBuffer; syncOffsetMs: number };
  /** Run on someone else's clock (a YouTube video): beats from the run start at performance time `now`. */
  external?: { position: (now: number) => number; begin: () => void; end: () => void };
  activeLanes?: ChartDrum[]; // lanes the student plays; the app plays the rest (layered practice)
  demo?: boolean;            // the app plays every note and nothing is scored
  guide?: boolean;           // practice-along: the app plays every note softly under you, you're still scored, no live tips
  gapBars?: number;          // the click is silent on every n-th bar
  hints?: boolean;           // the sheet shows the count and who plays each note under the staff
  countAloud?: string[][];   // words the voice says per bar, one per slot ('' = silent): engine/lesson.ts countPlan
  freeBars?: number[];       // 1-based chart bars that are yours (free / trade bars): strokes there aren't extras
  zoom?: number;             // a "fix this bar" loop (lessons): practice only, no tempo ladder
  goodMs?: number;           // a wider Good window for beginners (engine/lesson.ts goodMsFor)
  count?: boolean;           // big "1 & 2 &" on the highway, for the counting lessons
  lesson?: { id: string; step: number; title: string; goal: string }; // saved with the run, read by the coach
};
export type Finished = { cues: Cue[]; zero: number; chart: Chart; run: Run; options: PlayOptions; results: NoteResult[]; extras: PlayedHit[]; hits: PlayedHit[]; stats: RunStats; startedAt: string; durationS: number };
export type Feedback = { lane: string; judgement: Judgement | 'extra'; time: number };

type State = {
  phase: 'idle' | 'playing' | 'done';
  chart?: Chart; run?: Run; options?: PlayOptions;
  zero: number; beatMs: number;   // perf ms of run beat 0, ms per beat
  results: NoteResult[]; feedback: Feedback[];
  auto: boolean[];                // per run note: played by the app, not the student
  cue?: { cue: Cue; at: number }; // latest live tip (performance.now() time)
  extraBeats: number[];           // where extra hits landed (run beats), for the sheet's ✕ marks
  waitPos: number; waitGroup: number; waitLast: number;
  finished?: Finished;
};

/** Mutable player state; the highway reads it every frame, React re-renders on phase changes only. */
export const player: State = { phase: 'idle', zero: 0, beatMs: 500, results: [], feedback: [], auto: [], extraBeats: [], waitPos: 0, waitGroup: 0, waitLast: 0 };
const listeners = new Set<() => void>();
let version = 0;
const notify = () => { version++; listeners.forEach(l => l()); };
export const subscribePlayer = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const playerVersion = () => version;

let cleanup: (() => void)[] = [];

// ---------- live tips (see engine/liveCoach.ts) ----------
let live: { coach: ReturnType<typeof createLiveCoach>; bar: number; hits: PlayedHit[]; extras: PlayedHit[]; cues: Cue[] } | null = null;
const cueListeners = new Set<(c: Cue) => void>();
/** Called with every live tip as it's given (for the voice). */
export const onCue = (fn: (c: Cue) => void) => { cueListeners.add(fn); return () => { cueListeners.delete(fn); }; };

function startLive(options: PlayOptions, hits: PlayedHit[], extras: PlayedHit[]) {
  const s = getSettings();
  live = s.liveTips === 'off' || options.wait || options.demo || options.guide ? null : { coach: createLiveCoach(s.chattiness), bar: 0, hits, extras, cues: [] };
}
/** Once per bar: look at the last two bars and maybe give one tip. */
function liveCheck(pos: number) {
  const run = player.run;
  if (!live || !run) return;
  const bpb = run.beatsPerBar, bar = Math.floor(pos / bpb);
  if (bar <= live.bar) return;
  live.bar = bar;
  const from = (bar - 2) * bpb, to = bar * bpb;
  const notes = run.notes.flatMap((n, i) => (player.auto[i] || n.t < from || n.t >= to ? [] : [{ drum: n.drum, accent: n.accent, ghost: n.ghost, ...player.results[i] }]));
  const extras = live.extras.filter(h => { const b = (h.time - player.zero) / player.beatMs; return b >= from && b < to; }).length;
  const raw = live.coach({ bar, notes, extras, reaction: reactingToClick(expectedTimes(run), live.hits) });
  if (!raw) return;
  const cue = applyTip(player.chart, raw); // the coach's own words for this exercise, when it has written them
  player.cue = { cue, at: performance.now() };
  live.cues.push(cue);
  cueListeners.forEach(l => l(cue));
}

/** The notes the student plays, on the hit clock (both clocks: zero + beats × beatMs). */
const expectedTimes = (run: Run) => run.notes.flatMap((n, i) => (player.auto[i] ? [] : [{ time: player.zero + n.t * player.beatMs, drum: n.drum }]));

/** Current position in run beats (negative during count-in). */
export function position(now = performance.now()) {
  if (player.options?.external) return player.options.external.position(now);
  if (player.options?.wait) {
    // Advance to the next group of notes and wait there until it's played.
    const groups = waitGroups();
    const target = player.waitGroup < groups.length ? groups[player.waitGroup].t : player.run!.beats;
    player.waitPos = Math.min(target, player.waitPos + (now - player.waitLast) / player.beatMs);
    player.waitLast = now;
    return player.waitPos;
  }
  return (now - player.zero) / player.beatMs;
}

let groupsCache: { run?: Run; groups: { t: number; idx: number[] }[] } = { groups: [] };
function waitGroups() {
  if (groupsCache.run !== player.run) {
    const groups: { t: number; idx: number[] }[] = [];
    player.run!.notes.forEach((n, i) => {
      if (player.auto[i]) return;
      const last = groups[groups.length - 1];
      if (last && Math.abs(last.t - n.t) < 1e-6) last.idx.push(i); else groups.push({ t: n.t, idx: [i] });
    });
    groupsCache = { run: player.run, groups };
  }
  return groupsCache.groups;
}

export function start(chart: Chart, options: PlayOptions) {
  if (!options.external && audio().state !== 'running') { whenRunning(() => start(chart, options)); return; }
  stop();
  hush();
  if (!options.demo && !options.wait) loadTips(chart, options.lesson?.goal);
  const run = buildRun(chart, options);
  const { scored, auto } = splitRun(run, options.demo ? [] : options.activeLanes);
  const isAuto = run.notes.map(() => false);
  auto.forEach(n => { isAuto[n.i] = true; });
  const beatMs = toBeatMs(chart.bpm, options.speed);
  if (options.external) return startExternal(chart, run, options, beatMs);
  const c = audio();
  const countIn = options.wait ? 0 : options.countInBars * beatsPerBar(chart);
  const t0 = c.currentTime + 0.15; // audio time of the first count-in click
  const zeroAudio = t0 + (countIn * beatMs) / 1000;
  const startedAt = new Date().toISOString();
  Object.assign(player, {
    phase: 'playing', chart, run, options, beatMs, zero: audioToPerf(zeroAudio),
    results: run.notes.map(() => ({ judgement: 'miss' })), feedback: [], auto: isAuto, cue: undefined, extraBeats: [],
    waitPos: -0.5, waitGroup: 0, waitLast: performance.now(), finished: undefined,
  } satisfies Partial<State>);

  const hits: PlayedHit[] = [];
  const extras: PlayedHit[] = [];
  const latency = getSettings().latencyMs;
  let drift = 0; // ms the audio clock has slipped against performance.now() since zero was taken
  const laneOf = (d: string) => (d === 'hhOpen' || d === 'hhPedal' ? 'hihat' : d);

  if (options.wait) {
    cleanup.push(onHit(h => {
      const hit = { time: h.time, pad: h.pad, velocity: h.velocity };
      hits.push(hit);
      const groups = waitGroups(), g = groups[player.waitGroup];
      if (!g) return;
      const idx = g.idx.find(i => player.results[i].judgement === 'miss' && h.pad && padMatches(run.notes[i].drum, h.pad));
      if (idx === undefined) {
        extras.push(hit);
        player.feedback.push({ lane: h.pad?.startsWith('hh') ? 'hihat' : (h.pad ?? 'snare'), judgement: 'extra', time: h.time });
        return;
      }
      player.results[idx] = { judgement: 'good', offset: 0, velocity: h.velocity, pad: h.pad };
      player.feedback.push({ lane: laneOf(run.notes[idx].drum), judgement: 'good', time: h.time });
      if (g.idx.every(i => player.results[i].judgement !== 'miss')) {
        player.waitGroup++;
        if (player.waitGroup >= groups.length) finish(scored, hits, extras, startedAt);
      }
    }));
    notify();
    return;
  }

  const match = createMatcher(scored.notes.map(n => ({ time: player.zero + n.t * beatMs, drum: n.drum })), windowsFor(beatMs, minGapBeats(scored.notes) * beatMs, options.goodMs));
  if (!options.demo) cleanup.push(onHit(h => {
    const hit = { time: h.time - latency - drift, pad: h.pad, velocity: h.velocity };
    const m = match(hit);
    if (!m && hit.time < player.zero) return; // count-in noodling isn't scored (an early first note still matches)
    hits.push(hit);
    if (m) {
      const i = scored.notes[m.index].i;
      player.results[i] = toResult(m, h.velocity, h.pad);
      player.feedback.push({ lane: laneOf(run.notes[i].drum), judgement: m.judgement, time: h.time });
    } else if (h.pad && auto.some(n => padMatches(n.drum, h.pad!))) {
      // playing along on a lane the app is playing: neither scored nor an extra
    } else if (options.freeBars && inFreeBar((hit.time - player.zero) / beatMs, bpb, options.fromBar, options.toBar - options.fromBar + 1, options.freeBars)) {
      // your own bar: no ✕, no "extra" flash, no "only the notes shown" tip
    } else {
      extras.push(hit);
      player.extraBeats.push((hit.time - player.zero) / beatMs);
      const pad = h.pad ?? 'snare';
      player.feedback.push({ lane: pad.startsWith('hh') ? 'hihat' : pad, judgement: 'extra', time: h.time });
    }
    if (player.feedback.length > 64) player.feedback.splice(0, 32);
  }));

  startLive(options, hits, extras);
  const countVoice = getSettings().countIn && !options.demo;
  // Lookahead scheduler for clicks, app-played notes, live tips and the end of the run.
  const sub = options.subdivision, bpb = beatsPerBar(chart);
  const sounding = options.guide ? run.notes : auto;
  const autoAt = (n: RunNote) => zeroAudio + (n.t * beatMs) / 1000;
  let a = 0;
  let k = -countIn * sub;
  const plan = options.countAloud, perBar = plan?.[0]?.length ?? 1, slots = plan ? Math.min(plan.length, Math.ceil(run.beats / bpb)) * perBar : 0; // never past the take's end
  const slotAt = (w: number) => zeroAudio + ((w * bpb) / perBar) * beatMs / 1000;
  let w = 0;
  const lastK = options.metronome ? run.beats * sub : 0; // metronome off → count-in only
  const timeOf = (k: number) => t0 + ((k / sub + countIn) * beatMs) / 1000;
  const timer = setInterval(() => {
    const late = c.currentTime - 0.03; // after a stall, drop what's due instead of playing it all at once
    for (; k < lastK && timeOf(k) < c.currentTime + 0.2; k++) {
      if (timeOf(k) < late) continue;
      const onBeat = k % sub === 0;
      if (!onBeat && !options.metronome) continue;
      const barStart = onBeat && (((k / sub) % bpb) + bpb) % bpb < 1e-6;
      if (k < 0 && onBeat && countVoice) sayAt(NUMBERS[Math.floor((((k / sub) % bpb) + bpb) % bpb + 1e-6)], timeOf(k)); // "one, two, three, four"
      const gap = options.gapBars && k >= 0 && (Math.floor(k / sub / bpb + 1e-6) + 1) % options.gapBars === 0;
      if (!gap) click(timeOf(k), !onBeat ? 2 : barStart ? 0 : 1);
    }
    for (; a < sounding.length && autoAt(sounding[a]) < c.currentTime + 0.2; a++) {
      const n = sounding[a];
      if (autoAt(n) < late) continue;
      playDrum(DRUM_PAD[n.drum][0], (n.accent ? 110 : n.ghost ? 40 : 80) * (options.guide ? 0.5 : 1), autoAt(n));
    }
    for (; w < slots && slotAt(w) < c.currentTime + 0.2; w++) {
      const word = plan![Math.floor(w / perBar)][w % perBar];
      if (word && slotAt(w) >= late) sayAt(word, slotAt(w));
    }
    const d = audioToPerf(zeroAudio) - player.zero;
    if (Math.abs(d) < 50) drift += (d - drift) * 0.1; // smoothed; a bigger jump is a stale timestamp, not drift
    liveCheck(position());
    if (performance.now() > player.zero + run.beats * beatMs + 400) finish(scored, hits, extras, startedAt);
  }, 25);
  cleanup.push(() => clearInterval(timer));

  if (options.backing) {
    // Song audio: beat b of the chart is at b*60/bpm + offset seconds in the file. Rate = speed (pitch shifts).
    // shortcut: playbackRate changes pitch at <100% speed; use a time-stretch worklet if that bothers you.
    const { buffer, syncOffsetMs } = options.backing;
    const secLen = (run.beats / Math.max(1, options.repeats)) * 60 / chart.bpm;
    const songStart = ((options.fromBar - 1) * bpb * 60) / chart.bpm + syncOffsetMs / 1000;
    const sources: AudioBufferSourceNode[] = [];
    for (let r = 0; r < Math.max(1, options.repeats); r++) {
      const when = zeroAudio + (r * secLen) / options.speed;
      const lead = Math.max(0, -songStart); // audio starts after beat 0
      sources.push(playBuffer(buffer, when + lead / options.speed, Math.max(0, songStart), secLen - lead, options.speed));
    }
    cleanup.push(() => sources.forEach(s => { try { s.stop(); } catch { /* already stopped */ } }));
  }
  notify();
}

// Same scoring as a normal run, but times are "beats on the external clock × beatMs" (zero = 0).
function startExternal(chart: Chart, run: Run, options: PlayOptions, beatMs: number) {
  const ext = options.external!, latency = getSettings().latencyMs, startedAt = new Date().toISOString();
  Object.assign(player, {
    phase: 'playing', chart, run, options, beatMs, zero: 0,
    results: run.notes.map(() => ({ judgement: 'miss' })), feedback: [], auto: run.notes.map(() => false), cue: undefined, extraBeats: [], finished: undefined,
  } satisfies Partial<State>);
  const hits: PlayedHit[] = [], extras: PlayedHit[] = [];
  const laneOf = (d: string) => (d.startsWith('hh') ? 'hihat' : d);
  const match = createMatcher(run.notes.map(n => ({ time: n.t * beatMs, drum: n.drum })), windowsFor(beatMs, minGapBeats(run.notes) * beatMs, options.goodMs));
  cleanup.push(onHit(h => {
    const hit = { time: ext.position(h.time - latency) * beatMs, pad: h.pad, velocity: h.velocity };
    const m = match(hit);
    if (!m && hit.time < 0) return; // pre-roll noodling isn't scored (an early first note still matches)
    hits.push(hit);
    if (m) {
      player.results[m.index] = toResult(m, h.velocity, h.pad);
      player.feedback.push({ lane: laneOf(run.notes[m.index].drum), judgement: m.judgement, time: h.time });
    } else {
      extras.push(hit);
      player.extraBeats.push(hit.time / beatMs);
      player.feedback.push({ lane: laneOf(h.pad ?? 'snare'), judgement: 'extra', time: h.time });
    }
    if (player.feedback.length > 64) player.feedback.splice(0, 32);
  }));
  startLive(options, hits, extras);
  const timer = setInterval(() => { const pos = ext.position(performance.now()); liveCheck(pos); if (pos > run.beats + 0.5) finish(run, hits, extras, startedAt); }, 50);
  cleanup.push(() => { clearInterval(timer); ext.end(); });
  ext.begin();
  notify();
}

/** Results cover only the notes the student played (`scored`); a demo just ends. */
function finish(scored: Run, hits: PlayedHit[], extras: PlayedHit[], startedAt: string) {
  const { chart, options } = player;
  if (options!.demo) { stop(); return; }
  cleanup.forEach(f => f()); cleanup = [];
  const results = scored.notes.map(n => player.results[n.i]);
  const stats = { ...computeStats(scored, results, extras.length), reaction: options!.wait ? null : reactingToClick(scored.notes.map(n => ({ time: player.zero + n.t * player.beatMs, drum: n.drum })), hits) };
  player.phase = 'done';
  player.finished = { cues: live?.cues ?? [], zero: player.zero, chart: chart!, run: scored, options: options!, results, extras, hits, stats, startedAt, durationS: Math.round((Date.now() - Date.parse(startedAt)) / 1000) };
  notify();
}

export function stop() {
  cleanup.forEach(f => f()); cleanup = [];
  if (player.phase !== 'idle') { player.phase = 'idle'; notify(); }
}
