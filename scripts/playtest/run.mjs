#!/usr/bin/env node
// Automated play test (N11): the app in headless Google Chrome, played by the emulated MPS-150 as a Beginner and a
// Solid player, through the real MIDI input path. No new dependency: the Chrome DevTools protocol over Node's built-in
// WebSocket. The API runs on a fresh temporary DATA_DIR with the coach off (no Claude usage); your data is never used.
//
//   npm run playtest            quick: a few lessons, ~5 minutes (before every merge)
//   npm run playtest -- --full  every stage's checkpoints until done (long)
//
// Each take must show a verdict (never "…"), the tempo must move the way the verdict says, the take must be saved,
// and the page must not throw. Prints a report; exits 1 on any problem.
import { spawn } from 'node:child_process';
import { mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FULL = process.argv.includes('--full');
const API = 8791, WEB = 5181, CDP = 9333;
const root = new URL('../..', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'drum-playtest-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const procs = [];
const LOGS = process.env.PLAYTEST_LOGS; // keep the servers' output here (for debugging a failed run)
const run = (cmd, argv, env = {}, log) => { const out = LOGS && log ? openSync(join(LOGS, log), 'w') : 'ignore'; const p = spawn(cmd, argv, { cwd: root, env: { ...process.env, ...env }, stdio: ['ignore', out, out] }); procs.push(p); return p; };
let cleaned = false;
const cleanup = () => { if (cleaned) return; cleaned = true; for (const p of procs) p.kill('SIGTERM'); rmSync(tmp, { recursive: true, force: true }); };
process.on('exit', cleanup);
process.on('SIGINT', () => process.exit(130));
async function waitFor(url, ms = 40000) {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(300)) { try { const r = await fetch(url); if (r.ok) return r; } catch { /* not up yet */ } }
  throw new Error(`timed out waiting for ${url}`);
}

// What to play: [player, lesson ids, takes per lesson]. The quick set touches counting, a layered groove, flams,
// 7/8, a song with the band and a free-bar step; --full plays every checkpoint of every stage until it's done.
const BEGINNER = { lateMs: 45, jitterMs: 40, weakHand: 0.6 }, SOLID = { lateMs: 8, jitterMs: 8, weakHand: 0.95 };
const QUICK = [['Beginner', BEGINNER, ['count-8ths', 'money-quarters'], 2], ['Solid', SOLID, ['hh-8ths', 'flam', 'seven-eight', 'trade-bars'], 2]];

run('node', ['server/index.ts'], { PORT: String(API), DATA_DIR: join(tmp, 'data'), CLAUDE_BIN: '/bin/false', AI_PROVIDER: '' }, 'api.log');
run(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(WEB), '--strictPort'], { PORT: String(API) }, 'vite.log');
run('google-chrome', ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${join(tmp, 'chrome')}`, '--autoplay-policy=no-user-gesture-required',
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank']);
await waitFor(`http://127.0.0.1:${API}/api/runs`);
await waitFor(`http://localhost:${WEB}/`);
await waitFor(`http://127.0.0.1:${CDP}/json/version`);

// ---------- a tiny DevTools-protocol client ----------
const page = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
let seq = 0;
const pending = new Map(), pageErrors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') pageErrors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expression) {
  const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (m.result?.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description ?? m.result.exceptionDetails.text);
  return m.result?.result?.value;
}
await send('Runtime.enable');
await send('Page.enable');
const open = async () => { await send('Page.navigate', { url: `http://localhost:${WEB}/` }); await sleep(2500); };

// A student who finished onboarding and the kit step; the coach, voice and spoken count-in off (no Claude, no TTS).
await open();
await evaluate(`localStorage.setItem('drumcoach.settings', JSON.stringify({ updatedAt: Date.now() + 1e9, latencyMs: 0, browserSounds: false, liveTips: 'screen', chattiness: 'normal',
  voice: false, countIn: false, playView: 'sheet', aiTips: false, liveCoach: false, handsFree: false, padCommands: true, clickVolume: 1, voiceVolume: 1, v: 3,
  profile: { goals: [], minutesPerDay: 25, onboarded: true }, lessons: {}, setupDone: true, setupNudged: true }))`);
await open();

