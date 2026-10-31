// Practice's first screen (choosing what to practise, from the throne): pick up where you left off, the warm-up, the
// For you cards with the ring that the ride moves, and the library. Ported from the web's src/play/PlayView.tsx
// (Chooser); the rules (forYou, practiceStart, studentRead, currentMilestone) are the core's.
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import { beatsPerBar } from '@drum-coach/core/engine/chart';
import type { Lesson, LessonProgress, Profile } from '@drum-coach/core/engine/lesson';
import { currentMilestone, studentRead } from '@drum-coach/core/engine/planner';
import { forYou, type RunRow } from '@drum-coach/core/engine/progress';
import type { PadCommand } from '@drum-coach/core/engine/padCommands';
import { weekdayOf } from '../progress/dates';
import { chartRow, segments, tabCount, type ChartRow, type PracticeChart, type Read, type TabId } from './catalog';

export type ChooserInput = {
  charts: PracticeChart[];
  /** Every run, oldest first (storage.runs.list()). */
  runs: RunRow[];
  /** The app settings' lesson progress and profile. */
  progress: Record<string, LessonProgress>;
  profile: Profile;
  /** Built-in plus coach-written lessons. */
  lessons: Lesson[];
};

/** The level For you picks at: the current stage's, or the last stage's once the whole path is done (never back to 1). */
export const practiceLevel = (lessons: Lesson[], progress: Record<string, LessonProgress>, profile: Profile) =>
  Math.max(1, currentMilestone(MILESTONES, lessons, progress, profile)?.level ?? MILESTONES[MILESTONES.length - 1].level);

export type Card = ChartRow & { why: string };
export type WarmItem = { id: string; title: string; bpm: number; minutes: 1 };
export type ChooserModel = {
  read: Read;
  level: number;
  /** The last Practice exercise you played (lessons and songs have their own places). */
  resume?: ChartRow & { kicker: string; takes: number };
  /** Up to 3 For you picks besides the resume card. */
  cards: Card[];
  /** The warm-up: the resume card and the For you picks, 4 at most, at today's tempos. Only with 2 or more. */
  warm?: { title: string; items: WarmItem[] };
  segments: ReturnType<typeof segments>;
  /** "All exercises" card's line: "Grooves 6 · Rudiments and drills 9 · …" */
  allLine: string;
  total: number;
};

export function chooserModel(input: ChooserInput): ChooserModel {
  const { charts, runs, progress, profile, lessons } = input;
  const read = studentRead(progress, runs);
  const level = practiceLevel(lessons, progress, profile);
  const row = (c: PracticeChart) => chartRow(c, runs, read);
  const lastRun = [...runs].reverse().find(r => charts.some(c => c.id === r.chartId));
  const resumeChart = lastRun && charts.find(c => c.id === lastRun.chartId);
  const picks = forYou(charts, runs, level, 8, read.pace);
  const cards = picks.filter(x => x.chart !== resumeChart).slice(0, 3).map(x => ({ ...row(x.chart), why: x.why }));
  let resume: ChooserModel['resume'];
  if (resumeChart && lastRun) {
    const takes = runs.filter(r => r.chartId === resumeChart.id).length;
    resume = { ...row(resumeChart), takes, kicker: `played ${weekdayOf(lastRun.startedAt)} · ${takes} take${takes === 1 ? '' : 's'}` };
  }
  const warmRows = [...(resume ? [resume] : []), ...cards].slice(0, 4);
  const segs = segments(charts);
  return {
    read, level, resume, cards,
    warm: warmRows.length > 1 ? { title: `${warmRows.length}-minute warm-up`, items: warmRows.map(r => ({ id: r.id, title: r.title, bpm: r.startsAt, minutes: 1 })) } : undefined,
    segments: segs,
    allLine: segs.filter(s => s.id !== 'foryou').map(s => `${s.label} ${s.count}`).join(' · '),
    total: charts.length,
  };
}

/** The ring: -1 is the resume card; until moved, it starts there (or on the first card). */
export const initialFocus = (m: Pick<ChooserModel, 'resume'>) => (m.resume ? -1 : 0);
/** Ride × 2 / Next card: the ring moves to the next card, then back to the resume card (or the first). */
export const stepFocus = (focus: number, m: Pick<ChooserModel, 'resume' | 'cards'>) =>
  (focus + 1 >= m.cards.length ? (m.resume ? -1 : 0) : focus + 1);
