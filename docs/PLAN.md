# Plan: every change from the play test (must go, revamps, good to have)

## Context
On 2026-10-25 the whole app was play-tested end to end as a strong student: all 49 lessons (Stick Rookie → Swing
Cat), every trophy except the 7/30-day streaks, Songs + Stage mode, Practice, Flow, 2-minute challenge. The log is
`docs/PLAYTEST.md`; twelve fixes are already on main (merge 598e645). This plan is everything that is still open,
written honestly: small bugs, UX debt, and the revamps an instructor says are needed before someone can genuinely
learn drums from this app. Implementation is done by another agent/session (owner's workflow); every UI item gets an
HTML mockup approved first.

---

## 1. Honest rating

**Overall: 6 / 10 as a drum teacher. 8 / 10 as a timing-and-coordination trainer for a beginner.**

| Area | Score | Why |
|---|---|---|
| Timing scoring and honesty | 8.5 | Measures the right things (accuracy, spread, flams, accent ratio, evenness), pass bars rise by level, every checkpoint needs an 8-bar take with a spread limit. It caught weak accents and real kit crosstalk. |
| Teaching methods | 8 | Layers, call and response, trade bars, gap/fading/2-and-4 click, tempo ladder, spaced review, intro slides. Real methods in the right places. |
| At-the-kit UX | 8 | Pad gestures, one big coach line, keyboard fallback everywhere, no mouse needed to practise. |
| Reliability | 6 | 12 bugs found and fixed in one run (stale coach line ×2, silent sound lock, kit crosstalk, false rank-up…), about 15 more still open (section 3). |
| AI coach: words after a take | 7 | Warm, specific, one physical fix. But too long for the throne, milliseconds for a beginner, invents button labels. |
| AI coach: planning and personalisation | 5 | After the play-test fixes it reads pace; it still doesn't plan a week, doesn't know weak limbs, likes, or songs, and Haiku-on-low half-follows the prompt. |
| Onboarding and setup | 5 | Calibration and latency are a skippable text link that also throws away the onboarding answers. |
| Curriculum breadth and depth | 4 | 49 lessons, 4 rudiments, ends at early intermediate. A strong student finishes in ~50 minutes of playing. |
| Songs and real music | 5 | YouTube flow works (tempo, coach groove, scored play, Stage mode), but it lives apart from the Journey; the coach's groove for Billie Jean was wrong; a 2-bar song counts as a show-off song. Lessons are drums + click, no band. |
| Musicality and feel | 3 | Swing, push/lay-back and phrase dynamics are not judged. |
| Technique instruction | 2 | Grip, rebound, posture, pedals are text only. Nothing shows how the body moves; nothing checks it. |
| Motivation and rewards | 7 | Stars, celebrations, ranks with "You can…" lists, badges, show-off songs. Fades for a fast student (every lesson feels the same; no band). |

### Expected rating after the work (re-rated at review with a fresh play test)
| Area | Now | After must go | After revamps | After good to have |
|---|---|---|---|---|
| Timing scoring | 8.5 | 8.5 | 9 | 9 |
| Teaching methods | 8 | 8 | 9 | 9 |
| At-the-kit UX | 8 | 8.5 | 8.5 | 9 |
| Reliability | 6 | 8 | 8 | 8.5 |
| AI coach: words | 7 | 8 | 8.5 | 8.5 |
| AI coach: planning, personalisation | 5 | 6 | 8 | 8 |
| Onboarding and setup | 5 | 7.5 | 7.5 | 8 |
| Curriculum depth | 4 | 4 | 7.5 | 8 |
| Songs and real music | 5 | 5.5 | 8 | 8.5 |
| Musicality and feel | 3 | 3 | 7 | 7 |
| Technique | 2 | 2 | 5.5 | 6 |
| Motivation | 7 | 7.5 | 8.5 | 9 |
| **Overall, as a drum teacher** | **6** | **6.5** | **8** | **8.5** |

The ceiling is about 8.5–9: an app can show technique and let you check yourself, but can't truly judge it the way a
teacher watching you can.

## 2. Can someone actually learn drums by following the app?

**Partly.** A motivated adult practising daily would come out with genuinely good time, the money beat and its
common variations, simple fills, a shuffle and a basic swing ride, and the ability to play along to simple songs:
a solid *advanced-beginner* foundation, with steadier time than many self-taught drummers.

**They would not become a well-rounded drummer, and some could pick up habits that hurt.** What's missing:
1. **Technique, seen and corrected.** Grip, fulcrum, rebound, relaxed wrists, heel-up/heel-down, hi-hat foot. This is
   where beginners go wrong alone (tension, sore wrists, buried beater) and the app can't see the body. → **R5**
2. **A real rudiment vocabulary.** No flams, drags, rolls, flam taps. These carry fills and left-hand control. → **R2**
3. **Playing with music.** Every lesson is drums and a click. Drumming is ensemble time; without a band the student
   never learns to lock with a bass line or hear form. → **R1, R8**
4. **Feel and dynamics.** Swing ratio, playing behind or on top of the beat, verse-soft/chorus-loud. → **R4**
5. **Depth beyond early intermediate.** No linear fills, 16th-kick independence, odd time, funk at tempo, soloing.
   → **R3**
6. **Proof over days, not one take.** A rank comes from one good take on one day. → **R7**
7. **The struggling student's path is unproven.** The owner is a beginner who will miss a lot, yet the play test never
   failed a take for musical reasons, so the slow-down ladder, "Fix bar N", "Learn it slowly" and "something
   different" are untested. → **M1** (must go first)
8. **Real-kit validation.** The crosstalk filter, latency and calibration were tested with the emulated kit and
   keyboard only. → **M2**
9. **Reading and ear training** are side effects, not taught. → **G1, G2**

With section 3 done and R1, R2, R5, R7 and R8 in place, the honest answer becomes "yes, to a confident
intermediate level, as long as the student also films themselves now and then or has an occasional check-in with a
human teacher". No app replaces that check for technique.

---

## Owner decisions (2026-10-25)
- **Show-off song:** at least 16 bars, every bar ≥ 85% (M18, R8).
- **Ranks:** earned now as today; a ✓ "proven" mark comes when the checkpoints pass again on another day. Never blocks
  the next stage (R7).
- **Technique:** animated stick/foot diagrams plus a local camera self-check; no video files (R5; own videos → G11).
- **Lesson writing:** Sonnet, medium effort, for lessons, plans, show-off picks and song grooves. The live chat stays
  on the fast model (M16).

## Working rules for the implementer
- Owner's workflow: this plan is executed by another agent/session. Keep each item a separate commit with a clear
  message; do the "Must go" items before any revamp.
- **UI items need an HTML mockup** shown in Chrome and an explicit "build it" before building (marked 🖼).
- Engine logic as pure functions in `src/engine/` with Vitest tests; timing math with synthetic hit streams.
- Every change keeps the keyboard fallback and pad gestures; the at-kit screens stay readable from 1–2 m.
- Verify in Chrome with the emulated kit on a **copy** of `data/` on its own ports (as in `docs/PLAYTEST.md` "How the
  test is run": Vite `--port 5180`, API `PORT=8790`, `DATA_DIR` in a scratch folder). Reload after code changes (HMR
  leaves duplicate modules).
- Update `docs/LEARNING.md` when teaching behaviour changes and add a line to `docs/PLAYTEST.md` per fixed finding.

---

## 3. Must go (bugs, broken trust, the beginner's path)

### M1. Struggle-path test pass, then fix what breaks (size M)
The owner's real path. Run the play-test method with the emulated kit set to a beginner (Late 45 ms, Jitter 40,
Weak hand 60%) and walk every failure route:
- rough take (< 60%) → −10 BPM; two close misses → −5; floor 40 → "Learn it slowly" (wait mode) and that wait mode
  never counts as a pass;
