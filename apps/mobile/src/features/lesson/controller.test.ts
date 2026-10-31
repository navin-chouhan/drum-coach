import { describe, expect, it, vi } from 'vitest';
import { CURRICULUM, LESSON_BY_ID, MILESTONES } from '@drum-coach/core/content/curriculum';
import { startProgress, type Lesson, type LessonProgress } from '@drum-coach/core/engine/lesson';
import { RunInputSchema, type RunInput } from '../../data/runs';
import { LessonController, sitting, type LessonDeps } from './controller';
import { flush, playAll, rig } from './fakes.testutil';
import { judge } from './judge';
import { frameOf } from './lessonView';
import { takeFile } from './share';

function setupCtl(lesson: Lesson, progress: Partial<LessonProgress> = {}, extra: Partial<LessonDeps> = {}) {
  const r = rig();
  r.settings.set({ lessons: { [lesson.id]: { ...startProgress(lesson), ...progress } }, voice: false, intro: false }); // the slides have their own tests below
  const runs: RunInput[] = [];
  const deps: LessonDeps = {
    setup: { lesson, hasNext: true }, take: r.take, settings: r.settings, lessons: () => CURRICULUM, lessonById: id => LESSON_BY_ID[id], milestones: MILESTONES,
    today: () => '2026-10-30', saveRun: async run => { runs.push(run); }, defer: fn => fn(), onBack: vi.fn(), onNext: vi.fn(), onItemDone: vi.fn(), ...extra,
  };
  const ctl = new LessonController(deps);
  return { r, ctl, runs, deps, p: () => r.settings.get().lessons[lesson.id] };
}
const money = LESSON_BY_ID['money-8ths'];

