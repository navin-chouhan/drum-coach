#!/usr/bin/env node
// Layout harness (dev only): renders the app with react-native-web in Playwright's Chromium at the iPad's 1194×834 pt
// and writes a PNG per screen and state to apps/mobile/screenshots/ (gitignored), plus overflow numbers.
// Fake data only: src/platform/storage.web.ts seeds src/dev/harness/seeds.ts by `?h=<state>`. Not the real iPad
// (fonts, safe areas and native views differ), so read it as a budget check, not a pixel truth.
//
//   node scripts/screenshots.mjs            export the web bundle, then shoot every shot
//   node scripts/screenshots.mjs --no-build reuse the last export (screenshots/.web)
//   node scripts/screenshots.mjs journey-alldone progress   only these shots
//   node scripts/screenshots.mjs --check    fail on overflows that aren't in scripts/screenshots-baseline.json
//   node scripts/screenshots.mjs --update-baseline         record today's overflows as the baseline (after review)
// Playwright comes from the machine (e.g. NODE_PATH=/opt/node-tools/node_modules); it isn't an app dependency.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(app, 'screenshots');
const web = join(out, '.web');
const W = 1194, H = 834;

// [name, url, steps before the shot]: { click: testID } | { text: visible text to click } | { fill: [testID, text] } |
// { wait: ms }. testIDs are data-testid on the web.
const FIRST_WELCOME = [{ click: 'firstrun-goal-rock' }, { text: '25 (recommended)' }, { text: 'New to drums' }];
const INTRO = [{ click: 'lesson-main-move' }, { wait: 600 }];
const NEXT = { click: 'lesson-intro-next' };
const SHOTS = [
  ['journey-fresh', '/?h=fresh'],
  ['journey-recap', '/?h=recap'],
  ['journey-sore', '/?h=sore'],
  ['journey-week', '/?h=week'],
  ['journey-writing', '/?h=writing'],
  ['journey-alldone', '/?h=alldone'],
  ['practice', '/practice?h=sore'],
  ['progress', '/progress?h=sore'],
  ['progress-fresh', '/progress?h=fresh'],
  ['progress-busy', '/progress?h=busy'],
  ['progress-coming', '/progress?h=busy&view=coming'],
  ['progress-lessons', '/progress?h=busy&view=lessons'],
  ['progress-teacher', '/progress?h=busy&view=teacher'],
  ['progress-skills', '/progress?h=busy&view=skills'],
  ['progress-path', '/progress?h=busy&view=path'],
  ['progress-month', '/progress?h=busy&view=month'],
  ['setup', '/setup?h=sore'],
  ['setup-busy', '/setup?h=busy'],
  ['setup-coach', '/setup?h=busy&tool=coach'],
  ['setup-kittest', '/setup?h=busy&tool=kittest'],
  ['setup-notemap', '/setup?h=busy&tool=notemap'],
  ['setup-sound', '/setup?h=busy&tool=sound'],
  ['setup-latency', '/setup?h=busy&tool=latency'],
  ['setup-input', '/setup?h=busy&tool=input'],
  ['setup-apikey', '/setup?h=busy&tool=apikey'],
  ['lesson', '/lesson/money-8ths?h=sore'],
  // Songs: the library, then one song in each mode (the YouTube area is a stub: src/youtube/YouTubeView.web.tsx)
  ['songs', '/songs?h=songs'],
  ['song-new', '/song/yt-harnessCCCC?h=songs'],
  ...['tempo', 'learn', 'jam', 'play', 'sheet'].map(m => [`song-${m}`, '/song/yt-harnessAAAA?h=songs', [{ click: `song-mode-${m}` }, { wait: 500 }]]),
  // Coach: offline (no server), the week plan with a healthy server, then a conversation
  ['coach-offline', '/coach?h=sore'],
  ['coach-week', '/coach?h=coach'],
  ['coach-session', '/coach?h=coach', [{ fill: ['coach-input', 'Why does bar 2 feel rushed?'] }, { click: 'coach-send' }, { wait: 800 },
    { fill: ['coach-input', 'And what should I play tomorrow?'] }, { click: 'coach-send' }, { wait: 800 }]],
  // First run, its 4 steps
  ['firstrun-welcome', '/welcome?h=firstrun', FIRST_WELCOME],
  ['firstrun-plug', '/welcome?h=firstrun', [...FIRST_WELCOME, { click: 'firstrun-continue' }, { wait: 600 }]],
  ['firstrun-pads', '/welcome?h=firstrun', [...FIRST_WELCOME, { click: 'firstrun-continue' }, { wait: 600 }, { click: 'firstrun-plug-continue' }, { wait: 600 }]],
  ['firstrun-latency', '/welcome?h=firstrun', [...FIRST_WELCOME, { click: 'firstrun-continue' }, { wait: 600 }, { click: 'firstrun-plug-continue' }, { wait: 600 },
    { click: 'firstrun-pads-fine' }, { wait: 600 }]],
  ['metronome', '/practice/metronome?h=sore'],
  ['technique', '/technique?h=sore'],
  ['technique-kick', '/technique?h=sore', [{ click: 'technique-demo-kick' }, { wait: 600 }]],
  ['flow', '/flow?h=sore', [{ wait: 800 }]],
  ['placement', '/lesson/placement?h=sore'],
  // The lesson steps (G3): ear quiz, transcription (checked once), a look step, the intro slides, the celebration
  ['lesson-quiz', '/lesson/ear-steady?h=sore'],
  ['lesson-quiz-said', '/lesson/ear-steady?h=sore', [{ click: 'lesson-quiz-answer-0' }, { wait: 200 }]],
  ['lesson-transcribe', '/lesson/write-it?h=sore', [{ click: 'lesson-transcribe-hihat-0' }, { click: 'lesson-transcribe-kick-0' }, { click: 'lesson-transcribe-check' }]],
  ['lesson-look', '/lesson/flam?h=sore', [{ wait: 600 }]],
  ['lesson-intro-1', '/lesson/money-8ths?h=sore', INTRO],
  ['lesson-intro-2', '/lesson/money-8ths?h=sore', [...INTRO, NEXT]],
  ['lesson-intro-3', '/lesson/money-8ths?h=sore', [...INTRO, NEXT, NEXT]],
  ['lesson-intro-4', '/lesson/money-8ths?h=sore', [...INTRO, NEXT, NEXT, NEXT, { wait: 600 }]],
  ['lesson-celebration', '/dev/parts?part=celebration&h=sore'],
  ['practice-details', '/dev/parts?part=details&h=sore', [{ wait: 800 }]],
];

