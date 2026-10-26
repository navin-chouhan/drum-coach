# Test report: `claude/plan-phase1-2026-10-25`, 2026-10-26

Tested at `d445bda` (the implementer's "morning summary" commit) on `claude/test-2026-10-26`. The implementer's log is
`docs/OVERNIGHT.md`; the plan is `~/.claude/plans/plan-all-the-change-purrfect-flamingo.md`.

**Setup deviation:** ports **5181 / 8791** instead of 5180 / 8790. When the test started, the implementer's session
had restarted its own Vite on 5180 (from `.claude/worktrees/plan-phase1`), so this run used the next free pair to avoid
both sessions sharing one API and data folder. Nothing else differs from `docs/PLAYTEST.md` "How the test is run".

- Profile A (fresh): empty `DATA_DIR` in the job scratch folder, `voices`/`whisper`/`tts` linked from the main checkout.
  The Beginner run used A; the Solid run used a second empty folder (A2), because the Beginner's 2★ history would have
  kept the student read off *flying* and hidden the checkpoints-first path and the probe.
- Profile B (real): a copy of `data/` (1.2 GB) in the job scratch folder, on 5182 / 8792.

## Summary
**Verdict: the must-go batch works for a strong student and mostly works for a struggling one. Five bugs were found
and fixed by the tester (F3, F7, F9, F10, F11); none had to be reverted. For a real beginner the app is not yet "never stuck":
two checkpoints became dead ends with the plan's own Beginner preset.** Not ready to merge without the reviewer
looking at the four tester fixes and the owner deciding the teaching questions (F1, F5, F6).

| | Count |
|---|---|
| Plan rows checked | 22 (section 2) |
| Pass | 15 (M3, M4, M5 after F3, M6, M7, M8, M9 after F11, M10, M12, M13, M14 bug part, M15, M16, M18, R2 windows) |
| Partly | 3 (M1, M19 → F10, M20) |
| Fail | 0 left (M5, M9 and M19 failed until tester fixes F3, F11 and F10) |
| Not testable here / not built | 4 (M2 owner at the kit, M11 waiting for its mockup, M17 no song with a beat grid, R1/R2 graces/R4/R7 unit only) |
| Regressions (12 fixed findings + round 6) | all pass except fix 12 (Practice level), regressed by M19 and fixed (F10); round 6 fix 15 incomplete (F7, fixed) |
| Findings | 11: 4 major + 1 minor fixed by tester (F3, F7, F9, F10, F11), 2 major + 1 minor teaching for the owner (F1, F5, F6), 3 minor not fixed (F2, F4, F8) |
| Tester fixes | 5 commits: dbdc523 (F3), abb2ed7 (F7), 9f4d62f (F9), 2b4652e (F10), b1d1c40 (F11). Tests now 249 / 249. |

The biggest things, in plain words:
1. **After a step, the big button left the lesson** (F3, fixed). The coach's "next" sent you to the Journey or the
   next lesson of the set with steps unplayed; the kit's "yes" did the same.
2. **At 40 BPM the screen said "Learn it slowly" but the button was "Fix bar 2"** (F7, fixed).
3. **Your real Journey said "✓ 5 done" for five lessons you never played** (F9, fixed).
4. **Practice → For you was empty for a Swing Cat** after M19's re-levelling (F10, fixed).
5. **A beginner with an uneven hand or a steady 45 ms lag can't pass "Single strokes" or the coach's timing
   lessons**: the app slows to 40 BPM and repeats for 30+ takes (F1, F5). Slower doesn't fix volume or latency; this
   is the implementer's open question 1, and the evidence says "hold the tempo on a timing- or volume-only fail".

## 1. Automated checks
| Check | Result |
|---|---|
| `npm test` | **248 / 248** pass (32 files) |
| `npx tsc --noEmit -p .` | clean (exit 0) |
| `npx eslint` on the 41 changed .ts/.tsx files | 169 problems (166 errors, 3 warnings) vs **160 on main** for the same files. All 9 new ones are `react-hooks/refs` in `src/lesson/LessonPlayer.tsx` (104 → 113), the kind the plan's verification allows. No new rule kinds anywhere. |

## 2. Plan items
| Id | Result | Evidence |
|---|---|---|
| M1 struggle path | partly | Every route ran (section 4). Two bugs fixed (F3, F7); three teaching gaps for the owner (F1, F5, F6). |
| M2 real kit | not testable | Owner at the MPS-150 (checklist in `docs/PLAYTEST.md`). |
| M3 verdict never hidden | pass | No take in ~300 showed "…" over a verdict. "Step done! Next: Rest on 2 and 4, right on time." stayed until the coach's line replaced it (as the plan's `fresh2 ?? outcome.say` intends). |
| M4 big moments | pass | "LESSON COMPLETE!" (coach lesson, line under it: "Nice finish, push the 'and' forward") and "🏆 NEW RECORD: 85 BPM!" with the coach line under it; the record's coach action was dropped. |
| M5 no invented buttons | pass after F3 | Coach `{kind: next, label: "Next step"}` on a record → the app's own "← Journey"; `{kind: next, label: "Snare alone, rest on 3"}` after a step → "▶ Again" (F3). `{kind: faster, label: "Try 90 BPM"}` shown as is (real action). Before F3 the step case left the lesson. |
| M6 short screen line | pass | Observed `show`: 6, 7, 9, 7 words ("Quiet on 3, lean in on 1 and 2", "Push the 'and' notes forward a little"). The spoken `say` still had no ms or % in the replies read. |
| M7 new-step tempo | pass | Coach: "The next step starts you back at 70 for sixteenth notes"; Solid run: "Rest on 2 and 4 next, starting slower at 60". No "the app slowed you". |
| M8 probe tries the target | pass | "Rests are notes too": probe → "Your tempo today: 80 BPM" = target. Roadhouse Shuffle (Stage 6 song) took 2 takes (round 5: 3, probe stopped at 90 < 92). |
| M9 no slides after a probe | fail → fixed (F11) | Follow-up run (profile A3, flying): on 2 of 2 untouched steps no slides before "🔍 Find my tempo", then the slides right after the probe. Fixed by tester; after the fix slides come before the probe and not after (2 of 2). |
| M10 counters, probe copy | pass | "0 of 2 clean takes at 60 BPM (one ★★★ take counts as both)"; first probe "Your tempo today: 80 BPM. That's where we practise.", the second in the session "Your tempo: 100 BPM." |
| M11 Journey after set / path | not built | Waits for its mockup. Seen: "That's today's set done. Want to jam a bit more? Jam ▶" on both runs (for the Beginner with two open checkpoints); after the path the hero offered a paradiddle review, 2-minute challenge on "The money beat" and Beat your best "Counting 8th notes", no stage card. |
| M12 weekly theme forgets | pass | 3 deliberately late Practice takes → "This week: landing behind the click"; after the Solid path (40+ on-time takes) no theme line. |
| M13 trophies never stale | pass | Follow-up run, fresh profile A3: one ★★★ take of "Sit, hold, strike", then straight to Trophies (Journey never visited): `s.badges` was still `[]`, the shelf already showed "🏅 First ★★★" and "★ 3 stars". Code: shelf = `s.badges ∪ earnedBadges(runs…)`, Practice refetches runs after `saveRun` resolves. |
| M14 (bug part) | pass | Fresh profile: picked rock/funk/jazz + 25 min, pressed "Setup → Pads": settings already held `goals [rock, funk, jazz]`, `minutesPerDay 25`, `onboarded true`; the welcome screen didn't come back. |
| M15 no built-in titles | pass (built-ins) | 7 coach lessons written, none with a built-in title. Two coach lessons share one title (F8). |
| M16 Sonnet for lessons | pass | `/api/coach/status`: "model claude-haiku-5-5, low effort; lessons and plans are written by claude-sonnet-5-5 on medium effort." |
| M17 groove confidence | not testable | No song with a beat grid on the test profiles (same as the implementer). Unit-tested. |
| M18 show-off ≥ 16 bars | pass (copy) | Journey's song card: "When 16 bars or more are in and every bar is played at 85% or better…"; Trophies the same. No song was scored. |
| M19 Practice levels | partly → F10 | Levels match the curriculum, but nothing is left at level 6, so For you was empty above it (fixed). |
| M20 triplet weak spots | partly | Unit-tested; shuffle, half-time and swing lessons passed live, the weak-spot slots weren't inspected. |
| R2 per-note windows | pass | "Hi-hat 8th notes" (8ths beside 16ths) and "16th-note hi-hat" passed ★★★ for the Solid player. |
| R1, R2 graces, R4, R7 | unit only | 249 tests pass; nothing is wired into screens yet (as `docs/OVERNIGHT.md` says). |

