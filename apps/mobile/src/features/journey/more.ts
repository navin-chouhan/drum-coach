// What Journey's ⋯ sheet holds after the reorganisation (D10, docs/mobile/REORG-PROPOSAL.md "Journey"): everything the
// one-job Journey no longer shows. Pure, so the "every feature stays reachable" rule is a unit test (more.test.ts).
import { songHref } from '../songs/songsModel';
import type { JourneyView, TrailStopView } from './model';

export type MoreAction =
  | { kind: 'lesson'; lessonId: string; mode?: 'play' | 'jam' | 'flow' | 'arcade' | 'hear'; role?: 'record' }
  | { kind: 'route'; href: string }
  | { kind: 'askNew' } | { kind: 'askHabit' } | { kind: 'askChallenge' };

export type MoreEntry = { key: string; emoji: string; title: string; sub?: string; testID: string; action: MoreAction; disabled?: boolean };
export type MoreSection = { key: string; title: string; entries: MoreEntry[] };

/** The routes the sheet opens (the shell owns them; one place to change when it moves them). */
export const MORE_ROUTES = { placement: '/lesson/placement', technique: '/technique', skills: '/progress?view=skills', path: '/progress?view=path', songs: '/songs', setup: '/setup' } as const;

/**
 * The ⋯ sheet's sections: "More ways to play" (Just jam, Flow, the after-set moves, the stage song, a new song,
 * show-off songs), "Your coach" (ask for a different lesson, this week's focus, the lessons written for you, the
 * challenge) and "Where you are" (Find my level, Skill map, Full path, Check my kit, Stick technique).
 */