- "🔍 Fix bar N" zoom loop and the return to the full take;
- "Ask the coach for something different" (struggle request → smaller, different lesson; `requestCoachLesson` with
  `struggle` in `src/lesson/LessonPlayer.tsx` `askHelp`);
- live tips during takes and their voice; the coach's tool switches (trade / count / layers / listen, `oneOff`);
- the student read moving `new` → `struggling` and the coach writing easier lessons; the autoProbe staying off.
Write each result into `docs/PLAYTEST.md` as a new round; anything wrong becomes a fix commit with a test.
Done when: every route above was exercised and behaves as `docs/LEARNING.md` describes.

### M2. Real-kit validation (owner at the MPS-150, size S)
Owner plays, implementer watches the run log:
- **Crosstalk filter** (`src/input/hits.ts`, `CROSSTALK_MS=15`, `CROSSTALK_SNARE_MAX=44`): Ghost notes full groove;
  confirm no real hi-hat stroke is dropped and no crosstalk extra remains. Tune the two constants from the evidence
  and add the measured numbers to `docs/KIT.md`.
- Calibration wizard and latency test on the real kit (the play test never ran them).
- Accent and ghost-note lessons with real sticks (velocity ranges ~15–127).

### M3. Coach line: the verdict never disappears (size S)
`src/lesson/LessonPlayer.tsx` `line` (≈353): order is `fresh2?.say ?? (thinkingAbout ? '…' : outcome?.say …)`, so on
step/lesson done the verdict turns into "…" for ~5 s. Change to `fresh2 ?? outcome?.say ?? (thinking ? …)` and show
the existing `<Thinking />` (`src/coach/api.tsx`) as a small line under it. Same in `src/play/PlayView.tsx` (≈111).

### M4. Keep the big moments (size S)
On a `role === 'record'` pass the coach paragraph replaces "🏆 NEW RECORD" (verdict set ≈165, `fresh2.say` wins).
Rule: for records, rank-ups and "Lesson complete", the app's verdict stays as the coach line; the coach's words go
under it (or are spoken only).

