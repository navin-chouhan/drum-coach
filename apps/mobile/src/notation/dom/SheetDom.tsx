'use dom';
// The sheet-music play view as an Expo DOM component: React DOM + VexFlow inside a WebView (@expo/dom-webview).
// NotationView.tsx (native) is the only user; it passes the chart and the take's timing as props once, a native
// action for the Clock, and pushes results through the imperative handle. Per frame nothing crosses the bridge: the
// cursor runs on requestAnimationFrame from performance.now() + a measured Clock offset (sheetModel.ts).
//
// Text is set with textContent / React; VexFlow builds SVG nodes. No HTML strings.
import { useCallback, useEffect, useRef, useState, type CSSProperties, type Ref } from 'react';
import { useDOMImperativeHandle, type DOMImperativeFactory, type DOMProps } from 'expo/dom';
import { engrave, paintHead, type Engraving } from './engrave';
import {
  barAt, beatsPerBarOf, countText, cursorAt, emptyMarks, measureClockOffset, mergeBatch, nextOffset, pageBars, pageCount, pageOf,
  positionFromPerf, sheetGeometry, totalBarsOf, type ResultBatch, type SheetChart, type SheetColors, type SheetMarks,
} from '../sheetModel';

export type SheetHandle = DOMImperativeFactory & {
  /** New results of the take (a ResultBatch). */
  push: (batch: never) => void;
};

export type SheetDomProps = {
  chart: SheetChart;
  bpm: number;
  /** Clock ms of beat 0. Also identifies the take: a new zero is a new take (marks cleared). */
  zero: number;
  latencyMs: number;
  colors: SheetColors;
  hints: boolean;
  leftHanded: boolean;
  scale?: number;
  displayLeadMs: number;
  /** Native action: the app's Clock now (ms). */
  clockNow: () => Promise<number>;
  /** Native action: everything the take has judged so far (the WebView may load after the take started). */
  ready: (take: number) => Promise<ResultBatch>;
  ref?: Ref<SheetHandle>;
  dom?: DOMProps;
};

const PAD = 8; // the paper's inset in the view
const RESYNC_MS = 2000;
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
let fontReady: Promise<unknown> | null = null;
// The beat count: a badge top right while playing, big in the middle for the count-in (the web's .sheetCount).
const SMALL_COUNT: Partial<CSSStyleDeclaration> = { left: 'auto', right: `${PAD + 6}px`, top: `${PAD + 4}px`, fontSize: '22px', padding: '1px 12px', transform: 'none' };
const BIG_COUNT: Partial<CSSStyleDeclaration> = { left: '50%', right: 'auto', top: '45%', fontSize: '90px', padding: '6px 30px', transform: 'translate(-50%,-50%)' };

function useViewSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setSize(s => (s.w === window.innerWidth && s.h === window.innerHeight ? s : { w: window.innerWidth, h: window.innerHeight }));
    window.addEventListener('resize', on);
    on();
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