## 3. Regressions (rounds 1–5)
| # | Fixed finding | Result | Evidence |
|---|---|---|---|
| 1, 8 | Stale coach line | pass | Every coach line matched its own take (coach log per take); no last-lesson debrief under a new take. |
| 2 | Sound-locked chip | pass | "🔈 Click or press any key to turn on the sound (a pad hit can't)" on every load until a key press. |
| 3 | Silent trade bars don't pass | pass | Trade bars with no answer strokes: "Once more, and fill your bars this time.", clean 0. |
| 4 | Fast track | pass | "Sit, hold, strike" ★★★ in 1 take (Solid). |
| 5 | Streak challenge done on first pass | pass | "Eight in a row" (2 steps) in 2 takes. |
| 6 | Counter hides after done | pass | No counter under "LESSON COMPLETE". |
| 7 | Midi Through hidden | pass | "No MIDI device — plug in the kit (keyboard works)". |
| 10 | Crosstalk on ghost notes | pass | Stage 5 "Ghost notes" passed with the emulated kit's crosstalk on. |
| 11 | Rank-up only once | pass | Each of the 7 ranks appeared exactly once in the Solid run; not re-tested with a leftover coach lesson. |
| 12 | Practice level after the path | **fail → fixed (F10)** | M19 regressed it; fixed and re-checked. |
| 13–18 | Round 6 fixes | pass, with F7 | Floor line, wait mode ("Nice and slow…", nothing saved), Fix bar honesty ("is getting there"), struggling read for wide spread (not triggered here, F6), finished-lesson next move. Fix 15 only worked on 1-bar charts (F7). |