### M5. The coach can't invent buttons (size S)
`LessonPlayer.tsx` ≈301 uses `fresh2.action.label` as is; `canRunAction` (`src/coach/session.ts` ≈48) never checks
the target. Fix: for `kind === 'next'` use the screen's own label (`onNext ? 'Next ▶' : '← Journey'`, as at ≈303); for
`drill` with an unknown `chartId`/lesson, drop the action (the reply's words stay). Same in `PlayView.tsx` ≈106. Add a
line to `server/prompts/session.md` (≈40): the app labels "next" itself. Test the pure label/validation helper.

### M6. Coach replies sized for the throne, in plain words (size S)
Screens show `reply.say` (spoken text, up to 400 chars, 2–4 sentences). Use the existing `show` field for the screen:
`fresh2?.show ?? fresh2?.say` in `LessonPlayer.tsx` and `PlayView.tsx`. In `server/prompts/session.md` (≈38–39):
`show` = the one thing to do next, ≤ 12 words; `say` = no milliseconds or percentages (use "a hair late", "right on
it"); numbers stay in the results panel. Don't shrink the schema max (an overlong field fails the whole reply);
instead drop an overlong `show` like `TipsSchema` does (`src/coach/schemas.ts` ≈35–39).

### M7. Tell the coach what really happened on a new step (size S)
`coachTake(f, { … tempoNow, target … })` (`LessonPlayer.tsx` ≈205) sends the *next* step's start tempo with the
*finished* step's target, so the coach says "the app slowed you to 60". Add `event: o.event` and, on stepDone,
`nextStep: { title, startBpm, targetBpm }`; update `server/prompts/session.md` (≈4–6): a new step restarts at its own
start tempo, that's not a slow-down. `SessionEventSchema` already passes extra fields through.

### M8. Tempo probe tries the target (size S)
`LessonPlayer.tsx` ≈114: `pr.tempo + 5 <= target` stops at 90 when the target is 92. Use `pr.tempo < target` and
`pr.tempo = Math.min(target, pr.tempo + 5)`; give `probeTempo` (`src/engine/lesson.ts` ≈113) an optional `target` cap
(`at(i) = min(target, start + 5i)`). Extend the existing probe tests (`lesson.test.ts` ≈160).

### M9. No intro slides right after a probe (size S)
`introShown` (`LessonPlayer.tsx` ≈235–247) re-shows slides on a > 10 BPM jump; probe bars bypass `play()`. In the
probe-finish branch set `introShown.current.set(key, working)` only if the key already exists (so a first-time step
still gets its slides).

### M10. Honest counters and probe copy (size S)
- Counter (≈401) and hold message (≈185): `step.pass?.streak ? 1 : CLEAN_TAKES`, plus "(one ★★★ take counts as both)".
- Probe lines (≈116, ≈122, ≈354): first time in a session keep the sentence; afterwards just "Your tempo: 90 BPM".

### M11. Journey after today's set and after the whole path (size S–M, 🖼 for the end state)
- Hero when the set is done (`src/lesson/TodayView.tsx` ≈100–109, ≈133): default to the next lesson
  (`others[0]`), not "Jam ▶"; keep Jam as the secondary button.
- Flow (≈105) picks `first-jam` forever; pick the latest finished groove of the newest stage instead.
- 2-minute challenge (≈118) and Beat your best (≈121): sort by level first, then oldest played.
- End of path (`currentMilestone` undefined): the stage card, trail and song card vanish and
  `/api/coach/lesson` returns 400 "finished every milestone" (`server/index.ts` ≈330). Until R3 adds levels, show an
  "All stages done" Journey: Flow on the newest groove, the 2-minute challenge, Beat your best, the show-off set, and a
  "coach challenge" button that asks for a review/stretch lesson at the last level instead of failing.

### M12. Weekly theme forgets fixed habits (size S)
`weekTheme` (`src/engine/progress.ts` ≈137–145) counts tips over 7 days only, so 3 early sloppy takes kept "landing
behind the click" after ~180 on-time takes. Keep a candidate only if it also appears in the last 5 takes. Test in
`progress.test.ts` (≈78–88, `run()` fixture).

### M13. Trophies are never stale (size S)
Badges on the shelf come from `s.badges`, which only Journey writes (`TodayView.tsx` ≈59–65). In `TrophyShelf`
(`src/ui/ProgressView.tsx`) show `s.badges ∪ earnedBadges(runs, s.lessons, MILESTONES.map(m => m.checkpoints))`.
Also fix `PlayView.tsx` ≈61: the runs refetch runs before `saveRun` (≈63); refetch after the save resolves
(`saveRun` in `src/play/Results.tsx` returns a promise you can await).

### M14. Onboarding keeps answers and makes setup a real step (size M, 🖼)
`Onboarding` (`TodayView.tsx` ≈295–323): the "Setup → Pads" link switches tabs without saving, so goals and minutes
are lost and the welcome screen returns. Fix: save first. Then add step 2 of onboarding: "Hit each pad once" (reuse
the `Calibrate` wizard) and "Tap 8 times for latency" (`LatencyCard`), each skippable with "No kit yet → keyboard".
Record `setupDone` in settings so Journey can nudge once if it was skipped.

### M15. Coach lessons never copy a built-in title (size S)
`POST /api/coach/lesson` (`server/index.ts` ≈333–339) dedupes only against coach lessons. After `ask()`, if the title
matches any `LESSON_BY_ID` title (case-insensitive), append the focus ("Rests are notes too: the &s") or retry; add
"never reuse a built-in or checkpoint title" to `server/prompts/lesson.md`. Test in `server/ai/lessons.test.ts`.

### M16. A stronger model for writing lessons (size S)
Lessons are written in the background by the same Haiku-on-low as the live chat (`server/ai/providers.ts` ≈25–33,
`CLAUDE_CLI_MODEL`/`EFFORT` global), and it half-follows the lesson prompt (warm-up echo steps for a flying student).
Add per-task overrides `CLAUDE_CLI_LESSON_MODEL` / `CLAUDE_CLI_LESSON_EFFORT` (default `claude-sonnet-5-5` / medium),
used for `ask('lesson' | 'plan' | 'showoff' | 'groove')`; keep the live session fast. Put model+effort in the cache key
(`server/ai/coach.ts` ≈35). Update `.env.example`, README, the `/api/coach/status` text.

### M17. Song grooves: say how sure the coach is, and allow a second try (size S)
`server/prompts/groove.md` + `ChatReplySchema` have no confidence; the cache key (title, bpm, ts) and `askCoach`'s
early return lock a wrong answer forever (Billie Jean). Add `confidence: 'know' | 'style-guess'` to a groove schema and
prompt, show it in `src/youtube/LearnMode.tsx` (≈145) ("I know this one" vs "a style guess: check by ear"), and an
"Ask again" that bypasses the cache (`noCache` flag through `ask()`).

### M18. A show-off song must be a real chunk of the song (size S)
`barsReady`/`songBarCount` let a 2-bar song count (`src/ui/ProgressView.tsx` ≈126, `TodayView.tsx` ≈70,
`earnedBadges` 'showoff' at `progress.ts` ≈104 ignores bars). Add `SHOWOFF_MIN_BARS = 16` and
`songReady(runs, id, bars)` in `progress.ts`: at least 16 bars of notes and every bar ≥ 85%. Use it at all three call
sites; pass ready song ids into `earnedBadges` (update its test). Copy in `BADGES`, ProgressView and `ShowoffCard`
("16 bars or more").

### M19. Practice library levels match the curriculum (size S)
`src/content/library.ts`: paradiddle is level 3 there but 4 in the curriculum, funk ghost notes 6 vs 4; no level 0 or 5
charts; "shuffle-68" is a straight 6/8 groove; `exercise` charts have no Practice tab. Re-level to curriculum levels,
rename the 6/8 chart's title (keep ids), add a tab or fold `exercise` into Rudiments. (New charts are G4.)

### M20. Weak spots for triplet grooves (size S)
`RunStats.heat` rounds `pos*4` into 16th slots (`src/engine/scoring.ts` ≈202), so shuffle/swing/6-8 weak spots land in
the wrong slot and the coach gets wrong "weakest beat positions". Use the chart's subdivision (12 slots per bar for
triplet grids). Test with a shuffle hit stream.

---

## 4. Revamps (needed for "can actually learn drums")

Order matters; see section 6. Three mockups (`docs/mockups/lesson-screen.html`, `journey.html`, `self-check.html`) are
approved before any revamp UI is built; engine work can start meanwhile.

**Rules that apply to every revamp:**
- **One place for pass limits.** Each new limit changes `Pass` (`src/engine/lesson.ts`), `checkPass`,
  `AiLessonSchema.pass` (`src/coach/schemas.ts`) and one line of `server/prompts/lesson.md`. New live cues go into
  `SPOKEN_CUES` (`liveCoach.ts`) and `THEME_WORDS` (`progress.ts`).
- **No new checkpoints in levels 0–6.** A student who already finished the path would be pushed back. New skills get
  practice lessons in 0–6 and are tested at the level 7–9 checkpoints.
- **Nothing new in the settings blob.** It's one JSON row capped at 64 KB. Profiles are computed on the server from
  `runs`.

### R1. Backing band: bass + keys under grooves and songs (size M, 🖼)
**Why:** drumming is ensemble time. Today every lesson is drums plus a click, so excitement fades and the student
never learns to lock with a bass line.

**Design:**
- **Files.** New `src/engine/band.ts` (pure) with:
  - `BandStyle` = rock | funk | shuffle | swing | sixeight | odd;
  - `BandSpec { style; chords?: string }`, one chord symbol per bar;
  - `bandNotes(spec, run, bpb): BandNote[]` (`{ t, dur, part: 'bass'|'keys', midi[], vel }`);
  - `chordMidi(sym)`;
  - `bandStyle(chart, tags)`, guessed from the chart (6/8, triplet grid with ride or hi-hat, ghosts or 16th kicks);
  - `bandFor(lesson, step)`: on for groove, song and fill steps; off for counting, probe, rest and rudiment steps.
- **Bass:** the chord root on every kick of the bar, so it locks to the groove with no authoring. Shuffle gets a
  boogie 1-3-5-6 line, swing a walking line.
- **Keys:** rock half-note pads, funk stabs on the &s, shuffle stabs on 2 and 4, swing Charleston, 6/8 dotted pads.
- **Fill bars:** one band hit on beat 1, then silence.
- **Sound:** `src/play/audio.ts` gets a `bandOut` gain node into `master` (voice ducking still works), a held-note
  `pad()` builder next to the private `tone()`/`noise()`, and `playBand()`.
- **Scheduling:** `src/play/player.ts` adds `PlayOptions.band`, scheduled in the existing lookahead loop next to the
  `sounding` loop (≈230–234) at `zeroAudio + t*beatMs/1000`. Oscillators follow the tempo with no pitch shift. The band
  honours the gap/fade click, so "keep time alone" steps stay honest.
- **Settings:** `band` (default on) and `bandVolume` (0.6), plus a "Band" slider in `SoundCheckCard`.
- **Lesson screen:** a "🎸 Band" toggle next to Hints (key B). The built-in songs get chord lines in
  `src/content/curriculum.ts` (Roadhouse Shuffle = 12-bar blues).
- **Tests:** `chordMidi`, bass on the kicks of `x...xx..`, the 12-bar wrap, the swing walk's approach note, nothing
  scheduled past `run.beats`, fill bar = one hit, `bandStyle` per built-in song.
- **Risk:** a synth band sounds cheap. Accept it now; samples later (G-list).

### R2. Grace-note rudiments: flam, drag, ruff, flam tap, press roll (size L)
**Why:** no rudiment vocabulary beyond singles, doubles and the paradiddle. Today a grace note would also break
scoring: one same-drum gap shrinks the timing windows of the *whole take* (`minGapBeats`/`windowsFor`,
`scoring.ts` ≈10–24, `player.ts` ≈181).

**Design:**
- **Chart format** (`src/engine/chart.ts`): `grace?: 1..3` (1 flam, 2 drag, 3 ruff), `buzz?`, `stick?: 'R'|'L'`.
  - `pattern()` characters: `f F d D r z`, plus an optional sticking string. This also fixes paradiddle hints, which
    show R L R L today.
  - Graces are attributes of the main note, not separate notes, so totals, extras and notation snapping stay clean.
- **Scoring** (`src/engine/scoring.ts`):
  - **Per-note windows:** `noteGood()` = min(goodMs, 0.4 × the gap to the nearest same-drum neighbour), replacing the
    per-take window at `player.ts` ≈181/278.
  - **Grace chain in `createMatcher`:** a later same-pad stroke within 60 ms, ≥ 0.9× the velocity, takes the note over.
    The result records `grace { strokes, gapMs, ratio }`. Capped at 3 moves or 120 ms. Notes without `grace` keep the
    old path.
  - **Buzz:** unmatched same-drum hits before the next note count as bounces, not extras.
- **Stats and pass:**
  - `RunStats.grace`.
  - Pass `minGracePct` (default 70 when graces exist), `graceGapMs [8, 50]`, `maxGraceRatio 0.75`.
  - Plain reasons: "some flams came out as one note", "grace too loud: keep that stick 3 cm off the pad".
- **Input:**
  - Keep `src/input/hits.ts`; add flam/drag pass-through tests.
  - Keyboard: Alt + key = flam (grace at velocity 40, then main +25 ms; map by `e.code`).
  - Emulated kit plays graces at −25·k ms, velocity 35, with the other hand.
- **Notation:** VexFlow `GraceNoteGroup` (slashed for flams) and `Tremolo(3)` in `SheetMusic.tsx buildVoice`. The
  highway draws a small dot before the note.
- **Lessons (practice):** L3 `flam`, L4 `flam-tap` and `drag`, L5 `buzz-roll` ("real kit only"), L7 `ruff-fill`.
  Tested inside the level 7–9 fill checkpoints.
- **Tests:**
  - 8ths keep ±100 ms beside 16ths on another drum;
  - flam −25 + main 0 → offset 0, `{strokes 1, gapMs 25}`;
  - drag `strokes 2`;
  - regression: no grace in the chart → the 30 ms stroke is still an extra;
  - notation and hints.
- **Risk:** MPS-150 retriggers (29–56 ms) overlap flam spacing, so this is unverified on the kit. Add it to M2's
  real-kit list.

### R3. Levels 7–9: from early intermediate to confident intermediate (size XL)
**Why:** the path ends at Swing Cat after ~50 minutes of playing for a strong student, and "expert" isn't reachable.

**Code:**
- `curriculum.ts`: replace `SPREAD_MS` with `spreadFor(level)` (40/30/25/20 ms). Today the array returns `undefined`
  above level 6 and the spread limit silently disappears.
- `Pass.minFreeOnBeatPct`; `checkPass(…, freeStats)` receives the free-bar stats already computed in `LessonPlayer`.
- **Odd /8 meters** (needed for 7/8):
  - Fix the count-in `k % sub` with negative `k` (`player.ts` ≈211/221).
  - Add pure `pulse(ts)` and `groupsOf(ts)` (5/8 = 3+2, 7/8 = 2+2+3), an 8th-note click with group accents, and a
    count-in voice counting 8ths.
  - 5/4 already works.
- Students who finished the old path resume at stage 8 (intended); show a one-time "New stages open" line.

**Content (★ = checkpoint):**

| Level | Stage / rank | Lessons |
|---|---|---|
| L7 | "Groove at tempo", rank Pocket Pro | ★kick-16-indep (16th kicks under 8ths, `variants` to read), ghost-16ths, ★funk-at-tempo (80→96), open-hat-funk [funk], lay-back (R4), ruff-fill (R2), stamina-groove (32 then 64 bars ≈ 5 min), ★song-pocket "Pocket Sixteen" (24 bars, soft verse / loud chorus, funk band) |
| L8 | "Linear and odd", rank Shape Shifter | linear-basics (hand-hand-foot groups), ★linear-groove, ★linear-fill (across the bar line), ★five-four (3+2), seven-eight (2+2+3, practice), ★song-odd "Five Alive" (16 bars 5/4) |
| L9 | "Solo voice", rank Solo Voice | ★fill-vocab (6 fill `variants`: 8th toms, 16th snare, triplet toms, flam accents, linear, drag), fills-build (soft→loud), ★trade-fours (4 band bars / 4 solo bars, `minFreeOnBeatPct` 70, scored crash back on 1), solo-vamp, ★song-spotlight "Spotlight" (32 bars with a 4-bar drum break) |

**Not included:** double kick (one pedal on the MPS-150), brushes.

**Tests:** checkpoints exist at their level; level 7+ checkpoints untagged; every last checkpoint step has a spread
limit; 5/4 and 7/8 charts valid; `countPlan` for 7/8. Update the `docs/LEARNING.md` tables (levels, ranks, 20 ms,
90%).

### R4. Feel judging: swing, dynamics, playing behind or on top (size M–L, 🖼)
**Why:** a drummer's feel is half the job. The app only knows "on time".

**Design:** new `src/engine/feel.ts`.
- **Swing %:** from on-beat/off-beat same-drum pairs: ((t_off − t_on)/beatMs)·100, at least 4 pairs. 50 = straight,
  67 = triplet.
- **Bar dynamics:** each drum's velocity normalised to its own take mean, then correlated with the chart's new `dyn?`
  marks (1–3 per bar). Pearson r, with a minimum range of 0.15.
- **Offset target:** `perDrum[drum].meanOffset` within ms ± tol.
- **Plumbing:** `computeStats(…, beatMs, dynTargets)` from `finish()` (`player.ts` ≈308).
- **Pass:** `swingPct [min,max]`, `minDynamicsR`, `offsetTarget { drum?, ms, tol }`.
- **Live coach:** rushing/dragging is measured against the target, so a lay-back step never hears "Dragging. Push".
  New cues: straight, bring-up, bring-down, lay-back.
- **Display:** Results shows a feel row; the sheet shows p / mf / f.
- **Lessons:** L5 `swing-feel` (practice); L7 `lay-back`; R3's fill and song checkpoints. Existing songs get `dyn`
  marks for display only.
- **Lay-back gate:** lay-back lessons need a measured latency (`latencyChecked`, set by the latency test).
- **Tests:** straight → 50, triplet → 67±1; crescendo r ≈ 1; per-drum normalisation; checkPass reasons; live coach on a
  +25 ms target.

### R5. Technique you can see, and check yourself (size L, 🖼)
**Why:** the biggest gap for learning without a teacher. Bad grip, tension and pedal habits go unseen.

**Design:**
1. **Animated technique diagrams**, generated from data, in a new `src/content/demos.ts` +
   `src/ui/TechniqueDemo.tsx`:
   - side-view sticks pivoting at a fulcrum dot, a 3 / 15 / 30 cm height ruler, foot and heel views;
   - big words (DROP, BOUNCE, LOW, HIGH), animated at the lesson's tempo with the Web Animations API (same technique as
     `KitView`);
   - offline, no copyright.
   - `DEMO_IDS`: posture, grip, rebound, accent-tap, doubles, flam, drag, buzz, kick-heel-down, kick-heel-up, hh-foot,
     hh-seesaw.
   - Pure `poseAt(demo, beat)`, tested.
