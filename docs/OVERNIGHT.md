# Overnight run, 2026-10-25 → 26

Branch: `claude/plan-phase1-2026-10-25` (worktree `.claude/worktrees/plan-phase1`). Plan: `docs/PLAN.md` /
`~/.claude/plans/plan-all-the-change-purrfect-flamingo.md`.

## Questions for the owner
1. **A take where every note landed but the timing failed slows the tempo (−5, down to 40).** Slower makes staying
   with the click harder, not easier. Should a timing-only fail *hold* the tempo instead (and give the timing tip)?
   *I'd recommend: hold the tempo for timing-only fails, slow down only for missed notes.* Waiting: a small ladder
   change in `src/engine/lesson.ts` (`ladderStep`) plus `docs/LEARNING.md`.
2. **Level 0–1 lets a take ~90 ms late pass** (Good is ±150 ms) while the live tip says "play with the click, not after
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
