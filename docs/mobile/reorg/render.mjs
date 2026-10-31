// Renders the reorg proposal's "after" wireframes to <name>.png at 1194×834 (1×), and reports overflow past the frame.
// Run: NODE_PATH=/opt/node-tools/node_modules node docs/mobile/reorg/render.mjs [name ...]
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright'); // the machine's Playwright, not a repo dependency
const NAMES = ['journey-after', 'practice-after', 'lesson-ready-after', 'lesson-take-after', 'lesson-results-after', 'you-after', 'setup-after'];
const only = process.argv.slice(2), dir = import.meta.dirname;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1194, height: 834 }, deviceScaleFactor: 1 });
for (const n of NAMES) {
  if (only.length && !only.includes(n)) continue;
  await page.goto('file://' + path.join(dir, `${n}.html`));
  await page.waitForTimeout(300);
  const over = await page.evaluate(() => [...document.querySelectorAll('.ipad *')].filter(e => {
    const r = e.getBoundingClientRect(); return r.width && (r.right > 1195 || r.bottom > 835);
  }).map(e => e.className || e.tagName).slice(0, 5));
  await page.screenshot({ path: path.join(dir, `${n}.png`), clip: { x: 0, y: 0, width: 1194, height: 834 } });
  console.log(n, over.length ? `overflow: ${over.join(', ')}` : 'ok');
}
await browser.close();