2. **Camera self-check** in a new `src/ui/SelfCheck.tsx`:
   - a mirrored live view plus a 10-second in-memory `MediaRecorder` loop next to the diagram;
   - captions say what to look for ("stick comes back up by itself? wrist loose?");
   - hi-hat ×1 records or stops, snare ×1 replays, Esc closes;
   - nothing is saved or sent.
- **Where they show:**
  - `Step.demo` / `Lesson.demo` (also allowed in `AiLessonSchema`);
  - an optional 4th intro slide, "HOW IT MOVES";
  - the lesson side card with "📷 Check yourself";
  - a new `look` step (like `rest`: demo + mirror, done = hi-hat pedal × 3).
- **Attached to:** posture, singles, accents, doubles, kick-quarters, hh-quarters, open-hats and the R2 lessons.
- **Not included:** pose detection, YouTube embeds.

### R6. A student profile and a weekly plan the Journey actually follows (size M, 🖼)
**Why:** personalisation is pace only; the coach reacts to the last lesson instead of planning a week; the weekly plan
is a hidden island (`PlanCard` in a collapsed section, ignores Profile, never steers `buildSession`).

**Design:**
- **Profile:** new `src/engine/profile.ts`, `StudentProfile` computed on the server from 28 days of runs
  (`json_extract` of perDrum, tipIds, lesson tool):
  - per-drum accuracy and offset with a trend (last 14 days vs the 14 before, ±3 points, ≥ 40 notes);
  - timing trend, top tips, minutes per tool (jam / drill / copy / flow / song), favourite songs.
  - `GET /api/profile`.
  - Passed into lesson input, the session's open event and the plan.
  - `PlayOptions.lesson.tool` is recorded on runs.
