import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useCharts, loadBacking, refreshCharts, type StoredChart } from '../content/charts';
import { MILESTONES } from '../content/curriculum';
import { currentMilestone, studentRead } from '../engine/planner';
import { forYou, lateTakes, MAX_SPEED, practiceStart, suggestNext, type RunRow } from '../engine/progress';
import { lastRound } from '../engine/takeMarks';
import { WINDOWS } from '../engine/scoring';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { allLessons } from '../lesson/aiLessons';
import { takeChart } from '../engine/transcribe';
import { audio } from './audio';
import { NotesView } from './NotesView';
import { canRunAction, coachTake, onCoachAction, replyFor, runAction, screenAction, thinkingAbout, useCoach } from '../coach/session';
import { player, playerVersion, start, stop, subscribePlayer, type Finished, type PlayOptions } from './player';
import { LatencyHint, Results, saveRun } from './Results';
import { BarCounter, CoachLine, GoalBar, LiveHint, Move, TempoLadder, TimingLine } from './AtKit';
import { Spark } from '../ui/ProgressView';
import { bandStyle, DEFAULT_CHORDS } from '../engine/band';
import { IntroSlides } from './IntroSlides';
import { beatsPerBar } from '../engine/chart';

const OPTS_KEY = 'drumcoach.playOptions';
type Saved = Omit<PlayOptions, 'fromBar' | 'toBar' | 'backing'> & { chartId: string; climb?: boolean }; // climb: 2 clean takes → +5 BPM, up to 5 above your best
const DEFAULTS: Saved = { chartId: 'rock-8ths', speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false, repeats: 4 };
const KIND_ICON: Record<string, string> = { groove: '🥁', rudiment: '🥢', fill: '💥', song: '🎵', exercise: '🎯' };
const idOf = (t?: Finished) => (t?.chart as { id?: string } | undefined)?.id; // a take's chart
const TABS = [['foryou', 'For you'], ['groove', 'Grooves'], ['rudiment', 'Rudiments and drills'], ['fill', 'Fills'], ['song', 'Songs'], ['ai', 'From your coach']] as const;

/**
 * Practice: pick anything (before you sit down), then play it from the kit. Same moves and gestures as a lesson;
 * the result shows on the screen, and the next step comes from the coach or the rule (suggestNext).
 */
