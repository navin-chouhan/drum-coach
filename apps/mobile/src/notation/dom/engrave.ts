// VexFlow engraving for the iPad sheet (runs inside the DOM component's WebView, never in React Native).
//
// The musical model is the core's (layoutMeasures, durationOf, noteHints, xAtBeat: packages/core/src/engine/
// notation.ts). The VexFlow calls follow the web's renderSheet/buildVoice (src/notation/SheetMusic.tsx) for what a
// play view draws: percussion staff, hands stem up and feet down, beams per beat (per dotted quarter in 6/8),
// triplets, accents, ghost brackets, open hi-hat "o", buzz, grace notes, grey app notes and the count/limb hints.
// The web's title/BPM header, road-map signs and dynamics aren't drawn here (the lesson player shows those outside).
// That file lives in the web app (DOM globals, the web player) so it can't be imported; keep the two in step.
//
// Everything is built as SVG nodes by VexFlow's SVGContext (createElementNS); no HTML strings.
import {
  Annotation, AnnotationVerticalJustify, Articulation, Beam, Dot, Formatter, GraceNote, GraceNoteGroup, ModifierPosition,
  Parenthesis, Renderer, Stave, StaveNote, Tremolo, Tuplet, Voice,
} from 'vexflow/bravura'; // Bravura is embedded in the bundle: works offline
import { durationOf, layoutMeasures, noteHints, xAtBeat, type NotationEvent } from '@drum-coach/core/engine/notation';
import type { ChartNote } from '@drum-coach/core/engine/chart';
import { ROW_H, TOP, BOTTOM, FIRST_EXTRA, rowHeight, type MeasureBox, type SheetColors } from '../sheetModel';

/** A drawn notehead of a chart note (`i` = index into the chart's notes): its SVG group, to colour it on a result. */
export type HeadRef = { i: number; el: SVGElement };
export type Engraving = { measures: MeasureBox[]; heads: HeadRef[]; width: number; height: number };

export type EngraveOptions = {
  notes: (ChartNote & { i: number })[];
  timeSignature: readonly [number, number];
  fromBar: number;
  toBar: number;
  /** Unscaled layout width and zoom (sheetGeometry). */
  width: number;
  scale: number;
  barMin: number;
  rows: number;
  hints: boolean;
  leftHanded: boolean;
  colors: SheetColors;
};

function buildVoice(events: NotationEvent[], stem: 1 | -1, groupSlots: number, dim: (i: number) => boolean, colors: SheetColors) {
  const notes: StaveNote[] = [], beams: Beam[] = [], tuplets: Tuplet[] = [];
  let beat: StaveNote[] = [], beatSlots = 0, tupletNotes: StaveNote[] = [];
  const closeBeat = () => {
    const beamable = beat.filter(n => !n.isRest() && ['8', '16'].includes(n.getDuration()));
    if (beamable.length > 1) beams.push(new Beam(beamable));
    if (tupletNotes.length) tuplets.push(new Tuplet(tupletNotes, { numNotes: 3, notesOccupied: 2, bracketed: tupletNotes.some(n => n.isRest()) }));
    beat = [];
    beatSlots = 0;
    tupletNotes = [];
  };
  for (const e of events) {
    const d = durationOf(e), rest = !e.heads.length;
    const n = new StaveNote({
      clef: 'percussion', stemDirection: stem,
      keys: rest ? [stem === 1 ? 'e/5' : 'e/4'] : e.heads.map(h => h.key),
      duration: `${d.duration}${d.dots ? 'd' : ''}${rest ? 'r' : ''}`,
    });
    if (d.dots) Dot.buildAndAttach([n], { all: true });
    // grey = the app plays it (layered lessons); per notehead, and the whole note when every head is the app's
    const grey = { fillStyle: colors.dim, strokeStyle: colors.dim };
    e.heads.forEach((h, hi) => { if (h.i !== undefined && dim(h.i)) n.setKeyStyle(hi, grey); });
    if (e.heads.length && e.heads.every(h => h.i !== undefined && dim(h.i))) n.setStyle(grey);
    e.heads.forEach((h, i) => {
      if (h.accent) n.addModifier(new Articulation('a>').setPosition(stem === 1 ? ModifierPosition.ABOVE : ModifierPosition.BELOW), i);
      if (h.ghost) { n.addModifier(new Parenthesis(ModifierPosition.LEFT), i); n.addModifier(new Parenthesis(ModifierPosition.RIGHT), i); }
      if (h.open) n.addModifier(new Annotation('o').setVerticalJustification(AnnotationVerticalJustify.TOP), i);
      if (h.buzz) n.addModifier(new Tremolo(3), i);
      if (h.grace) {
        const g = Array.from({ length: h.grace }, () => new GraceNote({ keys: [h.key], duration: h.grace === 1 ? '8' : '16', slash: h.grace === 1, clef: 'percussion', stemDirection: 1 }));
        n.addModifier(new GraceNoteGroup(g, true).beamNotes(), i);
      }
    });
    notes.push(n);
    beat.push(n);
    if (d.inTuplet) tupletNotes.push(n);
    beatSlots += e.slots;
    if (beatSlots >= (e.triplet ? 3 : groupSlots)) closeBeat();
  }
  closeBeat();
  return { notes, beams, tuplets };
}