- **Weekly plan:**
  - `PlanSchema` gains `focus`, `why`, `lessonIds` (≤ 6, filtered to known ids), `drums`, and `notes` (the coach's
    notebook, fed back next week); `days` optional.
  - Asked automatically on the first Journey visit of an ISO week (same trigger as the Monday recap, key
    `plan-<week>`), filled from Profile and actual playing days.
  - Rewrite `server/prompts/plan.md`.
- **Journey:** "🎯 This week: <focus>" replaces the weekTheme line (weekTheme is the fallback).
  `buildSession(…, focusIds)`: an open focus lesson at or below the current level leads the skill slot, and a finished
  one becomes the review.
- **Tests:** profile trends, top tips, tool minutes, empty data; planner focus steering and unknown ids; lesson input
  carries profile and focus; old plans without `focus` parse.

### R7. Ranks proven on another day (size S, 🖼 inside the Journey mockup)
**Why:** today a rank is one good take on one day.

**Rule:**
- **Earned** = checkpoints passed. Unchanged, never blocks the next stage.
- **Proven ✓** = every checkpoint passed again at its target on a later day. Reviews count, and once proven it stays.

**Code:**
- `LessonProgress.provenAt?`; `isProven(p)` (old saves with `reviewStage ≥ 1` count); `proveOnAnotherDay()` applied
  after the review and ladder saves in `LessonPlayer`.