export default function SheetDom(props: SheetDomProps) {
  const { chart, bpm, zero, latencyMs, colors, hints, leftHanded, scale, displayLeadMs, clockNow, ready } = props;
  const { w, h } = useViewSize();
  const paper = useRef<HTMLDivElement>(null), pre = useRef<HTMLDivElement>(null), extras = useRef<HTMLDivElement>(null);
  const cursor = useRef<HTMLDivElement>(null), barHi = useRef<HTMLDivElement>(null), count = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const offset = useRef(NaN);
  const marks = useRef<SheetMarks>(emptyMarks(zero));
  // The current page's drawing and a hook to repaint it when results arrive.
  const shown = useRef<{ eng: Engraving; fromBar: number; repaint: (notes: number[] | null, newExtras: { beat: number }[]) => void } | null>(null);
  const timing = useRef({ zero, beatMs: 60000 / bpm, latencyMs });
  timing.current = { zero, beatMs: 60000 / bpm, latencyMs };

  // Results: merged into the marks, painted on the page if it's showing.
  const apply = useCallback((b: ResultBatch) => {
    const changed = mergeBatch(marks.current, b, timing.current);
    shown.current?.repaint(changed.notes, changed.extras);
  }, []);
  useDOMImperativeHandle(props.ref ?? null, () => ({ push: (b: ResultBatch) => apply(b) }) as unknown as SheetHandle, [apply]);

  // A new take: clear the marks (and the page's colours) and ask for what the take has so far.
  useEffect(() => {
    marks.current = emptyMarks(zero);
    extras.current?.replaceChildren();
    shown.current?.repaint(null, []);
    let live = true;
    ready(zero).then(b => { if (live) apply(b); }, () => {});
    return () => { live = false; };
  }, [zero, ready, apply]);

  // The Clock offset, measured now and every few seconds.
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout> | undefined;
    const sync = async () => {
      try {
        const m = await measureClockOffset(clockNow, () => performance.now());
        if (live) offset.current = nextOffset(offset.current, m);
      } catch { /* the bridge isn't up yet: try again */ }
      if (live) timer = setTimeout(() => void sync(), RESYNC_MS);
    };
    void sync();
    return () => { live = false; clearTimeout(timer); };
  }, [clockNow]);

  useEffect(() => {
    document.body.style.margin = '0';
    document.body.style.background = colors.paper;
    document.body.style.overflow = 'hidden';
  }, [colors.paper]);

  // Pages and the frame loop.
  useEffect(() => {
    if (!w || !h || !paper.current) return;
    const bpb = beatsPerBarOf(chart.timeSignature), total = totalBarsOf(chart);
    const notes = chart.notes.map((n, i) => ({ ...n, i }));
    const geo = sheetGeometry(w - 2 * PAD, h - 2 * PAD, { hints, notes, bpb, scale });
    const pages = pageCount(total, geo.perPage);
    let cancelled = false, raf = 0, page = -1;
    let next: { p: number; eng?: Engraving } | undefined;

    const render = (p: number, el: HTMLElement): Engraving => {
      const { fromBar, toBar } = pageBars(p, geo.perPage, total);
      return engrave(el, {
        notes: notes.filter(n => n.t >= (fromBar - 1) * bpb - 1e-6 && n.t < toBar * bpb - 1e-6), timeSignature: chart.timeSignature,
        fromBar, toBar, width: geo.width, scale: geo.scale, barMin: geo.barMin, rows: geo.rows, hints, leftHanded, colors,
      });
    };
    const placeX = (eng: Engraving, fromBar: number, beat: number) => {
      const c = cursorAt(eng.measures, beat, bpb, fromBar);
      if (!c) return;
      const x = document.createElement('div');
      x.textContent = '✕';
      Object.assign(x.style, { position: 'absolute', left: '0', top: '0', color: colors.result.extra, font: `900 ${Math.round(26 * geo.scale / 1.6)}px -apple-system, system-ui, sans-serif`,
        transform: `translate(${PAD + c.x - 9}px, ${PAD + c.box.y - 6}px)`, pointerEvents: 'none' } satisfies Partial<CSSStyleDeclaration>);
      extras.current?.appendChild(x);
    };
    const draw = (p: number) => {
      page = p;
      const { fromBar } = pageBars(p, geo.perPage, total);
      let eng: Engraving;
      try {
        if (next?.p === p && next.eng) { paper.current!.replaceChildren(...Array.from(pre.current!.childNodes)); eng = next.eng; }
        else eng = render(p, paper.current!);
        setError('');
      } catch (e) {
        setError(`Couldn't draw this part: ${(e as Error).message}`);
        shown.current = null;
        return;
      }
      const repaint = (changed: number[] | null, newExtras: { beat: number }[]) => {
        const want = changed && new Set(changed);
        for (const head of eng.heads) {
          if (want && !want.has(head.i)) continue;
          const k = marks.current.notes.get(head.i);
          paintHead(head.el, k ? colors.result[k] : undefined);
        }
        const first = (fromBar - 1) * bpb, last = first + geo.perPage * bpb;
        for (const x of newExtras) if (x.beat >= first && x.beat < last) placeX(eng, fromBar, x.beat);
      };
      extras.current?.replaceChildren();
      shown.current = { eng, fromBar, repaint };
      repaint(null, marks.current.extras);
      // The next page is engraved while this one plays: a full render at the turn would stall the downbeat.
      next = undefined;
      if (p + 1 < pages) {
        const n: { p: number; eng?: Engraving } = { p: p + 1 };
        next = n;
        setTimeout(() => { if (!cancelled && next === n && pre.current) { try { n.eng = render(n.p, pre.current); } catch { /* drawn at the turn */ } } }, 60);
      }
      if (p > 0 && !reduceMotion) paper.current!.animate([{ opacity: 0, transform: 'translateX(60px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.2,.8,.25,1)' });
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const tm = timing.current, cur = cursor.current!, hi = barHi.current!, c = count.current!;
      const pos = Number.isFinite(offset.current) ? positionFromPerf(performance.now(), offset.current, tm.zero, tm.beatMs, displayLeadMs) : -Infinity;
      const p = pageOf(barAt(Math.max(0, pos), bpb, total), geo.perPage);
      if (p !== page) draw(p);
      const ct = countText(pos, bpb, total * bpb);
      if (c.textContent !== ct.text) {
        c.textContent = ct.text;
        Object.assign(c.style, ct.countIn ? BIG_COUNT : SMALL_COUNT, { display: ct.text ? 'block' : 'none' });
        if (ct.countIn && ct.text && !reduceMotion) c.animate([{ scale: 1.5 }, { scale: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.25,1)' });
      }
      const s = shown.current, at = s && pos >= 0 ? cursorAt(s.eng.measures, pos, bpb, s.fromBar) : null;
      if (!at) { cur.style.opacity = hi.style.opacity = '0'; return; }
      cur.style.opacity = '1';
      cur.style.height = `${96 * geo.scale}px`;
      cur.style.transform = `translate(${PAD + at.x - 4}px, ${PAD + at.box.y + 14 * geo.scale}px)`;
      hi.style.opacity = '1';
      hi.style.height = `${80 * geo.scale}px`;
      hi.style.width = `${at.box.x1 - at.box.x0}px`;
      hi.style.transform = `translate(${PAD + at.box.x0}px, ${PAD + at.box.y + 22 * geo.scale}px)`;
    };
    fontReady ??= document.fonts.load('30px Bravura');
    void fontReady.then(() => { if (!cancelled) { draw(0); raf = requestAnimationFrame(tick); } });
    return () => { cancelled = true; cancelAnimationFrame(raf); shown.current = null; };
  }, [chart, w, h, hints, leftHanded, scale, colors, bpm, displayLeadMs]);

  const abs: CSSProperties = { position: 'absolute', left: 0, top: 0, pointerEvents: 'none', willChange: 'transform' };
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: `${colors.paper} radial-gradient(${colors.dots} 1.2px, transparent 1.3px) 0 0/9px 9px`, fontFamily: '-apple-system, system-ui, sans-serif' }}>
      <div ref={barHi} aria-hidden style={{ ...abs, opacity: 0, background: colors.barTint, mixBlendMode: 'multiply' }} />
      <div ref={paper} role="img" aria-label={`Drum notation${chart.title ? ` for ${chart.title}` : ''}, with a cursor at the current beat`} style={{ position: 'absolute', left: PAD, top: PAD }} />
      <div ref={extras} aria-hidden />
      <div ref={cursor} aria-hidden style={{ ...abs, opacity: 0, width: 8, background: colors.cursor, border: `3px solid ${colors.frame}`, boxShadow: `3px 3px 0 ${colors.frame}`, zIndex: 2 }} />
      <div ref={count} aria-hidden style={{ display: 'none', position: 'absolute', zIndex: 4, fontWeight: 900, color: colors.frame, background: colors.cursor, border: `3px solid ${colors.frame}`, boxShadow: `3px 3px 0 ${colors.frame}`, minWidth: 40, textAlign: 'center' }} />
      <div ref={pre} aria-hidden style={{ position: 'absolute', left: 0, top: 0, visibility: 'hidden' }} />
      {error ? <p style={{ position: 'absolute', bottom: PAD, left: PAD, margin: 0, color: colors.result.missed, font: '600 15px -apple-system, system-ui, sans-serif' }}>{error}</p> : null}
    </div>
  );
}
