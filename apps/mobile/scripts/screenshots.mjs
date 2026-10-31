#!/usr/bin/env node
// Layout harness (dev only): renders the app with react-native-web in Playwright's Chromium at the iPad's 1194×834 pt
// and writes a PNG per screen and state to apps/mobile/screenshots/ (gitignored), plus overflow numbers.
// Fake data only: src/platform/storage.web.ts seeds src/dev/harness/seeds.ts by `?h=<state>`. Not the real iPad
// (fonts, safe areas and native views differ), so read it as a budget check, not a pixel truth.
//
//   node scripts/screenshots.mjs            export the web bundle, then shoot every shot
//   node scripts/screenshots.mjs --no-build reuse the last export (screenshots/.web)
//   node scripts/screenshots.mjs journey-alldone progress   only these shots
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(app, 'screenshots');
const web = join(out, '.web');
const W = 1194, H = 834;

const SHOTS = [
  ['journey-fresh', '/?h=fresh'],
  ['journey-recap', '/?h=recap'],
  ['journey-sore', '/?h=sore'],
  ['journey-week', '/?h=week'],
  ['journey-writing', '/?h=writing'],
  ['journey-alldone', '/?h=alldone'],
  ['practice', '/practice?h=sore'],
  ['progress', '/progress?h=sore'],
  ['setup', '/setup?h=sore'],
  ['lesson', '/lesson/money-8ths?h=sore'],
  // W2's states (a take runs on the silent web engine, src/platform/audio.web.ts; no hits, so it ends on its results)
  ...W2_SHOTS(),
];

/** Steps: tap a testID, tap one `through` while it shows (slides), or wait for one (takes run in real time: ≤ 60 s). */
function W2_SHOTS() {
  // Play, then G3's intro slides (Next ▶ … Ready ▶) when the step has them, then the take runs to its results
  const take = [{ tap: 'lesson-main-move' }, { through: 'lesson-intro-next' }, { wait: 'lesson-take-card', ms: 60_000 }];
  return [
    ['lesson-results', '/lesson/money-8ths?h=sore', take],
    ['lesson-results-more', '/lesson/money-8ths?h=sore', [...take, { tap: 'lesson-more-button' }, { wait: 'lesson-more' }]],
    ['lesson-results-coach', '/lesson/money-8ths?h=sore', [...take, { tap: 'lesson-ask-coach' }, { wait: 'coach-inspector' }]],
    ['lesson-more', '/lesson/money-8ths?h=sore', [{ tap: 'lesson-more-button' }, { wait: 'lesson-more' }]],
    // a real celebration needs a passing take (no drummer on the web): app/dev/celebration.tsx shows it with fake values
    ['lesson-celebration', '/dev/celebration?h=sore', [{ wait: 'lesson-celebration' }]],
    ['lesson-celebration-rank', '/dev/celebration?rank=1&h=sore', [{ wait: 'lesson-celebration' }]],
    ['practice-your-take', '/practice?h=sore', [{ tap: 'practice-play' }, { tap: 'practice-main' }, { through: 'lesson-intro-next' }, { wait: 'practice-your-take', ms: 60_000 }]],
    ['practice-details', '/practice?h=sore', [{ tap: 'practice-play' }, { tap: 'practice-main' }, { through: 'lesson-intro-next' }, { wait: 'practice-details-open', ms: 60_000 }, { tap: 'practice-details-open' }, { wait: 'practice-details' }]],
    ['journey-more', '/?h=sore', [{ tap: 'journey-more-open' }, { wait: 'journey-more' }]],
    ['placement', '/lesson/placement?h=sore', [{ wait: 'placement-rung' }]],
  ];
}

const args = process.argv.slice(2);
const only = args.filter(a => !a.startsWith('--'));
mkdirSync(out, { recursive: true });
if (!args.includes('--no-build') || !existsSync(join(web, 'index.html'))) {
  // worktrees share /tmp: a private TMPDIR for Metro's cache
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', web], { cwd: app, stdio: 'inherit', env: { ...process.env, TMPDIR: mkdtempSync(join(tmpdir(), 'dc-web-')) } });
}