- `rankState(m) = locked | earned | proven` in `planner.ts`, used by TodayView, ProgressView and Celebration.
- **Copy:** "Groove Keeper ✓" or "prove it on another day (1 of 2)"; review tiles for unproven checkpoints say "Prove
  it".
- **Tests:** same day not proven; next day at target proven; a later fail stays proven; old save with
  `reviewStage ≥ 1` proven.

### R8. A song at the centre of every stage (size L, 🖼)
**Why:** the show-off song is the owner's top reward, but the Journey and Songs live apart, a beginner has to go
through YouTube search, tempo tapping and note entry, and after the last stage everything vanishes.

**Design:**
- **Built-in songs for every stage:** new practice songs `song-first` (L0, 8 bars), `song-hats` (L1, 16) and
  `song-sixteen` (L4, 16), with band chords (R1).
- **Stage song:**
  - It is the last `kind:'song'` lesson of the level, set automatically when a stage starts (`Profile.song.builtin`).
  - Journey says once "Your stage song: X, or pick a real song" (ShowoffCard flow unchanged).
  - The trail's last stop becomes a button with a bars-ready ring.
- **Bites:**
  - One lesson per stage ends with a `bite` of its stage song.
  - `barsReady` also counts bite runs at the song's bar offsets (`runRows` extracts `$.lesson.bite`).
  - `applyBites` resolves built-in song ids.
  - The groove slot of the daily set prefers the stage song's bite while bars aren't ready.
- **After the path:**
  - `lessonInput` returns a post-path input instead of `null`, which removes the 400 at `server/index.ts` ≈330.
  - `buildSession` gets an after-the-path branch: warm-up, "prove it" review, weekly focus, one take of a show-off
    song.
  - The hero offers the show-off set, Beat your best and "Learn a new song". This replaces M11's interim end state.
