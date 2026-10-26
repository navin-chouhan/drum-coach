import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { countInNumber } from '../engine/run';
import { getSettings } from '../input/settings';
import {
  Annotation, AnnotationVerticalJustify, Articulation, BarlineType, Beam, Dot, VoltaType, Formatter, GraceNote, GraceNoteGroup, ModifierPosition, Parenthesis, Tremolo,
  Renderer, Stave, StaveNote, Tuplet, Voice,
} from 'vexflow/bravura'; // Bravura is embedded: works offline
import type { ChartNote } from '../engine/chart';
import type { Form } from '../engine/form';
import { durationOf, layoutMeasures, noteHints, xAtBeat, type NotationEvent } from '../engine/notation';
import { player, playerVersion, position, subscribePlayer } from '../play/player';

const ROW_H = 120, HINT_H = 36, MIN_BAR_W = 230, FIRST_EXTRA = 70;
/** Row height: hints (count and hand/foot under each note) need room below the feet's stems. */
const rowHeight = (hints?: boolean) => ROW_H + (hints ? HINT_H : 0);
let fontReady: Promise<unknown> | null = null;

/** Turns one voice's events into VexFlow notes, beams (per beat, or per dotted quarter in 6/8-type meters) and triplet brackets. */
function buildVoice(events: NotationEvent[], stem: 1 | -1, groupSlots = 4, dim?: (i: number) => boolean) {
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
    if (dim) { // grey = the app plays it (layered lessons); per notehead, and the whole note when every head is the app's
      const grey = { fillStyle: '#a3a3a3', strokeStyle: '#a3a3a3' };
      e.heads.forEach((h, hi) => { if (h.i !== undefined && dim(h.i)) n.setKeyStyle(hi, grey); });
      if (e.heads.length && e.heads.every(h => h.i !== undefined && dim(h.i))) n.setStyle(grey);
    }
    e.heads.forEach((h, i) => {
      if (h.accent) n.addModifier(new Articulation('a>').setPosition(stem === 1 ? ModifierPosition.ABOVE : ModifierPosition.BELOW), i);
      if (h.ghost) { n.addModifier(new Parenthesis(ModifierPosition.LEFT), i); n.addModifier(new Parenthesis(ModifierPosition.RIGHT), i); }
      if (h.open) n.addModifier(new Annotation('o').setVerticalJustification(AnnotationVerticalJustify.TOP), i);
      if (h.buzz) n.addModifier(new Tremolo(3), i); // a buzz stroke: the Z-like slashes on the stem
      if (h.grace) { // small notes before it: one slashed 8th for a flam, 16ths for a drag or ruff
        const g = Array.from({ length: h.grace }, () => new GraceNote({ keys: [h.key], duration: h.grace === 1 ? '8' : '16', slash: h.grace === 1, clef: 'percussion', stemDirection: 1 }));
        n.addModifier(new GraceNoteGroup(g, true).beamNotes(), i);
      }
    });
    notes.push(n); beat.push(n);
    if (d.inTuplet) tupletNotes.push(n);
    beatSlots += e.slots;
    if (beatSlots >= (e.triplet ? 3 : groupSlots)) closeBeat();
  }
  closeBeat();
  return { notes, beams, tuplets };
}

export type MeasureBox = { index: number; x0: number; x1: number; y: number; points: { beat: number; x: number }[] };
export type NoteGroup = { idx: number[]; beat: number; x: number; y: number }; // x, y = notehead centre (screen px from the SVG origin)
type SheetOptions = {
  notes: (ChartNote & { i?: number })[]; timeSignature: readonly [number, number]; fromBar?: number; toBar?: number;
  width: number; title?: string; bpm?: number; dim?: (i: number) => boolean;
  scale?: number; barMin?: number; // zoom (1 = VexFlow size) and the narrowest bar before wrapping, in unscaled units
  hints?: boolean; // the count and who plays each note (R / L hand, K kick, H hi-hat foot) under the staff
  dyn?: number[]; // volume marks per bar (1 p, 2 mf, 3 f), shown where they change
  form?: Form; // the road map (N7): repeat signs, 1st/2nd endings, D.C. al Coda
};