## 4. Beginner run (profile A: Late 45, Jitter 40, Weak hand 60)
Stage 1 finished (Stick Rookie), Stage 2 one of three checkpoints; ~300 takes, ~140 minutes of playing.

| Route | Result |
|---|---|
| Rough take → −10 | ✓ 55 → 45 on 3/16 landed (player made later: Late 160, Jitter 150, Weak 30) |
| Two close misses → −5 | ✓ 60 → 55 "Let's take it to 55 BPM. Slower is how it sticks." |
| 40 floor → "Learn it slowly" | ✓ after F7; wait mode never passes (runs 84 → 84, progress unchanged) |
| "🔍 Fix bar N" and back | ✓ bar 2 looped at 45, ladder unchanged, "Bar 2 is getting there. Now the whole thing again at 55 BPM." While Fix bar is the main move there's no "▶ Again" (only Slower). |
| "Ask the coach for something different" | ✓ 20 s, "Hit with the click, not after it": 2 steps, smaller, a streak, kind focus. But see F5: it then dead-ended. |
| Coach tool switches | ✓ count (one-off, count aloud), layers (one lane), listen (no run saved), trade (as a coach step); ladder untouched each time |
| Live tips | ✓ on screen; 84/86 runs carry tips (dragging 83). Voice not checkable. |
| Student read new → struggling | ✗ stayed *steady* (F6) |
| No autoProbe while not flying | ✓ no "Find my tempo" in the whole Beginner run |
| Lesson takes | Sit hold strike 21, Echo game 6, Trade bars 2, Counting quarters 10, Eight in a row 2, Counting 8ths ★cp 10, Rests ★cp 20, Hi-hat pedal down 18, Kick drum 18, Accents 24, Hi-hat 8ths ★cp ~32; given up after 30: two coach timing lessons, **Single strokes ★cp**, **Hand and foot together ★cp** |

