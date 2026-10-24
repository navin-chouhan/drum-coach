import { useEffect } from 'react';
import type { Lesson, Milestone } from '../engine/lesson';
import type { PadId } from '../engine/kit';
import { audio, playDrum } from '../play/audio';

// A drum flourish through the speakers: a short fill for a lesson, a bigger one for a rank up.
const FILL: [PadId, number][] = [['snare', 0], ['snare', 0.12], ['tom1', 0.24], ['tom2', 0.36], ['floor', 0.48], ['kick', 0.6], ['crash', 0.6]];
const BIG_FILL: [PadId, number][] = [...FILL.slice(0, 5), ['snare', 0.6], ['snare', 0.66], ['snare', 0.72], ['snare', 0.78], ['kick', 0.9], ['crash', 0.9], ['kick', 1.2], ['crash', 1.2]];

/** The moment after a lesson: stars, progress to the next rank, and what's next. A rank up gets its own, bigger moment. */
export function Celebration({ lesson, stars, milestone, rankUp, next, done, total, nextLabel, onNext, onAgain, onClose }: {
  lesson: Lesson; stars: number; milestone?: Milestone; rankUp: boolean; next?: Milestone;
  done: number; total: number; nextLabel: string; onNext: () => void; onAgain: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const t0 = audio().currentTime + 0.05;
    for (const [pad, dt] of rankUp ? BIG_FILL : FILL) playDrum(pad, 110, t0 + dt);
  }, [rankUp]);

  return (
    <div className="celebrate" role="dialog" aria-modal="true" aria-labelledby="celebrateTitle">
      <div className="card celebrateCard">
        <div className="bigBurst" id="celebrateTitle">{rankUp ? 'RANK UP!' : 'LESSON COMPLETE!'}</div>
        {rankUp && milestone ? <>
          <p>You're now a</p>
          <div className="rankSticker">{milestone.rank}</div>
          <p className="small">You can:</p>
          <ul className="canDo">{milestone.canDo.map(c => <li key={c}>{c}</li>)}</ul>
          {next && <p>Next stage: <b>{next.title}</b>, on the way to <b>{next.rank}</b>.</p>}
        </> : <h2>{lesson.title}</h2>}
        <div className="bigStars" aria-label={`${stars} of 3 stars`}>
          {[1, 2, 3].map(i => <span key={i} className={i <= stars ? 'on' : ''} style={{ animationDelay: `${0.25 + i * 0.25}s` }}>★</span>)}
        </div>
        {!rankUp && milestone && (
          <div className="rankProgress">
            <p className="small">Stage {milestone.level + 1}, {milestone.title}: {done} of {total} checkpoints to <b>{milestone.rank}</b></p>
            <div className="velbar"><i style={{ width: `${(100 * done) / Math.max(1, total)}%` }} /></div>
          </div>
        )}
        <div className="actions">
          <button className="primary big" autoFocus onClick={onNext}>{nextLabel}</button>
          {stars < 3 && <button onClick={onAgain}>Go for {'★'.repeat(stars + 1)}</button>}
          <button className="link" onClick={onClose}>Stay on this lesson</button>
        </div>
      </div>
    </div>
  );
}
