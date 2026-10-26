import { useEffect, useRef, useState } from 'react';
import { onCoachAction } from '../coach/session';
import type { ChartNote } from '../engine/chart';
import { limbPlan, noteHints } from '../engine/notation';
import { onHit } from '../input/hits';
import { getSettings } from '../input/settings';
import { TechniqueDemo } from '../ui/TechniqueDemo';
import type { DemoId } from '../content/demos';

const TAP_GAP_MS = 250; // a stick bounce or a double hit counts once

/**
 * Before the first take: three big slides (what, who plays what, count it) you move through from the kit,
 * one hi-hat hit forward and one snare hit back; forward on the last one starts the take (count-in as usual).
 * While they're up, the other pad gestures do nothing (a quick double snare mustn't start a take).
 */
export function IntroSlides({ title, sub, bpm, what, notes, beatsPerBar, focus, demo, onDone, onClose }: {
  title: string; sub?: string; bpm: number; what: string; notes: (ChartNote & { mine?: boolean })[]; beatsPerBar: number; focus?: string;
  demo?: DemoId; // a 4th slide: how the body moves (R5)
  onDone: () => void; onClose: () => void;
}) {
  const [i, setI] = useState(0);
  const last = demo ? 3 : 2;
  const next = () => (i >= last ? onDone() : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));
  const nav = useRef({ next, back, onClose });
  nav.current = { next, back, onClose };

  useEffect(() => {
    let at = -Infinity;
    const offHit = onHit(h => {
      if (h.time - at < TAP_GAP_MS) return;
      if (h.pad === 'hhClosed' || h.pad === 'hhOpen') { at = h.time; nav.current.next(); }
      else if (h.pad === 'snare') { at = h.time; nav.current.back(); }
    });
    const offAction = onCoachAction(a => { if (a.kind === 'main') nav.current.next(); return true; }); // swallow the rest
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') nav.current.onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); nav.current.next(); } // not the focused button behind
      else if (e.key === 'ArrowLeft') nav.current.back();
    };
    window.addEventListener('keydown', onKey, true); // capture: before the screen behind sees it
    return () => { offHit(); offAction(); window.removeEventListener('keydown', onKey, true); };
  }, []);

  const left = getSettings().leftHanded; // N9: a left-handed player's hints mirror
  const plan = limbPlan(notes, beatsPerBar, left);
  const firstBar = noteHints(notes.filter(n => n.t < beatsPerBar - 1e-6), beatsPerBar, left);
  const pedalDown = notes.some(n => n.drum === 'hihat') && !plan.some(p => p.limb === 'H');

  return (
    <div className="introSlides" role="dialog" aria-modal="true" aria-label={`About to play: ${title}`}>
      <div className="slide" key={i}>
        <span className="pg">{i + 1} / {last + 1}</span>
        {i === 0 && <>
          <span className="k">{title.toUpperCase()} · {bpm} BPM</span>
          <p className="t">{sub ?? title}</p>
          <p className="s">{what}</p>
        </>}
        {i === 1 && <>
          <span className="k">WHO PLAYS WHAT</span>
          <div className="limbs">
            {plan.map(p => <div key={p.limb} className="limb"><b>{p.limb}</b>{p.name}<span>{p.drums.join(' and ')}, {p.when}</span></div>)}
          </div>
          {pedalDown && <p className="s small">Left foot: keep the hi-hat pedal down.</p>}
        </>}
        {i === 2 && <>
          <span className="k">COUNT IT LIKE THIS</span>
          <div className="countBar" style={{ gridTemplateColumns: `repeat(${Math.min(16, firstBar.length)}, 1fr)` }}>
            {firstBar.slice(0, 16).map(h => <div key={h.t} className={Number.isInteger(h.t) ? 'beat' : ''}>{h.count}<small>{h.limbs}</small></div>)}
          </div>
          {focus && <p className="s">💡 {focus}</p>}
        </>}
        {i === 3 && demo && <>
          <span className="k">HOW IT MOVES</span>
          <TechniqueDemo id={demo} bpm={bpm} compact />
        </>}
        <div className="slideNav">
          <button className="go" onClick={next}>{i >= last ? 'Ready ▶' : 'Next ▶'} <i>hi-hat × 1</i></button>
          {i > 0 && <button onClick={back}>◀ Back <i>snare × 1</i></button>}
        </div>
      </div>
    </div>
  );
}
