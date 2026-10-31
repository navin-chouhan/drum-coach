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
];

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
  for (const [name, url] of SHOTS) {
    if (only.length && !only.includes(name)) continue;
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
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