export function moreSections(v: JourneyView, coach: { thinking: boolean } = { thinking: false }): MoreSection[] {
  const play: MoreEntry[] = [];
  if (v.jamLessonId) play.push({ key: 'jam', emoji: '🎸', title: 'Just jam', sub: 'no score, with the band', testID: 'journey-jam', action: { kind: 'lesson', lessonId: v.jamLessonId, mode: 'jam' } });
  if (v.flow) play.push({ key: 'flow', emoji: '🌊', title: 'Flow', sub: v.flow.sub, testID: 'journey-more-flow', action: { kind: 'lesson', lessonId: v.flow.lessonId, mode: 'flow' } });
  if (v.arcade) play.push({ key: 'arcade', emoji: '⏱', title: '2-minute challenge', sub: v.arcade.goal, testID: 'journey-more-arcade', action: { kind: 'lesson', lessonId: v.arcade.lessonId, mode: 'arcade' } });
  if (v.record) play.push({ key: 'record', emoji: '🏆', title: 'Beat your best', sub: v.record.goal, testID: 'journey-more-record', action: { kind: 'lesson', lessonId: v.record.lessonId, role: 'record' } });
  if (v.song) {
    play.push({ key: 'song-play', emoji: '🎵', title: `Stage song: ${v.song.title}`, sub: `${v.song.ready} of ${v.song.bars} bars ready`, testID: 'journey-more-song-play', action: { kind: 'lesson', lessonId: v.song.lessonId } });
    play.push({ key: 'song-hear', emoji: '👂', title: `Hear ${v.song.title}`, sub: 'with the band', testID: 'journey-more-song-hear', action: { kind: 'lesson', lessonId: v.song.lessonId, mode: 'hear' } });
  }
  play.push({ key: 'newsong', emoji: '🎵', title: 'Learn a new song', sub: 'from YouTube, a few bars at a time', testID: 'journey-more-song', action: { kind: 'route', href: MORE_ROUTES.songs } });
  for (const s of v.showoff) play.push({ key: `showoff-${s.id}`, emoji: '🎤', title: `Show-off: ${s.title}`, sub: 'Stage mode is under Play', testID: `journey-more-showoff-${s.id}`, action: { kind: 'route', href: songHref(s.id) } });

  const coachE: MoreEntry[] = [];
  if (v.pathDone) coachE.push({ key: 'challenge', emoji: '🎯', title: 'Coach challenge', sub: v.challenge?.title ?? 'a review or stretch lesson aimed at your weakest spot', testID: 'journey-more-challenge',
    action: v.challenge ? { kind: 'lesson', lessonId: v.challenge.lessonId } : { kind: 'askChallenge' }, disabled: !v.challenge && coach.thinking });
  if (v.trail) coachE.push({ key: 'ask', emoji: '✍', title: 'Ask the coach', sub: 'for a different lesson', testID: 'journey-more-ask', action: { kind: 'askNew' }, disabled: coach.thinking });
  if (v.week) coachE.push({ key: 'week', emoji: '🎯', title: `This week: ${v.week.words}`, sub: v.week.habit ? 'a lesson for this' : v.week.why, testID: 'journey-week',
    action: v.week.habit ? { kind: 'askHabit' } : { kind: 'route', href: MORE_ROUTES.skills }, disabled: !v.week.habit && !v.week.why });
  for (const l of v.coachLessons) coachE.push({ key: `coach-${l.lessonId}`, emoji: '✍', title: l.title, sub: 'written for you', testID: `journey-more-coach-${l.lessonId}`, action: { kind: 'lesson', lessonId: l.lessonId } });

  const where: MoreEntry[] = [
    { key: 'level', emoji: '🪜', title: 'Find my level', sub: 'a short placement test', testID: 'journey-find-level', action: { kind: 'route', href: MORE_ROUTES.placement } },
    { key: 'skills', emoji: '🗺️', title: 'Skill map', sub: 'what you can play, by skill', testID: 'journey-skill-map', action: { kind: 'route', href: MORE_ROUTES.skills } },
    { key: 'path', emoji: '🧭', title: 'Full path', sub: 'every stage and lesson', testID: 'journey-more-path', action: { kind: 'route', href: MORE_ROUTES.path } },
    { key: 'technique', emoji: '🥢', title: 'Stick technique', sub: 'how it moves', testID: 'journey-more-technique', action: { kind: 'route', href: MORE_ROUTES.technique } },
  ];
  if (v.setupDue) where.unshift({ key: 'kit', emoji: '🛠', title: 'Check my kit', sub: 'pads and latency', testID: 'journey-check-kit', action: { kind: 'route', href: MORE_ROUTES.setup } });

  return [
    { key: 'play', title: 'More ways to play', entries: play },
    { key: 'coach', title: 'Your coach', entries: coachE },
    { key: 'where', title: 'Where you are', entries: where },
  ].filter(s => s.entries.length);
}

/** The 4th move on Journey after today's set (D10: only then): Beat your best, else the 2-minute challenge. */
export function afterSetMove(v: JourneyView): MoreEntry | null {
  if (!v.afterSet) return null;
  if (v.record) return { key: 'record', emoji: '🏆', title: 'Beat your best', sub: v.record.goal, testID: 'journey-record', action: { kind: 'lesson', lessonId: v.record.lessonId, role: 'record' } };
  if (v.arcade) return { key: 'arcade', emoji: '⏱', title: '2-minute challenge', sub: v.arcade.goal, testID: 'journey-arcade', action: { kind: 'lesson', lessonId: v.arcade.lessonId, mode: 'arcade' } };
  return null;
}

/** The stage strip's one line: the trail's summary, plus the stage song's bars ("· song 5/16 bars"). */
export function stageLine(v: JourneyView): string {
  return [v.trail?.summary, v.song ? `song ${v.song.ready}/${v.song.bars} bars` : null].filter(Boolean).join(' · ');
}

/** A dot's spoken label (the dots carry no text). */
export const dotLabel = (s: TrailStopView) =>
  `${s.title}${s.flag === 'checkpoint' ? ', checkpoint' : s.flag === 'coach' ? ', written by your coach' : ''}: ${s.state === 'done' ? `done${s.stars ? `, ${s.stars} stars` : ''}` : s.state === 'now' ? 'you are here' : 'to come'}`;
