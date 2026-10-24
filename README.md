# Drum Coach

A personal AI drum instructor for the Millenium MPS-150 e-kit, running locally in Chrome.

- `CLAUDE.md`: instructions Claude Code reads automatically in every session
- `docs/SPEC.md`: what we're building, and the milestones
- `docs/KIT.md`: verified facts about the drum kit and its MIDI
- `prototype/drum-stage.html`: working prototype (open it in Chrome)

## Start on Linux

1. Install Claude Code (needs a Claude subscription or Anthropic Console account):
   ```bash
   curl -fsSL https://claude.ai/install.sh | bash
   ```
   Open a new terminal and check it with `claude --version`.
2. Install Node.js 20+ and git if you don't have them (`node -v`, `git --version`).
3. Unzip this folder, then:
   ```bash
   cd ~/drum-coach
   git init && git add . && git commit -m "Project brief and prototype"
   claude
   ```
4. Paste this as your first message:

   > Read CLAUDE.md, docs/SPEC.md and docs/KIT.md, and look at prototype/drum-stage.html.
   > Then plan milestone M0 and M1 and build them. Keep the keyboard fallback working so you
   > can test without the kit. When M1 is done, tell me how to run it so I can test with my drums.

5. After each milestone, test with your kit and ask for the next one ("now do M2").

The AI coach (M4) uses your logged-in `claude` CLI (your Claude subscription). An Anthropic API key
in `.env` is only an optional fallback.

## Run the app

```bash
npm install        # first time only
npm run dev        # web app on http://localhost:5173, API on 127.0.0.1:8787
```
Open **http://localhost:5173** in Google Chrome and allow MIDI access when asked.
Close `amidi -d` or any other app holding the kit's MIDI port first.

Other scripts: `npm test` (Vitest), `npm run lint`, `npm run build`.

### Tabs
- **Kit**: live animated kit + hit timeline.
- **Play**: pick an exercise or song, set speed (50–125%), bars A–B, repeats, metronome, count-in, wait mode. `Esc` stops.
  After a run you get the results screen (accuracy, rushing/dragging, per-drum, where-in-the-bar heat map, replay) and can ask the coach.
- **Songs**: learn real songs from YouTube (below). Importing a drum MIDI file + audio is still there under "Import files".
- **Coach**: what-next pick, weekly plan checklist, chat (can create exercises). Uses your logged-in `claude` CLI.
- **Progress**: streak, minutes, accuracy and BPM trends per exercise.
- **Calibrate**: hit-each-pad wizard, note map, latency calibration.

## Learning songs from YouTube
1. **Songs** tab → search "artist song" (or paste a YouTube / YouTube Music link) → **Learn this**.
2. **Versions** → *Find drumless & covers*: pick a drumless version (for playing along) and a drum cover (to watch/learn).
3. **1 · Set tempo**: press Play, hit any pad on every beat starting on a "1" (8–16 taps) → Save. Tick *Click along* to check it by ear.
   Each version needs its own tempo; once one version has it, 2–4 taps set the next one.
4. **2 · Learn by ear**: loop a few bars (slow them down with Speed), play what you hear; each pass becomes a take (rings).
   *Use take*, click cells to fix notes, tick *Hear my part* to compare with the recording, *Save bars*, move on.
   *Ask coach for the groove* gives Claude's best guess for the song (from its knowledge, not by listening) as a starting point.
5. **3 · Jam**: play freely along with the song and get scored against its beat (timing, drift, dynamics per drum) + coach.
6. **4 · Play (scored)**: your transcription as a note highway with the drumless version, scored and saved to Progress.

No drumless version? **Reduce drums (experimental)** opens a small "song player" window; Chrome asks which tab to share:
pick *Drum Coach – song player* with "Also share tab audio" on. Drums get quieter (not removed); nothing is recorded or stored.

### YouTube setup (one time, free)
1. Go to https://console.cloud.google.com/ → create a project (any name).
2. *APIs & Services → Library* → enable **YouTube Data API v3**.
3. *APIs & Services → Credentials → Create credentials → API key*; edit it → *API restrictions* → YouTube Data API v3.
4. Put it in `.env` as `YOUTUBE_API_KEY=...` and restart `npm run dev`.
The free quota allows ~100 searches a day (results are cached for 24 h). Without a key you can still paste links.
Videos play ad-free with Premium when Chrome is signed in to YouTube; a few videos don't allow embedding.

Data (runs, songs, plans, settings, coach answer cache) is in `data/` (SQLite). Back it up if you care about your history.
In dev, the console has `drumCoach.emitNote(note, velocity)` for testing without the kit.