describe('lesson controller (LessonPlayer without React)', () => {
  it('before: Play, Hear it, Slower, Skip with their gestures', async () => {
    const { ctl } = setupCtl(money, { step: 2, bpm: 70 });
    const v = ctl.view();
    expect(v.moves.map(m => [m.label, m.gesture])).toEqual([['▶ Play', 'yes'], ['👂 Hear it', 'tom2'], ['🐢 Slower', 'floor'], ['⏭ Skip to next', 'ride']]);
    expect(v.line).toBe(money.steps[2].text);
    expect(v.results).toBeUndefined();
    expect(v.playView).toBe('sheet');
  });

  it('a clean take: verdict, ladder (2nd clean → up), run saved, moves "Play at 75" / "Stay at 70"', async () => {
    const { r, ctl, runs, p } = setupCtl(money, { step: 2, bpm: 70, clean: 1 });
    ctl.moves()[0].run();
    expect(ctl.playing).toBe(true);
    await playAll(r);
    await Promise.resolve();
    expect(p().bpm).toBe(75);
    expect(p().clean).toBe(0);
    const v = ctl.view();
    expect(v.outcome?.event).toBe('up');
    expect(v.line).toMatch(/Up to 75 BPM!$/);
    expect(v.moves.map(m => m.label)).toEqual(['▶ Play at 75', '🎧 Hear your take', '🐢 Stay at 70', '⏭ Skip to next']);
    expect(v.results?.card).toMatchObject({ big: '48', unit: '/48', label: 'notes landed', stars: 3, needed: '39 needed' });
    expect(v.results?.timing?.caption).toBe('48 hits · on average right on the click');
    expect(runs).toHaveLength(1);
    expect(RunInputSchema.safeParse(runs[0]).success).toBe(true);
    expect(runs[0].summary).toMatchObject({ passed: true, lesson: { id: 'money-8ths', step: 3 } });
  });

  it('a rough take slows down and names the bar to fix', async () => {
    const { r, ctl, p } = setupCtl(money, { step: 2, bpm: 70 });
    ctl.moves()[0].run();
    await playAll(r, i => (i % 12 < 6 ? undefined : 0)); // half the notes missed: a rough take
    expect(p().bpm).toBe(60);
    const v = ctl.view();
    expect(v.outcome?.event).toBe('slowDown');
    expect(v.outcome?.passed).toBe(false);
    expect(v.results?.card?.reason).toBeTruthy();
  });

  it('Fix bar N loops the bar 4×, 10 BPM slower, with the guide', async () => {
    const lesson = LESSON_BY_ID['money-8ths'];
    const { r, ctl } = setupCtl(lesson, { step: 3, bpm: 90 }); // 2-bar chart
    ctl.moves()[0].run();
    await playAll(r, i => (i % 24 >= 12 && i % 24 < 20 ? undefined : 0)); // bar 2 shaky in every round
    const v = ctl.view();
    expect(v.results?.fix).toMatchObject({ bar: 2, bpm: v.frame.bpm - 10 });
    v.moves[0].run();
    expect(r.take.state.options).toMatchObject({ fromBar: 2, toBar: 2, repeats: 4, guide: true, zoom: 2 });
  });

  it('kit gestures: crash × 4 stops; yes plays; floor × 2 slows down', async () => {
    const { r, ctl, p } = setupCtl(money, { step: 2, bpm: 70 });
    ctl.padCommand('yes');
    expect(ctl.playing).toBe(true);
    ctl.padCommand('stop');
    expect(ctl.playing).toBe(false);
    ctl.padCommand('slower');
    expect(p().bpm).toBe(65);
    expect(r.take.state.options!.speed * money.steps[2].chart.bpm).toBeCloseTo(65);
  });

  it('wait mode: no verdict, no ladder, not saved', async () => {
    const lesson = LESSON_BY_ID['count-quarters'];
    const { r, ctl, runs, p } = setupCtl(lesson, { bpm: 60 });
    ctl.play(false, 60, true);
    await flush();
    for (let i = 0; i < 16; i++) r.bus.emit('snare', r.clock.now() + i); // 4 bars
    expect(r.take.state.phase).toBe('done');
    expect(ctl.view().line).toBe('Nice and slow. When it feels easy, play it with the click.');
    expect(runs).toHaveLength(0);
    expect(p().bpm).toBe(60);
  });

  it('an interrupted take (D6): kept with ≥ 2 whole bars, flagged, off the ladder', async () => {
    const { r, ctl, runs, p } = setupCtl(money, { step: 2, bpm: 70, clean: 1 });
    ctl.moves()[0].run();
    await flush();
    await playAll(r, () => 0, r.take.state.zero + 9 * r.take.state.beatMs);
    ctl.interrupt();
    expect(p()).toMatchObject({ bpm: 70, clean: 1 });
    expect(ctl.view().line).toMatch(/^Take stopped\. 2 bars kept/);
    expect(runs).toHaveLength(1);
    expect(runs[0].summary).toMatchObject({ interrupted: true, passed: false });
  });

  it('an interrupted take under 2 bars is dropped', async () => {
    const { r, ctl, runs } = setupCtl(money, { step: 2, bpm: 70 });
    ctl.moves()[0].run();
    await flush();
    await playAll(r, () => 0, r.take.state.zero + 5 * r.take.state.beatMs);
    ctl.interrupt();
    expect(runs).toHaveLength(0);
    expect(ctl.view().line).toMatch(/too short to keep/);
  });

  it('an interruption ends at the time native gives (QA2 m6): 3 bars heard late, 1 bar kept → dropped', async () => {
    const { r, ctl, runs } = setupCtl(money, { step: 2, bpm: 70 });
    ctl.moves()[0].run();
    await flush();
    const s = r.take.state;
    await playAll(r, () => 0, s.zero + 13 * s.beatMs);
    ctl.interrupt(s.zero + 5 * s.beatMs);
    expect(runs).toHaveLength(0);
    expect(ctl.view().line).toMatch(/too short to keep/);
  });

  it('finishing the lesson celebrates and ticks the item', async () => {
    const lesson = LESSON_BY_ID['count-quarters'];
    const { r, ctl, deps } = setupCtl(lesson, { bpm: 80 });
    ctl.moves()[0].run();
    await playAll(r);
    const v = ctl.view();
    expect(v.outcome?.event).toBe('lessonDone');
    expect(v.celebration).toMatchObject({ title: 'LESSON COMPLETE!', stars: 3, nextLabel: "Next in today's session →" });
    expect(deps.onItemDone).toHaveBeenCalledOnce();
    ctl.closeCelebration();
    expect(ctl.view().celebration).toBeUndefined();
    expect(ctl.view().moves[0].label).toBe('Next ▶');
  });

  it('the break reminder after 22 minutes of playing', async () => {
    sitting.rest();
    sitting.add(23 * 60);
    const { r, ctl } = setupCtl(money, { step: 2, bpm: 70 });
    ctl.moves()[0].run();
    await playAll(r);
    expect(ctl.view().moves[0].label).toBe('☕ 2-minute break');
    ctl.view().moves[0].run();
    expect(ctl.view().onBreak).toBe(true);
    ctl.endBreak();
    sitting.rest();
  });

  it('Sheet | Highway is remembered in the settings', async () => {
    const { ctl, r } = setupCtl(money);
    ctl.setPlayView('highway');
    expect(r.settings.get().playView).toBe('highway');
    expect(ctl.view().playView).toBe('highway');
  });

  it('share: the take as a MIDI file named like the web', async () => {
    const { r, ctl } = setupCtl(money, { step: 2, bpm: 70 });
    ctl.moves()[0].run();
    await playAll(r);
    const f = ctl.view().take!;
    const file = takeFile(f, 'The money beat / take', new Date(Date.UTC(2026, 9, 30, 19, 45)));
    expect(file.name).toBe('The money beat - take 2026-10-30-19-45.mid');
    expect([...file.bytes.slice(0, 4)]).toEqual([0x4d, 0x54, 0x68, 0x64]); // "MThd"
  });

  it('judge: find your tempo climbs 5 BPM per clean bar', async () => {
    const lesson = LESSON_BY_ID['count-quarters'];
    const r = rig();
    r.take.start(lesson.steps[0].chart, { fromBar: 1, toBar: 1, repeats: 1, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false, probe: true });
    await playAll(r);
    const f = r.take.state.finished!;
    const settings = r.settings.get();
    const out = judge({ f, setup: { lesson, hasNext: false }, frame: frameOf({ lesson, hasNext: false }, startProgress(lesson)), free: [], settings, lessons: CURRICULUM, milestones: MILESTONES,
      lessonById: id => LESSON_BY_ID[id], takeNo: 0, probe: { tempo: 60, accs: [] }, explainProbe: true, today: '2026-10-30' });
    expect(out.probe).toEqual({ tempo: 65, accs: [100] });
    expect(out.outcome.say).toBe('Clean! Now 65…');
  });
});

