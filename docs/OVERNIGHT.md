# Overnight run, 2026-10-25 → 26

## Morning summary (read this first)
**Branch:** `claude/plan-phase1-2026-10-25`, worktree `.claude/worktrees/plan-phase1`. Nothing merged, nothing pushed,
main untouched. Final check: **248/248 tests pass**, `tsc` clean, no new lint problems except the "refs during render" kind.
Test servers (5180 / 8790) stopped, Chrome tab closed. Your real `data/` and localhost:5173 were never touched (the
play test used a copy in the job's scratch folder).

**Done**
- Must go: M3 (6a8cfd2), M4 (32efe15), M8 (1e5a4e6), M9 (2d473a6), M10 (b8a1f70), M12 (e8fb560), M13 (980d425),
  M20 (d4d6c79), M5 (91e7191, bd2af78), M6 (447b152), M7 (a3466b2), M15 (4e40d0a), M16 (5084409), M17 (95045f2),
  M18 (cb526e9), M19 (3094bfa).
- M1, the struggle-path play test as a beginner (round 6 in docs/PLAYTEST.md). Six fixes, one commit each:
  - At 40 BPM, a take where every note landed but the timing failed now gets the timing fix instead of "try wait mode"
    (543f74f).
  - **"🐢 Learn it slowly" at 40 BPM wasn't wait mode.** It played a scored take at 35 BPM that could pass and climb.
    Now it really is wait mode, and it's the big move after a rough take at the floor (fe83e7b).
  - The "Fix bar" loop only says "sounds better" when it was better (5ea2b4e).
  - A beginner whose hits wander more than ±40 ms now reads as *struggling*, not *steady* (9da0848).
  - After "Lesson complete" the big move is "Next" again, not the coach's "Try a slower tempo" (dfcf635).
  - The round log is in 6ddb795.
- M2: the real-kit checklist for you, in docs/PLAYTEST.md under "M2: real-kit checklist" (a279a50).
- M14, bug part only: the welcome screen saves your goals before opening Setup → Pads (a943a5a). The new setup step
  waits for its mockup.
- Engine-only revamp work. None of it changes a screen.
  - R7: ranks proven on another day (0078ec3).
  - R2: per-note timing windows (b39ccb1). These are live: 8th notes beside 16ths keep their ±100 ms window. Checked in
    Chrome.
  - R2: grace-note scoring for flams, drags and ruffs (3a62a7a).
  - R4: `src/engine/feel.ts` (e38efe6).
  - R1: `src/engine/band.ts` (abdc06d).

**Reverted or blocked:** none reverted. Still open:
- M11: waiting for its mockup.
- M14's setup step: waiting for its mockup.
- R2 isn't finished: buzz rolls, notation, highway dots, keyboard and emulated-kit graces, the lesson-prompt line, and
  the new lessons.
- R1 and R4 aren't wired into the player, the screens or the pass check.
- M17's "Ask again" button wasn't clicked in Chrome. The test data has no song with a beat grid. Its logic is
  unit-tested.

**Mockups to review** (open them with `npm run dev`, then http://localhost:5173/docs/mockups/NAME.html):
- `docs/mockups/m11-journey-after.html`
- `docs/mockups/m14-onboarding-setup.html`
- `docs/mockups/lesson-screen.html`
- `docs/mockups/journey.html`
- `docs/mockups/self-check.html`

They load the app's real stylesheet. Chrome screenshots didn't work tonight, so I checked them by script only: they
load, use your theme, and don't scroll sideways. Please look at them yourself.

**What you need to do**
1. Look at the 5 mockups and say "build it", or what to change.
2. Run the M2 kit checklist at the MPS-150. Start with part A, latency: your own data looks like setup latency.
3. Answer the 3 questions below.
4. Have the reviewer session review the branch, then decide about merging.

One thing to know: the M16 lesson model (Sonnet on medium) applies to lessons, plans, show-off picks and song grooves.
Their cached answers are asked fresh once. The live chat and tips keep their cache.

Branch: `claude/plan-phase1-2026-10-25` (worktree `.claude/worktrees/plan-phase1`). Plan: `docs/PLAN.md` /
`~/.claude/plans/plan-all-the-change-purrfect-flamingo.md`.

## Questions for the owner
1. ✅ *Answered: hold the tempo (done).* **A take where every note landed but the timing failed slows the tempo (−5, down to 40).** Slower makes staying
   with the click harder, not easier. Should a timing-only fail *hold* the tempo instead (and give the timing tip)?
   *I'd recommend: hold the tempo for timing-only fails, slow down only for missed notes.* Waiting: a small ladder
   change in `src/engine/lesson.ts` (`ladderStep`) plus `docs/LEARNING.md`.
2. ✅ *Answered: pass + gentle note (done).* **Level 0–1 lets a take ~90 ms late pass** (Good is ±150 ms) while the live tip says "play with the click, not after
   it". Mixed message. Keep the generous window and soften the tip at levels 0–1, or make the verdict mention it?
   *I'd recommend: keep the window, and say "Nice! A touch late: lean into the click" in the verdict when the mean
   offset is over 50 ms.* Waiting: one line in `LessonPlayer.tsx`.
3. **Your own data looks like setup latency** (34% landed this week, "landing behind the click", the latency hint
   fires). Please run part A of the M2 kit checklist (docs/PLAYTEST.md) first. Nothing is waiting on it in code.

## Log
| Time | Item | Status | Commit | Tests | Checked in Chrome |
|---|---|---|---|---|---|
| start | baseline | – | 598e645 | 206/206 | – |
| 23:40 | M8 tempo probe tries the target | done | 1e5a4e6 | 206 + probe cases | later (batch) |
| 23:50 | M3 verdict stays while coach thinks | done | 6a8cfd2 | 206 | later (batch) |
| 23:55 | M4 big moments keep their verdict | done | 32efe15 | 208 (`coachLine`) | later (batch) |
| 00:00 | M9 no slides after a probe | done | 2d473a6 | 208 | later (batch) |
| 00:05 | M10 honest counter, short probe lines | done | b8a1f70 | 208 | later (batch) |
| 00:15 | M12 weekly theme forgets fixed habits | done | e8fb560 | 209 | later (batch) |
| 00:20 | M13 trophies never stale | done | 980d425 | 209 | later (batch) |
| 00:30 | M20 triplet weak spots | done | d4d6c79 | 210 | later (batch) |
| 00:40 | M5 coach can't invent buttons | done | 91e7191, bd2af78 | 212–213 | later (batch) |
| 00:45 | M6 short screen line, plain words | done | 447b152 | 213 | later (batch) |
| 00:50 | M7 coach told about a new step | done | (next) | 214 | later (batch) |
| 01:00 | M15 coach titles never copy built-ins | done | 4e40d0a | 216 | – (server; needs an AI call) |
| 01:10 | M16 Sonnet/medium for lessons, plans, show-off, grooves | done | 5084409 | 218 | – (server) |
| 01:20 | M17 groove confidence + Ask again | done | 95045f2 | 220 | later (batch) |
| 01:30 | M18 show-off song ≥ 16 bars | done | cb526e9 | 221 | later (batch) |
| 01:35 | M19 Practice levels match the path | done | (next) | 222 | later (batch) |
| 01:35 | M19 | done | 3094bfa | 222 | – |
| 02:00 | M1 play test, Beginner preset (round 6) | done | 543f74f, fe83e7b, 5ea2b4e, 9da0848, dfcf635, 6ddb795 | 223 | ✓ Chrome on 5180/8790 with a copy of your data: slow-downs, floor, wait mode, Fix bar, "something different", live tips, trade one-off, M3/M4/M6 lines, Practice (Solid) |
| 02:40 | M2 real-kit checklist written | done | a279a50 | – | – (owner runs it) |
| 03:10 | Mockups M11, M14, lesson screen, Journey, self-check | done | 1e02bac | – | ✓ all 5 load with the app's styles (scripted check; screenshots time out) |
| 03:15 | M14 bug part: save before Setup → Pads | done | a943a5a | 223 | ✓ goals kept, onboarding done |
| 03:25 | R7 engine | done | 0078ec3 | 226 | – (engine only) |
| 03:35 | R2 per-note windows | done | b39ccb1 | 228 | ✓ a Solid take of "Hi-hat 8th notes" scored 32/32 after the change |
| 03:50 | R2 grace-note scoring | done | 3a62a7a | 236 | – (engine only) |
| 04:00 | R4 feel.ts | done | e38efe6 | 241 | – |
| 04:10 | R1 band.ts | done | abdc06d | 248 | – |
| 04:15 | final run | 248/248, tsc clean | – | – | servers stopped, tab closed |

## Day session, 2026-10-26 (owner approved all mockups; "How it moves" redone as v2 and approved)
Owner: "complete all the changes … keep a beginner drummer as the user and find him the best experience via AI coach
personalised curation". Built in my recommended order, each item checked in Chrome on a data copy (5180 / 8790).

| Item | Commit | Checked |
|---|---|---|
| Owner decisions: timing-only fails hold the tempo; late passes get a gentle note | 0f0e040 | unit tests |
| How it moves v2 mockup (approved) | b5cadcf | geometry checked by script |
| M11 Journey after the set / after the path | 4d08eae | ✓ incl. one coach challenge |
| M14 onboarding kit step + one nudge (also: goals save dropped the stage song) | bb1ce7a | ✓ |
| R7 proven ranks on screen | 890f6a2 | ✓ |
| R1 backing band | 6a1cc46 | ✓ oscillators during a take |
| R6 student profile + weekly plan | 8fab4b4 | ✓ coach planned "Play right with the click, not behind" |
| R2 flam/drag lessons, notation, keyboard + emulated graces | 5908ff1 | ✓ 16/16 flams scored |
| R5 How it moves + camera self-check + look steps | cc5c2b9 | ✓ (camera permission not granted by me) |
| R8 a song at the centre of every stage (+ server import fix) | 91d7270 | ✓ |
| R4 feel judging | 44fe8fd | ✓ straight take 49.8% swing |
| R3 levels 7–9 | a66545e | ✓ 7/8 take |
| R2 buzz rolls | 1d2e429 | ✓ 0 extras from bounces |
| R4 live feel cues | deff9df | ✓ smoke test |
| G7 "Still solid" on replay | d78bba3 | ✓ |
| G10 honest note on Trophies | afe855e | – |
| G8 play-test tooling (presets, free-bar fill, streak test, scripts/playtest) | c28b92c | ✓ |
| G3 Practice library 3+ per level | 16af45f | tests |
| G5 coach band chords | 011d102 | tests |
| G1 reading lessons | 81bfb81 | ✓ |
| G2 ear-training quizzes | 67c563f | ✓ |
| G6 rotating praise, weekly target | 5e58ca2 | ✓ |

**Final check:** all tests pass, tsc clean, server modules import; my test servers stopped, my Chrome tabs closed.

**Not done, and why**
- **G4 sampled sounds:** needs CC0 sample files downloaded; I don't download files without your OK. Say which source.
- **G9:** voice talk-back and song-audio capture are yours to try (microphone, tab-share prompt).
- **G11 own demo videos:** out of scope (you chose diagrams + camera).
- **N1–N11 (path to 10):** each needs its own short plan and mockup first (the plan says so). Suggested next: N11
  (automated play test) and N9 (per-pad velocity calibration).
- Observation: on "Pocket Sixteen" a Solid emulated player got a "dragging" tip mid-take; worth a look on the real kit
  (ghost-note grooves, M2 part C).

## N5 skill map and placement · N8 you vs you (2026-10-26)
- N5: `src/engine/skills.ts` (skill map, due refreshes into the daily set, placement ladder), Journey → 🗺 Skill map and
  "Find my level", onboarding "I've played drums before". The coach sees the map for lessons and week plans. Play test
  gained a placement check; `PLAYTEST_PORT_OFFSET` lets it run beside another session's play test (fixed ports collided).
- N8: kept takes (`run_hits`), You vs you on Trophies with replay, month-by-month table, skill growth lines, the coach's
  monthly report (one real call checked: good), concert mode with MIDI save. Checked on the 5180/8790 test copy.

## N7 musicianship (2026-10-26)
- Sight-reading grades 1–5, road maps (repeat/endings/D.C. al Coda drawn on the sheet, played expanded), the
  write-what-you-hear grid, listening assignments; coach prompt knows them. Checked in headless Chrome on the test copy.
- Owner ask: "How it moves" bigger → ⤢ Bigger opens the full demo in an overlay (Esc closes); the side column is wider.
