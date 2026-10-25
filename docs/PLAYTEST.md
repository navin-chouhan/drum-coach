# Play-test log: the whole path, played as a drum instructor would review it

A running record of playing every lesson from Stage 1 to Swing Cat, what an instructor would criticise, and what
was fixed. Newest stage at the bottom. Updated as the run goes.

## How the test is run
- **App:** this worktree, served on `http://localhost:5180` (API on 8790) with its own empty `DATA_DIR` in the
  session scratchpad, so the owner's real progress (localhost:5173, `./data`) is never touched.
- **Player:** the app's built-in emulated kit (Setup → Pads → Emulated kit) plays every take through the real MIDI
  input path. Profile: a solid player, 8 ms late, ±8 ms jitter, weak hand 95% (the owner asked for an expert, not a
  simulated beginner). Free bars (trade, own fill) are filled with 8th notes by keyboard events, since the emulated
  kit leaves them silent.
- **Browser:** Claude in Chrome. Its screenshot, click and find tools time out on every page here (even a plain JSON
  page), so the app is driven by page scripts: clicks on the buttons the user would press, hi-hat taps for the intro
  slides, and one real key press per page load to allow sound.
- **Onboarding:** all three styles picked (rock, funk, jazz) so every tagged lesson is on the path; 25 minutes a day.

## Lessons learned about testing this app
- Chrome blocks sound until a real click or key press on the page. Scripted key events and MIDI don't count, so a
  page that is reloaded and then started from the kit waits forever. (Fixed: a chip says so, see below.)
- After a hot reload, Vite serves app modules with `?t=` query strings. Importing `/src/...` from the console then
  gives a second, separate copy of the module (a second player, a second AudioContext). Import the exact URL from
  `performance.getEntriesByType('resource')`, or restart Vite.
- The celebration always renders three ★ characters and lights them with CSS (`.bigStars .on`), so reading its text
  says ★★★ even for 1 star.
- A reload that isn't started by a click can lose Chrome's permission to play sound; the new "turn on the sound"
  chip showed exactly that during the run, and one real key press fixed it.
- Editing app code while a page is open makes Vite hot-swap modules; once that left the lesson screen not showing a
  finished lesson's verdict (the lesson had completed and saved). Reload the page after code changes before trusting
  what it shows. The autopilot lives in a git-excluded `.playtest-helpers.js`, re-armed after a reload with one
  `await import('/.playtest-helpers.js?' + Date.now())`.
- The Chrome tool's JavaScript call times out after 45 s, so long runs go in the background inside the page and
  report through `fetch('/api/autopilot-…')`, which shows up in the server log.

## Findings and fixes

### Round 1 (Stage 1), fixed in d29ba6c
| # | Finding | Kind | Fix |
|---|---|---|---|
| 1 | The AI debrief of a finished lesson appeared as the coach line under the next lesson's first take ("first lesson done… all 32 snare hits" on "Your first jam"). The screen took any reply newer than the take's start as the answer to that take. | Bug | The coach state remembers which take a reply is about (`replyFor`, `thinkingAbout` in `src/coach/session.ts`), on lessons and Practice. |
| 2 | Starting a take from the kit right after a page load did nothing: no count-in, no message. The audio clock was waiting for a user gesture that a pad hit can't give. | Bug | A header chip, "Click or press any key to turn on the sound (a pad hit can't)", shown until the first gesture. |
| 3 | Trade bars passed a take where nothing was played in the answer bars ("Clean take", lesson done). | Teaching | Free/trade bars still count any rhythm, but empty bars hold the step: "Once more, and fill your bars this time." |
| 4 | A player landing 100% still needed 2 clean takes at every +5 BPM step (10 takes for one counting lesson). | Teaching | A ★★★-quality take counts as both clean takes. |
| 5 | "Eight in a row" asked for a second clean take after 16 in a row. | Teaching | A streak challenge is done on its first pass. |
| 6 | After "Lesson complete" the panel still said "0 of 2 clean takes". | UX | The counter hides once the step or lesson is done. |
| 7 | The header said "Midi Through Port-0 connected" with no kit plugged in. | UX | Linux's Midi Through loopback port is never listed; the chip says "No MIDI device — plug in the kit". |
| – | "Nice! Up to 60 BPM!" when the lesson was already at 60. | Not a bug | An earlier rough take had dropped it to 50; one clean take climbs +10. |

### Round 2 (Stage 1 → 2), fixed in 801ca07: the coach didn't adapt to the student
Evidence: every take 100% and tight, every lesson ★★★, yet after "Counting 8th notes" the coach wrote "Counting the &
in 8th notes" (the same lesson again), lessons restarted at 60 BPM, and a coach "Rests are notes too" stood in for the
checkpoint with snare on 1 and 3 only, an easier rhythm than the checkpoint's "rest on 2 and 4, play the &s".