describe('intro slides (src/play/IntroSlides.tsx, LessonPlayer play())', () => {
  const withIntro = (progress: Partial<LessonProgress> = { step: 2, bpm: 70 }) => {
    const x = setupCtl(money, progress);
    x.r.settings.set({ intro: true });
    return x;
  };

  it('come before the first take of a step: what, who plays what, count it, how it moves; the last Next starts it', () => {
    const { ctl } = withIntro();
    ctl.moves()[0].run();
    expect(ctl.playing).toBe(false);
    const it = ctl.view().intro!;
    expect(it).toMatchObject({ i: 0, last: 3, title: money.title, sub: money.steps[2].title, bpm: 70, what: money.steps[2].text, demo: 'rebound' });
    expect(it.notes.every(n => n.mine)).toBe(true);
    expect(it.focus).toBe(money.how.split(/(?<=\.)\s/)[0]);
    ctl.introBack();
    expect(ctl.view().intro!.i).toBe(0);
    ctl.introNext(); ctl.introNext(); ctl.introBack(); ctl.introNext(); ctl.introNext();
    expect(ctl.view().intro!.i).toBe(3);
    ctl.introNext();
    expect(ctl.view().intro).toBeUndefined();
    expect(ctl.playing).toBe(true);
  });

  it('are shown once per step, again after a tempo jump of more than 10 BPM, never for a demo or wait mode', () => {
    const { ctl } = withIntro();
    ctl.play(true);
    expect(ctl.view().intro).toBeUndefined();
    ctl.stop();
    ctl.play(false, 70, true);
    expect(ctl.view().intro).toBeUndefined();
    ctl.stop();
    ctl.play(false, 70);
    ctl.introClose(); // Esc: the slides go, nothing starts
    expect(ctl.view().intro).toBeUndefined();
    expect(ctl.playing).toBe(false);
    ctl.play(false, 75);
    expect(ctl.playing).toBe(true); // seen at 70: 75 is no jump
    ctl.stop();
    ctl.play(false, 85);
    expect(ctl.view().intro).toBeDefined();
  });

  it('take the kit: the gestures and the coach do nothing but "yes" turns a slide', () => {
    const { ctl, p } = withIntro();
    ctl.moves()[0].run();
    ctl.padCommand('slower');
    expect(p().bpm).toBe(70);
    expect(ctl.runAction({ kind: 'faster', label: 'Faster' })).toBe(true);
    expect(p().bpm).toBe(70);
    ctl.runAction({ kind: 'main' });
    expect(ctl.view().intro!.i).toBe(1);
  });

  it('are off with the setting', () => {
    const { ctl, r } = withIntro();
    r.settings.set({ intro: false });
    ctl.moves()[0].run();
    expect(ctl.playing).toBe(true);
  });
});

describe('ear quiz and transcription steps (EarQuiz.tsx, Transcribe.tsx)', () => {
  it('a quiz step: no gestures or coach moves, its clips play once at the step tempo, done moves on', () => {
    const lesson = LESSON_BY_ID['ear-steady'];
    const { r, ctl, p } = setupCtl(lesson);
    expect(ctl.view().resting).toMatchObject({ quiz: 'steady', transcribe: false });
    ctl.padCommand('yes');
    expect(ctl.playing).toBe(false);
    expect(ctl.runAction({ kind: 'main' })).toBe(true);
    expect(p().step).toBe(0);
    const chart = lesson.steps[0].chart, then = vi.fn();
    ctl.playClip(chart, 1, then);
    expect(r.take.state.options).toMatchObject({ demo: true, fromBar: 1, toBar: chart.bars, repeats: 1, activeLanes: undefined, band: undefined, then });
    expect(r.take.state.options!.speed * chart.bpm).toBeCloseTo(70);
    ctl.stop();
    ctl.finishRest();
    expect(p().step).toBe(1);
  });

  it('a transcription step is resting too; the kit\'s "yes" moves on, as on the web', () => {
    const lesson = LESSON_BY_ID['write-it'];
    const { ctl, p } = setupCtl(lesson);
    expect(ctl.view().resting).toMatchObject({ transcribe: true });
    ctl.padCommand('yes');
    expect(p().step).toBe(1);
  });
});