/** Draws the notation into `el` (SVG) and returns where every bar, beat and note ended up (in screen pixels). */
export function renderSheet(el: HTMLElement, o: SheetOptions): { measures: MeasureBox[]; groups: NoteGroup[]; height: number } {
  el.replaceChildren();
  const { timeSignature: ts } = o, k = o.scale ?? 1, width = o.width / k, MIN = o.barMin ?? MIN_BAR_W;
  const bpb = (ts[0] * 4) / ts[1];
  const measures = layoutMeasures([...o.notes].sort((a, b) => a.t - b.t), bpb, o.fromBar ?? 1, o.toBar);
  const perRow = Math.max(1, Math.floor((width - FIRST_EXTRA - 10) / MIN));
  const volta = o.form?.endings || o.form?.coda ? 26 : 0; // room above each row for ending brackets and coda words
  const rows = Math.ceil(measures.length / perRow), rowH = rowHeight(o.hints) + volta;
  const top = o.title || o.bpm ? 52 : 10, height = top + rows * rowH + 10;
  const r = new Renderer(el as HTMLDivElement, Renderer.Backends.SVG);
  r.resize(width * k, height * k);
  const ctx = r.getContext();
  ctx.scale(k, k);
  if (o.title) { ctx.setFont('Academico', 16, 'bold'); ctx.fillText(o.title, 10, 22); }
  // BPM under the title: long titles ran into it at the right edge.
  if (o.bpm) { ctx.setFont('Academico', 12); ctx.fillText(`${Math.round(o.bpm)} BPM`, 10, o.title ? 42 : 22); }
  const boxes: MeasureBox[] = [], groups: NoteGroup[] = [];
  const compound = ts[1] === 8 && ts[0] % 3 === 0; // felt in groups of three 8ths
  measures.forEach((m, i) => {
    const row = Math.floor(i / perRow), col = i % perRow;
    const barW = (width - FIRST_EXTRA - 10) / perRow;
    const x = 5 + (col ? FIRST_EXTRA + col * barW : 0), w = barW + (col ? 0 : FIRST_EXTRA), y = top + row * rowH + volta;
    const stave = new Stave(x, y, w);
    if (col === 0) stave.addClef('percussion');
    if (i === 0) stave.addTimeSignature(`${ts[0]}/${ts[1]}`);
    if (col === 0 || i === 0) stave.setMeasure(m.index);
    const f = o.form, rp = f?.repeat;
    if (rp && m.index === rp[0]) stave.setBegBarType(BarlineType.REPEAT_BEGIN);
    if (rp && m.index === rp[1]) stave.setEndBarType(BarlineType.REPEAT_END);
    if (rp && f?.endings && (m.index === rp[1] || m.index === rp[1] + 1)) stave.setVoltaType(VoltaType.BEGIN_END, m.index === rp[1] ? '1.' : '2.', -5);
    if (f?.coda && m.index === f.coda.codaAt - 1) stave.setEndBarType(BarlineType.DOUBLE);
    stave.setContext(ctx).draw();
    if (f?.coda) { // the jumps, written as words over the staff
      ctx.setFont('Times New Roman', 14, 'bold italic');
      if (m.index === f.coda.toCoda) ctx.fillText('To Coda ⊕', x + w - 80, y - 10);
      if (m.index === f.coda.codaAt - 1) ctx.fillText('D.C. al Coda', x + w - 95, y - 10);
      if (m.index === f.coda.codaAt) ctx.fillText('⊕ Coda', x + 4, y - 10);
    }
    const hands = buildVoice(m.hands, 1, compound ? 6 : 4, o.dim), feet = buildVoice(m.feet, -1, compound ? 6 : 4, o.dim);
    const time = { numBeats: ts[0], beatValue: ts[1] };
    const vh = new Voice(time).setMode(Voice.Mode.SOFT).addTickables(hands.notes);
    const vf = new Voice(time).setMode(Voice.Mode.SOFT).addTickables(feet.notes);
    // Full width, not formatToStave: its end padding plus the last note's own slot read as an extra beat before the barline.
    new Formatter().joinVoices([vh, vf]).format([vh, vf], stave.getNoteEndX() - stave.getNoteStartX() - Stave.rightPadding);
    vh.draw(ctx, stave); vf.draw(ctx, stave);
    [...hands.beams, ...feet.beams].forEach(b => b.setContext(ctx).draw());
    [...hands.tuplets, ...feet.tuplets].forEach(t => t.setContext(ctx).draw());
    const barStart = (m.index - 1) * bpb, points = [{ beat: barStart, x: stave.getNoteStartX() }];
    ([[m.hands, hands.notes], [m.feet, feet.notes]] as const).forEach(([evs, notes]) => evs.forEach((e, ei) => {
      const n = notes[ei], nx = n.getAbsoluteX() + 6;
      points.push({ beat: e.beat, x: nx });
      const idx = e.heads.flatMap(h => (h.i === undefined ? [] : [h.i]));
      const ys = n.getYs();
      if (idx.length) groups.push({ idx, beat: e.beat, x: (n.getAbsoluteX() + n.getGlyphWidth() / 2) * k, y: (ys.reduce((a, b) => a + b, 0) / ys.length) * k });
    }));
    points.push({ beat: barStart + bpb, x: x + w - 4 });
    points.sort((a, b) => a.beat - b.beat || a.x - b.x);
    if (o.hints) { // the student's notes only: the app's (grey) ones aren't theirs to count
      const inBar = o.notes.filter(n => n.t >= barStart - 1e-6 && n.t < barStart + bpb - 1e-6);
      for (const h of noteHints(inBar.map(n => ({ ...n, t: n.t - barStart, mine: !(n.i !== undefined && o.dim?.(n.i)) })), bpb, getSettings().leftHanded)) {
        const hx = xAtBeat(points, barStart + h.t) + 2;
        ctx.setFont('Arial', 14, 'bold'); ctx.fillText(h.count, hx - ctx.measureText(h.count).width / 2, y + ROW_H + 4);
        ctx.setFont('Arial', 11, 'bold'); ctx.fillText(h.limbs, hx - ctx.measureText(h.limbs).width / 2, y + ROW_H + 20);
      }
    }
    const mark = o.dyn?.[m.index - 1];
    if (mark && mark !== o.dyn?.[m.index - 2]) { ctx.setFont('Times New Roman', 18, 'bold italic'); ctx.fillText(['p', 'mf', 'f'][mark - 1], stave.getNoteStartX(), y + 18); }
    boxes.push({ index: m.index, x0: x * k, x1: (x + w) * k, y: y * k, points: points.map(q => ({ beat: q.beat, x: q.x * k })) });
  });
  // On a row, the cursor glides on to the next bar's downbeat note: stopping at the barline made it snap forward there.
  boxes.forEach((b, i) => {
    const n = boxes[i + 1];
    if (n?.y === b.y) b.points[b.points.length - 1].x = Math.max(...n.points.filter(p => p.beat === n.points[0].beat).map(p => p.x));
  });
  return { measures: boxes, groups, height: height * k };
}

