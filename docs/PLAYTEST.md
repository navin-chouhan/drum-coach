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
- The browser keeps settings in localStorage per origin. A new data copy on the same test port (5180) is merged with
  the last test's browser copy: keys the server copy lacks (e.g. `badges`) survive. Run
  `localStorage.removeItem('drumcoach.settings')` before loading a new data copy. (Round 6's trophy shelf showed the
  old run's badges this way; the owner's real app on 5173 isn't affected.)
- The Chrome tool's JavaScript call times out after 45 s, so long runs go in the background inside the page and
  report through `fetch('/api/autopilot-…')`, which shows up in the server log.
- Editing `.playtest-helpers.js` reloads the app page: Vite treats it as an imported module. Edit it between runs, then
  press a key (sound) and import it again.
- In the server log the request URL comes before `"msg":"incoming request"` on the same line; a log filter that
  expects the opposite order sees nothing.
- `ping()` must cut its message by characters, not UTF-16 units: half an emoji makes `encodeURIComponent` throw and
  kills the background run.
- The Chrome tool sometimes blocks a result as "cookie/query string data" (long page text with `?`, `=`, `&`, `%`).
  Strip those characters before returning text.
- The Beginner preset is a fixed weak hand (60%) and a fixed 45 ms lag. It doesn't improve, so a step whose only
  check is evenness or timing can loop forever; cap takes per lesson (30) and log the give-ups.
- A Solid run needs its own empty data folder: one 2★ lesson in the history keeps the read off *flying*, which turns
  off checkpoints-first and the probe.
- Two app tabs on one origin share localStorage and each pushes its copy to the server, so the newer write wins. After
  Chrome restarts it can restore an old test tab you can't see from the tool's tab group; a fresh profile on that
  origin then gets the old tab's lessons. Start each fresh profile on a new port pair (5183/8793 …), and wipe the
  data folder only while its API is stopped.
- When the implementer's session is still around, ports 5180/8790 may be taken by it. Use the next pair (5181/8791)
  rather than sharing one API and data folder.

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

### Round 5 (sweep, trophies, extras)
| # | Finding | Kind | Fix |
|---|---|---|---|
| 11 | Finishing a leftover Stage 2 coach lesson at Swing Cat showed "RANK UP! You're now a Limb Wrangler" again: the check asked whether the stage's checkpoints are all passed now, not whether this lesson completed the stage. | Bug | Rank up only when the checkpoint this lesson proves wasn't passed before (`LessonPlayer.tsx`). Not re-checked live: it needs a fresh coach lesson for a passed checkpoint. (7155595) |
| 12 | Practice → For you after the whole path: "at your level" was "Basic rock beat, 80 BPM" for a Swing Cat. With no current milestone the level fell back to 1. | Bug | Falls back to the last stage's level; now "Funk groove with ghost notes". (c5c28d9) |
| – | Checked live: a silent take of "Your own fill" now gets "Once more, and fill your bars this time" and doesn't count (fix 3). | Verified | |

### Round 6 (M1: the struggle path, Beginner preset), 2026-10-26 overnight
Played on a copy of the owner's real data (a true beginner: 2 lessons done, 38 takes) with the emulated kit set to
Late 45 ms, Jitter ±40 ms, Weak hand 60%, retriggers and crosstalk on. Branch `claude/plan-phase1-2026-10-25`.

| # | Finding | Kind | Fix |
|---|---|---|---|
| 13 | At the 40 BPM floor a take with 16/16 notes landed, failed only for dragging (41 ms), got "Try Learn it slowly: the music waits for each note". Wait mode helps you find notes; it can't fix timing. | Teaching | At the floor, when the notes landed, the line names the fix instead: "All the notes are there. Dragging by 41 ms. Lock onto the click." (`floorLine`) |
| 14 | At the 40 BPM floor, "🐢 Learn it slowly" (and floor × 2) didn't start wait mode: it ran "slower", a scored take at 35 BPM (below the floor), which passed and climbed: "Nice! Up to 45 BPM!", best 35. The label promised wait mode; the take counted. | Bug | At the floor the move is wait mode, as labelled. Checked live: the music waits, the verdict is "Nice and slow…", nothing is saved and the tempo stays. |
| 15 | After a floor fail with missed notes the line said "Try Learn it slowly" but the big move (hi-hat pedal × 3 / "yes") was "▶ Again". | UX | The main move becomes "🐢 Learn it slowly" in that case. |
| 16 | "🔍 Fix bar 2" worked (bar 2 looped 4× at 50 instead of 60, the ladder didn't move), but its verdict always said "Bar 2 sounds better", even when the loop went badly. | Honesty | "sounds better" only when the loop passed, else "is getting there". |
| 17 | After ~15 rough takes (avg 75% landed, hits wandering ±75 ms, no lesson finished, comfortable at 40 BPM) the student read was *steady*, not *struggling*: the cut-off was accuracy < 75 and spread was ignored. The coach would write for a steady student. | Teaching | A spread wider than 40 ms (looser than any checkpoint allows) also reads as struggling (`studentRead`). On the test data the read is now *struggling*. |
| 18 | After "Lesson complete" (M4 kept the verdict, with the coach's short line under it: verified) the big move and the kit's "yes" became the coach's "Try a slower tempo", replaying a finished lesson instead of moving on. | UX | A record, rank up or finished lesson keeps the app's own next move; the coach's button is dropped (`dropCoachAction(true)`), its words stay. |

Routes walked (Beginner preset unless noted), against `docs/LEARNING.md`:
| Route | Result |
|---|---|
| Two close misses → −5 BPM | ✓ 60 → 55 ("Let's take it to 55 BPM. Slower is how it sticks.") |
| Rough take (< 60%) → −10 BPM | ✓ 55 → 45 (13/32 landed); next rough → 40 |
| Floor 40 → "Learn it slowly" (wait mode), never a pass | ✓ after fixes 13–15: the music waits, verdict "Nice and slow…", no run saved, progress unchanged |
| After easing off, one clean take climbs +10 | ✓ 40 → 50 |
| "🔍 Fix bar N" and back to the full take | ✓ bar 2 ×4 at 50 instead of 60, ladder unchanged, then "Now the whole thing again at 60 BPM" (fix 16). Not offered on 1-bar charts (by design: `worstBars` needs 2+ bars). |
| "Ask the coach for something different" | ✓ ~21 s; "Feel the & with a click on every 8th": jam → copy-me → 8-in-a-row streak, 40–50 BPM (smaller, different tools). Its "focus" said "you played 8ths perfectly at a slow tempo", which flatters a 78% take. |
| Live tips during a take | ✓ "dragging" and "reacting" on screen (`liveTips: screen`); spoken tips not checked (sound can't be heard by the test). |
| Coach tool switch, one take | ✓ trade via `runAction({kind:'trade'})`: one-off, free bars, ladder untouched. count / layers / listen share that path; not run separately. |
| Student read new → struggling | ✓ after fix 17 (server read: struggling, 75%, spread 75 ms, comfortable 40 BPM) |
| autoProbe stays off for a non-flying student | ✓ no "Find my tempo" on any untouched step |
| M3 / M4 / M6 live | ✓ the verdict stayed with "Your coach is listening back…" under it; after "Lesson complete" the coach's line ("Lift each stick sooner, right as the click arrives") sat under the verdict |
| Practice (Solid preset) | ✓ short coach line "Clean groove, every hit landed. Keep this steady feel.", button "Try a bit faster" |

Open observations from this round (not fixed):
- **Mixed message on a late take at level 0–1.** 32/32 landed but ~93 ms late: the live tip said "Hitting 135 ms after each
  click. Play with the click, not after it", the verdict said "Nice! Up to 50 BPM!" (the 150 ms Good window lets it
  pass; `checkPass`'s reaction check didn't fire). A question for the owner (docs/OVERNIGHT.md).
- **A timing-only fail slows the tempo like missed notes.** All notes landed but dragging → −5 BPM, down to 40, where
  keeping with the click is harder, not easier. Question for the owner.
- **The owner's own data says "latency".** Their week: 34% landed, "landing behind the click", and the app's latency
  hint fires. The latency test is the first thing in the M2 kit checklist.
- The emulated kit doesn't play in wait mode (the test used keyboard strokes) or in free bars (G8).
- After a code change the open page keeps stale modules (HMR): one "missing verdict" was that, not a bug.

### Round 7 (test of the plan branch), 2026-10-26
Branch `claude/plan-phase1-2026-10-25` at d445bda, tested on `claude/test-2026-10-26`; ports 5181/8791 (5182/8792 for
the real-data copy). Full report: `docs/TEST-REPORT-2026-10-26.md`. Beginner run on an empty profile, Solid run on a
second empty profile, then a copy of the owner's data.

| # | Finding | Kind | Fix |
|---|---|---|---|
| 19 (F3) | After "Step done" the coach's `next` became the big move and left the lesson (to Journey or the set's next lesson) with steps unplayed; the kit's "yes" too. | Bug | After `stepDone` a coach `next` is dropped like on big moments; ▶ starts the next step (dbdc523). |
| 20 (F7) | At 40 BPM the verdict said "Try Learn it slowly" but on 2+ bar charts the big move was "Fix bar N" (looping at 40, no slower). | Bug | `slowly` before `fixBar` (abb2ed7). Round 6 fix 15 now holds on any chart. |
| 21 (F9) | The owner's Journey trail showed "✓ 5 done" for five lessons never played (every lesson before a coach-lesson hero was folded). | Bug | Fold only finished lessons (9f4d62f). |
| 22 (F10) | Practice → For you was a lone warm-up for a Swing Cat: M19 left no level-6 chart (fix 12 regressed). | Bug | "At your level" falls back to the highest library level below (2b4652e, with a test). |
| 23 (F11) | After "Find my tempo" on an untouched step the intro slides came right after the probe (M9 only skipped slides already seen, and probes run only on untouched steps). | Bug | Unseen slides now come before the probe (b1d1c40). |
| – (F1, F5) | A beginner whose only fault is volume (weak hand) or a steady ~45 ms lag is slowed to 40 BPM and loops: "Single strokes" ★cp and two coach timing lessons never passed in 30 takes. | Teaching | Owner decision: hold the tempo for timing/volume-only fails, switch tool after ~5 fails. |
| – (F6) | The student read stayed *steady* for ~19 takes per lesson (notes land in the 150 ms window, spread 23 ms). | Teaching | Owner decision: count takes per lesson. |

Stage log (Beginner, profile A):
| Stage | Result | Lessons (takes) |
|---|---|---|
| 1 · Ready to play | Stick Rookie ✓ | Sit hold strike (21), Your first jam, coach "Say it and play it" (~10), coach "Silent beat 3" (9), Echo game (6), Trade bars (2), Counting quarters (10), Eight in a row (2), Counting 8ths ✓cp (10), Rests ✓cp (20). Coach "Land on the click" given up after 30. |
| 2 · Every limb | 1 of 3 checkpoints | Hi-hat pedal down (18), Kick drum (18), Accents (24, 1★), Hi-hat 8ths ✓cp (~32). Given up after 30: **Single strokes ★cp** (volume, at 40 BPM), **Hand and foot together ★cp** (55–75 ping-pong), coach "Hit with the click" ×2 (same title, F8). |

Solid (profile A2): all 7 ranks, every lesson ★★★, ~70 takes, Stage 1 in 3 lessons (checkpoints first, one coach
stand-in), most checkpoints 2–4 takes with the probe; Roadhouse Shuffle in 2 (round 5: 3). Weekly theme from 3 late
takes disappeared after the path (M12). After the path: a review, the 2-minute challenge and Beat your best ("🏆 NEW
RECORD: 85 BPM!" kept, coach line under it).

### Open observations (not fixed yet)
- **Weekly theme never forgets.** "This week: landing behind the click" came from 3 deliberately sloppy takes at the very
  start; ~180 on-time takes later it's still the habit to work on. It should need the issue to still be present lately.
- **Trophies can be stale right after a take.** The 10,000-notes badge only lit after leaving and reopening Trophies.
- **Flow after the path opens Stage 1's jam** ("Your first jam") for a Swing Cat; it should use the latest stage.
- **The coach invents next steps.** After "Beat your best" its button said "Next posture step", which doesn't exist.
- **Coach text replaces the big moment.** "🏆 NEW RECORD" was replaced by the coach's paragraph.
- **The coach's groove for a real song can be wrong.** Billie Jean: it suggested a kick on the & of 2 and ghost
  snares; the real part is 8th hi-hat, kick 1 and 3, snare 2 and 4. It says "verify by ear", but a beginner can't.
- **A show-off song can be very short.** The set counts any saved bars of a song at 85%+, even 2 bars, with a grid the
  student tapped; the app can't tell whether the part matches the record.
- **The Practice library is thin at the top.** 12 charts, one at level 6, none for swing or shuffle.
- **Song audio (tab capture) wasn't tested:** it needs Chrome's share-a-tab prompt, which the test can't click.
- The tempo probe never tries the target itself when +5 overshoots it (90 → 95 > 92 stops at 90).
- After a probe's tempo jump (> 10 BPM) the intro slides show again for the exercise just played.
- Even when flying, the coach (Haiku, low effort) still opens with an echo warm-up step the prompt tells it to skip.
- When today's set is done, Journey's big button is "Jam ▶". A student who wants more has to use "Something else" or
  the path to get to the next checkpoint.
- While the coach is thinking after a step, the coach line shows "…" in place of the verdict ("Step done! Next: …") for
  several seconds.
- The live coach misreads a new step's start tempo as being slowed down ("The app slowed you to 60").


## Instructor's review: the whole app, as a critical drum teacher sees it

Written after playing the full path (Stick Rookie → Swing Cat) as a strong student. What I could not see: Chrome
screenshots failed all session, so UI remarks come from the page text, structure and code, not from looking at the
screen. Mistake paths (rough takes, slowing down, "Fix bar N", "something different") were not exercised, because
the player never failed for musical reasons.

### Verdict in one paragraph
As a **time-keeping and coordination trainer for an adult beginner** the app is genuinely good: scoring is honest
(it caught weak accents and kit crosstalk that a human teacher would hear too), the tempo ladder, layers, intro slides
and kit gestures are thoughtful, and the coach's words after a take are warm and specific. It is **not yet a
holistic drum teacher**. Technique beyond timing and volume is not taught or checked, the curriculum ends at early
intermediate, music is mostly a click, and the two halves of the app (the Journey and Songs/YouTube) don't meet in
the middle. A strong student can finish all seven ranks in about **50 minutes of playing**, which says more about
the depth of the path than about the student.

### What works (keep it)
- **Honest, measurable feedback.** Accuracy, spread, flams, accent ratio and velocity evenness are the right things
  to measure, and the pass bars rise with the level. Every checkpoint ends with an 8-bar proving take with a spread
  limit: averaging on time isn't enough. That's exactly what a teacher listens for.
- **Pedagogy built in.** One limb at a time (layers), call and response, trade bars, gap click, fading click, the
  2-and-4 click, spaced review. These are real teaching methods, used in the right places.
- **Built for the throne.** Kit gestures (hi-hat pedal ×3 = go), one big coach line, and the keyboard fallback
  everywhere. Starting a lesson never needs the mouse.
- **The live coach's voice.** After a step it says what landed, what drifted, and one physical thing to try ("your
  foot is trailing your hand a touch, lift your foot a little sooner"). That is good teaching.
- **Rewards.** Stars, a celebration after each lesson, rank-ups with "You can: …" lists, badges. The "You can" list
  after a rank-up is the best moment in the app: it names the skill, not the score.

### What's missing (biggest gaps first)
1. **Technique is not taught, only implied.** Grip, fulcrum, rebound, heel-up vs heel-down, Moeller and
   hi-hat foot control appear as text. There are no demonstration videos or animations, and nothing on screen
   shows *how* the body moves. "Sit, hold, strike" is a snare drill with a velocity check; it can't see posture. A
   teacher spends the first month here. At minimum: a short looping demo clip or animation per technique, and a
   self-check ("film yourself and compare").
2. **The rudiment set stops at four.** Singles, doubles, paradiddle, accents (plus triplets). LEARNING.md promises
   flams, drags and the buzz roll ("about eight cover a beginner"); none exist as lessons. Flams and drags are core
   for fills and for left-hand control.
3. **The path ends at early intermediate, then stops.** After Swing Cat the coach says "You have finished every
   milestone… ask the coach for new challenges". There is no level 7+: no linear fills across the bar line, 16th-note
   kick independence, odd time beyond 6/8, ghost-note funk at real tempos, double-kick, brush/jazz comping depth, or
   soloing. "Expert" is not reachable inside the app's structure.
4. **Almost no music in lessons.** Lessons are drums plus a click (the app plays the other drum lanes in a synth).
   No bass line, no chords, no loop under a groove. Grooves feel like exercises, not songs. A simple backing loop per
   style (rock, funk, shuffle, swing) would change the excitement level more than any badge.
5. **The Journey and real songs live apart.** The show-off song needs YouTube search, notes made by ear or by tab
   capture, then scored play on the Songs tab. For a beginner that is a big jump from "Next ▶". The built-in "in the
   style of" songs (Steady Eight, Garage Eight, Roadhouse Shuffle, Medium Swing) are the right idea but sound like a
   drum machine with no band.
6. **Feel and musicality aren't judged.** Shuffle and swing are scored on a triplet grid; nobody checks the swing
   ratio, the push or lay-back of a groove, dynamics over a phrase (verse soft, chorus loud), or fills that build.
   Mean offset is shown, but "behind the beat on purpose" isn't a skill the app knows.
7. **Reading is a side effect.** The sheet music is good, but there are no reading lessons: no counting from the
   page, no rhythm cards, no sight-reading take (`variants` exist but few steps use them).
8. **Listening and ear training are thin.** Echo game and trade bars only. Missing: "what did you hear?" quizzes,
   naming a groove from a song, hearing rushing vs dragging in someone else's take.
9. **Stamina and consistency over days.** A checkpoint passes on one good take. Spaced review helps, but there's no
   "play it clean on 3 different days" for ranks, and no long-form stamina (5-minute groove).

### UI and UX
- **Repetitive lines for a strong student.** With the tempo probe, every lesson opens with "Let's find your
  tempo…" then "Your tempo today: N BPM. That's where we practise." Fine once, flat by the tenth lesson. Vary it, or
  skip the sentence and just show the number.
- **Intro slides come back after every big tempo jump.** After a probe jumps 60 → 100, the same three slides
  (what, who plays what, count it) show again for an exercise just played. For the probe's jump they should be
  skipped.
- **"…" hides the verdict.** While the coach thinks (about 5 s), the coach line shows "…" instead of "Step done!
  Next: …". Show the verdict and put the thinking state elsewhere.
- **The clean-takes counter misleads with the fast track.** "0 of 2 clean takes at 80 BPM" when one ★★★ take is
  enough. Say "1 great take or 2 clean ones".
- **When today's set is done, the big button is "Jam ▶".** A motivated student has to find "Something else" or the
  path to keep going. For a student on a roll, offer the next lesson.
- **Long coach paragraphs at the kit.** Debriefs are 3–4 sentences with milliseconds ("about 7 milliseconds
  late"). From 1–2 m away that's too much text and the wrong unit for a beginner. One sentence on screen ("A hair
  late on the kick: lift the foot sooner"), the rest spoken.
- **Setup is easy to skip and silent about it.** Onboarding says to check pads and latency under Setup, then
  "Let's start" goes straight to a lesson. A first-run check ("hit each pad once", "tap 8 times for latency") as
  step 2 of onboarding would prevent wrong-note frustration.
- Fixed during the run: the sound-locked chip, "Midi Through" shown as the kit, the stale coach line.

### AI coach and personalisation
- **Before the fixes:** the coach treated everyone as a struggling beginner. It wrote review lessons after ★★★,
  restarted at 60 BPM, and let an easier lesson pass a checkpoint. **After:** it reads the evidence, aims at the next
  checkpoint and starts at the student's tempo (round 2).
- **Still weak:** Haiku on low effort follows the prompt only partly (it still adds warm-up echo steps for a
  flying student). For lesson writing, a stronger model or effort is worth the wait, since lessons are written in
  the background anyway.
- **Personalisation is about pace, not the person.** Goals (rock/funk/jazz) only filter tagged lessons. The coach
  doesn't know favourite songs, which hand or foot is weaker over time, or what the student enjoys (jam vs drill).
  The live tips' "This week's thing" ("landing behind the click") is a good start: build on it with a running
  "student profile" the coach updates.
- **The coach doesn't plan the week.** It reacts to the last lesson. A teacher plans "this week: hi-hat foot and
  ghost notes", then checks in. The `/api/coach/plan` endpoint exists; the Journey doesn't lead with it.

### Lessons and curation
- Individual lessons are well made: clear what/why/how, sensible tempos, the right tools.
- Curation now adapts by pace (round 2–3). Non-checkpoint lessons are skipped for a flying student; a teacher would
  still assign one "fun" lesson per stage (a jam or a song bite) so the journey isn't only tests.
- Coach lessons duplicate built-ins (a coach "Rests are notes too" beside the built-in one, same title). The coach
  should never reuse a built-in title.

### Journey, learning, excitement, ease
- **Journey:** clear stages, ranks, and "You can" lists. But the student sees a list of lesson tiles, not a map with
  a destination song. Show the stage's song at the end of the trail from day one (the code has it as "Unlock a real
  song").
- **Learning:** strong for time and coordination, weak for technique, reading, musicality and vocabulary (fills,
  styles).
- **Excitement:** high in the first stage (celebrations, badges). It fades for a fast student because every lesson
  feels the same (probe, take, stars) and there's no band. Backing loops, a real song per stage and a weekly
  challenge would keep it.
- **Ease:** excellent at the kit, with one-tap next steps, gestures and the keyboard fallback. Weak points were the
  silent sound lock (fixed) and setup checks that are easy to skip.

### Recommendations, in order of impact
1. Backing loops (bass + chords) under lesson grooves and the built-in songs.
2. Technique demos (short looping videos or animations) for grip, rebound, kick and hi-hat foot, plus flams, drags
   and buzz rolls as rudiment lessons.
3. Levels 7–9: linear fills, 16th-kick independence, odd time, funk at tempo, a solo/fill-vocabulary stage.
4. Put the stage's real song at the centre of each stage (one tap from Journey), with bites in the lessons.
5. Judge feel: swing ratio, phrase dynamics, behind/ahead on purpose.
6. A weekly plan from the coach and a running student profile beyond pace.
7. The UX items above: vary the probe line, skip slides after a probe, keep the verdict visible, shorter on-screen
   coach text.

## Trophies at the end of the run
| Trophy | Status |
|---|---|
| All 7 ranks (Stick Rookie → Swing Cat) | ✓ |
| Stars | 88 from the path, every lesson ★★★ (Trade bars 1★ from the silent take before fix 3) |
| First ★★★, Clean at 100, 1,000 notes, 10,000 notes, Perfect stage | ✓ |
| Show-off song + Show-off set | ✓ Billie Jean, bars 1–8, 104/104 along the YouTube video; Stage mode played it with "ENCORE! 100% on time" |
| Your fills | ✓ one fill kept from "Your own fill" |
| 2-minute challenge | ✓ 50 clean bars on the money beat at 100 BPM (600/600) |
| Beat your best | ✓ new record on "Sit, hold, strike" |
| **7-day and 30-day streak** | ✗ **Blocked:** they need 7 and 30 real days of play. Not faked (no clock or data changes). |

Every lesson on the path is finished: 30 on the first pass, the 19 skipped practice lessons in the sweep (49 visible
lessons, all ★★★). About 69 minutes of playing, 188 takes saved.

Not tested: real-kit calibration and the latency test (keyboard/emulated kit only), voice talk-back (microphone),
song audio capture (tab share prompt), drumless/cover search, the mistake paths (rough take, Fix bar, slower).

## Stage log
| Stage | Rank | Lessons played | Notes |
|---|---|---|---|
| 7 · Swing | Swing Cat ✓ | Jazz ride pattern ✓cp (4), Snare comping ✓cp (2), Song: Medium Swing ✓cp (2, 168/168 at 130) | The whole path took about 50 minutes of playing. |
| 6 · Triplet feels | Triplet Traveller ✓ | Triplets ✓cp (4), The shuffle ✓cp (4), Half-time feel ✓cp (2), Song: Roadhouse Shuffle ✓cp (3, 288/288) | The song's probe stopped at 90 because 95 > 92 and never tried the target itself: one extra 24-bar take. |
| 5 · 16ths and dynamics | Dynamics Boss ✓ | The paradiddle ✓cp (4), 16th-note hi-hat ✓cp (4), Ghost notes ✓cp (3, after the crosstalk fix), Ride groove ✓cp (3) | Found fix 9 (emulated accents) and fix 10 (crosstalk). |
| 4 · Variations and first fills | Fill Maker ✓ | Kick on the & of 3 ✓cp (4 takes), Your first fill ✓cp, Song: Garage Eight ✓cp (2: probe + one 24-bar take, 310/310) | With the probe, each checkpoint is a probe plus a proving take. |
| 3 · The money beat | Groove Keeper ✓ | The money beat ✓cp (6), Song: Steady Eight ✓cp (2: probe + one 16-bar take, 192/192) | The probe on a song only plays bar 1, but the full song still has to pass. |
| 2 · Every limb on its own | Limb Wrangler ✓ | Single strokes ✓cp (14 takes), Hi-hat 8th notes ✓cp (16), Hand and foot together ✓cp (7) | Flying: checkpoints only, all ★★★. The practice lessons (hi-hat quarters, kick, accents, the coach's singles lesson) were skipped by the new planner and are left for the end-of-run sweep. Most takes went to climbing from 60 BPM. |
| 1 · Ready to play | Stick Rookie ✓ | Sit hold strike, Your first jam, Echo game, Trade bars (1★, silent answer before fix 3), Counting quarter notes, Eight in a row, Even quarters then counting 8ths (coach), Counting 8th notes ✓cp, Counting the & in 8th notes (coach), Rests are notes too (coach stand-in ✓cp) | All takes 100%. The built-in "rests" checkpoint was passed by an easier coach stand-in (fixed for later stages). |

## M2: real-kit checklist (for the owner at the MPS-150)
Run on the branch, your own data is fine (`npm run dev`, Chrome, kit on USB, module volume down if the app plays
sounds). Takes ~20 minutes. Write the numbers into the table at the end; the implementer tunes from them.

**Before you start**
1. `amidi -l` shows `e-Drum MIDI 1`. The app header says the kit is connected (not "No MIDI device").
2. ⚙ Setup → Pads → Emulated kit: **off** (it would play your takes for you).
3. Setup → Coach → "Show live tips": on, so you can see what the app hears.

**A. Latency first** (your week says "landing behind the click", and the app's latency hint keeps firing)
1. ⚙ Setup → Pads → latency test: tap 8+ times with the click on the **snare**. Note the number and the spread.
2. Do it again with headphones on the module vs. on the laptop. Note both.
3. Play one take of "Counting 8th notes" at 60 BPM. Does the results page still say "Almost every stroke landed about
   N ms late"? Write N down.

**B. Calibration wizard** ("hit each pad")
1. Setup → Pads → the calibration screen: hit each pad once when asked, in order.
2. Check that every pad lands on the right name, and the hi-hat with the pedal **down** shows *closed*, pedal up *open*.
3. Press the hi-hat pedal alone: it should show *pedal*, and pressing it after an open hit must not count as a hit
   (the choke).
4. Anything wrong → note which pad and what it showed.

**C. Crosstalk and retriggers** (`src/input/hits.ts`: `CROSSTALK_MS = 15`, `CROSSTALK_SNARE_MAX = 44`, `BOUNCE_MS = 60`)
1. Journey → path → Stage 5 "Ghost notes" (or Practice → "Funk groove with ghost notes"), full groove, 3 takes at a
   tempo you can play.
2. After each take open "Details and history". Note: hi-hat accuracy, extra hits, and any hi-hat **miss** right after a
   ghost snare.
3. Then play 2 bars of just loud hi-hat 8ths with ghost snares between: does any *real* hi-hat stroke go missing? (If
   yes, the crosstalk filter is too eager: say so.)
4. Play 16 hard single strokes on the snare, then on each tom. Extra hits on the results page = retriggers getting
   through.

**D. Accents and ghosts with real sticks** (velocity ~15–127)
1. Stage 2 "Accents": one take. Does "accent ratio" pass when you play accents clearly louder?
2. "Ghost notes": one take. Do soft ghosts register at all (not as misses)? What's the softest stroke you can play that
   still counts?

**E. Gestures at the kit**
1. Hi-hat pedal × 3 starts the main move, crash × 2 = yes, tom 2 × 2 = listen, floor × 2 = slower, ride × 2 = next.
2. In the intro slides: hi-hat × 1 = forward, snare × 1 = back.
3. At 40 BPM after a rough take: floor × 2 should now start **wait mode** ("Learn it slowly"), not a scored take.

**Write down**
| Check | Your number / note |
|---|---|
| Latency (snare, laptop audio) | ms, spread |
| Latency (module headphones) | ms, spread |
| Results "N ms late" after the test | |
| Calibration: wrong pads | |
| Ghost-note groove: hi-hat misses after a ghost / extras | |
| A real hi-hat stroke dropped? | |
| Retrigger extras (snare / toms) | |
| Softest ghost that counts | |
| Gestures that didn't work | |