## 5. Solid run (profile A2: 8, 8, 95)
All 7 ranks, every lesson ★★★, about 70 takes (43 saved runs), checkpoints first. Per lesson mostly 2–4 takes (probe +
proving take); the money beat 8. After the path the Journey still offered a lesson (a review), 2-minute challenge and
Beat your best. Counters honest, verdicts never hidden, coach buttons real (M5), screen lines short (M6).

## 6. Real data (profile B)
- Old save loads: settings `v: 3`, the 2 coach-lesson progress entries and 38 runs are identical to the owner's
  `data/` (compared read-only). Nothing lost, no console errors.
- Journey: 210 words, 5 tiles; not crowded. Recap "Last week you played 18 minutes. Your notes landed 34% of the
  time." Theme "This week: landing behind the click" (true for this data). The show-off song card offers "Another One
  Bites the Dust: add its notes in Songs". Today's set: a coach lesson + "Your first jam".
- Songs (3 songs, tempo and drumless flags kept), Practice ("For you" at level 1–2) and Trophies all render.
- **F9** (fixed): the trail showed "✓ 5 done" for lessons never played.

## 7. Mockups (not approved; the owner decides)
Opened from Vite on 5181. Screenshots time out in this Chrome (as in every earlier run), so this is from the page text,
computed font sizes and a 390 px-wide check, not from looking at the screen.

| Mockup | From 1–2 m | Next step obvious? | Clutter / issues |
|---|---|---|---|
| `m11-journey-after` | The two hero lines are 30–34 px; tiles 18 px. Good. | Yes: "Next lesson: Hi-hat 8th notes ▶" is the big button, Jam second; end-of-path "🎯 Coach challenge ▶". | 368 words, but most are designer notes ("Today:… Change:…"), not app copy. The app copy itself is short. The hero line "That's today's set done, 24 minutes. On a roll? Next on your path: …" is 15 words: fine. |
| `m14-onboarding-setup` | Step titles 34 px; pad list 18 px. | Yes: one lit pad, "Tom 1 hit it now", and "No kit yet → keyboard" / "Skip". | **Scrolls sideways at 390 px** (the pad row). The latency step's "I'll correct for it" is true: `player.ts` ≈184/281 subtracts `latencyMs` from every hit. |
| `lesson-screen` | Coach line 34–40 px, numbers 22 px; R2/R4 explanation text 12–14 px is fine (designer notes). | Yes, the four moves stay. | The most crowded: a feel row with 6 numbers (landed, in a row, flams, grace gap, ratio, feel) under the coach line. From the throne one number + one word would read better; the rest in Details. "0.5 grace : main" means nothing to a beginner. |
| `journey` | Hero 30–34 px; "This week" line 20 px. | Yes: "Yes, let's go ▶". | Four new ideas at once (weekly focus, stage song ring, proven ranks, "Prove it" tiles). The "prove it on another day · 1 of 2" rank line is clear. A beginner may not know what "a bite of your stage song" is: say "8 bars of Steady Eight". |
| `self-check` | Diagram words 26–34 px. | Yes: hi-hat × 1 record, snare × 1 replay, Esc. | Clear privacy line ("Nothing is saved or sent"). Good, few words. |

## Findings

### F3 · major · M5 (and the M1 struggle path) · Fixed by tester: dbdc523
**After a step mid-lesson, the big button (and the kit's "yes") left the lesson.**
- Steps: profile A, Beginner preset. Coach lesson "Say it and play it: the 'and' game" (3 steps), opened from the
  path. Step 1 "Echo the 'ands'" passed (2 clean takes, 22/22).
- Expected: the verdict "Step done! Next: Non-stop 8ths", then ▶ Play starts step 2 (LEARNING.md: the lesson carries on).
- Actual: the coach's reply carried `action: { kind: 'next' }`, the natural answer to `stepDone`. The screen showed its
  line "Count '1 and 2 and' out loud as you play" and the main move became **"← Journey"** (inside today's set it would
  be "Next ▶" = the next lesson of the set). Steps 2–3 were left unplayed; hi-hat pedal × 3 / crash × 2 / "yes" do the
  same, because `padAction('yes')` runs the coach's action.
- Cause: `LessonPlayer.tsx:272` maps a coach `next` to `(onNext ?? onBack)()` (= next item), and `:304` puts it on the
  main button whenever the moment isn't "big". This existed on main too (the old "Next posture step" button of the open
  observations was the same path); M5 only made the label honest. Round 6's fix 18 covered "Lesson complete", not
  "Step done".