export function PlayView({ pending }: { pending?: { chartId: string; bpm?: number } }) {
  const charts = useCharts();
  useSyncExternalStore(subscribePlayer, playerVersion);
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const [o, setO] = useState<Saved>(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(OPTS_KEY) ?? '{}') }; } catch { return DEFAULTS; }
  });
  const [section, setSection] = useState<{ from: number; to: number } | null>(null);
  const [picking, setPicking] = useState(!pending);
  const [details, setDetails] = useState(false);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [error, setError] = useState('');
  const [intro, setIntro] = useState<{ run: () => void }>();
  const introShown = useRef(new Map<string, number>());
  // The 5-minute warm-up: a few short exercises back to back at their start tempos, about a minute each, no slides.
  const [warm, setWarm] = useState<{ ids: string[]; bpms: number[]; i: number }>();
  const set = (patch: Partial<Saved>) => setO(prev => {
    const next = { ...prev, ...patch };
    try { localStorage.setItem(OPTS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  // "Play this" from the coach/plan/songs: select the chart and set the speed so it lands on the suggested BPM.
  const [applied, setApplied] = useState<typeof pending>();
  const target = pending && pending !== applied ? charts.find(x => x.id === pending.chartId) : undefined;
  if (pending && target) {
    setApplied(pending);
    set({ chartId: target.id, ...(pending.bpm && { speed: Math.min(MAX_SPEED, Math.max(0.5, pending.bpm / target.bpm)) /* the tempo asked for, exactly */ }) });
    setSection(null); setPicking(false);
  }

  useEffect(() => () => stop(), []);
  const mine = player.chart && player.options && !player.options.lesson; // a take of Practice's, not a lesson's
  const justDone = mine && player.phase === 'done' ? player.finished : undefined;
  // The result stays on this screen: save the take and tell the coach once (both are idempotent); the runs are
  // fetched after the save, so suggestions and trophies include this take.
  // Climb: once your takes include this one, 2 clean takes at this tempo move it up 5, up to 5 above your best.
  const [climbedFor, setClimbedFor] = useState<Finished>();
  const chart: StoredChart = charts.find(c => c.id === o.chartId) ?? charts[0];
  const atBpm = (b: number, c: StoredChart = chart) => Math.max(0.5, Math.min(MAX_SPEED, b / c.bpm));
  useEffect(() => {
    void (justDone ? saveRun(justDone) : Promise.resolve()).then(() => fetch('/api/runs')).then(r => r.json()).then((rs: RunRow[]) => {
      setRuns(rs);
      if (!justDone || !o.climb || warm) return;
      const c = charts.find(x => x.id === idOf(justDone)), mine = rs.filter(r => r.chartId === c?.id);
      if (!c || !mine.length) return;
      const sg = suggestNext(mine, [{ id: c.id, title: c.title, bpm: c.bpm, level: c.level }]), cap = Math.max(c.bpm, ...mine.filter(r => r.accuracy >= 90).map(r => Math.round(r.bpm))) + 5;
      if (sg.chartId === c.id && sg.bpm > Math.round(c.bpm * o.speed) && sg.bpm <= cap) { set({ speed: atBpm(sg.bpm, c) }); setClimbedFor(justDone); }
    }).catch(() => {});
    if (justDone && !warm) coachTake(justDone);
  }, [justDone]); // eslint-disable-line react-hooks/exhaustive-deps -- once per take

  const from = Math.min(section?.from ?? 1, chart.bars), to = Math.min(section?.to ?? chart.bars, chart.bars);
  const bpm = Math.round(chart.bpm * o.speed);
  const playing = player.phase === 'playing';
  const [lastTake, setLastTake] = useState<Finished>();
  if (justDone && idOf(justDone) === chart.id && !justDone.options.demo && justDone !== lastTake) setLastTake(justDone);
  const f = playing || idOf(lastTake) !== chart.id ? undefined : lastTake;
  const hints = settings.hints !== false;

  async function go(speed = o.speed, extra?: Partial<PlayOptions>, c: StoredChart = chart) {
    setError(''); setDetails(false);
    let backing: PlayOptions['backing'];
    if (c.hasAudio) {
      try { backing = { buffer: await loadBacking(c.id, audio()), syncOffsetMs: c.syncOffsetMs ?? 0 }; }
      catch { setError('Could not load the backing audio; playing without it.'); }
    }
    // The band under grooves and songs (not under a chart's own backing audio).
    const style = bandStyle(c), band = !backing && getSettings().band !== false && (c.kind === 'groove' || c.kind === 'song') ? { style, chords: DEFAULT_CHORDS[style] } : undefined;
    const sec = c === chart ? { fromBar: from, toBar: to } : { fromBar: 1, toBar: c.bars };
    const run = () => start(c, { ...o, speed, ...sec, backing, hints, band, ...extra });
    // Intro slides before the first take of an exercise (or after a tempo jump of more than 10 BPM); not in the warm-up.
    const b = c.bpm * speed, seen = introShown.current.get(c.id);
    if (!extra?.demo && !extra?.repeats && !o.wait && getSettings().intro !== false && (seen === undefined || Math.abs(seen - b) > 10)) {
      introShown.current.set(c.id, b); setIntro({ run }); return;
    }
    run();
  }
  // about a minute of one warm-up exercise at its start tempo
  const warmTake = (id: string, at: number) => {
    const c = charts.find(x => x.id === id);
    if (!c) return;
    set({ chartId: c.id, speed: atBpm(at, c) }); setSection(null); setPicking(false);
    void go(atBpm(at, c), { repeats: Math.max(1, Math.round(60 / ((beatsPerBar(c) * 60) / at) / c.bars)) }, c);
  };
  const startWarm = (ids: string[], bpms: number[]) => { setWarm({ ids, bpms, i: 0 }); warmTake(ids[0], bpms[0]); };
  useEffect(() => { // the next warm-up exercise starts by itself, 3 s after the last one ends
    if (!warm || !justDone) return;
    const t = setTimeout(() => { if (warm.i + 1 < warm.ids.length) { setWarm({ ...warm, i: warm.i + 1 }); warmTake(warm.ids[warm.i + 1], warm.bpms[warm.i + 1]); } else setWarm(undefined); }, 3000);
    return () => clearTimeout(t);
  }, [justDone]); // eslint-disable-line react-hooks/exhaustive-deps -- once per finished take
  const playAt = (b: number) => { const speed = atBpm(b); set({ speed }); void go(speed); };
  const listen = () => (f && f.hits.length
    ? start(takeChart(f.hits, { zero: f.zero, beatMs: 60000 / (f.chart.bpm * f.options.speed), beats: f.run.beats, beatsPerBar: f.run.beatsPerBar, title: 'Your take', timeSignature: f.chart.timeSignature }), { ...o, fromBar: 1, toBar: 999, repeats: 1, speed: 1, demo: true, wait: false })
    : void go(o.speed, { demo: true, wait: false })); // a demo never waits for hits, even with "Learn it slowly" on
  const nextChart = () => { const n = charts[charts.findIndex(c => c.id === chart.id) + 1] ?? charts[0]; set({ chartId: n.id }); setSection(null); };

  // What next: the coach's suggestion when it answered this take, otherwise the rule (two clean → +5, rough → −10).
  const coach = useCoach(), [opened] = useState(Date.now);
  const reply = replyFor(coach, f, opened);
  const mineRuns = runs.filter(r => r.chartId === chart.id);
  const last = mineRuns[mineRuns.length - 1];
  const sug = f && !f.options.wait && mineRuns.length ? suggestNext(mineRuns, [{ id: chart.id, title: chart.title, bpm: chart.bpm, level: chart.level }]) : undefined;
  const bestClean = Math.max(0, ...mineRuns.filter(r => r.accuracy >= 90).map(r => Math.round(r.bpm)));
  const cap = Math.max(bestClean, chart.bpm) + 5; // Climb stops 5 above your best (or the chart's own tempo)
  const next = sug?.chartId === chart.id ? sug.bpm : bpm;
  // Before the first take: start where you left off, a bit slower if last time was rough.
  const startAt = practiceStart(bpm, last, studentRead(getSettings().lessons, runs));
  const act = screenAction(reply?.action, '⏭ Next one');
  const main = warm ? { label: '⏹ Stop the warm-up', run: () => { setWarm(undefined); stop(); } }
    : act && canRunAction(act) ? { label: act.label, run: () => void runAction(act) }
    : !f ? (startAt !== bpm ? { label: `▶ Play at ${startAt}`, run: () => playAt(startAt) } : { label: '▶ Play', run: () => void go() })
    : next > bpm ? { label: `🐇 Try ${next}`, run: () => playAt(next) }
    : next < bpm ? { label: `🐢 Try ${next}`, run: () => playAt(next) }
    : { label: `▶ Again at ${bpm}`, run: () => void go() };
  const againIsMain = !warm && !(act && canRunAction(act)) && !!f && next === bpm; // the last move above
  const line = warm ? (playing ? '' : warm.i + 1 < warm.ids.length && justDone ? `Warm-up ${warm.i + 1} of ${warm.ids.length} done. Next: ${charts.find(c => c.id === warm.ids[warm.i + 1])?.title}…` : `Warm-up ${warm.i + 1} of ${warm.ids.length}: ${chart.title} at ${bpm}.`)
    : reply?.show ?? reply?.say ?? (f ? (f === climbedFor ? `Two clean takes in a row! Up to ${bpm}.` : next > bpm ? `Two clean takes in a row! Ready for ${next}?` : next < bpm ? `Let's take it to ${next} and lock it in.` : `${f.stats.accuracy >= 90 ? 'Nice!' : 'Good.'} Once more at ${bpm}?`)
    : last && last.accuracy < 60 ? `Last time ${Math.round(last.bpm)} BPM was tricky. Let's warm up at ${startAt}.`
    : last ? `Last time ${Math.round(last.bpm)} BPM, ${Math.round(last.accuracy)}% landed. Start there?`
    : chart.description ?? `Ready when you are: ${bpm} BPM.`);

  // From the kit: yes = the main move, floor / tom 1 = 5 BPM slower / faster and play, ride = next.
  useEffect(() => onCoachAction(a => {
    if (picking || intro) return false; // the intro slides have the kit's taps
    if (a.kind === 'main') { main.run(); return true; }
    if (a.kind === 'listen') { listen(); return true; }
    if (a.kind === 'next') { nextChart(); return true; }
    if (a.bpm) { playAt(a.bpm); return true; }
    if (a.kind === 'slower' || a.kind === 'faster') { playAt(bpm + (a.kind === 'slower' ? -5 : 5)); return true; }
    void go(); return true;
  }));

  async function nudge(ms: number) {
    const syncOffsetMs = (chart.syncOffsetMs ?? 0) + ms;
    await fetch(`/api/charts/${encodeURIComponent(chart.id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ syncOffsetMs }) });
    await refreshCharts();
  }

  // The sheet needs each note's index to mark how it went after a take (as on the lesson screen).
  const idleChart = useMemo(() => ({ ...chart, notes: chart.notes.map((n, i) => ({ ...n, i })) }), [chart]);
  const take = useMemo(() => {
    if (!f || playing || f.options.demo || f.options.wait || !f.results.length) return undefined;
    if (f.chart.notes.length !== chart.notes.length || f.chart.notes.some((n, i) => n.t !== chart.notes[i].t || n.drum !== chart.notes[i].drum)) return undefined;
    const r = lastRound(chart, f.run, f.results, f.options, f.extras.map(h => (h.time - f.zero) / (60000 / (f.chart.bpm * f.options.speed))));
    return { ...r, mark: (i: number) => r.marks.get(i) };
  }, [f, playing, chart]);
  // the whole path done (no current milestone): the last stage's level, not back to 1
  const level = Math.max(1, currentMilestone(MILESTONES, allLessons(), settings.lessons, settings.profile)?.level ?? MILESTONES[MILESTONES.length - 1].level);
  if (picking) return <Chooser charts={charts} runs={runs} level={level} onPick={id => { set({ chartId: id }); setSection(null); setPicking(false); }} onWarm={startWarm} />;
  if (f && details) return <Results f={f} onAgain={() => void go()} onBack={() => setDetails(false)} />;

  const pickBar = (b: number) => setSection(!section || section.from !== section.to ? { from: b, to: b } : { from: Math.min(section.from, b), to: Math.max(section.from, b) });
  const chipT = (label: string, note: string, on: boolean, flip: () => void) => <button className={on ? 'on' : ''} aria-pressed={on} onClick={flip}><span>{label}<small>{note}</small></span></button>;
  const s = f?.stats;
  const myPads = [...new Set(chart.notes.filter(n => !n.auto).map(n => n.drum))];
  const recent = mineRuns.slice(-12);
  const lean = lateTakes(mineRuns);
  const bestRun = mineRuns.reduce<RunRow | undefined>((x, r) => (!x || r.accuracy > x.accuracy ? r : x), undefined);
  const history = mineRuns.length ? `${mineRuns.length} take${mineRuns.length === 1 ? '' : 's'} here. Best: ${Math.round(bestRun!.accuracy)}% landed at ${Math.round(bestRun!.bpm)} BPM.${lean ? ' They all land late by about the same amount: check the latency in Setup first.'
    : recent.length >= 3 && recent.slice(-3).every(r => r.accuracy < 60) ? ' The last few were hard: a slower tempo helps it stick.' : ''}` : 'Your takes of this one show up here.';

  return (
    <div className={`lessonScreen practice ${playing ? 'playing' : ''}`}>
      {intro && <IntroSlides title={chart.title} bpm={bpm} what={chart.description ?? `${chart.bars} bar${chart.bars === 1 ? '' : 's'}, ${o.repeats} times round.`} notes={chart.notes.filter(n => n.t >= (from - 1) * beatsPerBar(chart)).map(n => ({ ...n, t: n.t - (from - 1) * beatsPerBar(chart) }))}
        beatsPerBar={beatsPerBar(chart)} focus={f?.cues.at(-1)?.text} onDone={() => { const r = intro.run; setIntro(undefined); r(); }} onClose={() => setIntro(undefined)} />}
      <div className="lbar card">
        <button className="link back" onClick={() => { stop(); setWarm(undefined); setPicking(true); }}>← All exercises</button>
        <h2>{chart.title}<small>{KIND_ICON[chart.kind ?? 'exercise']} {chart.kind ?? 'exercise'}{chart.source === 'ai' ? ' · ✍ by your coach' : ''}{warm ? ` · warm-up ${warm.i + 1} of ${warm.ids.length}` : ''}</small></h2>
        <span className="tempoBox">
          {!playing && <button className="st" aria-label="5 BPM slower" onClick={() => set({ speed: atBpm(bpm - 5) })}>−</button>}
          <span className="n">{bpm}<small>BPM</small></span>
          {!playing && <button className="st" aria-label="5 BPM faster" onClick={() => set({ speed: atBpm(bpm + 5) })}>+</button>}
          {bestClean > 0 && <span className="bestHere">best clean here: {bestClean} BPM</span>}
        </span>
        <button className={`hintToggle ${hints ? 'on' : ''}`} aria-pressed={hints} onClick={() => setSettings({ hints: !hints })} title="Show the count, which hand or foot plays each note, and the beat ball">💡 Hints <kbd>H</kbd></button>
      </div>

      {playing ? <LiveHint /> : <>
        <CoachLine line={line} thinking={!reply && thinkingAbout(coach, f)} />
        <div className="moves five">
          <Move go label={main.label} onClick={main.run} />
          <Move label={f && f.hits.length ? '🎧 Hear your take' : '👂 Hear it'} gesture="tom 2 × 2" onClick={listen} />
          {f && !againIsMain ? <Move alt label={`▶ Again at ${bpm}`} onClick={() => void go()} />
            : <Move alt label="🐇 +5 BPM" gesture="tom 1 × 2" onClick={() => playAt(bpm + 5)} />}
          <Move alt label="🐢 −5 BPM" gesture="floor × 2" onClick={() => playAt(bpm - 5)} />
          <Move alt label="⏭ Next one" gesture="ride × 2" onClick={nextChart} />
        </div>
      </>}

      <div className="lessonMain">
        <section className="lessonMusic">
          {!playing && <div className="barPick">{chart.bars} bar{chart.bars === 1 ? '' : 's'}{chart.bars > 1 && <> · Loop:
            {chart.bars <= 16 ? <>
              <button className={!section ? 'on' : ''} onClick={() => setSection(null)}>All</button>
              {Array.from({ length: chart.bars }, (_, i) => i + 1).map(b => <button key={b} className={section && b >= from && b <= to ? 'on' : ''} onClick={() => pickBar(b)}>{b}</button>)}
            </> : <>
              <input type="number" min={1} max={chart.bars} value={from} aria-label="From bar" onChange={e => setSection({ from: Math.max(1, +e.target.value || 1), to: Math.max(to, +e.target.value || 1) })} />
              to <input type="number" min={from} max={chart.bars} value={to} aria-label="To bar" onChange={e => setSection({ from, to: Math.max(from, +e.target.value || from) })} />
            </>}</>}
            {' '}· <button onClick={() => set({ repeats: Math.max(1, o.repeats - 1) })} aria-label="Fewer times round">−</button> {o.repeats}× round <button onClick={() => set({ repeats: Math.min(50, o.repeats + 1) })} aria-label="More times round">+</button>
          </div>}
          <NotesView idle={{ chart: idleChart, fromBar: from, toBar: to, bpm, hints, zoom: 1.3, marks: take?.mark, extras: take?.extras }} />
          {!playing && (hints || take) && <p className="hintLegend">
            {take ? <><span className="on">on it</span><span className="late">late / early</span><span className="missed">missed</span><span>× extra hit</span></>
              : <span>R right hand · L left hand · K kick · H hi-hat foot</span>}</p>}
          {take && <TimingLine offsets={take.offsets} zone={WINDOWS.perfect} missed={take.missed} extra={f?.stats.extra ?? 0} />}
          <GoalBar kit={myPads} right={playing ? <button className="primary big stopBtn" onClick={() => { setWarm(undefined); stop(); }}>Stop <small>(crash × 4, Esc)</small></button>
            : o.climb && <TempoLadder bpm={bpm} start={Math.min(bpm, cap - 5)} target={cap} />}>
            {playing ? <BarCounter /> : <span className="climb">
              <button className={`sw ${o.climb ? 'on' : ''}`} role="switch" aria-checked={!!o.climb} aria-label="Climb" onClick={() => set({ climb: !o.climb })} />
              <span><b>Climb</b>: after 2 clean takes the tempo goes up 5, until {cap}.<small>{o.climb ? 'On: it climbs by itself.' : 'Off: the tempo stays where you put it.'}</small></span></span>}
          </GoalBar>
        </section>
        {!playing && <aside className="lessonSide">
          {f && s ? <div className={`card result ${s.accuracy >= 90 ? 'pass' : ''}`}>
            <h3>Your take</h3>
            <div className="top"><span className="bigN">{s.total - s.miss}<small>/{s.total}</small></span><span><b>notes landed</b><br /><span className="small">{s.streak} in a row · {s.recoveries} comebacks</span></span></div>
            {f.cues.length > 0 && <p className="tip">💡 {f.cues[f.cues.length - 1].text}</p>}
            <LatencyHint f={f} />
            <p className="small"><button className="link" onClick={() => setDetails(true)}>details and history</button> · <button className="link" onClick={() => void go(o.speed, { demo: true, wait: false })}>👂 hear it right</button></p>
          </div> : chart.description && <div className="card"><h3>What it is</h3><p>{chart.description}</p></div>}
          <div className="card">
            <h3>How it plays</h3>
            <div className="chipGrid">
              {chipT('🔔 Click', 'on every beat', o.metronome, () => set({ metronome: !o.metronome }))}
              {chipT('⁘ 8th click', 'click on the &s too', o.subdivision === 2, () => set({ subdivision: o.subdivision === 2 ? 1 : 2 }))}
              {chipT('1 bar count-in', 'before each take', o.countInBars > 0, () => set({ countInBars: o.countInBars ? 0 : 1 }))}
              {chipT('🎶 Play along', 'I play softly under you', !!o.guide, () => set({ guide: !o.guide }))}
              {chipT('🐢 Wait mode', 'waits for each note', o.wait, () => set({ wait: !o.wait }))}
              {chipT('💡 Hints', 'count, sticking, beat ball', hints, () => setSettings({ hints: !hints }))}
              {chipT('📋 Intro slides', 'before the first take', settings.intro !== false, () => setSettings({ intro: settings.intro === false }))}
            </div>
          </div>
          <div className="card"><h3>Your takes here</h3>
            <div className="hist">{recent.length > 1 && <Spark values={recent.map(r => Math.round(r.accuracy))} min={0} max={100} unit="% landed" label={`Notes landed in your last ${recent.length} takes`} />}<span>{history}</span></div></div>
          <details className="card">
            <summary>⚙ More</summary>
            <label className="check"><input type="checkbox" checked={settings.browserSounds} onChange={e => setSettings({ browserSounds: e.target.checked })} /> Browser drum sounds (turn the module down)</label>
            {settings.latencyMs !== 0 && <p className="small">Latency correction: {settings.latencyMs} ms</p>}
            {chart.hasAudio && <>
              <p className="small">Song sync: <b>{chart.syncOffsetMs ?? 0} ms</b>. If the notes arrive before the music, increase it.</p>
              <div className="actions">{[-50, -10, 10, 50].map(ms => <button key={ms} onClick={() => void nudge(ms)}>{ms > 0 ? '+' : ''}{ms}</button>)}</div>
            </>}
          </details>
          {error && <p className="warn">{error}</p>}
        </aside>}
      </div>
    </div>
  );
}

/**
 * Choosing what to practise, from the throne: what you played last on top, the For you cards with a ring the ride
 * moves (ride × 2) and the hi-hat plays (pedal × 3), an optional 5-minute warm-up (tom 1 × 2), then tabs and search.
 */
function Chooser({ charts, runs, level, onPick, onWarm }: { charts: StoredChart[]; runs: RunRow[]; level: number; onPick: (id: string) => void; onWarm: (ids: string[], bpms: number[]) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('foryou');
  const [q, setQ] = useState('');
  const read = useMemo(() => studentRead(getSettings().lessons, runs), [runs]);
  const picks = useMemo(() => forYou(charts, runs, level, 8, read.pace), [charts, runs, level, read.pace]);
  const startOf = (c: StoredChart) => practiceStart(c.bpm, runs.filter(r => r.chartId === c.id).at(-1), read);
  const best = (id: string) => Math.max(0, ...runs.filter(r => r.chartId === id && r.accuracy >= 90).map(r => Math.round(r.bpm)));
  // Pick up where you left off: the last Practice exercise you played (lessons and songs have their own places).
  const lastRun = [...runs].reverse().find(r => charts.some(c => c.id === r.chartId));
  const resume = lastRun && charts.find(c => c.id === lastRun.chartId);
  const cards = picks.filter(x => x.chart !== resume).slice(0, 3);
  const [picked, setFocus] = useState<number>(); // the ring: -1 = the card you played last; until moved, it starts there
  const focus = picked ?? (resume ? -1 : 0);
  const focused = focus < 0 ? resume : cards[focus]?.chart;
  const warmList = [...(resume ? [resume] : []), ...cards.map(x => x.chart)].slice(0, 4);
  const warm = () => onWarm(warmList.map(c => c.id), warmList.map(startOf));
  useSyncExternalStore(subscribePlayer, playerVersion);
  const hearing = player.phase === 'playing' && !!player.options?.demo;
  const hear = (c?: StoredChart) => { if (hearing) { stop(); return; } if (c) start(c, { fromBar: 1, toBar: c.bars, repeats: 1, speed: startOf(c) / c.bpm, metronome: true, subdivision: 1, countInBars: 1, wait: false, demo: true }); };
  const step = () => setFocus(focus + 1 >= cards.length ? (resume ? -1 : 0) : focus + 1);
  const onAction = useEffectEvent((a: Parameters<Parameters<typeof onCoachAction>[0]>[0]) => {
    if (a.kind === 'main' && focused) { onPick(focused.id); return true; }
    if (a.kind === 'next') { step(); return true; }
    if (a.kind === 'listen') { hear(focused); return true; }
    if (a.kind === 'faster') { warm(); return true; }
    return false;
  });
  useEffect(() => onCoachAction(a => onAction(a)), []);
  const count = (id: (typeof TABS)[number][0]) => charts.filter(c => (id === 'ai' ? c.source === 'ai' : id === 'rudiment' ? ['rudiment', 'exercise'].includes(c.kind ?? 'exercise') : c.kind === id)).length;
  const list = q.trim() ? charts.filter(c => c.title.toLowerCase().includes(q.trim().toLowerCase())).map(chart => ({ chart, why: '' }))
    : tab === 'foryou' ? []
    // Exercises (imported or untyped charts) live under Rudiments and drills, so every chart has a tab.
    : charts.filter(c => (tab === 'ai' ? c.source === 'ai' : tab === 'rudiment' ? ['rudiment', 'exercise'].includes(c.kind ?? 'exercise') : c.kind === tab)).map(chart => ({ chart, why: '' }));
  const plays = (c: StoredChart) => `starts at ${startOf(c)} today${best(c.id) ? ` · best clean ${best(c.id)}` : ''} · ${c.bars} bar${c.bars === 1 ? '' : 's'}`;
  const tabs = TABS.filter(([id]) => id !== 'foryou' && count(id) > 0);
  return (
    <div className="lessonScreen practice">
      <div className="pickTop">
        <div className={`card resume ${focus < 0 ? 'focus' : ''}`}>
          {resume ? <div className="resumeBig"><span className="ic" aria-hidden>{KIND_ICON[resume.kind ?? 'exercise']}</span>
            <div className="kicker"><span>Pick up where you left off</span>played {new Date(lastRun.startedAt).toLocaleDateString('en', { weekday: 'short' })} · {runs.filter(r => r.chartId === resume.id).length} takes</div>
            <h2>{resume.title}</h2>
            <div>{resume.description && <p>{resume.description}</p>}
              <div className="meta"><span className="pill">starts at {startOf(resume)} today</span>{best(resume.id) > 0 && <span className="pill">best clean: {best(resume.id)} BPM</span>}{resume.source === 'ai' && <span className="pill">✍ by your coach</span>}</div></div>
          </div> : <p className="resumeNew">Pick something below. <b>Ride × 2</b> moves the yellow ring, <b>hi-hat pedal × 3</b> plays it.</p>}
          <div className="moves" style={{ '--n': 2 } as React.CSSProperties}>
            <Move go label={focused ? (focus < 0 ? '▶ Play it' : `▶ Play ${focused.title}`) : '▶ Play'} onClick={() => focused && onPick(focused.id)} />
            <Move label={hearing ? '■ Stop' : '👂 Hear it'} gesture="tom 2 × 2" onClick={() => hear(focused)} />
            <Move alt label="⏭ Next card" gesture="ride × 2" onClick={step} />
          </div>
        </div>
        {warmList.length > 1 && <div className="card warm"><h3>{warmList.length}-minute warm-up</h3>
          <p>A few short exercises, one after the other, at the tempos For you picks. Just loosen up.</p>
          <ol>{warmList.map(c => <li key={c.id}>{c.title} <span>1 min · {startOf(c)}</span></li>)}</ol>
          <Move alt label="🔥 Start the warm-up" gesture="tom 1 × 2" onClick={warm} />
        </div>}
      </div>
      <div className="browse"><span className="lbl">For you</span><span className="small">ride × 2 moves the ring · hi-hat pedal × 3 plays it</span></div>
      <div className="grid4">
        {cards.map(({ chart: c, why }, i) => (
          <button key={c.id} className={`exCard2 ${focus === i ? 'focus' : ''} ${c.source === 'ai' ? 'ai' : ''}`} onClick={() => onPick(c.id)} onFocus={() => setFocus(i)}>
            <span className="ic" aria-hidden>{KIND_ICON[c.kind ?? 'exercise']}</span>{why && <span className="tag">{why}</span>}
            <b>{c.title}</b><span className="small">{plays(c)}</span></button>
        ))}
        <button className="exCard2 all" onClick={() => setTab(tabs[0]?.[0] ?? 'groove')}><span className="ic" aria-hidden>＋</span><b>All exercises</b>
          <span className="small">{tabs.map(([id, label]) => `${label} ${count(id)}`).join(' · ')}</span></button>
      </div>
      <div className="browse">
        <div className="tabRow">{TABS.map(([id, label]) => (id === 'foryou' || count(id) > 0) && <button key={id} className={tab === id && !q ? 'on' : ''} onClick={() => { setTab(id); setQ(''); }}>{label}{id !== 'foryou' && <small> {count(id)}</small>}</button>)}</div>
        <span className="sp" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Search" aria-label="Search exercises" />
      </div>
      {(q.trim() || tab !== 'foryou') && <div className="card">
        {list.length === 0 && <p className="small">Nothing here yet.</p>}
        <div className="exGrid">
          {list.map(({ chart: c }) => (
            <button key={c.id} className={`exCard ${c.source === 'ai' ? 'ai' : ''}`} onClick={() => onPick(c.id)}>
              <span className="ic" aria-hidden>{KIND_ICON[c.kind ?? 'exercise']}</span>
              <b>{c.title}</b>
              <span className="small">{plays(c)}</span>
            </button>
          ))}
        </div>
      </div>}
    </div>
  );
}
