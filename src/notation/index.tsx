import { lazy, Suspense, type ComponentProps } from 'react';

// VexFlow + its embedded font are ~800 kB: loaded only when a sheet is first shown.
const Sheet = lazy(() => import('./SheetMusic').then(m => ({ default: m.SheetMusic })));
const Player = lazy(() => import('./SheetMusic').then(m => ({ default: m.SheetPlayer })));

/** Starts loading the notation chunk now, so a play view that shows the sheet only once playing doesn't load it during the count-in. */
export const preloadSheet = () => { void import('./SheetMusic'); };

export function SheetMusic(props: ComponentProps<typeof Sheet>) {
  return <Suspense fallback={<p className="small">Loading notation…</p>}><Sheet {...props} /></Suspense>;
}

/** Prints only the sheet: the page hides everything else while printing. */
export function printSheet() {
  document.body.classList.add('printingSheet');
  const done = () => { document.body.classList.remove('printingSheet'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

/** The animated notation play view (see SheetMusic.tsx). */
export function SheetPlayer() {
  return <Suspense fallback={<p className="small">Loading notation…</p>}><Player /></Suspense>;
}
