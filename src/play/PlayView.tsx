import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useCharts, loadBacking, refreshCharts, type StoredChart } from '../content/charts';
import { MILESTONES } from '../content/curriculum';
import { currentMilestone } from '../engine/planner';
import { forYou, MAX_SPEED, suggestNext, type RunRow } from '../engine/progress';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { allLessons } from '../lesson/aiLessons';
import { takeChart } from '../engine/transcribe';
import { audio } from './audio';
import { NotesView } from './NotesView';
import { KitView } from '../ui/KitView';
import { canRunAction, coachTake, onCoachAction, replyFor, runAction, thinkingAbout, useCoach } from '../coach/session';
import { player, playerVersion, start, stop, subscribePlayer, type Finished, type PlayOptions } from './player';
import { LatencyHint, Results, saveRun } from './Results';
import { CoachLine, LiveHint, Move } from './AtKit';
import { IntroSlides } from './IntroSlides';
import { beatsPerBar } from '../engine/chart';

const OPTS_KEY = 'drumcoach.playOptions';
type Saved = Omit<PlayOptions, 'fromBar' | 'toBar' | 'backing'> & { chartId: string };
const DEFAULTS: Saved = { chartId: 'rock-8ths', speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false, repeats: 4 };
const KIND_ICON: Record<string, string> = { groove: '🥁', rudiment: '🥢', fill: '💥', song: '🎵', exercise: '🎯' };
const TABS = [['foryou', 'For you'], ['groove', 'Grooves'], ['rudiment', 'Rudiments'], ['fill', 'Fills'], ['song', 'Songs'], ['ai', 'From your coach']] as const;

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
  useEffect(() => { fetch('/api/runs').then(r => r.json()).then(setRuns).catch(() => {}); }, [justDone]);
  // The result stays on this screen: save the take and tell the coach once (both are idempotent).
  useEffect(() => { if (justDone) { saveRun(justDone); coachTake(justDone); } }, [justDone]);

  const chart: StoredChart = charts.find(c => c.id === o.chartId) ?? charts[0];
  const from = Math.min(section?.from ?? 1, chart.bars), to = Math.min(section?.to ?? chart.bars, chart.bars);
  const bpm = Math.round(chart.bpm * o.speed);
  const playing = player.phase === 'playing';
  const lastTake = useRef<Finished>(undefined);
  const idOf = (t?: Finished) => (t?.chart as { id?: string } | undefined)?.id;
  if (justDone && idOf(justDone) === chart.id && !justDone.options.demo) lastTake.current = justDone;
  const f = playing || idOf(lastTake.current) !== chart.id ? undefined : lastTake.current;
  const hints = settings.hints !== false;

  async function go(speed = o.speed, extra?: Partial<PlayOptions>) {
    setError(''); setDetails(false);
    let backing: PlayOptions['backing'];
    if (chart.hasAudio) {
      try { backing = { buffer: await loadBacking(chart.id, audio()), syncOffsetMs: chart.syncOffsetMs ?? 0 }; }
      catch { setError('Could not load the backing audio; playing without it.'); }
    }
    const run = () => start(chart, { ...o, speed, fromBar: from, toBar: to, backing, hints, ...extra });
    // Intro slides before the first take of an exercise (or after a tempo jump of more than 10 BPM).
    const b = chart.bpm * speed, seen = introShown.current.get(chart.id);
    if (!extra?.demo && !o.wait && getSettings().intro !== false && (seen === undefined || Math.abs(seen - b) > 10)) {
      introShown.current.set(chart.id, b); setIntro({ run }); return;
    }
    run();
  }
  const atBpm = (b: number) => Math.max(0.5, Math.min(MAX_SPEED, b / chart.bpm));
  const playAt = (b: number) => { const speed = atBpm(b); set({ speed }); void go(speed); };
  const listen = () => (f && f.hits.length
    ? start(takeChart(f.hits, { zero: f.zero, beatMs: 60000 / (f.chart.bpm * f.options.speed), beats: f.run.beats, beatsPerBar: f.run.beatsPerBar, title: 'Your take', timeSignature: f.chart.timeSignature }), { ...o, fromBar: 1, toBar: 999, repeats: 1, speed: 1, demo: true, wait: false })
    : void go(o.speed, { demo: true, wait: false })); // a demo never waits for hits, even with "Learn it slowly" on
  const nextChart = () => { const n = charts[charts.findIndex(c => c.id === chart.id) + 1] ?? charts[0]; set({ chartId: n.id }); setSection(null); };

  // What next: the coach's suggestion when it answered this take, otherwise the rule (two clean → +5, rough → −10).
  const coach = useCoach(), opened = useRef(Date.now()).current;
  const reply = replyFor(coach, f, opened);
  const mineRuns = runs.filter(r => r.chartId === chart.id);
  const last = mineRuns[mineRuns.length - 1];
  const sug = f && !f.options.wait && mineRuns.length ? suggestNext(mineRuns, [{ id: chart.id, title: chart.title, bpm: chart.bpm, level: chart.level }]) : undefined;
  const next = sug?.chartId === chart.id ? sug.bpm : bpm;
  // Before the first take: start where you left off, a bit slower if last time was rough.
  const startAt = last ? Math.max(40, Math.round(last.bpm) - (last.accuracy < 60 ? 10 : 0)) : bpm;
  const main = reply?.action && canRunAction(reply.action) ? { label: reply.action.label, run: () => void runAction(reply.action!) }
    : !f ? (startAt !== bpm ? { label: `▶ Play at ${startAt}`, run: () => playAt(startAt) } : { label: '▶ Play', run: () => void go() })
    : next > bpm ? { label: `🐇 Try ${next}`, run: () => playAt(next) }
    : next < bpm ? { label: `🐢 Try ${next}`, run: () => playAt(next) }
    : { label: `▶ Again at ${bpm}`, run: () => void go() };
  const line = reply?.say ?? (f ? (next > bpm ? `Two clean takes in a row! Ready for ${next}?` : next < bpm ? `Let's take it to ${next} and lock it in.` : `${f.stats.accuracy >= 90 ? 'Nice!' : 'Good.'} Once more at ${bpm}?`)
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

  // the whole path done (no current milestone): the last stage's level, not back to 1
  const level = Math.max(1, currentMilestone(MILESTONES, allLessons(), settings.lessons, settings.profile)?.level ?? MILESTONES[MILESTONES.length - 1].level);
  if (picking) return <Chooser charts={charts} runs={runs} level={level} onPick={id => { set({ chartId: id }); setSection(null); setPicking(false); }} />;
  if (f && details) return <Results f={f} onAgain={() => void go()} onBack={() => setDetails(false)} />;

  const pickBar = (b: number) => setSection(!section || section.from !== section.to ? { from: b, to: b } : { from: Math.min(section.from, b), to: Math.max(section.from, b) });
  const toggle = (label: string, on: boolean, flip: () => void) => <button className="tg" aria-pressed={on} onClick={flip}>{label} <em className={on ? '' : 'off'}>{on ? 'on' : 'off'}</em></button>;
  const s = f?.stats;

  return (
    <div className={`lessonScreen ${playing ? 'playing' : ''}`}>
      {intro && <IntroSlides title={chart.title} bpm={bpm} what={chart.description ?? `${chart.bars} bar${chart.bars === 1 ? '' : 's'}, ${o.repeats} times round.`} notes={chart.notes.filter(n => n.t >= (from - 1) * beatsPerBar(chart)).map(n => ({ ...n, t: n.t - (from - 1) * beatsPerBar(chart) }))}
        beatsPerBar={beatsPerBar(chart)} focus={f?.cues.at(-1)?.text} onDone={() => { const r = intro.run; setIntro(undefined); r(); }} onClose={() => setIntro(undefined)} />}
      <div className="lbar card">
        <button className="link back" onClick={() => { stop(); setPicking(true); }}>← All exercises</button>
        <h2>{chart.title}</h2>
        <span className="toolBadge">{KIND_ICON[chart.kind ?? 'exercise']} {(chart.kind ?? 'exercise').toUpperCase()}{chart.source === 'ai' ? ' · BY YOUR COACH' : ''}</span>
        <span className="bigTempo">
          {!playing && <button className="tempoStep" aria-label="5 BPM slower" onClick={() => set({ speed: atBpm(bpm - 5) })}>−</button>}
          {bpm} <small>BPM</small>
          {!playing && <button className="tempoStep" aria-label="5 BPM faster" onClick={() => set({ speed: atBpm(bpm + 5) })}>+</button>}
        </span>
      </div>

      {playing ? <LiveHint /> : <>
        <CoachLine line={line} thinking={!reply && thinkingAbout(coach, f)} />
        <div className="moves five">
          <Move go label={main.label} onClick={main.run} />
          <Move label={f && f.hits.length ? '🎧 Hear your take' : '👂 Hear it'} gesture="tom 2 × 2" onClick={listen} />
          {f && !main.label.startsWith('▶ Again') ? <Move alt label={`▶ Again at ${bpm}`} onClick={() => void go()} />
            : <Move alt label="🐇 +5 BPM" gesture="tom 1 × 2" onClick={() => playAt(bpm + 5)} />}
          <Move alt label="🐢 −5 BPM" gesture="floor × 2" onClick={() => playAt(bpm - 5)} />
          <Move alt label="⏭ Next one" gesture="ride × 2" onClick={nextChart} />
        </div>
      </>}

      <div className="lessonMain">
        <section className="lessonMusic">
          {playing && <button className="primary big stopBtn" onClick={stop}>Stop <small>(crash × 4, Esc)</small></button>}
          {!playing && chart.bars > 1 && <div className="barPick">Loop bars:
            {chart.bars <= 16 ? <>
              <button className={!section ? 'on' : ''} onClick={() => setSection(null)}>All</button>
              {Array.from({ length: chart.bars }, (_, i) => i + 1).map(b => <button key={b} className={section && b >= from && b <= to ? 'on' : ''} onClick={() => pickBar(b)}>{b}</button>)}
            </> : <>
              <input type="number" min={1} max={chart.bars} value={from} aria-label="From bar" onChange={e => setSection({ from: Math.max(1, +e.target.value || 1), to: Math.max(to, +e.target.value || 1) })} />
              to <input type="number" min={from} max={chart.bars} value={to} aria-label="To bar" onChange={e => setSection({ from, to: Math.max(from, +e.target.value || from) })} />
            </>}
            · <button onClick={() => set({ repeats: Math.max(1, o.repeats - 1) })} aria-label="Fewer times round">−</button> {o.repeats}× round <button onClick={() => set({ repeats: Math.min(50, o.repeats + 1) })} aria-label="More times round">+</button>
          </div>}
          <NotesView idle={{ chart, fromBar: from, toBar: to, bpm, hints, zoom: 1.6 }} />
          {hints && <p className="hintLegend">R right hand · L left hand · K kick · H hi-hat foot</p>}
        </section>
        {!playing && <aside className="lessonSide">
          {f && s ? <div className={`card result ${s.accuracy >= 90 ? 'pass' : ''}`}>
            <div className="nums">
              <div><b>{s.total - s.miss}/{s.total}</b><span>landed</span></div>
              <div><b>{s.streak}</b><span>in a row</span></div>
              <div><b>{s.recoveries}</b><span>comebacks</span></div>
            </div>
            {f.cues.length > 0 && <p className="tip">💡 {f.cues[f.cues.length - 1].text}</p>}
            <LatencyHint f={f} />
            <p className="small">{mineRuns.some(r => r.accuracy >= 90) ? `Best here: ${Math.max(...mineRuns.filter(r => r.accuracy >= 90).map(r => Math.round(r.bpm)))} BPM at 90%+ · ` : ''}
              <button className="link" onClick={() => setDetails(true)}>details and history</button> · <button className="link" onClick={() => void go(o.speed, { demo: true, wait: false })}>👂 hear it right</button></p>
          </div> : chart.description && <div className="card"><p>{chart.description}</p></div>}
          <div className="card toggles">
            <h3>How it plays</h3>
            {toggle('🔔 Click', o.metronome, () => set({ metronome: !o.metronome }))}
            {toggle('Click on every 8th', o.subdivision === 2, () => set({ subdivision: o.subdivision === 2 ? 1 : 2 }))}
            {toggle('1 bar count-in', o.countInBars > 0, () => set({ countInBars: o.countInBars ? 0 : 1 }))}
            {toggle('🎶 Play along (I play softly under you)', !!o.guide, () => set({ guide: !o.guide }))}
            {toggle('🐢 Wait mode (waits for each note)', o.wait, () => set({ wait: !o.wait }))}
            {toggle('💡 Hints (key H)', hints, () => setSettings({ hints: !hints }))}
            {toggle('📋 Intro slides before the first take', settings.intro !== false, () => setSettings({ intro: settings.intro === false }))}
          </div>
          <details className="card">
            <summary>⚙ More</summary>
            <label className="check"><input type="checkbox" checked={settings.browserSounds} onChange={e => setSettings({ browserSounds: e.target.checked })} /> Browser drum sounds (turn the module down)</label>
            {settings.latencyMs !== 0 && <p className="small">Latency correction: {settings.latencyMs} ms</p>}
            {chart.hasAudio && <>
              <p className="small">Song sync: <b>{chart.syncOffsetMs ?? 0} ms</b>. If the notes arrive before the music, increase it.</p>
              <div className="actions">{[-50, -10, 10, 50].map(ms => <button key={ms} onClick={() => nudge(ms)}>{ms > 0 ? '+' : ''}{ms}</button>)}</div>
            </>}
          </details>
          {error && <p className="warn">{error}</p>}
          <div className="lessonKit"><KitView /></div>
        </aside>}
      </div>
    </div>
  );
}