// A static server with the single-page fallback (expo-router's web export is one index.html).
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(web, path);
  if (!file.startsWith(web) || !existsSync(file) || !extname(file)) file = join(web, 'index.html');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch();
const report = [];
try {
  for (const [name, url, steps = []] of SHOTS) {
    if (only.length && !only.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    let failed = '';
    for (const st of steps) {
      const sel = `[data-testid="${st.tap ?? st.wait ?? st.through}"]`;
      try {
        if (st.through) {
          for (let k = 0; k < 10 && await page.locator(sel).first().isVisible(); k++) { await page.locator(sel).first().click(); await page.waitForTimeout(400); }
        } else if (st.tap) { await page.locator(sel).first().click({ timeout: 10_000 }); await page.waitForTimeout(600); }
        else await page.locator(sel).first().waitFor({ state: 'visible', timeout: st.ms ?? 10_000 });
      } catch { failed = `step ${JSON.stringify(st)} failed`; break; }
    }
    await page.waitForTimeout(600);
    if (failed) errors.unshift(failed);
    await page.screenshot({ path: join(out, `${name}.png`) });
    // What spills: a visible element ends outside the frame. Content a scroll view holds, or notation drawn in the sheet's
    // SVG past its paper, is `clipped` (meant to be cut). Content a smaller box (a card) cuts off is `cut`: usually a bug.
    const o = await page.evaluate(([w, h]) => {
      const de = document.documentElement;
      const spill = [], cut = [];
      let clipped = 0, truncated = 0;
      const line = (el, r) => {
        const id = el.getAttribute('data-testid'), text = (el.textContent ?? '').trim().slice(0, 50);
        return id || (el.children.length === 0 && text) ? `${id ?? 'text'} "${text}" ends at ${Math.round(r.right)}×${Math.round(r.bottom)}` : '';
      };
      // How the element is cut: by a scroll view or inside the sheet's SVG ('clipped', meant), by a smaller box that
      // hides overflow ('cut', usually a bug), or not at all ('').
      const how = (el, r) => {
        let res = '';
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const cs = getComputedStyle(a), ov = cs.overflowY + cs.overflowX;
          if (!/(auto|scroll|hidden)/.test(ov)) continue;
          const br = a.getBoundingClientRect();
          if (br.width * br.height >= 0.9 * w * h) continue; // the screen's own frame: past it is a spill
          if (r.bottom <= br.bottom + 1 && r.right <= br.right + 1) continue;
          if (/(auto|scroll)/.test(ov) || el.closest('svg')) return 'clipped';
          if (cs.textOverflow === 'ellipsis' || getComputedStyle(a).webkitLineClamp !== 'none') return 'trunc';
          res ||= 'cut';
        }
        return res;
      };
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        const l = line(el, r);
        if (!l && !el.closest('svg')) continue;
        const c = how(el, r);
        if (c === 'clipped') clipped++;
        else if (c === 'trunc') truncated++;
        else if (c === 'cut') { if (l) cut.push(l); }
        else if (l && (r.bottom > h + 1 || r.right > w + 1)) spill.push(l);
      }
      return { scrollW: de.scrollWidth, scrollH: de.scrollHeight, clipped, truncated, spills: spill.length, spill: spill.slice(0, 12), cuts: cut.length, cut: cut.slice(0, 8) };
    }, [W, H]);
    report.push({ name, url, ...o, errors: errors.slice(0, 3) });
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
for (const r of report) {
  console.log(`${r.name}: ${r.spills ? `${r.spills} spill` : 'fits'}${r.cuts ? `, ${r.cuts} cut by their card` : ''}${r.errors.length ? `, errors: ${r.errors.join(' | ')}` : ''}`);
  for (const s of r.spill) console.log(`  ${s}`);
  for (const s of r.cut) console.log(`  cut: ${s}`);
}
console.log(`PNGs in ${out}`);