- **Minimum length:** `SHOWOFF_MIN_BARS = 16` (from M18).
- **Tests:** bite offsets, minimum bars, post-path session not empty, built-in `applyBites`, post-path lesson input,
  every level has a song ≥ 8 bars with a chord line that fits.

---

## 5. Good to have

- **G1 · Reading lessons.**
  - A "Read it" step type: sheet only (`NotesView` option to hide the highway), 4 `variants` per step so it can't be
    memorised.
  - A rhythm-cards lesson per stage (quarters/8ths/rests at L0–1, 16ths at L4, triplets at L5).
- **G2 · Ear training.** A quiz slide built like `IntroSlides`, answered with pad gestures (`padCommands`):
  - "Which did you hear: rushed or steady?", using `takeChart` + `hearTake` to play two versions;
  - "Which groove is this?";
  - "Where's the kick?" (pick the bar).
  - One quiz per stage as a practice lesson.
- **G3 · Practice library to match the path.** Add charts for levels 0 and 5, shuffle, swing and 6/8, and the R3
  grooves; at least 3 per level so "For you" always has a step up (`src/content/library.ts`, ids never renamed).
- **G4 · Sample-based band and drum sounds.** Replace the synth with small CC0 samples once R1 has proven the idea.
- **G5 · Coach-written band chords** for coach lessons and song bites (schema `band.chords`).
- **G6 · Variety and surprise.** A rotating set of verdict and probe lines; a weekly challenge tile (a groove + a
  target, shared with the 2-minute challenge best).
- **G7 · Replaying a finished lesson** shows "Still solid" instead of a second "LESSON COMPLETE!" celebration.
- **G8 · Play-test tooling in the repo.**
  - Move the autopilot (`.playtest-helpers.js`) into `scripts/playtest/` as a dev-only tool.
  - Add Beginner / Solid presets to `EmulatedKitCard`, and have the emulated kit fill free bars.
  - Add a fake-date test for the streak badges (`earnedBadges(runs, …, now)` already takes `now`).
  - So the next play test takes minutes, not hours.
- **G9 · Voice talk-back and song-audio capture.** Untested in the play test (microphone, tab-share prompt). Owner
  runs them once and logs the results.
- **G11 · Your own demo videos.** Short local clips in `data/demos/` (gitignored), streamed by `/api/demos/:id`
  (id checked against `DEMO_IDS`), shown instead of the R5 diagram when present. Not in scope now (owner chose
  diagrams + camera).
- **G10 · A note in the app** (Trophies or Setup): technique can't be fully judged by an app. Film yourself monthly
  (R5), and if possible take one lesson with a human teacher per stage.

---

## 5b. Path to 9.5–10 (after everything above)

What still separates ~8.5 from ~10 is what a great human teacher does: watch your body, use real music, know you
over months, and take you all the way to advanced. A true 10 means **the app plus a light human touch built in**, not
an app that pretends to replace a teacher. Each item names the area it lifts.

