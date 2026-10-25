# Gentle coach: practice is play, not an exam

## Why
Playing the first lessons as a beginner (about 1 note in 8 missed, ±45 ms of wobble) failed every take at 77–86%
with "Not yet, 90% needed". The tempo couldn't drop (start = target), and "fix this" got the same drill 4 BPM slower.
The coach had written 9 near-identical "count the 8ths" lessons, and Journey showed three different "next" buttons.
The owner said this makes them lose motivation. Goal: they enjoy the drums while learning and never feel they are failing a test.

## What changes
1. **Relaxed criteria by stage** (`passFor` in `src/engine/lesson.ts`): accuracy needed 75% at levels 0–1, 80% at 2–3,
   85% at 4–5, 90% at 6. Extra hits mostly ignored early (40% at levels 0–1, 25% at 2–3, then 15%). A coach lesson
   can't be stricter than its level. The Good window is 150 ms at levels 0–1 (100 ms after that).
2. **Adaptive tempo** (`ladderStep`): a rough take (< 60% landed) drops 10 BPM at once; two close misses drop 5.
   The floor is 40 BPM, not the step's start tempo. Below the start tempo one clean take climbs 10 BPM.
   At the floor the app offers wait mode ("learn it slowly").
3. **Short takes**: 4 bars (8 for the proving take), down from 8 and 16.
4. **Gentle feedback**: the headline is what went right ("26 of 32 notes landed, best run 11 in a row, better than
   last take") plus the next move. No "Not yet" or "needed". Recoveries (a hit straight after a miss) are counted
   as a win.
5. **Coach toolbox**: a step can use a tool the app runs:
   - `jam`: play along, any full take counts. For fun and grooves.
   - `copy`: call and response. The app plays a bar, you echo it (notes marked `auto` are played by the app).
   - `pass.streak`: a mini challenge, "N notes in a row". The streak replaces the accuracy bar.
   - default: the drill with the tempo ladder.
   The prompt tells the coach to mix tools, and to switch tool and simplify when the student struggles instead of
   repeating the drill. A new coach lesson retires the coach's unstarted lessons for that level, so they don't pile up.
   Built-in level 0 gains a jam and an echo game, so day one is fun offline too.
6. **Calm Journey**: one Play next (today's first open item), today's mix, one progress line (notes landed this week
   against last week). The coach's lesson list, weekly plan, full path and reset move under one "More" fold.

## Not doing (yet)
Song bites as a separate tool (song lessons and the Songs tab already exist), music backing beyond the app's drums,
an "OK" judgement tier separate from Good.