Causes: both prompts hard-coded "an adult beginner who misses a lot of notes and learns slowly"; the input was 15 raw
takes with no summary (Haiku on low effort didn't infer the level); a coach lesson was requested after every finished
lesson; stand-ins were checked only for their tool, not their tempo or rhythm.

| Part | Change |
|---|---|
| Student read | `studentRead` in `src/engine/planner.ts`: pace `new` / `struggling` / `steady` / `flying` from the last 4+ finished lessons' stars and the last 12 takes, plus `comfortableBpm`. Lessons finished on the same day all count (progress only stores the day). |
| Prompts | `server/prompts/lesson.md` and `session.md` teach the student the read shows; "beginner" is only the assumption while there's no data. The lesson input and every live "open"/"take" event carry the read. |
| Planner | A flying student's candidates put the stage's checkpoints first; no filler coach lesson is requested after a lesson or on Journey. |
| Stand-ins | `standsInFor` in `server/ai/lessons.ts`: the last step must reach the checkpoint's target tempo with at least its notes per bar on each of its drums; otherwise the lesson is kept as practice. |

Checked live: with the read `flying` (100%, spread 6 ms, comfortable 70 BPM), the coach wrote "Hi-hat eighths with the
pedal down", aimed at the `hh-8ths` checkpoint, starting at 70 instead of 60.

### Round 3 (Stage 3): built-in lessons didn't adapt their start tempo
Evidence: "Single strokes" took 14 takes and "Hi-hat 8th notes" 16 for a student landing 100%: every step climbed from
its written start (60) one +5 at a time.

| Change | Detail |
|---|---|
| `autoProbe` (`src/engine/lesson.ts`) | For a flying student, every untouched drill step with a ladder opens with "🔍 Find my tempo": 1-bar takes from the start, +5 per clean bar; practice starts 10 below where it broke, or at the target if nothing broke. Copy, trade, jam, layers and challenge steps keep their own flow; new / steady / struggling students climb as before. The step still ends with the 8-bar proving take. |
| Lesson screen | Probing is remembered per step (it was once per lesson), so every step of a lesson can probe. |

Checked live: "The money beat" (checkpoint) probed 60 → 90 and 80 → 100 cleanly and finished in 6 actions, ★★★.

### Round 4 (Stages 4–5)
| # | Finding | Kind | Fix |
|---|---|---|---|
| 8 | The coach-line fix from round 1 was incomplete: when the coach started thinking about a new take it moved the "which take" marker but kept the previous reply, so for a few seconds the last lesson's debrief showed as the answer to the new take (seen on "Kick on the & of 3" and "Your first fill"; the coach log proved the replies themselves were right). | Bug | The reply and the thinking each remember their own take (`take`, `thinking` in `src/coach/session.ts`), with tests in `src/coach/session.test.ts`. (047583a) |
| 10 | Ghost notes (full groove) failed for a ±8 ms player: 129/136, hits "wandering" ±47 ms. A ghost snare fires the MPS-150 hi-hat ~10 ms later (measured on the owner's kit); that echo claimed the next hi-hat note as a miss and the real stroke became an extra. Known as open item F10, never filtered. On the real kit every ghost-note and funk groove would punish the student for the hardware. | Bug | A hi-hat hit within 15 ms after a snare ≤ 44 velocity and no louder than it is dropped as crosstalk (`src/input/hits.ts`); real hi-hat strokes and backbeats are kept. After: 68/68. (a420eac) |
| 9 | The emulated kit could never pass an accent check: accents 115, every other stroke 92 (ratio 0.8 > 0.7). The app was right; the test player accented weakly. | Test tool | In an accented pattern its other strokes are taps (70). (d1f8873) |

### Open observations (not fixed yet)
- Even when flying, the coach (Haiku, low effort) still opens with an echo warm-up step the prompt tells it to skip.
- When today's set is done, Journey's big button is "Jam ▶". A student who wants more has to use "Something else" or
  the path to get to the next checkpoint.
- While the coach is thinking after a step, the coach line shows "…" in place of the verdict ("Step done! Next: …") for
  several seconds.
- The live coach misreads a new step's start tempo as being slowed down ("The app slowed you to 60").


## Stage log
| Stage | Rank | Lessons played | Notes |
|---|---|---|---|
| 4 · Variations and first fills | Fill Maker ✓ | Kick on the & of 3 ✓cp (4 takes), Your first fill ✓cp, Song: Garage Eight ✓cp (2: probe + one 24-bar take, 310/310) | With the probe, each checkpoint is a probe plus a proving take. |
| 3 · The money beat | Groove Keeper ✓ | The money beat ✓cp (6), Song: Steady Eight ✓cp (2: probe + one 16-bar take, 192/192) | The probe on a song only plays bar 1, but the full song still has to pass. |
| 2 · Every limb on its own | Limb Wrangler ✓ | Single strokes ✓cp (14 takes), Hi-hat 8th notes ✓cp (16), Hand and foot together ✓cp (7) | Flying: checkpoints only, all ★★★. The practice lessons (hi-hat quarters, kick, accents, the coach's singles lesson) were skipped by the new planner and are left for the end-of-run sweep. Most takes went to climbing from 60 BPM. |
| 1 · Ready to play | Stick Rookie ✓ | Sit hold strike, Your first jam, Echo game, Trade bars (1★, silent answer before fix 3), Counting quarter notes, Eight in a row, Even quarters then counting 8ths (coach), Counting 8th notes ✓cp, Counting the & in 8th notes (coach), Rests are notes too (coach stand-in ✓cp) | All takes 100%. The built-in "rests" checkpoint was passed by an easier coach stand-in (fixed for later stages). |
