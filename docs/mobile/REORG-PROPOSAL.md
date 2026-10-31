# iPad reorganisation: proposal for the owner (2026-10-31)

Proposal only: no app code has changed. Wireframes are in [`reorg/`](reorg/): each `*-after.png` (HTML source next to
it, re-render with `NODE_PATH=/opt/node-tools/node_modules node docs/mobile/reorg/render.mjs`) sits beside today's
harness shot `*-before.png`.

## Summary (for the owner)
1. **Four sections instead of six:** Journey · Practice · You · Setup. Songs moves into Practice (a shelf next to
   Grooves, Rudiments and Fills). Progress and the Coach's week plan become **You**. Chatting with the coach opens from
   the coach's speech bubble on any screen, so it no longer needs its own section.
2. **The sidebar collapses.** « (or the `\` key) shrinks it to an icon rail; » brings it back; your choice is
   remembered. The three status pills become one kit dot. Players hide the sidebar completely.
3. **Max screen while playing.** Lesson, Practice and Songs all use one full-screen player. Before and after a take you
   see a slim bar, the coach's line, the music (big) and one row of moves. During a take you see only the music, the
   bar number, one tip and a small Stop button (crash × 4, or Esc).
4. **Voice first.** The coach says what you need to know out loud: the step, the count-in, tips, your score after
   **every** take, and what comes next. The screen then needs fewer words: short labels and big numbers. A new
   "say it again" gesture (kick × 2) repeats the last line.
5. **One main job per screen.** Journey = start the next thing. Practice = pick and play. You = how you're doing.
   Setup = is everything working. Everything else moves one tap deeper (⋯ sheets, doors on You, rows in Setup).
6. **Nothing is lost.** Every feature from the web app can still be reached (the table at the end lists where each one
   went). Two small things are **cut** (the "Your time" chart and the duplicate Skill map button), and you can veto both.
7. Size: about **5–7 agent-days**. The shared player and the voice work are the biggest parts.

## The structure

| Today (6 + dev) | Proposed (4) | Notes |
|---|---|---|
| Journey | **Journey** | Up next, today's set and the stage. Everything else goes under ⋯ |
| Songs | → **Practice** › Songs shelf | The song screen opens in the shared player (D5: Songs was the next phase, so this changes nothing in v1) |
| Practice | **Practice** | For you (the warm-up is the first card) and 4 kinds |
| Progress | → **You** | 2 cards plus 6 doors |
| Coach | → **You** › Coach's week plan, and 💬 chat from the coach bubble anywhere | Coach settings → Setup |
| Setup | **Setup** | Status at the top and 6 rows. About / dev links move here |
| Sidebar status pills ×3 | 1 kit dot; latency and coach only show up when they need something (a Journey notice, Setup) | |

**Sidebar states.** Expanded (228 pt, Journey's default), rail (84 pt: icons and the kit dot), hidden (in every player,
first run and full-screen tools). Toggle with the « / » button at the bottom or `\` on the keyboard. The choice is
remembered. The kit gestures don't move between sections. They are for playing.

**Max screen (the shared player).** Lessons, Practice play and Songs play/stage share one frame (it is today's
LessonScreen, simplified):
- *Before / after a take:* a slim black bar (‹, title + "Step 3 of 4", the goal "□□ 2 clean → 75", BPM, ⋯), the coach's
  line (spoken), the music across the full width, and one strip of 4 moves with their gestures.
- *During a take:* no bar and no sidebar, and no kit drawing when a real kit is connected. You see "Bar 3 / 4", one live
  tip, the BPM and the music, as large as it fits.
- *Getting out:* **crash × 4** (already there), **Esc**, or the **■ Stop** corner button, all of which stop the take.
  Then: **‹** / Esc (not playing) leaves the player, **ride × 2** goes on to the next item, and **⋯** holds the rest
  (Sheet/Highway, Hints, Band, How it moves, the lesson's why, Share take, Reset, the list of keys and gestures). Hints
  (H) and Band (B) stay on their keys.
- *Touch pads* (no kit) take the bottom third, as today. That is the only time a kit picture shows.

## Voice first: today and gaps
**Today (iPad):** expo-speech with the iPad's system voice (D6). The web uses Piper from the server, or else the
browser's voice. Defaults are shared (`packages/core/src/input/settings.ts`): **voice on**, **spoken count-in on**,
**live tips = screen** (the v3 migration moved spoken tips back to the screen), chattiness Normal. Setup → Coach and
voice holds Speak the verdicts, Count me in out loud, Live tips Off/Screen/+spoken, and How much the coach says.

| Moment | Spoken today? | Proposed |
|---|---|---|
| Journey opens | Only the Monday recap | Say the Up next line once per visit: "Up next: the money beat, step 3, 70." Also say badges and new stages. Say the sore check as a question (the answer stays a tap) |
| Lesson / exercise opens (step intro, intro slides) | ✗ | Say the step's one-line "what to play" plus the focus. The slides' text gets spoken versions, so the slides can step forward on their own (hi-hat × 1 still works) |
| Count-in | ✓ ("one, two, three, four", the native word samples) | Keep |
| Count along (`countAloud` steps) | ✓ | Keep |
| Live tips during a take | Screen only by default | **Default: + spoken** (short tip words; the screen shows one line) |
| After every take: score + verdict | ✗: only when a set item is **done** (`judge.ts`: `speak: o.itemDone && voice`); Practice and Songs never speak it | **Every take:** "46 of 48. Clean. One more and we go to 75." Chattiness sets the length: Short = number + verdict |
| What next | ✗ | Add it to the verdict: "Again with the pedal, or ride for next." (Normal only; not on Short) |
| Live coach reply / week plan | ✓ (reply, not during a take) | Keep |
| Notices: setup nudge, latency hint, break time | ✗ (break is on screen) | Speak them as the coach line |
| Say it again | ✗ | New gesture **kick × 2** between takes (kick is free in `padCommands.ts`), plus key `R` |

**Voice quality gap:** the iPad's default voice is the compact system one, while the web has Piper. Option A: in
Setup → Coach's voice, pick from the voices installed on the iPad (Enhanced/Premium ones are downloaded in iOS
Settings → Accessibility → Spoken Content). expo-speech takes a `voice` id. Option B: have the home server render the
fixed phrases with Piper and cache them on the iPad, with the system voice as the offline fallback. **Recommended: A
now, B later.**

## Per screen

### Journey (busiest home screen): M (~1 day)
Before `reorg/journey-before.png` → after `reorg/journey-after.png`.
- **Every session:** coach line, Up next + Start / Hear it / Something else, today's set, stage position.
- **Weekly:** rank, streak, landed %, This week's focus, the stage song, the trail with labels. **Rarely:** Find my
  level, Skill map, Flow, Stick technique, Ask the coach for a lesson, Just jam.
- **Stays:** the coach line (spoken, one notice at a time), the hero card (bigger: a 46 pt title and the groove), and
  3 moves.
- **Moved:** *Just jam* → ⋯ (a fourth move only after the set, as the 2-minute challenge / Beat your best do today).
  *You card* (rank ring, streak, landed, min today, week focus + "lesson for this") → **You** (the streak stays as "🔥 6"
  on the set strip). *Stage song card* → the last dot of the stage strip ("song 5/16 bars") and the Practice › Songs
  shelf. *Trail with labels* → a dots strip; **Full path** opens it on You. *Find my level, Skill map, ⋯ More* → one ⋯
  sheet.
- **Merged:** Today's set becomes one horizontal strip of chips plus minutes.
- **Cut:** the duplicate "Skill map" button in the title bar (it's on You).
- **Voice:** the Up next line is spoken.
- **Questions:**
  1. Should "Just jam" stay visible on Journey? *Recommended: no, put it under ⋯; it returns after the set.*
  2. Should the stage trail keep its lesson names? *Recommended: dots only; names on Full path.*
  3. Should the All-done state (8 tiles) become 4 tiles plus ⋯? *Recommended: yes.*

### Lesson player (ready, take, results, sheets): L (~1.5 days, shared with Practice and Songs)
Before `lesson-ready-before.png`, `lesson-results-before.png` → after `lesson-ready-after.png`, `lesson-take-after.png`,
`lesson-results-after.png`.
- **Top bar today:** back, title, 4 step pills, Sheet/Highway, BPM + ladder, Hints, Band, ⋯, Share. **After:** back,
  title + "Step 3 of 4", the goal boxes, BPM, ⋯.
- **Moved to ⋯:** Sheet/Highway (a setting; D8 still opens on Sheet), Hints and Band (keys H/B stay), step pills, tempo
  ladder (as "2 clean → 75"), Share take, the results legend, the timing line, Keep fill N, Reset, How it moves, the
  lesson card.
- **Ready:** the coach line and the music are full width. The kit drawing goes when a real kit is connected; the goal
  card goes into the bar.
- **Take:** the max screen above.
- **Results:** a big **46/48** and stars, one fix line + **Fix bar 2**, and "Ask the coach ›" as a link. The take sheet
  shows up to 4 bars without paging when it fits.
- **Voice:** the step intro, the score and verdict after every take, and what's next.
- **Questions:**
  1. Should the kit drawing show while you play a real kit? *Recommended: no; it can be switched on in ⋯.*
  2. Is the tempo ladder worth a place in the bar? *Recommended: no, "□□ 2 clean → 75" says the same.*
  3. Share take: in ⋯ only? *Recommended: yes.*

### Practice + play + Details: M + shared player (~1 day)
Before `practice-before.png`, `practice-play-before.png` → after `practice-after.png`; play uses the shared player
(`lesson-results-after.png`).
- **Home today:** Pick up where you left off, 3 moves, the warm-up panel, For you (4) + All, kind tabs, search,
  Metronome. **After:** For you = 4 big cards (🔥 warm-up first, then "left off here", your level, the coach's pick), 3
  moves, 4 kind tiles (Grooves, Rudiments, Fills, **Songs**), Metronome, 🔎.
- **Play today:** a crowded screen: 5 moves, loop chips, times round, the sheet squeezed into a third, touch pads, Climb +
  text, plus a scrolling side column (Your take, How it plays ×7, Your takes here, ⚙ More, Just the click).
  **After:** the shared player. − / + BPM sit beside the number in the bar. The moves are Again / Hear / Slower /
  Faster / Next, with Next on ride × 2.
- **Moved to ⋯:** loop bars + times round ("Loop: all · 4×"), How it plays (click, 8th click, count-in, play along,
  wait, hints, intro slides), kit sounds, song sync, Climb (a toggle with one line), Your takes here (→ Details),
  Metronome. **Details and history** is a link on the score card.
- **Cut:** "Your drums: …" (the music shows it) and the Climb explainer paragraph (it moves to ⋯).
- **Voice:** Practice gains the spoken score and verdict (it has none today).
- **Questions:**
  1. Should Songs be a Practice shelf rather than its own section? *Recommended: yes.*
  2. Should Climb default to on? *Recommended: keep it as today, but show it as a chip in the bar.*
  3. Should search stay as an icon? *Recommended: yes.*

### Songs (library + song screen): M (~1 day)
Before `song-before.png`. No wireframe; it follows Practice and the player.
- The library becomes the Practice › Songs shelf: My songs, search/paste link, Import (under ⋯).
- **Song screen today:** a 5-step tab row, a YouTube box, Play + Speed, Versions, Song audio (experimental), and a grid
  editor, all on one screen. **After:** the song opens on its current step with one primary action. Learn by ear (grid,
  bars, Use take) stays a work screen with the sidebar hidden. Jam / Play (scored) / Stage use the shared player
  (YouTube on top, music below). Versions and Song audio go into ⋯.
- **Questions:**
  1. Should Learn by ear stay on the iPad (it's tap-heavy)? *Recommended: yes, as a work screen, not a play screen.*
  2. Should "Song audio (experimental)" be hidden on the iPad? *Recommended: hide it; it can't work there yet.*

### Progress → You (+ Coach's week plan): M (~1 day)
Before `progress-before.png`, `coach-before.png` → after `you-after.png`.
- **Today:** a "since" chip, Month report, Teacher, Getting better (chart + 3 stat boxes), This week, Skill map (3 rows +
  chips), Trophies, Your time, Coming up, Your lessons (3 + All).
- **After:** Getting better (coach line + chart) and This week (fire dots, streak, minutes, the coach's focus). Then 6
  doors: Path & skills · Trophies · Your lessons · Coach's week plan · Show-off & fills · Reports (month + teacher).
- **Moved:** the 3 stat boxes (notes landed, best take, stars) → Trophies / Your lessons. The Coach tab's weekly plan →
  a door. Coach chat → 💬 in the bar (and the coach bubble everywhere). The plan's goals form → Setup › Coach connection.
- **Cut (option):** **Your time** (14-day minutes chart). This week shows the same minutes. *Veto if you use it.*
- **Questions:**
  1. Should the section be called "You" or keep "Progress"? *Recommended: "You", since it now holds the coach's plan too.*
  2. Cut "Your time"? *Recommended: cut it.*
  3. Chat: from the bubble on every screen, or only on You? *Recommended: both (the bubble is the shortcut).*

### Setup (+ tools): M (~1 day)
Before `setup-before.png` → after `setup-after.png`.
- **Today:** 6 grouped lists with 14 rows and 4 explanatory paragraphs, the server form inline, and the API key.
  **After:** 3 status cards (Kit, Latency, Coach, each with its one fix button) and 6 rows: Pads · Sound · Coach's voice
  · While you play · Coach connection · About.
- **Moved:** the server URL/token, the API key and the plan settings → Coach connection. MIDI input → Pads. Which hand
  leads → While you play. The paragraphs → inside each detail page. The Build / dev links (sidebar today) → About.
- **Voice:** Coach's voice becomes its own row: on/off, the voice picker (new), chattiness, spoken tips, spoken
  count-in, a test.
- **Questions:**
  1. Should Live tips default to "+ spoken"? *Recommended: yes (voice first).*
  2. Should Autopilot stay hidden in While you play? *Recommended: yes.*

### First run: S (~½ day)
It stays 4 steps (goal, plug in, pads, latency). The only change is that each step's instruction is spoken. The
sidebar is hidden (as today).

### Shared work: M (~1 day)
The collapsible sidebar (3 states, remembered, `\` key), one kit dot, the ⋯ sheet pattern, the voice moments and
kick × 2 "say it again", and harness shots for the new states.

## Where everything went (nothing removed unless marked)
| Feature | Now lives |
|---|---|
| Find my level, Flow, Stick technique, Ask coach for a lesson, coach's lessons, Just jam | Journey ⋯ |
| Rank, streak, landed %, minutes today, week focus, "lesson for this" | You (the streak is also on Journey's set strip) |
| Stage song, show-off set, concert, fills | Journey stage strip · Practice › Songs · You › Show-off & fills |
| Skill map, full path | You › Path & skills (and Journey's "Full path") |
| Month report, For your teacher | You › Reports |
| Weekly plan + chat | You › Coach's week plan · 💬 from the coach bubble |
| Sheet/Highway, Hints, Band, Share, Reset, How it moves, keys | Player ⋯ (H/B keys stay) |
| Loop bars, times round, How it plays, kit sounds, sync nudge, Climb | Player ⋯ (Practice) |
| Metronome | Practice bar · Player ⋯ |
| Placement, technique, flow, ear quiz, transcribe, look steps | Unchanged routes (they already are full screen) |
| Your time chart | **Cut (option)** |
| Title-bar Skill map button | **Cut** (duplicate) |
| Dev links in the sidebar | Setup › About (debug builds) |

## Decision check
- **D4 (approved mockups):** this changes the approved navigation (5–6 sections → 4) and the screen layouts. It needs
  your approval, which is what this proposal is for. The look stays the same.
- **D8 (sheet music default):** kept. Sheet/Highway only moves into ⋯.
- **D5 (Songs next phase):** no conflict. Songs becomes a shelf.
- **D6 (iPad built-in voice offline):** kept. The voice picker uses iPad voices; Piper is optional later.
- D0–D3, D7, D9: no change.

## Size
Shared ~1 · Journey ~1 · Player ~1.5 · Practice ~1 · Songs ~1 · You ~1 · Setup ~1 · First run ~0.5 → **about 7
agent-days**, or **5** if Songs and First run wait.