- Fix: after `stepDone`, a coach `next` is treated like a big moment: its action is dropped (its words stay), so the
  main move and the kit's "yes" are the app's own ▶ for the next step. "⏭ Skip to next" (ride × 2) is unchanged.
  `src/lesson/LessonPlayer.tsx` +3/−2 (`appMove`).
- Risk: none for other events; a coach `next` mid-step or after a finished lesson behaves as before.
- Verified: 248/248 tests, tsc clean, lint only `react-hooks/refs` (+3). In Chrome after a reload: coach lesson "Silent
  beat 3: your first rest", step 1 done; the coach's reply was `action {kind: 'next', label: 'Snare alone, rest on 3'}`
  (it also named the next step, which the prompt forbids); the main move stayed "▶ Again" and started step 2 inside the
  lesson (progress `step: 1`). Before the fix the same moment showed "← Journey".

### F4 · minor · not in the plan · not fixed
After "Step done! Next: X" the main button says **"▶ Again"** although it starts a new step. A beginner reads "again"
as "repeat what I just did". `LessonPlayer.tsx` ≈320 labels any move after a verdict "▶ Again". Suggest "▶ Next step"
when `outcome.event === 'stepDone'` (copy change, so left for the owner).

### F7 · major · M1 (round 6 fix 15) · Fixed by tester: abb2ed7
**At the 40 BPM floor the verdict said "Try Learn it slowly" but the big move was "🔍 Fix bar N".**
- Steps: profile A, "Sit, hold, strike" (2 bars), emulated kit Late 160, Jitter 150, Weak hand 30%. 55 → 45 (rough,
  3/16) → 40 (8/16) → 9/16 at 40: "Nice comebacks! This one is tricky. Try 'Learn it slowly': the music waits for each
  note."
- Actual: the main move (and hi-hat × 3 / "yes") was "🔍 Fix bar 2", which at the floor loops at `max(40, bpm − 10)` =
  40, the same tempo; no button said "Learn it slowly" (the 🐢 Slower move did start wait mode, but under another
  label). The student alternates Fix bar ↔ Again at 40.
- Cause: `LessonPlayer.tsx` ≈317–318 checks `outcome.fixBar` before `outcome.slowly`; round 6 fix 15 was checked on a
  1-bar chart, where `worstBars` gives no fix bar.
- Fix: check `slowly` before `fixBar` (2 lines swapped, one comment). `slowly` is only set at the floor with missed
  notes, so nothing else changes.
- Verified: tests 248/248, tsc clean, lint unchanged. Chrome after reload: same setup at 40 BPM → main move
  "🐢 Learn it slowly"; pressing it started wait mode (keyboard strokes, 16 notes) → "Nice and slow. When it feels easy,
  play it with the click.", runs 84 → 84 (nothing saved), progress unchanged.

### F11 · minor · M9 · Fixed by tester: b1d1c40
**Intro slides still came right after a tempo probe, so M9 didn't apply in practice.**
- Steps: profile A3, flying student (2 lessons ★★★). "Counting quarter notes" and "Hi-hat with the pedal down", both
  untouched: main move "🔍 Find my tempo".
- Actual: no slides before the probe; after "Your tempo today: 80 BPM." the next ▶ showed the 3 intro slides for the
  exercise just played (2 of 2).
- Cause: M9 (`LessonPlayer.tsx` ≈128–130) only updates `introShown` if the slides were already seen. The probe runs
  only on untouched steps (`canProbe` ≈266), where they never were, and probe bars bypass `play()`'s slide gate.
