# How Drum Coach teaches

The owner is an adult learning drums as a first instrument, with mixed music goals and 20–30
minutes a day. The app should feel like a patient teacher: it decides what to practise today,
explains why, demonstrates, listens, and moves the tempo for you. This file is the pedagogy the
code follows. Lesson content lives in `src/content/curriculum.ts`.

## What an adult beginner has to learn
1. **Setup and body.** Throne height, pad placement, posture, matched grip and fulcrum, letting the
   stick rebound, relaxed wrists, heel-up and heel-down kick, hi-hat pedal control, warm-ups,
   hearing and wrist safety. On this e-kit the hi-hat pad sends *open* (46) unless the pedal is
   held down, so "pedal down" is a habit to build from day one.
2. **Rhythm literacy.** This is the biggest gap without any music background: pulse, tempo,
   counting out loud (1 2 3 4, 1 & 2 &, 1 e & a), quarter, 8th, 16th and triplet notes, rests,
   4/4 then 6/8, straight versus swung feel, rushing versus dragging.
3. **Limb independence.** Build a groove one limb at a time (hi-hat, then kick, then snare).
   Later, ostinatos and four-way coordination.
4. **Rudiments.** Single strokes, double strokes, the paradiddle, flam, drag and buzz. About eight
   cover a beginner.
5. **Grooves.** The money beat and its variations, kick on the and-of-3, 16th hi-hats, open
   hi-hats, ride grooves, half-time, shuffle, basic funk, 6/8, the jazz ride pattern.
6. **Fills and phrasing.** 8th and 16th fills around the toms, crash on 1, 4- and 8-bar phrases.
7. **Dynamics.** Even volume, accents, ghost notes. The kit reports velocity, so this is measurable.
8. **Reading.** Basic notation is optional, but adults like to see structure.
9. **Musicality and songs.** Song form, playing along to music early.
10. **Practice skills and mindset.** Short daily practice beats one long weekly session. Go slow,
    get it right, then go faster. Isolate the hard bar. Use the metronome, including a gap click.
    Review old material. Measure instead of guessing. Expect plateaus. Adults want the *why*,
    and need quick wins in week one.