const useWidth = (ref: React.RefObject<HTMLElement | null>) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, [ref]);
  return size;
};

/**
 * Drum notation for a chart (percussion staff, hands stem up, feet stem down), wrapped to the width.
 * Bars are 1-based; `title` prints above when given.
 */
export function SheetMusic({ notes, timeSignature, fromBar = 1, toBar, title, bpm, hints, dim, zoom = 1.15, dyn, form }: {
  notes: (ChartNote & { i?: number })[]; timeSignature: readonly [number, number]; fromBar?: number; toBar?: number; title?: string; bpm?: number;
  hints?: boolean; dim?: (i: number) => boolean; zoom?: number; // zoom: notation size on wide screens
  dyn?: number[]; // p / mf / f per bar
  form?: Form; // the road map, on a chart shown before it's played
}) {
  const host = useRef<HTMLDivElement>(null);
  const { w: width } = useWidth(host);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!width) return;
    let cancelled = false;
    fontReady ??= document.fonts.load('30px Bravura');
    void fontReady.then(() => {
      if (cancelled || !host.current) return;
      try { renderSheet(host.current, { notes, timeSignature, fromBar, toBar, title, bpm, width, hints, dim, dyn, form, scale: width < 500 ? 1 : zoom, barMin: hints ? 320 : 250 }); setError(''); } // hints need room at the barlines
      catch (e) { setError(`Couldn't draw this part: ${(e as Error).message}`); }
    });
    return () => { cancelled = true; };
  }, [notes, timeSignature, fromBar, toBar, title, bpm, width, hints, dim, zoom, dyn, form]);
  return (
    <div className="sheet">
      <div ref={host} className="sheetPaper" role="img" aria-label={`Drum notation${title ? ` for ${title}` : ''}`} />
      {error && <p className="warn">{error}</p>}
    </div>
  );
}

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// Same palette as the surreal-pop highway (Highway.tsx JCOLOR).
const COLORS = { perfect: '#4BE08A', good: '#FFE14D', miss: '#FF5A4F' };
const STAR = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2, r = i % 2 ? 0.62 : 1; return `${50 + 48 * r * Math.cos(a)},${50 + 48 * r * Math.sin(a)}`; }).join(' ');