// ---------- one take, played in the page: press the big move like a student saying "yes" ----------
const TAKE = `(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const settings = await import('/src/input/settings.ts'), player = await import('/src/play/player.ts');
  const runs = async () => (await (await fetch('/api/runs')).json()).length;
  const before = { prog: settings.getSettings().lessons[LESSON], runs: await runs() };
  const main = document.querySelector('.moves .move.go');
  if (!main) return { problem: 'no main move on screen' };
  const label = main.innerText.split('\\n')[0];
  if (/Done, next step/.test(label)) { main.click(); await sleep(400); return { label, line: 'step done', skip: true }; }
  if (/Next|Journey/.test(label)) return { label, done: true };
  main.click(); await sleep(600);
  for (let i = 0; i < 6 && document.querySelector('.introSlides'); i++) { [...document.querySelectorAll('.introSlides button')].find(b => /Next|Ready/.test(b.innerText))?.click(); await sleep(300); }
  const t0 = Date.now();
  await sleep(800);
  while (player.player.phase === 'playing') { if (Date.now() - t0 > 150000) return { label, problem: 'take never ended' }; await sleep(300); }
  await sleep(1200);
  const line = document.querySelector('.say .bubble')?.innerText.split('\\n')[0] ?? '';
  const prog = settings.getSettings().lessons[LESSON], problems = [];
  if (!line.trim() || line.trim() === '…') problems.push('no verdict on screen');
  const up = line.match(/Up to (\\d+) BPM/), down = line.match(/take it to (\\d+) BPM/);
  if (up && prog?.bpm !== +up[1]) problems.push('verdict says ' + up[1] + ' BPM, progress has ' + prog?.bpm);
  if (down && prog?.bpm !== +down[1]) problems.push('verdict says ' + down[1] + ' BPM, progress has ' + prog?.bpm);
  const scored = /Clean take|Up to|take it to|Same tempo|once more|Lesson complete|Still solid|Step done|tricky|notes are there/.test(line);
  // (a take with no notes of yours, e.g. only free bars, isn't saved by design)
  if (scored && player.player.finished?.stats.total && (await runs()) <= before.runs) problems.push('the take was not saved');
  const close = [...document.querySelectorAll('button')].find(b => /^Back to Journey$|Next in today/.test(b.innerText)); // the celebration
  return { label, line, bpm: prog?.bpm, step: prog?.step, done: !!prog?.completedAt, problems, celebration: !!close };
})()`;

const report = [];
const scenarios = FULL
  ? [['Beginner', BEGINNER, null, 10], ['Solid', SOLID, null, 10]]
  : QUICK;
const allCheckpoints = await evaluate(`import('/src/content/curriculum.ts').then(c => c.MILESTONES.flatMap(m => m.checkpoints))`);
for (const [who, human, ids, takes] of scenarios) {
  await open();
  await evaluate(`import('/src/input/emulatedKit.ts').then(k => k.setEmulatedKit({ on: true, retriggers: true, crosstalk: true, ...${JSON.stringify(human)} }))`);
  for (const id of ids ?? allCheckpoints) {
    await evaluate(`import('/src/ui/nav.ts').then(n => n.requestLesson(${JSON.stringify(id)}))`);
    await sleep(1500);
    for (let t = 0; t < takes; t++) {
      const r = await evaluate(TAKE.replaceAll('LESSON', JSON.stringify(id)));
      if (r.skip) { t--; continue; }
      report.push({ who, id, take: t + 1, ...r });
      const flag = r.problem || r.problems?.length ? '✗' : '✓';
      console.log(`${flag} ${who.padEnd(8)} ${id.padEnd(16)} take ${t + 1}: ${r.problem ?? r.line ?? r.label}${r.problems?.length ? '  ← ' + r.problems.join('; ') : ''}`);
      if (r.done || r.problem) break;
    }
  }
}
const failed = report.filter(r => r.problem || r.problems?.length);
console.log(`\n${report.length} takes, ${failed.length} with problems, ${pageErrors.length} page errors`);
pageErrors.slice(0, 10).forEach(e => console.log('  page error: ' + e.split('\n')[0]));
ws.close();
process.exit(failed.length || pageErrors.length ? 1 : 0);