export const focusedRow = (focus: number, m: Pick<ChooserModel, 'resume' | 'cards'>): ChartRow | undefined =>
  (focus < 0 ? m.resume : m.cards[focus]);
/** The big move's label: "▶ Play it" on the resume card, "▶ Play <title>" on a For you card. */
export function playLabel(focus: number, m: Pick<ChooserModel, 'resume' | 'cards'>) {
  const f = focusedRow(focus, m);
  return f ? (focus < 0 ? '▶ Play it' : `▶ Play ${f.title}`) : '▶ Play';
}

/** Kit gestures on the chooser (the web's onCoachAction there): yes plays the ring, ride moves it, tom 2 hears it, tom 1 warms up. */
export type ChooserAction = 'play' | 'step' | 'hear' | 'warm';
export const CHOOSER_GESTURES: Partial<Record<PadCommand, ChooserAction>> = { yes: 'play', next: 'step', listen: 'hear', faster: 'warm' };

/** About a minute of one warm-up exercise at its tempo: how many times round (the web's warmTake). */
export const warmRepeats = (c: Pick<PracticeChart, 'timeSignature' | 'bars'>, bpm: number) =>
  Math.max(1, Math.round(60 / ((beatsPerBar(c) * 60) / bpm) / c.bars));

// ---------- The reorganised Practice (D10, docs/mobile/reorg/practice-after.png) ----------

/** One of the 4 big For you cards: the warm-up first, then where you left off, then the picks (the coach's tagged). */
export type ForYouCard = {
  key: string; tag: string; icon: string; title: string; line: string;
  /** The exercise it plays, or undefined for the warm-up. */
  row?: ChartRow; ai?: boolean;
};

export function forYouCards(m: Pick<ChooserModel, 'warm' | 'resume' | 'cards'>): ForYouCard[] {
  const chart = (r: ChartRow, tag: string): ForYouCard => ({
    key: r.id, tag: r.ai ? '✍ by your coach' : tag, icon: r.icon, title: r.title, row: r, ai: r.ai,
    line: `starts at ${r.startsAt}${r.best ? ` · best ${r.best}` : ` · ${r.bars} bar${r.bars === 1 ? '' : 's'}`}`,
  });
  const out: ForYouCard[] = [];
  if (m.warm) out.push({ key: 'warm', tag: `warm-up · ${m.warm.items.length} min`, icon: '🔥', title: 'Warm-up', line: m.warm.items.map(w => w.title).join(' · ') });
  if (m.resume) out.push(chart(m.resume, 'left off here'));
  for (const c of m.cards) out.push(chart(c, c.why || 'for you'));
  return out.slice(0, 4);
}

/** Ride × 2 / Next card: round the 4 cards. */
export const nextCard = (i: number, n: number) => (n ? (i + 1) % n : 0);
/** The big move: "Play Warm-up", "Play Basic rock beat". */
export const playCardLabel = (c: ForYouCard | undefined) => (c ? `Play ${c.title}` : 'Play');
/** The coach's line in the bar. */
export const practiceLine = (cards: ForYouCard[]) =>
  cards[0]?.key === 'warm' ? 'Warm up first? Ride × 2 moves the ring.' : cards.length ? 'Pick one. Ride × 2 moves the ring.' : 'Pick a kind below to see every exercise.';

/** The 4 kind tiles (Songs is a shelf here, D10): exercises per kind; Songs counts your songs and adds YouTube. */
export type KindTile = { id: 'groove' | 'rudiment' | 'fill' | 'song'; label: string; icon: string; count: string };
export function kindTiles(charts: PracticeChart[], ytSongs: number): KindTile[] {
  const n = (id: TabId) => tabCount(charts, id);
  return [
    { id: 'groove', label: 'Grooves', icon: '🥁', count: String(n('groove')) },
    { id: 'rudiment', label: 'Rudiments', icon: '🥢', count: String(n('rudiment')) },
    { id: 'fill', label: 'Fills', icon: '💥', count: String(n('fill')) },
    { id: 'song', label: 'Songs', icon: '🎵', count: `${n('song') + ytSongs} + YouTube` },
  ];
}
