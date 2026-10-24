import { useEffect, useRef, useState } from 'react';
import {
  Annotation, AnnotationVerticalJustify, Articulation, Beam, Dot, Formatter, ModifierPosition, Parenthesis,
  Renderer, Stave, StaveNote, Tuplet, Voice,
} from 'vexflow/bravura'; // Bravura is embedded: works offline
import type { ChartNote } from '../engine/chart';
import { durationOf, layoutMeasures, type NotationEvent } from '../engine/notation';

const ROW_H = 120, MIN_BAR_W = 230, FIRST_EXTRA = 70;
let fontReady: Promise<unknown> | null = null;

/** Turns one voice's events into VexFlow notes, beams (per beat, or per dotted quarter in 6/8-type meters) and triplet brackets. */
function buildVoice(events: NotationEvent[], stem: 1 | -1, groupSlots = 4) {
  const notes: StaveNote[] = [], beams: Beam[] = [], tuplets: Tuplet[] = [];
  let beat: StaveNote[] = [], beatSlots = 0, tupletNotes: StaveNote[] = [];
  const closeBeat = () => {
    const beamable = beat.filter(n => !n.isRest() && ['8', '16'].includes(n.getDuration()));
    if (beamable.length > 1) beams.push(new Beam(beamable));
    if (tupletNotes.length) tuplets.push(new Tuplet(tupletNotes, { numNotes: 3, notesOccupied: 2, bracketed: tupletNotes.some(n => n.isRest()) }));
    beat = []; beatSlots = 0; tupletNotes = [];
  };
  for (const e of events) {
    const d = durationOf(e), rest = !e.heads.length;
    const n = new StaveNote({
      clef: 'percussion', stemDirection: stem,
      keys: rest ? [stem === 1 ? 'e/5' : 'e/4'] : e.heads.map(h => h.key),
      duration: `${d.duration}${d.dots ? 'd' : ''}${rest ? 'r' : ''}`,
    });
    if (d.dots) Dot.buildAndAttach([n], { all: true });
    e.heads.forEach((h, i) => {
      if (h.accent) n.addModifier(new Articulation('a>').setPosition(stem === 1 ? ModifierPosition.ABOVE : ModifierPosition.BELOW), i);
      if (h.ghost) { n.addModifier(new Parenthesis(ModifierPosition.LEFT), i); n.addModifier(new Parenthesis(ModifierPosition.RIGHT), i); }
      if (h.open) n.addModifier(new Annotation('o').setVerticalJustification(AnnotationVerticalJustify.TOP), i);
    });
    notes.push(n); beat.push(n);
    if (d.inTuplet) tupletNotes.push(n);
    beatSlots += e.slots;
    if (beatSlots >= (e.triplet ? 3 : groupSlots)) closeBeat();
  }
  closeBeat();
  return { notes, beams, tuplets };
}

/**
 * Drum notation for a chart (percussion staff, hands stem up, feet stem down), wrapped to the width.
 * Bars are 1-based; `title` prints above when given.
 */
export function SheetMusic({ notes, timeSignature, fromBar = 1, toBar, title, bpm }: {
  notes: ChartNote[]; timeSignature: readonly [number, number]; fromBar?: number; toBar?: number; title?: string; bpm?: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(host.current!);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    let cancelled = false;
    fontReady ??= document.fonts.load('30px Bravura');
    void fontReady.then(() => {
      if (cancelled || !host.current) return;
      const el = host.current;
      el.replaceChildren();
      try {
        const bpb = (timeSignature[0] * 4) / timeSignature[1];
        const measures = layoutMeasures([...notes].sort((a, b) => a.t - b.t), bpb, fromBar, toBar);
        const perRow = Math.max(1, Math.floor((width - FIRST_EXTRA - 10) / MIN_BAR_W));
        const rows = Math.ceil(measures.length / perRow);
        const top = title || bpm ? 52 : 10;
        const r = new Renderer(el, Renderer.Backends.SVG);
        r.resize(width, top + rows * ROW_H + 10);
        const ctx = r.getContext();
        if (title) { ctx.setFont('Academico', 16, 'bold'); ctx.fillText(title, 10, 22); }
        if (bpm) { ctx.setFont('Academico', 12); ctx.fillText(`${Math.round(bpm)} BPM`, width - 70, 22); }
        measures.forEach((m, i) => {
          const row = Math.floor(i / perRow), col = i % perRow;
          const barW = (width - FIRST_EXTRA - 10) / perRow;
          const x = 5 + (col ? FIRST_EXTRA + col * barW : 0), w = barW + (col ? 0 : FIRST_EXTRA);
          const stave = new Stave(x, top + row * ROW_H, w);
          if (col === 0) stave.addClef('percussion');
          if (i === 0) stave.addTimeSignature(`${timeSignature[0]}/${timeSignature[1]}`);
          if (col === 0 || i === 0) stave.setMeasure(m.index);
          stave.setContext(ctx).draw();
          const compound = timeSignature[1] === 8 && timeSignature[0] % 3 === 0; // felt in groups of three 8ths
          const hands = buildVoice(m.hands, 1, compound ? 6 : 4), feet = buildVoice(m.feet, -1, compound ? 6 : 4);
          const time = { numBeats: timeSignature[0], beatValue: timeSignature[1] };
          const vh = new Voice(time).setMode(Voice.Mode.SOFT).addTickables(hands.notes);
          const vf = new Voice(time).setMode(Voice.Mode.SOFT).addTickables(feet.notes);
          new Formatter().joinVoices([vh, vf]).formatToStave([vh, vf], stave);
          vh.draw(ctx, stave); vf.draw(ctx, stave);
          [...hands.beams, ...feet.beams].forEach(b => b.setContext(ctx).draw());
          [...hands.tuplets, ...feet.tuplets].forEach(t => t.setContext(ctx).draw());
        });
        setError('');
      } catch (e) {
        setError(`Couldn't draw this part: ${(e as Error).message}`);
      }
    });
    return () => { cancelled = true; };
  }, [notes, timeSignature, fromBar, toBar, title, bpm, width]);

  return (
    <div className="sheet">
      <div ref={host} className="sheetPaper" role="img" aria-label={`Drum notation${title ? ` for ${title}` : ''}`} />
      {error && <p className="warn">{error}</p>}
    </div>
  );
}

/** Prints only the sheet: the page hides everything else while printing. */
export function printSheet() {
  document.body.classList.add('printingSheet');
  const done = () => { document.body.classList.remove('printingSheet'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}