| # | Item | What it is | Key tech / files | Size | Lifts |
|---|---|---|---|---|---|
| N1 | **Technique judged, not just shown** | The camera self-check (R5) gets on-device pose and hand tracking: stick height per stroke, wrist vs arm motion, shoulder tension (raised shoulders), back angle, heel-up vs heel-down. A "technique score" sits next to the timing score, plus one physical fix per take. | `@mediapipe/tasks-vision` (WASM + model files served from `public/`, so it runs offline), new `src/engine/posture.ts` (pure, tested on recorded landmark fixtures), `SelfCheck.tsx`. Frames never leave the laptop. | XL | Technique 5.5 → 8 |
| N2 | **A human in the loop** | "Teacher pack": export a 30-second self-check clip, the take's MIDI and a one-page progress summary, so the owner can send it to a human teacher for a monthly review. The teacher's notes are typed back in and become coach input. | Export via the browser download API (owner-initiated); new `teacherNotes` in the profile (R6). | M | Technique → 9, personalisation |
| N3 | **Real music in lessons** | Song bites play over the song's real **drumless** YouTube version (the IFrame player is synced to the lesson take, like Songs → Play), not only the synth band. A sampled kit and band (CC0 samples) replace the synth. | Reuse `startExternal`/`yt.ts` in `LessonPlayer`; sample loader in `audio.ts`. Never download or store YouTube audio (CLAUDE.md YouTube rules). | L | Songs 8.5 → 9.5, motivation |
| N4 | **Song parts you can trust** | A verified song pack: the owner picks songs, the app suggests a part from live tab-capture onsets (`src/engine/onsets.ts`) plus the coach's guess, and the owner confirms it by ear with the existing grid editor. A part is marked "verified" before it can be a stage song. Fixes "the coach guessed Billie Jean wrong". | `yt_songs.verified`, LearnMode "Mark as verified", onset-to-grid suggestion quality pass. | M | Songs, trust |
| N5 | **Placement and a skill map** | A 10-minute placement test at onboarding (a ladder of grooves and rudiments) places experienced players at the right stage. Mastery is tracked **per skill** (time, 16ths, triplets, ghosts, flams, independence, reading, feel), not per lesson, with spaced review per skill. The coach plans from the skill map. | New `src/engine/skills.ts` (skill graph: each lesson tags the skills it trains), placement flow, Journey "skill map" view. | L | Curriculum fit, personalisation 8 → 9.5 |
| N6 | **Advanced levels and style tracks** | Levels 10–12: polyrhythms (3:2, 4:3), advanced independence (ostinatos), Latin (songo, bossa, samba on a kit), gospel/R&B chops, metric modulation, soloing with phrasing. Plus parallel style tracks (rock, funk, jazz, Latin) after level 6, so the path branches by goal instead of being one line. | `curriculum.ts` content, `MILESTONES` gains a `track` field, planner per track. Odd meters from R3. | XL | Curriculum 8 → 9.5 |
| N7 | **Full musicianship** | Sight-reading to fluency (graded reading takes with `variants`), chart reading with repeats, first/second endings and codas; ear training to transcription (hear a groove, write it in the grid editor, scored against the real chart); listening assignments ("hear how the drummer lays back in this song"). | Notation repeats/codas in `notation.ts`; a transcription exercise type that scores a written grid against a chart. | L | Musicianship, depth |
| N8 | **You vs you, over months** | Every month, auto-pick one take of the same groove and play "you a month ago" against "you now" (own MIDI only), with charts of skill growth. Progress reports the coach writes monthly. Concert mode: a setlist of show-off songs played back to back with the band, recorded as MIDI for friends. | `takeChart` replay of stored runs (needs hits saved per run: a new `run_hits` table, size-capped), monthly report prompt, Stage mode setlist. | M | Motivation 9 → 9.5 |
| N9 | **Fair hardware** | Per-pad velocity calibration (each pad's soft/loud range, so dynamics checks are fair across pads), a per-pad retrigger profile measured on the real kit, and a sound-check that confirms click, band and coach levels from the throne. Left-handed setup (mirror sticking and hints). | Calibrate wizard step "hit soft, then loud"; `velocityCurve` per pad in the note-map store; hints mirror. | M | Scoring 9 → 9.5, accessibility |
| N10 | **Health and long-term habits** | Warm-up and stretch routine before sessions, practice-length guidance (no 2-hour first days; breaks every 20–25 minutes), hearing-safe volume reminder, wrist-pain check-ins ("anything sore?" → lighter plan). | `rest` steps + session planner rules, a coach prompt line. | S | Teaching, safety |
| N11 | **Proven quality** | The autopilot play test (G8) runs as an automated end-to-end suite before every merge (beginner and solid players, the whole path). Real-kit sessions are recorded as MIDI fixtures and replayed in tests, so kit-specific bugs (crosstalk, retriggers) can't come back. | `scripts/playtest/` + a headless Chrome runner; fixtures in `src/input/fixtures/`. | M | Reliability 8.5 → 9.5 |

**Expected rating with N1–N11:**

| Area | After good to have | After path to 10 |
|---|---|---|
| Technique | 6 | 8.5–9 (with N2's monthly human review) |
| Songs and real music | 8.5 | 9.5 |
| Curriculum depth | 8 | 9.5 |
| Personalisation | 8 | 9.5 |
| Musicality and feel | 7 | 8.5 |
| Reliability | 8.5 | 9.5 |
| Motivation | 9 | 9.5 |
| **Overall** | **8.5** | **9.5** |

**Why not a flat 10:** feel, groove and sound are partly taste, and some technique problems (tension you can't see,
pain) still need a person in the room now and then. N2 builds that in instead of hiding it.

## 6. Order of work

1. **Must go, in this order:** M3–M10, M12, M13, M20 (small, independent); M5/M6/M7 together (all coach-line); M15–M17
   (AI side); M18, M19; M11 and M14 after their mockups. **M1 (struggle-path pass) right after the coach-line fixes,
   then M2 with the owner at the kit.**
2. **Mockups:** lesson screen (band toggle, demo panel, feel row, grace notation), Journey (weekly focus, stage song,
   proven ranks, after-the-path), self-check. Get "build it" before any revamp UI.
3. **Revamps:**
   - R7 + R2's per-note windows (no dependencies);
   - then the R2 engine → R4 engine → R1 player work, one after another (all touch `scoring.ts` and `player.ts`);
   - then R5; R2 lessons and notation; R1 UI and song chords;
   - then R3 (needs R1, R2, R4 and the /8 meter fix);
   - then R8 (needs R1, R3; uses R7);
   - then R6 (needs profile data; `/api/profile` can land any time).
4. **Good to have:** G8 early (it speeds up every later test), the rest after R3.
5. **Path to 10:**
   - N11 and N9 first (quality and fair hardware make everything after it measurable);
   - then N4 and N3 (real music);
   - then N5 (skill map, which N6 plans on);
   - then N1 and N2 (technique);
   - then N6, N7, N8, N10.
   - Each N item gets its own short plan and mockup round before building. They are bigger and riskier than R items.

## 7. Verification

- **Every item:**
  - `npm test`, `npx tsc --noEmit -p .`, and `npx eslint` on changed files (no new warnings beyond each file's
    existing "refs during render").
  - Each engine change has a Vitest test with synthetic hit streams.
- **Each UI item:** mockup approved, then checked in Chrome on a copy of `data/` with the emulated kit on its own ports
  (`docs/PLAYTEST.md` → "How the test is run"). Reload after edits.
- **After the must-go batch:** repeat the play test at two settings:
  - **Beginner** (M1): Late 45, Jitter 40, Weak hand 60;
  - **Solid** (8, 8, 95).
  - Expected: no stale coach line, no "…" over verdicts, honest counters, Journey always offers a next lesson, Trophies
    current, weekly theme drops a fixed habit.
- **After R1–R5:** owner session at the MPS-150 (crosstalk, flams/drags, dynamics, band level against the click),
  with the numbers recorded in `docs/KIT.md`.
- **After R3 + R8:** a full path play test from Stick Rookie to Solo Voice, logged as a new `docs/PLAYTEST.md` run.
  Done when a "Solid" player needs real effort on L7–9, every stage has a playable song with a band, and a "Beginner"
  player's path never dead-ends.
