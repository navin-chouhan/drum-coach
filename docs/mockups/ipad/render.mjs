// Renders every mockup to png/<name>.png at 1194×834 (1×). Run: node docs/mockups/ipad/render.mjs [name ...]
// Uses the Playwright Chromium that's already installed; nothing to install.
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright'); // the pre-installed global Playwright, not a repo dependency

// [png name, html file, #hash variant]
const SHOTS = [
  ['journey', 'journey.html'],
  ['lesson-ready', 'lesson-take.html', 'ready'],
  ['lesson-countin', 'lesson-take.html', 'countin'],
  ['lesson-take', 'lesson-take.html'],
  ['lesson-take-falling', 'lesson-take.html', 'falling'],
  ['lesson-take-sheet', 'lesson-take.html', 'sheet'],
  ['lesson-results', 'lesson-results.html'],
  ['lesson-results-sheet', 'lesson-results.html', 'sheet'],
  ['lesson-share', 'lesson-results.html', 'share'],
  ['practice', 'practice.html'],
  ['progress', 'progress.html'],
  ['setup', 'setup.html'],
  ['coach', 'coach.html'],
  ['coach-offline', 'coach.html', 'offline'],
  ['touch-pads', 'touch-pads.html'],
  ['first-run-1-welcome', 'first-run.html', 's1'],
  ['first-run-2-plug-in', 'first-run.html', 's2'],
  ['first-run-3-pads', 'first-run.html', 's3'],
  ['first-run-4-latency', 'first-run.html', 's4'],
];

(async () => {
  const only = process.argv.slice(2);
  const dir = import.meta.dirname, out = path.join(dir, 'png');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1 });
  for (const [name, file, hash] of SHOTS) {
    if (only.length && !only.includes(name)) continue;
    const url = 'file://' + path.join(dir, file) + (hash ? '#' + hash : '');
    await page.goto('about:blank');
    await page.goto(url);
    await page.waitForTimeout(250);
    // Report anything that spills out of its box, so clipping is caught before looking at the PNG.
    const spills = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('.ipad *')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || el.closest('svg')) continue;
        if ((el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== 'visible') || (el.scrollHeight > el.clientHeight + 1 && cs.overflowY !== 'visible')) {
          if (el.clientWidth > 0 && !el.classList.contains('ipad')) bad.push((el.className || el.tagName) + ' ' + el.scrollWidth + 'x' + el.scrollHeight + ' in ' + el.clientWidth + 'x' + el.clientHeight);
        }
      }
      const frame = document.querySelector('.ipad');
      for (const el of frame.querySelectorAll('.card, .move, .group, .panel, .bottomSafe')) {
        const r = el.getBoundingClientRect();
        if (r.width && (r.bottom > 776 || r.right > 1194)) bad.push('off-frame: ' + el.className + ' bottom ' + Math.round(r.bottom));
      }
      return bad;
    });
    await page.screenshot({ path: path.join(out, name + '.png'), clip: { x: 0, y: 0, width: 1194, height: 834 } });
    console.log(name, spills.length ? 'SPILLS: ' + spills.slice(0, 8).join(' | ') : 'ok');
  }
  await browser.close();
})();