/** Choosing what to practise (before you sit down): "For you" first, tabs by kind, and search. */
function Chooser({ charts, runs, level, onPick }: { charts: StoredChart[]; runs: RunRow[]; level: number; onPick: (id: string) => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('foryou');
  const [q, setQ] = useState('');
  const picks = useMemo(() => forYou(charts, runs, level), [charts, runs, level]);
  const list = q.trim() ? charts.filter(c => c.title.toLowerCase().includes(q.trim().toLowerCase())).map(chart => ({ chart, why: '' }))
    : tab === 'foryou' ? picks
    : charts.filter(c => (tab === 'ai' ? c.source === 'ai' : (c.kind ?? 'exercise') === tab)).map(chart => ({ chart, why: '' }));
  const best = (id: string) => Math.max(0, ...runs.filter(r => r.chartId === id && r.accuracy >= 90).map(r => Math.round(r.bpm)));
  return (
    <div className="lessonScreen">
      <div className="card">
        <h3>Practise anything</h3>
        <div className="chooserBar">
          {TABS.map(([id, label]) => <button key={id} className={tab === id && !q ? 'on' : ''} onClick={() => { setTab(id); setQ(''); }}>{label}</button>)}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔎 Search" aria-label="Search exercises" />
        </div>
        {list.length === 0 && <p className="small">Nothing here yet.</p>}
        <div className="exGrid">
          {list.map(({ chart: c, why }) => (
            <button key={c.id} className={`exCard ${why === 'played lately' ? 'recent' : ''} ${c.source === 'ai' ? 'ai' : ''}`} onClick={() => onPick(c.id)}>
              <span className="ic" aria-hidden>{KIND_ICON[c.kind ?? 'exercise']}</span>
              {why && <span className="tag">{why}</span>}
              <b>{c.title}</b>
              <span className="small">{c.bpm} BPM{best(c.id) ? ` · best ${best(c.id)}` : ''} · {c.bars} bar{c.bars === 1 ? '' : 's'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
