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
| Backing band | Grooves, songs and fills play with a synth bass and keys (`engine/band.ts`): the bass lands on every kick, keys by style (rock pads, funk stabs on the &s, shuffle stabs on 2 and 4, swing Charleston, 6/8 dotted pads), chords per bar from the lesson (the built-in songs have their own; Roadhouse Shuffle is a 12-bar blues). Free bars get one hit, then they're yours; the band goes quiet with the gap click and fades with the click. Off for counting, rudiments, find-your-tempo and rests. 🎸 Band toggle (key B); volume under Setup → Sound check. |
| How it moves | Technique you can see (`content/demos.ts`, drawn by `ui/TechniqueDemo.tsx` and, for the grip and the kick, the close-ups in `ui/demoArt.ts`): an animated arm and hand (shoulder, elbow, wrist, the thumb-and-index fulcrum, the back fingers moving with the stick), the grip from the thumb side and from above (the butt end behind the hand, tip shadows), or the foot on a real kick pedal heel down or heel up (heel up from the money-beat stage on), at the lesson's tempo, with a cm ruler, the tip's path, slow motion and "✗ Wrong" showing the usual mistake (squeezing, same-height accents, two wrist strokes for a double, flat flams, a buried beater). Shown on the lesson card, as a 4th intro slide and in "look" steps (watch, then done). "📷 Check yourself" (key C) opens the camera as a mirror next to it, with a 10-second replay (hi-hat × 1 records, snare × 1 replays); nothing is saved or sent. The app can't judge technique; it helps you see it. |
| Feel | A step can ask for a feel (`engine/feel.ts`): a swing range (where the & lands between beats: 50% straight, 67% triplet swing), volume that follows the sheet's p / mf / f marks (correlated bar by bar, each drum against its own mean), or playing behind the beat on purpose (`offsetTarget`; then the live coach says "Lay back" instead of "Dragging. Push"). The result shows the feel next to the notes landed. "Straight or swung?" (stage 6) plays the same 8ths both ways. |
| Reading | "Read the rhythm" (stage 1), "Read 16ths" (stage 5) and "Read triplets" (stage 6): rhythm cards on the snare, a different card each take (`variants`), shown without the count and hand hints (`read` steps), so the student reads instead of copying. |
| Ear training | Listening games answered from the kit (`lesson/EarQuiz.tsx`, `engine/earQuiz.ts`): "Steady or rushed?" (stage 1: the bar twice, one rushing) and "Where's the kick?" (stage 3: which of three kick lines). Hi-hat / snare / floor × 1 (or keys 1–3) answer, tom 2 × 1 plays it again; four rounds, then you play it yourself. |
| Health and habits | Every day's set opens with a 2-minute stretch (wrists, forearms, shoulders). After about 22 minutes of playing in one sitting the big move becomes "☕ 2-minute break". Journey gives practice-length advice (no marathon first week, a nudge after an hour), a weekly ear-safety tip, and once a week asks "anything sore?": "a bit sore" gives 3 lighter days (a short set, no record attempts) and tells the coach, which writes lighter lessons and plans. |
| Demo first | Every step has **Hear it**: the app plays the whole pattern at your tempo. |
| Count out loud | A one-bar count-in, and big beat numbers on the highway for the counting lessons. |
| Tempo ladder | Two clean takes → +5 BPM until the step's target (one ★★★-quality take counts as both, and a streak challenge is done on its first pass). A rough take (< 60% landed) → −10 BPM at once; two close misses → −5. When every note landed and only the timing or volume failed, the tempo holds and the line names the fix (slower doesn't fix timing). The floor is 40 BPM, below the step's start if needed; after easing off, one clean take climbs +10. At the floor: "Learn it slowly" (wait mode). |
| Stuck on a step | A teacher changes the approach instead of saying "again": `LessonProgress.stuck` counts failed takes in a row on a step (also when the tempo holds). After 3 the big move changes (`stuckMove`): a steady rushing/dragging fault with no saved latency test opens the latency test in the lesson (it's usually the setup); otherwise count along (timing) or "hear mine, then the right way"; from 5 the coach writes something different. The verdict says why in plain words. |
| Sweet spot, not an exam | The pass bar grows with the stage (`passFor`): 75% at levels 0–1, 80% at 2–3, 85% at 4–5, 90% from 6; stray strokes barely count early on, and the Good window is 150 ms at levels 0–1 (a pass more than 50 ms off the click still hears "A touch late: lean into the click"). Takes are 4 bars (8 for the proving take). Feedback leads with what went right: notes landed, best run in a row, comebacks after a miss, better than last take. |
| Coach toolbox | A step is a drill (default), a `jam` (any take counts), a `copy` (call and response: notes marked `auto` are played by the app) or a challenge (`pass.streak`, N in a row). The coach mixes them and switches tool when you struggle. |
| Zoom in | After a missed take, "Fix bar N" loops the stickiest bar (`worstBars`) 4 times, 10 BPM slower, with the app playing softly underneath. Practice only: no ladder. The live coach can offer it (`action.kind: 'zoom'`). |
| Layers | A step's `layers` lists lanes from one limb to the full groove; each clean take adds the next layer at the same tempo (`layerUp`), then the tempo ladder runs on the full groove. A fail never removes a layer. |
| Free bars and trade bars | `freeBars` makes some bars yours (no notes, any fill); `trade` is call and response where every answer bar is free. Free bars are scored on the 8th-note grid (`freeBarStats`, "on the beat %"), their strokes aren't extras, and any take counts unless the step sets `pass`, as long as you played something in them. A take that is only your own bars gets its stars from staying on the beat (`freeStars`) and is saved like any take. |
| Listen back | "Hear your take" plays your own hits at their real times (`takeChart`, extras included) with the click, then "Hear it right" plays the chart. Hearing the difference, not only seeing it. |
| Count with me | `countAloud` makes the coach's voice count during the take ("1 2 3 4" or "1 & 2 &"), fading to only "one" after 4 bars (`countPlan`) so the student takes over. Needs the Piper voice (the words are pre-rendered). |
| Song bite | A step's `bite` names 1–8 bars of a saved song (`yt_songs` with notes); the server cuts the chart from the song's notes (`applyBites`), so it practises offline on the app's drums. "Play it with the song" opens Songs → Play on those bars. |
| Beat your best and badges | Journey's set ends with a "Beat your best" tile: one take of a finished lesson you haven't played for longest, 5 BPM above your best (a streak challenge: 4 more in a row). A pass is a NEW RECORD. Badges (`BADGES`, `earnedBadges`) are earned from runs and progress, announced once on Journey and shown on the trophy shelf. |
| Song project | Each stage starts with "Pick your song for this stage" (the coach suggests 3 real songs for the stage's skills); the pick is `Profile.song`. Journey shows how many of its bars are ready (`barsReady`: bars played at 85%+ in any take), the trail ends at it, and the coach's song bites come from it. Every bar ready makes it a show-off song on Progress. Ranks still come from the checkpoints. |
| Lesson screen at the kit | Built to be read from the throne with sticks in hand: one big coach line (the live coach's own words when it answered), four moves with their kit gestures (hi-hat pedal × 3 or crash × 2 = the main move, tom 2 × 2 = listen, floor × 2 = slower, ride × 2 = next), big sheet music and three result numbers. Hints (key H to toggle) put the count and the hand or foot under every note (`noteHints`); while playing only the music, one big live hint and Stop show. |
| Practice at the kit | Choose before you sit down ("For you": played lately, the coach's drills, a warm-up, your level and a step up; tabs and search), then play from the kit with the same moves: yes = the next sensible step (`suggestNext`: two clean → +5 BPM, rough → −10; a rough last time starts 10 BPM lower), floor / tom 1 = 5 BPM slower / faster, ride = next exercise. The result shows on the screen; the full results page is under "details and history". For a struggling student "For you" offers no step up, and a never-played chart starts at their comfortable tempo (`practiceStart`). |
| Intro slides | Before the first take of an exercise, step or layer (or after a tempo jump of more than 10 BPM): what to play, who plays what (`limbPlan`: each limb, its drums and when), and the first bar counted with the limbs and one thing to focus on. One hi-hat hit goes forward, one snare hit back; forward on the last slide starts the count-in. Other gestures are ignored while they're up. Switch: Practice → How it plays. |
| Switch tools by voice | Inside a lesson the live coach can offer one take in another tool (`trade`, `count`, `layers`, `listen`); yes or a tap runs it (`PlayOptions.oneOff`), the verdict is "one for fun" and the tempo ladder doesn't move. |
| Weekly plan from your coach | On the first Journey visit of a week the coach writes the week's plan from a student profile (`engine/profile.ts`, last 28 days: each drum's accuracy and lateness with a trend, the tips given most, minutes per tool, songs, the weakest drum), the stage and last week's notes: one focus ("This week: …" with a why), up to 6 lessons that lead each day's set (`buildSession` focus ids: an open one leads, a finished one is the review), and a notebook it reads next week. The lesson writer and the live coach are told the focus. Falls back to "This week's thing". |
| This week's thing | Journey names the live tip given most in the last 7 days (3+ times, `weekTheme`) as the habit to work on, with "lesson for this": the coach writes a lesson aimed at it. Runs keep their tip ids (`tipIds` in the summary). |
| Stitch the song | When every bar of the stage's song is ready, Journey offers "Play *song* all the way through": a lesson built on the fly (`stitchLesson`, chart = `songChart`) from 75% of the song's tempo up to it, played through once per take. Finishing it offers "Now with the real song →" (Songs → Play). |
| Your fills | After a take with free bars, each one you filled (2+ strokes) can be kept ("Keep fill N", `fillFromTake` snaps it to 16ths). Kept fills (last 20, `Settings.fills`) are on Progress (Coming up) with "Hear it", and free-bar lessons offer "Hear one of your fills". |
| Flow mode | Journey's "🌊 Flow" opens the stage's jam groove in flow: it loops until Stop (Esc or 4 crashes, which keeps the take), the click fades to silence over 8 bars (`fadeClick`), a live line shows the last 4 bars (`recentAccuracy`), and the verdict is just how many bars you flowed. No ladder. |
| Step options | `fadeClick` (the click fades out over N bars; the verdict says in words whether the tempo held, `takeDrift`), `clickOn` ("2and4" backbeat click or "8ths", `clickOnBeat`), `variants` (a different phrase each take, `pickVariant`), `bars` (a long stamina take), `rest` (a countdown with one body tip; "done" moves on). Built in: "The money beat" ends with a 2-and-4 click, "Steady Eight" fades the click after 4 bars. |
| Find your tempo | A `probe` step plays 1-bar takes from `bpm.start`, 5 BPM faster after each clean bar, until one falls apart; the working tempo is 10 below it (`probeTempo`). |
| 2-minute challenge | Journey offers a finished groove for 2 minutes at your best tempo (`seconds` on an endless take); the score is clean bars (no miss, no extra: `cleanBars`), best kept per lesson (`Settings.arcade`). |
| Autopilot | Setup → Coach: after each verdict the main move starts by itself in 5 seconds; any pad hit waits. Off by default. |
| Monday recap | On the first Journey visit of an ISO week, the coach says and shows three plain sentences about the last 7 days (`weekRecap`: minutes, notes landed against the week before, the newest badge). |
| Specific feedback, one fix | After each take, one friendly line and at most one tip. The AI coach is one click away. |
| Gap click | Some steps silence the click every other bar, so you keep time on your own ("Hi-hat 8th notes"; "The money beat" now ends with a 2-and-4 click instead). |
| Spaced review | A finished lesson comes back after 2, 5, 12 and 30 days. Failing a review resets it to 1 day. |
| Interleaving | A day's session is warm-up, review, one new skill and one groove or song. It isn't 30 minutes of one thing. |
| Daily plan, not a menu | The **Journey** tab builds the session from your progress. You press Start. |
| Say it, then play it | With hints on, quarter and 8th charts show every 8th of the count under the notes, big; the syllables you say but don't play are blue, so "say the &, don't play it" is on the page, not only in the text. |
| See the beat coming | During a take (hints on) a ball bounces along the count and lands on each number with the click, top of its bounce on the "&". For the beginner who waits to hear the click and then hits (takes that all land about 0.1 s late). |
| The goal before the take | Under the sheet: boxes for the clean takes and what "clean" means in notes ("12 of 16 notes land, and on average no more than a hair (40 ms) off the click"), what happens then (the tempo goes up to 45, the step is done), and a mini kit with your pads lighting on each hit. |
| Results on the notes | After a take each note of its last round says on it / late / early / missed in its colour, extra hits get an ×, and a timing line shows every hit against the click (`engine/takeMarks.ts`). A steady lean to one side is the pattern to see: the same lag on every note is usually latency, and Setup marks the latency check "do this first" when your last takes all lean late (`lateTakes`). |
| Practice with a ladder | Practice's **Climb** (off by default): two clean takes at a tempo move it up 5, until 5 above your best clean tempo. The **warm-up** chains a few short exercises (your last one and the For you picks) at their start tempos, about a minute each, no slides. |
| Progress you can see | Progress shows notes landed per day you played with the coach's plain line ("Saturday 1 in 13 notes landed. Sunday 4 in 10."), the week against your daily goal, the skill map in three groups, trophies with how far each one is (`badgeProgress`), and your lessons in plain words. |
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

**The coach teaches the student the evidence shows.** `studentRead` (`src/engine/planner.ts`) sums up the last 4
finished lessons' stars and the last 12 takes as a pace: *new*, *struggling* (takes under 75%, a spread wider than 40 ms, or mostly 1 star),
*steady*, or *flying* (★★★ lessons, takes 95%+ with spread ≤ 20 ms), plus the tempo they own (`comfortableBpm`). Both
the lesson writer and the live coach get it; "adult beginner" is only the assumption while there's no data. A flying
student gets no lessons in between: the stage's checkpoints come first in the plan and the coach isn't asked for filler.
A coach lesson stands in for a checkpoint only if its last step plays it (`standsInFor`): the checkpoint's target
tempo and at least its notes per bar on each of its drums.

## Accomplishment: stars, ranks and show-off songs

Learning should feel like a journey with a win at every step, and the best win for a beginner is playing a real
song for friends.

- **Stars per lesson** (`starsFor` in `src/engine/lesson.ts`), from the take that completes it, best kept:
  ★ passed · ★★ ≥95% on time and ≤5% extra hits · ★★★ ≥98%, ≤2% extra, ≥70% perfect and spread ≤15 ms.
  The coach sees stars: 1 star means shaky, so strengthening it beats a new topic.
- **Celebration** after every finished lesson: stars, a drum fill, progress to the next rank, one Next button. Playing a finished lesson
  through again says "Still solid" instead (no second celebration).
- **Ranks**: each milestone has a title (`rank` in `MILESTONES`), earned when its checkpoints pass:
  Stick Rookie, Limb Wrangler, Groove Keeper, Fill Maker, Dynamics Boss, Triplet Traveller, Swing Cat, Pocket Pro, Shape
  Shifter, Solo Voice.
  Ranks stay on the built-in checkpoints so they work offline (a coach stand-in marks the built-in checkpoint passed).
  A rank is *earned* the day its checkpoints pass (it never blocks the next stage) and gets a **✓ proven** mark when
  every checkpoint passes again at its target on a later day (a review, Beat your best or a replay; `proveOnAnotherDay`).
  Once proven it stays. Review tiles of unproven checkpoints say "Prove it".
- **Show-off song**: each rank unlocks real songs the coach picks for the stage's skills (`/api/coach/showoff`).
  You learn one in Songs; played scored at 85%+ it joins your show-off set, playable in Stage mode.
- **The coach builds the path** inside the fixed stages: after every finished lesson it writes the next one in
  the background, and Journey's Next up offers it first.

## Skill map and placement (N5)

- **Skill map** (`src/engine/skills.ts`, Journey → 🗺 Skill map): every lesson trains skills (steady time, hands, hands and
  feet, 16ths, triplets, loud and soft, rudiments, fills, feel, reading and ears, songs), found from its kind and charts.
  Mastery = stars earned against 3 stars on every lesson of the skill. A skill not practised for 3/7/14 days (by mastery)
  is *due*: the daily set takes its oldest lesson as the review, and the coach sees the map for lessons and week plans.
- **Placement** (onboarding "I've played drums before", or Journey → Find my level): one take of each stage's first
  checkpoint at target tempo, from stage 1 up; the first one that doesn't pass is where you start. Stages below count
  as passed with one star, so the coach still strengthens them.

## You vs you, over months (N8)

- Every scored take keeps its own hits (`run_hits`, size-capped: the latest 300 takes plus each exercise's first take of
  each month). Progress → **This month's report** (You vs you) pairs a take 28+ days old with a recent one of the same bars (`youVsYou` in
  `src/engine/history.ts`) and plays either back as drum sounds: only the student's own MIDI, never audio.
- Month by month: minutes, takes, on-time %, spread and best BPM at 90%+ (`monthly`). The skill map draws each skill's
  growth over the last 6 months (`skillGrowth`).
- **The coach's monthly report** (`/api/coach/month`, `server/prompts/month.md`): written once a month on request, kept in
  settings, "Ask again" rewrites it.
- **Concert mode**: Progress → 🎤 Concert plays the show-off set back to back in Stage mode; each encore offers the next
  song and "💾 Save as MIDI" for friends.

## Musicianship (N7)

- **Graded sight-reading** (`src/engine/sight.ts`): lessons sight-1…sight-4 deal a new one-bar card per take, no hints:
  grade 1 quarters, 2 8ths, 3 snare and kick, 4 16ths, 5 triplets.
- **Road maps** (`src/engine/form.ts`): a chart may carry `form` (repeat signs, 1st/2nd endings, D.C. al Coda). The sheet
  draws the signs before the take; the player plays `expandForm` (the bars in play order). Lesson "Road maps".
- **Write what you hear** (`transcribe` steps, `lesson/Transcribe.tsx`): the app plays a groove, the student taps it into
  a grid and checks it (`gridScore`, 80% passes; "Show me" after two tries), then plays it.
- **Listening assignments** (`listen` steps): a real recording to find on YouTube (a search link, nothing is downloaded)
  and one thing to hear in the drums, then the groove itself.
- The coach can use all four in its lessons (`server/prompts/lesson.md`); they count toward "Reading and ears" on the
  skill map.

## Real music in lessons (N3)

- A song bite (a coach lesson's `bite` step on a YouTube song) plays over the song's **drumless upload** when it has one
  with a beat grid: the official embedded player sits under the sheet and the take runs on the YouTube clock
  (`src/lesson/RealSong.tsx`, same timing as Songs → Play). One pass of the bars, a bar of the song as the count-in, at
  the nearest speed YouTube offers. A checkbox switches back to the practice band. Nothing is downloaded or recorded.
- Not built: a sampled kit and band (needs downloaded samples; skipped with N1's downloads).

## Curriculum shape
Levels 0–12, one milestone each (levels 7–9 added later: a student who finished level 6 carries on at level 7, told once that new stages are open; 10–12 added with N6). Untagged lessons are the core path. Lessons tagged `rock`, `funk`, `jazz` or `latin` appear only
if that goal was picked during onboarding; picking none means "not sure yet" and shows everything.

| Level | Theme |
|---|---|
| 0 | Setup, posture, counting quarters and 8ths |
| 1 | One limb at a time; single strokes and accents |
| 2 | The money beat, built layer by layer; double strokes; four on the floor; first song |
| 3 | Kick variations, open hi-hat, crash phrasing, first fills, the flam, a rock song |
| 4 | 16ths, paradiddle, flam taps, the drag, ghost notes, open-hat grooves, ride groove |
| 5 | Triplets, shuffle, half-time, funk, 6/8, a shuffle song |
| 6 | Jazz ride, feathered kick, comping, a swing tune |
| 7 | Groove at tempo: 16th kicks under 8ths, ghost 16ths, funk at 96, open-hat funk, laying back, a ruff fill, a 5-minute groove, a song with soft and loud sections |
| 8 | Linear and odd: linear grooves and fills, 5/4, 7/8 (practice), a 5/4 song |
| 9 | Solo voice: six fills on demand, fills that build, trading fours, a solo vamp, a song with a 4-bar drum break |
| 10 | Polyrhythms and ostinatos: 3 over 2, 4 over 3, a foot ostinato, a song that switches between them |
| 11 | Style mastery: one checkpoint per style (gospel chops, gospel shuffle, jazz waltz, samba), a gospel song |
| 12 | Time tricks and soloing: metric modulation, soloing in phrases, a 32-bar finale |

**Style tracks** (N6): from stage 7 the path branches by goal. A milestone's `track` names what each style works on, and
each style has its own tagged checkpoint there (stage 7: driving rock, open-hat funk, swing at tempo, bossa nova; stage
11: as above). A tagged checkpoint counts only for students with that goal (`checkpointsOf`), so the planner follows
your track; "not sure yet" follows the rock / pop track there. Journey shows your track under the current stage.

Songs are written "in the style of" and played by the built-in synth. No copyrighted audio ships.
Real songs come in through the Songs tab: search YouTube, set the tempo, learn the part by ear (with suggested notes
and sheet music), jam along or play it scored with the drumless version. MIDI + audio import is still there too.

## Rules of thumb in the code
- Pass criteria come from the lesson's level (`passFor`: 75–90% accuracy, 40–15% extra hits); a step can relax them but not tighten them. A step can add a timing limit
  (|mean offset|), a consistency limit (spread, std dev of offsets), a hand–foot flam limit, a velocity-evenness
  limit (CV %), a weak-second-double limit or a ghost-to-accent volume ratio. Every checkpoint's last step limits
  spread (`spreadFor`: 40 ms at levels 0–2, 30 at 3–4, 25 at 5–6, 20 at 7–9): averaging on time isn't enough, each hit has to be.
- A take is 4 bars; the proving take (last step at its target tempo) and copy-me takes are 8.
- Good is ±100 ms (±150 at levels 0–1; Perfect ±40), shrunk per note to 40% of the gap to its nearest neighbour on the same drum, so fast 16ths are
  judged tighter while the 8ths beside them on another drum keep their window.
- Keyboard timing is 10–30 ms late, so expect *Good* rather than *Perfect*. Never calibrate latency
  from the keyboard. Ghost-note checks need the real kit.
- Wait mode is for learning the pattern only; it never counts as a pass.
- Grace notes (flam, drag, ruff) are scored as one note: the grace stroke(s) first, then the main stroke takes the note
  over (`createMatcher`). The take checks that most came out as two strokes, the grace soft (≤ 0.75 of the main) and
  8–50 ms before it. Keyboard: Alt + key plays a flam. On the MPS-150 pad retriggers (29–56 ms) are close to flam
  spacing: check on the real kit (M2).
- Odd /8 meters (5/8, 7/8) click every 8th note with the group starts accented (7/8 = 2+2+3, `engine/meter.ts`), and the
  count-in counts 8ths ("one … seven"). Solo and break bars can ask to stay on the beat (`minFreeOnBeatPct`).