const args = process.argv.slice(2);
const only = args.filter(a => !a.startsWith('--'));
const baselinePath = join(app, 'scripts', 'screenshots-baseline.json');
mkdirSync(out, { recursive: true });
if (!args.includes('--no-build') || !existsSync(join(web, 'index.html'))) {
  // worktrees share /tmp: a private TMPDIR for Metro's cache
  execFileSync('npx', ['expo', 'export', '--platform', 'web', '--output-dir', web], { cwd: app, stdio: 'inherit', env: { ...process.env, TMPDIR: mkdtempSync(join(tmpdir(), 'dc-web-')) } });
}

// Reads a file, or null when it isn't there (one read, no exists-then-read race).
function readOrNull(file, enc) {
  try { return readFileSync(file, enc); } catch (err) { if (err?.code === 'ENOENT' || err?.code === 'EISDIR') return null; throw err; }
}

// A static server with the single-page fallback (expo-router's web export is one index.html).
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(web, path);
  if (!file.startsWith(web + sep) || !extname(file)) file = join(web, 'index.html');
  let body = readOrNull(file);
  if (body === null) body = readFileSync(file = join(web, 'index.html'));
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
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
    for (const st of steps) {
      try {
        if (st.click) await page.locator(`[data-testid="${st.click}"]`).first().click({ timeout: 4000 });
        else if (st.text) await page.getByText(st.text, { exact: true }).first().click({ timeout: 4000 });
        else if (st.fill) await page.locator(`[data-testid="${st.fill[0]}"]`).first().fill(st.fill[1], { timeout: 4000 });
        else if (st.wait) await page.waitForTimeout(st.wait);
        await page.waitForTimeout(150);
      } catch (e) { errors.push(`step ${JSON.stringify(st)}: ${String(e.message ?? e).split('\n')[0]}`); }
    }
    await page.screenshot({ path: join(out, `${name}.png`) });
    // What spills: the page scrolls, or a visible element ends outside the frame, or text is cut by its box.
    const o = await page.evaluate(([w, h]) => {
      const de = document.documentElement;
      const spill = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
        if (r.bottom > h + 1 || r.right > w + 1) {
          const id = el.getAttribute('data-testid'), text = (el.textContent ?? '').trim().slice(0, 50);
          if (id || (el.children.length === 0 && text)) spill.push(`${id ?? 'text'} "${text}" ends at ${Math.round(r.right)}×${Math.round(r.bottom)}`);
        }
      }
      return { scrollW: de.scrollWidth, scrollH: de.scrollHeight, spill: spill.slice(0, 12) };
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
  console.log(`${r.name}: ${r.spill.length ? `${r.spill.length} spill` : 'fits'}${r.errors.length ? `, errors: ${r.errors.join(' | ')}` : ''}`);
  for (const s of r.spill) console.log(`  ${s}`);
}
console.log(`PNGs in ${out}`);

// --check: fail on new overflows against the committed baseline (a shot that spills more than it did, a new spilled
// element, a page that scrolls further, or a shot that couldn't run its steps). --update-baseline writes it.
// A dev tool, not CI: the numbers come from Chromium, not the iPad.
const key = s => s.replace(/ ends at \d+×\d+$/, '');
if (args.includes('--update-baseline')) {
  const prev = JSON.parse(readOrNull(baselinePath, 'utf8') ?? '{}');
  for (const r of report) prev[r.name] = { scrollW: r.scrollW, scrollH: r.scrollH, spill: r.spill.map(key), errors: r.errors.length };
  writeFileSync(baselinePath, `${JSON.stringify(prev, null, 2)}\n`);
  console.log(`baseline written: ${baselinePath}`);
} else if (args.includes('--check')) {
  const baseline = JSON.parse(readOrNull(baselinePath, 'utf8') ?? '{}');
  const worse = [];
  for (const r of report) {
    const b = baseline[r.name];
    if (!b) { if (r.spill.length || r.errors.length) worse.push(`${r.name}: not in the baseline and spills ${r.spill.length} / errors ${r.errors.length}`); continue; }
    const fresh = r.spill.map(key).filter(s => !b.spill.includes(s));
    if (fresh.length) worse.push(`${r.name}: new spill: ${fresh.join('; ')}`);
    if (r.scrollW > Math.max(W, b.scrollW) || r.scrollH > Math.max(H, b.scrollH)) worse.push(`${r.name}: page ${r.scrollW}×${r.scrollH} (baseline ${b.scrollW}×${b.scrollH})`);
    if (r.errors.length > b.errors) worse.push(`${r.name}: ${r.errors.length} errors (baseline ${b.errors}): ${r.errors.join(' | ')}`);
  }
  if (worse.length) { console.log(`\n✗ ${worse.length} shot(s) worse than ${baselinePath}:`); for (const w of worse) console.log(`  ${w}`); process.exitCode = 1; }
  else console.log(`\n✓ no new overflow against the baseline (${report.length} shots)`);
}