## Teaching methods the app uses
| Method | How the app does it |
|---|---|
| Layered groove building | A lesson step lists its `activeLanes`. The app plays the other lanes, so you learn hi-hat alone, then add kick, then snare. |
| Demo first | Every step has **Hear it**: the app plays the whole pattern at your tempo. |
| Count out loud | A one-bar count-in, and big beat numbers on the highway for the counting lessons. |
| Tempo ladder | Two clean takes → +5 BPM until the step's target. A rough take (< 60% landed) → −10 BPM at once; two close misses → −5. The floor is 40 BPM, below the step's start if needed; after easing off, one clean take climbs +10. At the floor: "Learn it slowly" (wait mode). |
| Sweet spot, not an exam | The pass bar grows with the stage (`passFor`): 75% at levels 0–1, 80% at 2–3, 85% at 4–5, 90% at 6; stray strokes barely count early on, and the Good window is 150 ms at levels 0–1. Takes are 4 bars (8 for the proving take). Feedback leads with what went right: notes landed, best run in a row, comebacks after a miss, better than last take. |
| Coach toolbox | A step is a drill (default), a `jam` (any take counts), a `copy` (call and response: notes marked `auto` are played by the app) or a challenge (`pass.streak`, N in a row). The coach mixes them and switches tool when you struggle. |
| Zoom in | After a missed take, "Fix bar N" loops the stickiest bar (`worstBars`) 4 times, 10 BPM slower, with the app playing softly underneath. Practice only: no ladder. The live coach can offer it (`action.kind: 'zoom'`). |
| Layers | A step's `layers` lists lanes from one limb to the full groove; each clean take adds the next layer at the same tempo (`layerUp`), then the tempo ladder runs on the full groove. A fail never removes a layer. |
| Free bars and trade bars | `freeBars` makes some bars yours (no notes, any fill); `trade` is call and response where every answer bar is free. Free bars are scored on the 8th-note grid (`freeBarStats`, "on the beat %"), their strokes aren't extras, and any take counts unless the step sets `pass`. |
| Listen back | "Hear your take" plays your own hits at their real times (`takeChart`, extras included) with the click, then "Hear it right" plays the chart. Hearing the difference, not only seeing it. |
| Count with me | `countAloud` makes the coach's voice count during the take ("1 2 3 4" or "1 & 2 &"), fading to only "one" after 4 bars (`countPlan`) so the student takes over. Needs the Piper voice (the words are pre-rendered). |
| Song bite | A step's `bite` names 1–8 bars of a saved song (`yt_songs` with notes); the server cuts the chart from the song's notes (`applyBites`), so it practises offline on the app's drums. "Play it with the song" opens Songs → Play on those bars. |
| Beat your best and badges | Journey's set ends with a "Beat your best" tile: one take of a finished lesson you haven't played for longest, 5 BPM above your best (a streak challenge: 4 more in a row). A pass is a NEW RECORD. Badges (`BADGES`, `earnedBadges`) are earned from runs and progress, announced once on Journey and shown on the trophy shelf. |
| Song project | Each stage starts with "Pick your song for this stage" (the coach suggests 3 real songs for the stage's skills); the pick is `Profile.song`. Journey shows how many of its bars are ready (`barsReady`: bars played at 85%+ in any take), the trail ends at it, and the coach's song bites come from it. Every bar ready makes it a show-off song on Trophies. Ranks still come from the checkpoints. |
| Lesson screen at the kit | Built to be read from the throne with sticks in hand: one big coach line (the live coach's own words when it answered), four moves with their kit gestures (hi-hat pedal × 3 or crash × 2 = the main move, tom 2 × 2 = listen, floor × 2 = slower, ride × 2 = next), big sheet music and three result numbers. Hints (key H to toggle) put the count and the hand or foot under every note (`noteHints`); while playing only the music, one big live hint and Stop show. |
| Specific feedback, one fix | After each take, one friendly line and at most one tip. The AI coach is one click away. |
| Gap click | Later steps silence the click every other bar, so you keep time on your own. |
| Spaced review | A finished lesson comes back after 2, 5, 12 and 30 days. Failing a review resets it to 1 day. |
| Interleaving | A day's session is warm-up, review, one new skill and one groove or song. It isn't 30 minutes of one thing. |
| Daily plan, not a menu | The **Journey** tab builds the session from your progress. You press Start. |
| Progress you can see | Path map by level, BPM per lesson, streak and minutes. |
| Expectations | Each lesson says what it is, why it matters, how to play it, and what passing means. |

Distilled from common beginner methods: levelled courses (technique, timing, independence,
musicality), scored play-along apps, the Stick Control and Syncopation drill books, and
groove-essentials-style play-along libraries.

## Milestones are fixed, lessons are curated for you
The path is a fixed list of **milestones** (`MILESTONES` in `src/content/curriculum.ts`). Each says
what you can do when you reach it, and names **checkpoint** lessons that prove it. Pass every
checkpoint and you move on. A coach lesson may stand in for one checkpoint: it names it (`checkpoint`, checked
against the stage), its last step reaches the checkpoint's tempo, and finishing it passes that checkpoint.

The lessons *between* checkpoints are chosen per student. The AI coach (`POST /api/coach/lesson`,
prompt in `server/prompts/lesson.md`) reads your recent takes, your progress and the milestone, and
writes the next lesson aimed at your weakest skill, with a one-line "why this, for you", mixing its tools
(jam, copy, challenge, drill). After a rough take you can ask it for something different: smaller and easier,
with a different tool. A new coach lesson replaces its unstarted ones for that stage, so they don't pile up. Coach lessons are validated with
zod, stored in SQLite and preferred by the daily planner. The built-in lessons are the offline
fallback and the examples the coach is shown.

## Accomplishment: stars, ranks and show-off songs

Learning should feel like a journey with a win at every step, and the best win for a beginner is playing a real
song for friends.

- **Stars per lesson** (`starsFor` in `src/engine/lesson.ts`), from the take that completes it, best kept:
  ★ passed · ★★ ≥95% on time and ≤5% extra hits · ★★★ ≥98%, ≤2% extra, ≥70% perfect and spread ≤15 ms.
  The coach sees stars: 1 star means shaky, so strengthening it beats a new topic.
- **Celebration** after every finished lesson: stars, a drum fill, progress to the next rank, one Next button.
- **Ranks**: each milestone has a title (`rank` in `MILESTONES`), earned when its checkpoints pass:
  Stick Rookie, Limb Wrangler, Groove Keeper, Fill Maker, Dynamics Boss, Triplet Traveller, Swing Cat.
  Ranks stay on the built-in checkpoints so they work offline (a coach stand-in marks the built-in checkpoint passed).
- **Show-off song**: each rank unlocks real songs the coach picks for the stage's skills (`/api/coach/showoff`).
  You learn one in Songs; played scored at 85%+ it joins your show-off set, playable in Stage mode.
- **The coach builds the path** inside the fixed stages: after every finished lesson it writes the next one in
  the background, and Journey's Next up offers it first.

## Curriculum shape
Levels 0–6, one milestone each. Untagged lessons are the core path. Lessons tagged `rock`, `funk` or `jazz` appear only
if that goal was picked during onboarding; picking none means "not sure yet" and shows everything.

| Level | Theme |
|---|---|
| 0 | Setup, posture, counting quarters and 8ths |
| 1 | One limb at a time; single strokes and accents |
| 2 | The money beat, built layer by layer; double strokes; four on the floor; first song |
| 3 | Kick variations, open hi-hat, crash phrasing, first fills, a rock song |
| 4 | 16ths, paradiddle, ghost notes, open-hat grooves, ride groove |
| 5 | Triplets, shuffle, half-time, funk, 6/8, a shuffle song |
| 6 | Jazz ride, feathered kick, comping, a swing tune |

Songs are written "in the style of" and played by the built-in synth. No copyrighted audio ships.
Real songs come in through the Songs tab: search YouTube, set the tempo, learn the part by ear (with suggested notes
and sheet music), jam along or play it scored with the drumless version. MIDI + audio import is still there too.

## Rules of thumb in the code
- Pass criteria come from the lesson's level (`passFor`: 75–90% accuracy, 40–15% extra hits); a step can relax them but not tighten them. A step can add a timing limit
  (|mean offset|), a consistency limit (spread, std dev of offsets), a hand–foot flam limit, a velocity-evenness
  limit (CV %), a weak-second-double limit or a ghost-to-accent volume ratio. Every checkpoint's last step limits
  spread (40 ms at levels 0–2, 30 at 3–4, 25 at 5–6): averaging on time isn't enough, each hit has to be.
- A take is 4 bars; the proving take (last step at its target tempo) and copy-me takes are 8.
- Good is ±100 ms (±150 at levels 0–1; Perfect ±40), shrunk to 40% of the closest gap between notes on one drum, so fast 16ths are judged
  tighter.
- Keyboard timing is 10–30 ms late, so expect *Good* rather than *Perfect*. Never calibrate latency
  from the keyboard. Ghost-note checks need the real kit.
- Wait mode is for learning the pattern only; it never counts as a pass.