- Fix: "Find my tempo" goes through the same gate: unseen slides first, then the probe; the probe's finish then marks
  them seen at the new tempo (M9's line works as written). +5/−1, one file. The plan's "a first-time step still gets
  its slides" holds; they just come first.
- Verified: tests 249/249, tsc clean, lint unchanged. Chrome (5183/8793, fresh profile): "Counting quarter notes" and
  "The kick drum": slides before the probe ✓, none after ✓, lessons finished ★★★.

### F9 · major · not in the plan (step 6, real data) · Fixed by tester: 9f4d62f
**On the owner's real data the Journey trail said "✓ 5 done" for five lessons never played.**
- Steps: profile B (copy of `data/`: 2 coach lessons started, none finished, 38 runs). Journey → Stage 1 trail.
- Actual: "✓ 5 done | 🔥 Eight in a row | 🎯 From quarters to 8ths… | 🎯 Slow quarters… | ★ Counting 8th notes | ★ Rests
  are notes too | 🎵 Another One Bites the Dust". Settings: no lesson has `completedAt`. Sit-hold-strike, first jam,
  echo game, trade bars and counting quarters were folded as done and couldn't be opened from the trail.
- Cause: `Trail` (`src/lesson/TodayView.tsx` ≈262–264) folds *every* lesson before the current stop
  (`before.slice(0, -1)`), assuming the current one is the first unfinished. The hero is a coach lesson, which the
  planner puts first, so the built-ins before it in path order weren't finished. Existed on main.
- Fix: fold only finished lessons before the current stop; unfinished ones stay as normal stops. +2/−1 in one file.
- Risk: a long trail when many unfinished lessons sit before a coach lesson (11 stops here vs ~10 intended); no
  layout change.
- Verified: tests 248/248, tsc clean, lint unchanged (same 5 problems as main). Profile B after reload: "🎯 Sit, hold,
  strike | 🎸 Your first jam | 🔁 Echo game | 🤜 Trade bars | 🎯 Counting quarter notes | 🔥 Eight in a row | 🎯 From
  quarters to 8ths… | … | 🎵 Another One Bites the Dust".

### F5 · major (teaching) · M1 · not fixed (owner decision)
**A coach lesson can set a pass bar the beginner can't reach, and nothing changes for 30+ takes.**
- Steps: profile A, Beginner preset. The coach's "Land on the click: playing with the beat, not behind it", step 2
  "Rest on 2 and 4, right on time" with `pass.maxAbsOffsetMs 40`. The student is a steady ~45 ms late (16/16 landed
  every take, spread ~23 ms).
- Actual: 30 takes on the step (the autopilot's cap), tempo bouncing 65–75 ("Same tempo, once more" / "Let's take it
  to 65" / "Up to 75"), never passed. The live coach only speaks at step/lesson end, so it never saw the struggle.
  "Ask the coach for something different" (a small link, shown only after a failed take) is the only way out.
- Teacher's view: a lag this steady is most likely setup latency (the app's own hint says so on every take), which no
  practice fixes; a beginner would grind and blame themselves.
- Second case, worse: the coach's answer to "Ask the coach for something different" (20 s, "Hit with the click, not
  after it": 2 steps, 60→65 and an 8-in-a-row streak, a kind focus, so that route itself works) slid on dragging-only
  fails from 60 to the 40 BPM floor, then failed 30 takes in a row there: "All the notes are there. Dragging by 40.2 ms.
  Lock onto the click." Built-in lessons let the same ~45 ms lag through about half the time; at 40 BPM it never
  passed. The rescue lesson tests exactly what this student can't change, and slower made it worse. This is the
  strongest evidence for the implementer's question 1 (hold the tempo on a timing-only fail).
- Suggest: (a) after ~6 failed takes on one step, make "Ask the coach for something different" the main move or say
  it in the verdict; (b) coach lessons shouldn't use `maxAbsOffsetMs` until the latency test was run (as R4 plans for
  lay-back); (c) a timing-only fail holds the tempo (implementer's question 1).

### F6 · minor (teaching) · M1 (fix 17) · not fixed (owner decision)
**The student read stays *steady* for a student who needs ~19 takes per lesson.**
- Evidence: after 75 takes and 4 lessons (2★ each): `studentRead` = steady, accuracy 100%, spread 23 ms, comfortable
  70 BPM. With the Beginner preset almost every note lands (Good window 150 ms at levels 0–1), so neither the accuracy
  (< 75) nor the spread (> 40 ms) rule fires; the cost in takes isn't counted. So the M1 route "new → struggling" did
  not happen on a fresh profile with this preset (round 6 saw it on the owner's data, where accuracy is 34–75%).
- Suggest: count takes per finished lesson (or the share of failed takes) in `studentRead`; e.g. > 12 takes per lesson
  reads as struggling.

### F8 · minor · M15 · not fixed
**Two different coach lessons can share a title.** Profile A ended up with "Hit with the click, not after it" twice:
`…-9738t` (level 0, the "something different" answer, 60→65 / 60→70) and `…-gl4hr` (level 1, 70→80 / 65→75 /
70→90). M15 checks built-in titles (`uniqueTitle`, `server/index.ts:334`); the coach-vs-coach check (`:336`) only
looks at the same level. A student seeing the same name in Stage 2 thinks "I already did this one". Suggest: pass the
coach lessons' titles into `uniqueTitle` as well (one line), so a repeat gets the focus appended.

### F1 · major (teaching) · M1 · not fixed (owner decision)
**A beginner whose only fault is uneven volume is slowed down for it, and the Stage 2 checkpoint "Single strokes"
becomes a dead end.**
- Dead end: the "Single strokes" checkpoint (Stage 2). Every take landed every note; the only reason was "Volume
  varies by ~25%". Volume-only fails walked the tempo down to the 40 BPM floor, then 30 takes there never passed ("All
  the notes are there. Volume varies by 25.2%. Aim for every stroke the same height."). With the plan's own Beginner
  preset the Limb Wrangler rank can't be earned, which breaks the plan's "a Beginner player's path never dead-ends".
  (The emulated weak hand is a fixed 60% velocity, harsher than a real student who improves, but the app's response,
  slowing down, is the same either way.)
- Steps: profile A, Beginner preset (weak hand 60%), "Sit, hold, strike" (alternating R L on the snare).
- Actual: 21 takes to finish (2★). Every take landed 32/32 (or 16/16), ~45 ms late; every fail was "Volume varies by
  ~25%". Fails alternate with clean takes, so "Clean take (1/2)" is followed by "Same tempo, once more. You are close."
  9 times; twice two fails in a row slowed it to 55, then 50 BPM, though tempo doesn't fix a weak hand. The coach is
  only asked at step/lesson end (by design since 4d2d91e), so nothing changes tool during the 21 takes; "Ask the coach
  for something different" is the only route and it's a small link.
- Expected (teacher): after 3–4 volume-only fails, name the hand ("your left hand is softer: lift it as high as the
  right") and hold the tempo; or offer the "something different" route as the main move.
- Same family as the implementer's open question 1 (a timing-only fail slows the tempo). Suggest: a fail whose only
  reason is evenness or timing holds the tempo. Not changed: it's a teaching rule.

### F2 · minor · not in the plan · not fixed
**The "Monday recap" fires on the first day of a fresh profile and calls today "last week".**
- Steps: profile A, after the first two lessons (12 minutes), back on Journey.
- Actual: "📅 Last week you played 12 minutes. Your notes landed 100% of the time. This week, one small thing at a
  time." All 12 minutes were played today. "landed 100%" is true for notes, but every second take failed.
- Cause: `TodayView.tsx` ≈49 shows `weekRecap(dash)` on the first Journey visit of an ISO week with any playing, and
  `minutesWeek` is the last 7 days including today (`progress.ts` ≈166). Existed on main.
- Suggested fix: only when there are runs from before this ISO week (or before today); wording "This week so far…"
  otherwise.

## The teacher's view
**Strong student:** a joy. Every lesson ★★★ in 2–4 takes, the probe skips the slow climb, ranks come with "You can…"
lists, the coach's screen lines are now short and in plain words, records and rank-ups keep their moment. The whole
path takes about 25 minutes of playing, which is the curriculum's depth (R3), not the student.

**Beginner (the owner):** encouraging and never rude, but not yet "never stuck".
- What a beginner feels: warm lines ("Nice comebacks!", "Slower is how it sticks"), honest Fix bar, a real wait mode,
  and a coach that writes kind, smaller lessons when asked. Good.
- What hurts: the same "Same tempo, once more. You are close." 9–12 times in a row; the tempo walking down to 40 for a
  fault that tempo can't fix (uneven hands, a steady lag that is probably setup latency); two checkpoints and two coach
  lessons where 30 takes changed nothing. A real teacher would stop after 4–5 tries, name the hand or the lag, and change
  the exercise. The app has every tool for that (count, layers, trade, listen, wait mode, "something different"), but
  between takes nobody reaches for them: the coach only speaks at step end and the help link is small.
- What's missing for the owner specifically: the latency check as a real onboarding step (M14's mockup), because a
  steady 45 ms lag reads as "dragging" everywhere and is the root of most of the Beginner run's fails.

**Suggested next changes (owner decisions):**
1. Timing-only and volume-only fails hold the tempo instead of slowing (question 1); name the cause in the verdict
   ("your left hand is softer", "everything is 45 ms late: run the latency test").
2. After ~5 failed takes on one step, the big move becomes a tool switch or "Ask the coach for something different".
3. The student read counts takes per lesson (F6).
4. Build M14's setup step (latency first) and M11.

## Scores (plan section 1), before vs now
| Area | Before (plan) | Plan's "after must go" | Now (this run) | Why |
|---|---|---|---|---|
| Timing scoring | 8.5 | 8.5 | 8.5 | Per-note windows work; crosstalk filter held. |
| Teaching methods | 8 | 8 | 7.5 | The tools are there, but a struggling student isn't moved to them (F1, F5). |
| At-the-kit UX | 8 | 8.5 | 8.5 | Short coach lines, verdicts stay, big moments kept; F3 and F7 fixed the two wrong big moves. |
| Reliability | 6 | 8 | 7.5 | 4 real bugs found in one run (all fixed), 3 of them older than this branch. |
| AI coach: words | 7 | 8 | 8 | Short `show`, plain words, honest about new steps, no invented buttons. Still names the next step in its label (the app relabels it). |
| AI coach: planning, personalisation | 5 | 6 | 5.5 | Sonnet writes kind, targeted lessons; but it set a pass bar the student can't meet (F5), and the read misses a struggle (F6). |
| Onboarding and setup | 5 | 7.5 | 5.5 | Only M14's bug part is in; the setup step waits for its mockup. |
| Curriculum depth | 4 | 4 | 4 | Unchanged (R3). |
| Songs and real music | 5 | 5.5 | 5 | M18 copy in; songs not exercised (no band yet). |
| Musicality and feel | 3 | 3 | 3 | R4 engine only. |
| Technique | 2 | 2 | 2 | R5 not started. |
| Motivation | 7 | 7.5 | 7.5 | Records and rank-ups keep their moment; a struggling student's grind pulls it down. |
| **Overall, as a drum teacher** | **6** | **6.5** | **6.5** (strong student 7, struggling beginner 5.5) | |

## Check on the laptop / at the kit (owner)
1. The M2 checklist in `docs/PLAYTEST.md`, **latency first** (part A): this run says a steady lag is the main
   beginner trap.
2. Glance at one probing step from the throne: the intro slides now come before "Find my tempo" (F11).
3. Spoken tips and coach voice from the throne (Piper), and talk-back (microphone).
4. Song audio / tab capture and "Ask again" on a song groove (M17).
5. Hi-hat pedal × 3 / crash × 2 after "Step done" now starts the next step (F3) and at 40 BPM starts wait mode (F7).
6. The 5 mockups (section 7).
