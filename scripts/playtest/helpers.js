// Play-test driver (dev only): drives the app from the console, as docs/PLAYTEST.md describes.
// Load after a reload with: await import('/scripts/playtest/helpers.js?' + Date.now())
const pl = await import('/src/play/player.ts');
const ek = await import('/src/input/emulatedKit.ts');
const st = await import('/src/input/settings.ts');
const nav = await import('/src/ui/nav.ts');
const coach = await import('/src/coach/session.ts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T = window.T = {
  pl, ek, st, nav, coach, sleep,
  btn: re => [...document.querySelectorAll('button')].find(b => re.test(b.innerText)),
  click(re) { const b = T.btn(re); if (!b) return 'NO BUTTON ' + re; b.click(); return 'clicked ' + b.innerText.trim().split('\n')[0]; },
  line: () => document.querySelector('.say .bubble')?.innerText,
  side: () => document.querySelector('.lessonSide .card')?.innerText,
  bar: () => document.querySelector('.lbar')?.innerText.replace(/\n/g, ' '),
  main: () => document.querySelector('.moves button')?.innerText.split('\n')[0],
  async slidesThrough() { let n = 0; for (let i = 0; i < 6 && document.querySelector('.introSlides'); i++) { const b = [...document.querySelectorAll('.introSlides button')].find(b => /Next|Ready/i.test(b.innerText)); if (!b) return 'no next'; b.click(); n++; await sleep(300); } return n ? `slides×${n}` : 'no slides'; },
  async untilDone(ms = 40000) { const t0 = Date.now(); await sleep(800); while (pl.player.phase !== 'done' && pl.player.phase !== 'idle') { if (Date.now() - t0 > ms) return 'TIMEOUT ' + pl.player.phase; await sleep(300); } await sleep(500); return pl.player.phase; },
  state() { const p = pl.player.options?.lesson; const id = p?.id; return id ? JSON.stringify(st.getSettings().lessons[id]) : ''; },
  report: () => ['LINE: ' + T.line(), 'SIDE: ' + (T.side() ?? '').replace(/\n+/g, ' | ').slice(0, 400), 'MAIN: ' + T.main(), 'BAR: ' + T.bar(), 'PROG: ' + T.state()].join('\n'),
  async go(re = /▶ (Play|Again)/) { const c = re ? T.click(re) : ''; await sleep(500); const s = await T.slidesThrough(); const ph = await T.untilDone(); return [c, s, ph, T.report()].join('\n'); },
  player: (o) => ek.setEmulatedKit({ on: true, retriggers: true, crosstalk: true, ...o }),
};
T.player({ lateMs: 45, jitterMs: 40, weakHand: 0.6 });
export default 'armed';