/** Draws bars fromBar..toBar into `el` (an SVG, replacing what was there) and returns where everything landed. */
export function engrave(el: HTMLElement, o: EngraveOptions): Engraving {
  el.replaceChildren();
  const ts = o.timeSignature, k = o.scale, width = o.width;
  const bpb = (ts[0] * 4) / ts[1];
  const sorted = [...o.notes].sort((a, b) => a.t - b.t);
  const autoOf = new Map(o.notes.map(n => [n.i, !!n.auto]));
  const isDim = (i: number) => autoOf.get(i) ?? false;
  const measures = layoutMeasures(sorted, bpb, o.fromBar, o.toBar);
  const perRow = Math.max(1, Math.floor((width - FIRST_EXTRA - 10) / o.barMin));
  const rowH = rowHeight(o.hints);
  const height = TOP + o.rows * rowH + BOTTOM;
  const r = new Renderer(el as HTMLDivElement, Renderer.Backends.SVG);
  r.resize(width * k, height * k);
  const ctx = r.getContext();
  ctx.scale(k, k);
  ctx.setFillStyle(o.colors.ink);
  ctx.setStrokeStyle(o.colors.ink);
  const boxes: MeasureBox[] = [], heads: HeadRef[] = [];
  const compound = ts[1] === 8 && ts[0] % 3 === 0; // felt in groups of three 8ths
  measures.forEach((m, idx) => {
    const row = Math.floor(idx / perRow), col = idx % perRow;
    const barW = (width - FIRST_EXTRA - 10) / perRow;
    const x = 5 + (col ? FIRST_EXTRA + col * barW : 0), w = barW + (col ? 0 : FIRST_EXTRA), y = TOP + row * rowH;
    const stave = new Stave(x, y, w);
    if (col === 0) stave.addClef('percussion');
    if (m.index === 1 || idx === 0) stave.addTimeSignature(`${ts[0]}/${ts[1]}`);
    if (col === 0) stave.setMeasure(m.index);
    stave.setContext(ctx).draw();
    const hands = buildVoice(m.hands, 1, compound ? 6 : 4, isDim, o.colors), feet = buildVoice(m.feet, -1, compound ? 6 : 4, isDim, o.colors);
    const time = { numBeats: ts[0], beatValue: ts[1] };
    const vh = new Voice(time).setMode(Voice.Mode.SOFT).addTickables(hands.notes);
    const vf = new Voice(time).setMode(Voice.Mode.SOFT).addTickables(feet.notes);
    // Full width, not formatToStave: its end padding plus the last note's own slot read as an extra beat before the barline.
    new Formatter().joinVoices([vh, vf]).format([vh, vf], stave.getNoteEndX() - stave.getNoteStartX() - Stave.rightPadding);
    vh.draw(ctx, stave);
    vf.draw(ctx, stave);
    [...hands.beams, ...feet.beams].forEach(b => b.setContext(ctx).draw());
    [...hands.tuplets, ...feet.tuplets].forEach(t => t.setContext(ctx).draw());
    const barStart = (m.index - 1) * bpb, points = [{ beat: barStart, x: stave.getNoteStartX() }];
    ([[m.hands, hands.notes], [m.feet, feet.notes]] as const).forEach(([evs, notes]) => evs.forEach((e, ei) => {
      const n = notes[ei];
      points.push({ beat: e.beat, x: n.getAbsoluteX() + 6 });
      e.heads.forEach((h, hi) => {
        const head = n.noteHeads[hi]?.getSVGElement();
        if (h.i !== undefined && head) heads.push({ i: h.i, el: head });
      });
    }));
    points.push({ beat: barStart + bpb, x: x + w - 4 });
    points.sort((a, b) => a.beat - b.beat || a.x - b.x);
    if (o.hints) { // the count, big, and who plays each of the student's notes (the app's grey ones aren't theirs)
      const inBar = o.notes.filter(n => n.t >= barStart - 1e-6 && n.t < barStart + bpb - 1e-6);
      const hs = noteHints(inBar.map(n => ({ ...n, t: n.t - barStart, mine: !n.auto })), bpb, o.leftHanded);
      // On a quarter / 8th grid every 8th is counted out loud ("1 & 2 &…"); the ones you say but don't play are blue.
      const say8 = ts[1] === 4 && hs.length > 0 && inBar.every(n => Math.abs(n.t * 2 - Math.round(n.t * 2)) < 1e-3);
      // Under its note when the beat has one (the rightmost head there: a rest at the same beat can sit left of it, and
      // the bar's start point sits left of the downbeat note), else between the drawn beats.
      const noteX = (b: number) => Math.max(-Infinity, ...points.slice(1).filter(p => Math.abs(p.beat - b) < 1e-6).map(p => p.x));
      for (const t of say8 ? Array.from({ length: bpb * 2 }, (_, q) => q / 2) : hs.map(h => h.t)) {
        const h = hs.find(q => Math.abs(q.t - t) < 1e-3), word = h?.count ?? (t % 1 ? '&' : String(t + 1));
        const nx = noteX(barStart + t), hx = (Number.isFinite(nx) ? nx : xAtBeat(points, barStart + t)) + 2;
        ctx.setFillStyle(h ? o.colors.ink : o.colors.say);
        ctx.setFont('Arial', say8 ? 18 : 14, 'bold');
        ctx.fillText(word, hx - ctx.measureText(word).width / 2, y + ROW_H + 8);
        if (h) { ctx.setFont('Arial', 12, 'bold'); ctx.fillText(h.limbs, hx - ctx.measureText(h.limbs).width / 2, y + ROW_H + 26); }
      }
      ctx.setFillStyle(o.colors.ink);
    }
    boxes.push({ index: m.index, x0: x * k, x1: (x + w) * k, y: y * k, points: points.map(q => ({ beat: q.beat, x: q.x * k })) });
  });
  // On a row, the cursor glides on to the next bar's downbeat note: stopping at the barline made it snap forward there.
  boxes.forEach((b, i) => {
    const n = boxes[i + 1];
    if (n?.y === b.y) b.points[b.points.length - 1].x = Math.max(...n.points.filter(p => p.beat === n.points[0].beat).map(p => p.x));
  });
  return { measures: boxes, heads, width: width * k, height: height * k };
}

/** Colours a notehead (its glyph and modifiers) in place; `color` undefined = back to the ink it was drawn in. */
export function paintHead(el: SVGElement, color: string | undefined) {
  for (const node of [el, ...Array.from(el.querySelectorAll<SVGElement>('*'))]) {
    node.style.fill = color ?? '';
    node.style.stroke = color ?? '';
  }
}
