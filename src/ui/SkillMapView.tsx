import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { MILESTONES } from '../content/curriculum';
import { checkPass, goodMsFor, startProgress } from '../engine/lesson';
import { monthly } from '../engine/history';
import { placementLadder, skillGrowth, skillMap } from '../engine/skills';
import { Spark } from './ProgressView';
import { getSettings, subscribeSettings } from '../input/settings';
import { lessonById, useLessons } from '../lesson/aiLessons';
import { saveProgress, today } from '../lesson/state';
import { NotesView } from '../play/NotesView';
import { player, start, stop, subscribePlayer } from '../play/player';

/** The skill map (N5): how far along each skill is, and which are due for a refresh. */
export function SkillMapView({ onBack, onOpen }: { onBack: () => void; onOpen: (lessonId: string) => void }) {
  const s = useSyncExternalStore(subscribeSettings, getSettings), lessons = useLessons();
  const map = skillMap(lessons, s.lessons, today());
  const [now] = useState(() => Date.now());
  const growth = skillGrowth(lessons, s.lessons, monthly([], now).map(m => m.month)); // N8: the last 6 months
  return (
    <div className="today skillMap">
      <div className="card">
        <button className="link back" onClick={onBack}>← Journey</button>
        <h2>🗺 Your skill map</h2>
        <p>Every lesson trains one or more of these. The bar fills with the stars you earn; a skill you haven't touched for a while asks
          for a refresh, and your coach plans your weeks from this map.</p>
      </div>
      <div className="card">
        {map.map(k => (
          <div key={k.id} className="skillRow">
            <div><b>{k.name}</b><span className="small"> · {k.what}</span></div>
            <div className="skillBar" aria-label={`${Math.round(k.mastery * 100)}%`}><i style={{ width: `${Math.max(2, k.mastery * 100)}%` }} /></div>
            <span className="small">{k.lessons.done} of {k.lessons.all} lessons</span>
            <Spark values={growth[k.id].map(v => Math.round(v * 100))} min={0} max={100} unit="%" label={`${k.name}, the last 6 months`} />
            {k.due && k.reviewLesson ? <button onClick={() => onOpen(k.reviewLesson!)}>🔁 Refresh</button> : <span />}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Placement (N5): one short take of each stage's first challenge at its target tempo, from stage 1 up, until one
 * doesn't pass; the stages before it count as passed and the student starts there. Stop any time.
 */
export function PlacementView({ onDone }: { onDone: () => void }) {
  const lessons = useLessons();
  const ladder = placementLadder(lessons, MILESTONES);
  const [i, setI] = useState(0), [result, setResult] = useState<string>(), [last, setLast] = useState<string>();
  const item = ladder[i], lesson = item && lessonById(item.lessonId), step = lesson?.steps[lesson.steps.length - 1];
  const judged = useRef(new WeakSet<object>());
  const finish = (level: number) => {
    // every challenge of the stages below this one counts as passed (one star: the student can come back for more)
    for (const m of MILESTONES.filter(m => m.level < level)) for (const id of m.checkpoints) {
      const l = lessonById(id);
      if (l && !getSettings().lessons[id]?.completedAt) saveProgress(id, { ...startProgress(l), step: l.steps.length - 1, completedAt: today(), stars: 1, bestBpm: l.steps[l.steps.length - 1].bpm.target });
    }
    const m = MILESTONES.find(x => x.level === level);
    setResult(m ? `You start at stage ${MILESTONES.indexOf(m) + 1}: ${m.title}.` : 'You passed every stage. Impressive!');
  };
  useEffect(() => subscribePlayer(() => {
    const f = player.finished;
    if (player.phase !== 'done' || !f || judged.current.has(f) || !lesson || !step || f.chart.title !== step.chart.title) return;
    judged.current.add(f);
    const ok = checkPass(f.stats, step.pass, lesson.level).ok;
    setLast(`${lesson.title}: ${f.stats.total - f.stats.miss} of ${f.stats.total} notes landed${ok ? ', passed' : ''}.`);
    if (!ok) finish(item.level); else if (i + 1 >= ladder.length) finish(Infinity); else setI(i + 1);
  }), [i, lesson, step, item, ladder.length]);
  useEffect(() => () => stop(), []);
  const play = () => step && lesson && start(step.chart, { fromBar: 1, toBar: step.chart.bars, repeats: Math.max(1, Math.ceil(4 / step.chart.bars)), speed: step.bpm.target / step.chart.bpm,
    metronome: true, subdivision: 1, countInBars: 1, wait: false, activeLanes: step.activeLanes, goodMs: goodMsFor(lesson.level), hints: true });

  return (
    <div className="today placement">
      <div className="card form onboarding">
        <h2>Find your level</h2>
        {result ? <>
          <p className="big">{result}</p>
          {last && <p className="small">{last}</p>}
          <button className="primary big" onClick={onDone}>Start there ▶</button>
        </> : item && lesson && step ? <>
          <p>Stage {i + 1} of {ladder.length}: one take of <b>{lesson.title}</b> at {step.bpm.target} BPM. Pass it and we try the next stage.</p>
          {last && <p className="small">✓ {last}</p>}
          <NotesView idle={{ chart: step.chart, bpm: step.bpm.target, goal: step.text, hints: true, zoom: 1.3 }} />
          <div className="actions">
            <button className="primary big" onClick={play}>▶ Play it</button>
            <button onClick={() => finish(item.level)}>Start at this stage</button>
            <button className="link" onClick={onDone}>Stop: start from the beginning</button>
          </div>
        </> : <button onClick={onDone}>Back</button>}
      </div>
    </div>
  );
}