/** A comic starburst sticker behind a played note (green / yellow / red), popping in. A miss also shouts "MISS!". */
function burst(layer: HTMLElement, origin: { x: number; y: number }, g: NoteGroup, j: keyof typeof COLORS, size: number) {
  const cx = origin.x + g.x, cy = origin.y + g.y;
  const b = document.createElement('div');
  b.className = `sheetBurst ${j}`;
  b.style.cssText = `width:${size}px;height:${size}px;transform:translate(${cx - size / 2}px,${cy - size / 2}px)`;
  b.innerHTML = `<svg viewBox="0 0 100 100" width="100%" height="100%"><polygon points="${STAR}" fill="${COLORS[j]}" stroke="#141414" stroke-width="5" stroke-linejoin="round"/></svg>`;
  layer.appendChild(b);
  if (!reduceMotion) b.firstElementChild!.animate([{ transform: 'scale(0) rotate(-40deg)' }, { transform: 'scale(1.3) rotate(8deg)', offset: 0.6 }, { transform: 'scale(1) rotate(0)' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.25,1)' });
  if (j === 'miss') {
    const w = document.createElement('div');
    w.className = 'sheetWord'; w.textContent = 'MISS!';
    w.style.transform = `translate(${cx - 24}px, ${cy - size}px)`;
    layer.appendChild(w);
    w.animate([{ opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1.25, offset: 0.25 }, { opacity: 1, scale: 1, offset: 0.7 }, { opacity: 0, scale: 1 }], { duration: 900, easing: 'ease-out', fill: 'forwards' });
  }
}

/**
 * The play view in notation: a page of bars with a cursor that glides through the current bar, notes that turn
 * green / amber / red as they're judged, ✕ for extra hits, the count-in and live tips. Pages turn per page of bars.
 * Reads the mutable player state every frame, like the highway.
 */
export function SheetPlayer() {
  useSyncExternalStore(subscribePlayer, playerVersion);
  const wrap = useRef<HTMLDivElement>(null), paper = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null), barHi = useRef<HTMLDivElement>(null);
  const count = useRef<HTMLDivElement>(null), tip = useRef<HTMLDivElement>(null), marks = useRef<HTMLDivElement>(null);
  const bursts = useRef<HTMLDivElement>(null), stage = useRef<HTMLDivElement>(null), pre = useRef<HTMLDivElement>(null);
  const { w, h } = useWidth(wrap);
  const run = player.phase === 'playing' ? player.run : undefined, chart = player.chart;

  useEffect(() => {
    if (!run || !chart || !w || !h || !paper.current) return;
    let raf = 0, page = -1, layout: ReturnType<typeof renderSheet> | null = null, cancelled = false;
    let origin = { x: 0, y: 0 }; // where the SVG's (0,0) is inside the stage
    const done = new Set<NoteGroup>(), shownX = new Set<number>();
    const bpb = run.beatsPerBar, totalBars = Math.ceil(run.beats / bpb - 1e-6);
    const scale = w < 700 ? 1.1 : player.options?.lesson || player.options?.hints ? 1.6 : 1.35, barMin = player.options?.hints ? 320 : 270; // read from the throne
    const perRow = Math.max(1, Math.floor(((w - 16) / scale - FIRST_EXTRA - 10) / barMin));
    const hints = player.options?.hints, rows = Math.max(1, Math.floor((h - 20) / (rowHeight(hints) * scale)));
    const perPage = perRow * rows;
    const notes = run.notes.map(n => ({ ...n }));
    const dim = (i: number) => player.auto[i];
    const render = (p: number, el: HTMLElement) => {
      const fromBar = p * perPage + 1, toBar = Math.min(totalBars, fromBar + perPage - 1);
      return renderSheet(el, { notes: notes.filter(n => n.t >= (fromBar - 1) * bpb && n.t < toBar * bpb), timeSignature: chart.timeSignature, fromBar, toBar, width: w - 16, dim, scale, barMin, hints });
    };
    // The next page is engraved in idle time while this one plays: a full render at the turn would stall the downbeat.
    let next: { p: number; layout?: ReturnType<typeof renderSheet> } | undefined;
    const idle = window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 0));
    const draw = (p: number) => {
      page = p; done.clear(); shownX.clear(); marks.current!.replaceChildren(); bursts.current!.replaceChildren();
      if (next?.p === p && next.layout) { paper.current!.replaceChildren(...pre.current!.childNodes); layout = next.layout; }
      else layout = render(p, paper.current!);
      if ((p + 1) * perPage < totalBars) {
        const n = next = { p: p + 1 } as NonNullable<typeof next>;
        idle(() => { if (!cancelled && next === n) n.layout = render(n.p, pre.current!); }, { timeout: 1000 });
      }
      if (import.meta.env.DEV) Object.assign(window, { drumCoachSheet: layout }); // dev: inspect the layout from tests
      const sv = paper.current!.querySelector('svg')!.getBoundingClientRect(), st = stage.current!.getBoundingClientRect();
      origin = { x: sv.left - st.left - stage.current!.clientLeft, y: sv.top - st.top - stage.current!.clientTop };
      if (p > 0 && !reduceMotion) stage.current!.animate([{ opacity: 0, transform: 'translateX(80px) rotate(2deg)' }, { opacity: 1, transform: 'translateX(-6px) rotate(-.5deg)', offset: 0.7 }, { opacity: 1, transform: 'none' }], { duration: 380, easing: 'cubic-bezier(.2,.8,.25,1)' }); // page turn
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!layout && page >= 0) return;
      const pos = position(), now = performance.now();
      const c = count.current!, cur = cursor.current!, hi = barHi.current!;
      if (pos < 0) { // count-in
        if (page !== 0) draw(0);
        const n = String(countInNumber(pos, run.beatsPerBar)); // 1 2 3 4, with the voice
        if (c.textContent !== n && !reduceMotion) c.animate([{ scale: 1.5 }, { scale: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.25,1)' });
        c.textContent = n; c.className = 'sheetCount big';
        cur.style.opacity = hi.style.opacity = '0';
        return;
      }
      const bar = Math.min(totalBars - 1, Math.floor(pos / bpb));
      if (Math.floor(bar / perPage) !== page) draw(Math.floor(bar / perPage));
      const box = layout!.measures[bar - page * perPage];
      if (box) {
        Object.assign(cur.style, { opacity: '1', height: `${96 * scale}px`, transform: `translate(${origin.x + xAtBeat(box.points, pos) - 4}px, ${origin.y + box.y + 14 * scale}px)` });
        Object.assign(hi.style, { opacity: '1', height: `${80 * scale}px`, transform: `translate(${origin.x + box.x0}px, ${origin.y + box.y + 22 * scale}px)`, width: `${box.x1 - box.x0}px` });
      }
      const inBar = pos - bar * bpb;
      c.textContent = `${Math.floor(inBar) + 1}${inBar % 1 >= 0.5 ? ' &' : ''}`; c.className = 'sheetCount';
      // colour notes once they're judged (or clearly missed)
      for (const g of layout!.groups) {
        if (done.has(g)) continue;
        let worst: keyof typeof COLORS | null = null, pending = false;
        for (const i of g.idx) {
          if (player.auto[i]) continue;
          const r = player.results[i];
          const j = r.judgement !== 'miss' ? r.judgement : (pos - run.notes[i].t) * player.beatMs > 80 && !player.options?.wait ? 'miss' : null;
          if (!j) { pending = true; continue; }
          if (!worst || j === 'miss' || (j === 'good' && worst === 'perfect')) worst = j;
        }
        if (!pending && worst) { done.add(g); burst(bursts.current!, origin, g, worst, 29 * scale); }
      }
      // ✕ for extra hits on this page
      const first = page * perPage * bpb, last = first + perPage * bpb;
      player.extraBeats.forEach((b, k) => {
        if (shownX.has(k) || b < first || b >= last) return;
        const mb = layout!.measures[Math.floor(b / bpb) - page * perPage];
        if (!mb) return;
        shownX.add(k);
        const x = document.createElement('span'); x.className = 'sheetX'; x.textContent = '✕';
        x.style.transform = `translate(${origin.x + xAtBeat(mb.points, b) - 8}px, ${origin.y + mb.y}px)`;
        marks.current!.appendChild(x);
      });
      // live tip
      const t = player.cue, age = t ? now - t.at : Infinity, tp = tip.current!;
      tp.style.opacity = age < 2500 ? String(Math.min(1, (2500 - age) / 400)) : '0';
      if (t && age < 2500 && tp.dataset.at !== String(t.at)) {
        tp.dataset.at = String(t.at); tp.textContent = t.cue.text; tp.classList.toggle('praise', t.cue.id === 'praise');
        if (!reduceMotion) tp.animate([{ translate: '0 -24px' }, { translate: '0 0' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.25,1)' });
      }
    };
    fontReady ??= document.fonts.load('30px Bravura');
    void fontReady.then(() => { if (!cancelled) raf = requestAnimationFrame(tick); });
    return () => { cancelled = true; cancelAnimationFrame(raf); };
  }, [run, chart, w, h]);

  return (
    <div className="sheetPlayer" ref={wrap}>
      <div className="sheetStage" ref={stage}>
        <div ref={bursts} aria-hidden />
        <div ref={paper} className="sheetPaper" role="img" aria-label="Drum notation, with a cursor at the current beat" />
        <div ref={barHi} className="sheetBar" aria-hidden />
        <div ref={cursor} className="sheetCursor" aria-hidden />
        <div ref={marks} aria-hidden />
        <div ref={pre} className="sheetPaper" style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden' }} aria-hidden />
      </div>
      <div ref={count} className="sheetCount" aria-live="off" />
      <div ref={tip} className="sheetTip" role="status" />
    </div>
  );
}
