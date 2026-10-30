# iPad mockups (D4): notes for the owner

Fresh iPad-native designs for the v1 screens: iPad only, landscape locked, 1194 × 834 pt, light theme. Mockups only,
no app code. Open `index.html` for the grid; every PNG in `png/` is one 1194 × 834 frame.

- **Example data.** A plausible student about three weeks in: Stage 3 "The money beat" (rank Limb Wrangler), step 3
  "+ snare" at 70 BPM, a 6-day streak. Lesson names, steps, tempos, pass rules and ranks come from
  `src/content/curriculum.ts` and `docs/LEARNING.md` (80% pass at level 2 → "39 of 48 notes", 2 clean takes → +5 BPM).
  The iPad starts fresh (D3), so on day one Journey shows Stage 1 instead.
- **Re-render:** `node docs/mockups/ipad/render.mjs [name …]` (Playwright Chromium, 1×). It also reports anything that
  overflows its box or ends inside the bottom 60 pt.
- **Variants** use the URL hash: `lesson-take.html#ready` / `#countin`, `lesson-results.html#share`,
  `coach.html#offline`, `first-run.html#s1`…`#s4`.

## Design choices (all screens)
- **iPadOS 26 conventions.** A floating glass sidebar (Journey, Practice, Progress, Coach, Setup), large titles,
  inset grouped lists, segmented controls, switches, a share-sheet popover and an inspector panel. SF via
  `-apple-system` (Inter stands in on Linux). The iPadOS status bar and home indicator are drawn.
- **Played from the throne.** The coach line is 21–23 pt, moves 22–28 pt, the tempo 44 pt, the live tip 27 pt and the
  count 24–30 pt. Touch targets are at least 44 pt. Nothing ends in the bottom 60 pt (the renderer checks it).
- **Full screen while playing.** The lesson player (before, count-in, take, results), the touch pads and first run hide
  the sidebar. During a take only the music, one live tip, the goal, the kit and Stop are left.
- **Hands-free is visible.** Every move the kit can drive carries its gesture as a dark capsule with the pad's colour
  dot: hi-hat pedal × 3 or crash × 2 = yes / the big move, tom 2 × 2 = listen, floor × 2 = slower, tom 1 × 2 = faster
  (and the warm-up), ride × 2 = next, crash × 4 = Stop (`src/engine/padCommands.ts`).
- **One colour per drum** on the highway, the kit view and the touch pads (hi-hat teal, snare indigo, kick graphite,
  crash gold, toms purple/magenta, floor brown, ride green-teal). Result colours stay separate: green on it, orange
  early/late, red dashed = missed, red ✕ = extra.
- **The web's kit chip becomes a status card** at the bottom of the sidebar: kit, latency, coach. Tapping it opens Setup.

## Journey (`journey.html`)
**Shows:** the coach's one line; Up next as a card (title, step, tempo range, a one-bar preview of the groove with the
new limb highlighted) and four moves with gestures; You (rank ring, next rank, streak, notes landed, minutes against
the daily goal); Today's set with a minute bar; the stage song ring (5 of 16 bars ready); the stage trail with stars, a
coach-written lesson (✦) and the ★ checkpoints.
**From the web revamp:** same content and order. The You numbers, set and song now sit in one row of three cards
so everything fits one landscape screen without scrolling. "Skill map" and "Kit gestures on" are toolbar buttons. Your
own real song is left out: Songs is the next phase (D5).
**Questions:**
1. Keep the stage song card in v1? The built-in song plays offline with the synth band; real songs wait for Songs.
2. Should "Kit gestures on" be a visible toggle on Journey, or live only in Setup?
3. Do you want a day-one mockup too (Stage 1, empty trail, setup notice)?

## Lesson player: before, count-in, take (`lesson-take.html`)
**Shows:** step pills (the current one named), the tempo with its 5-BPM ladder (start dashed, goal black), Highway /
Sheet, Hints, Band and ⋯ More; the coach line and four moves; a note highway with R / L / K on the notes and the
count under it ("&" in blue), a beat ball on the now line; the goal ("2 clean takes in a row and the tempo goes up to
75. Clean = 39 of 48 notes land.") with tick boxes; a kit view whose pads light on each hit. The count-in shows the
big number on the beat. During the take: the live tip ("Hi-hat foot down (it sounds open)", a real rule-based tip),
judged notes behind the line, green rings where hits just landed, and Stop with crash × 4.
**From the web revamp:** same building blocks (coach line, moves, ladder, goal bar, mini kit, beat ball, results on
the notes). The highway runs **left to right**, lanes stacked like notation (cymbals on top, kick below), so it reads
the same way as the sheet and the count; the web highway falls top to bottom in kit order. The kit view is bigger and
shows the hit result. The side column is gone (How it moves, Check yourself are later per RECON).
**Questions:**
1. Highway direction: left-to-right as drawn, or the web's falling lanes?
2. Sheet music (VexFlow, the hardest part of the port) in v1, or highway first and the sheet in a later update?
3. Is the live tip readable at the top, or should it sit next to the now line?

## Lesson results and Share take (`lesson-results.html`, `#share`)
**Shows:** the verdict line ("Clean! 46 of 48 landed, 21 in a row. Two clean takes: up to 75.") with "Coach is
listening back"; moves Play at 75 / Hear your take / Stay at 70 / Skip to next; all 4 bars with every note marked
(on it, early −62, late +52, missed, extra ✕); the timing line (on average 18 ms late); the take card (46 of 48, ★★,
best run, extra hits); one thing to fix with "Fix bar 3 · 4× at 60"; Ask the coach. Share take opens the share sheet
with `The money beat · take 2.mid` (AirDrop, Messages, Mail, Notes, Save to Files, Copy).
**From the web revamp:** results stay on the notes; the side card keeps the count, stars and one tip. "Save as MIDI"
moved out of ⋯ More to a toolbar **Share take** button (D5); it uses the iOS share sheet instead of a download.
**Questions:**
1. Should the shared MIDI hold only your hits, or also the lesson's chart as a second track (for a teacher)?
2. 8-bar proving takes: four rows of two bars, or two pages?
3. "Fix bar N" (zoom in) in v1?

## Practice (`practice.html`)
**Shows:** Pick up where you left off (Single strokes (16ths), starts at 70, best clean 80) with Play it / Hear it /
Next card; the 5-minute warm-up (tom 1 × 2); For you cards with the yellow ring (ride × 2 moves it, hi-hat pedal × 3
plays it); a segmented control by kind and the library as grouped lists with your best clean tempo.
**From the web revamp:** same structure; tabs become a segmented control, search moves to the toolbar. No Songs tab
until the Songs phase. The play screen reuses the lesson player (big − / + tempo, loop bars, Climb) and isn't drawn.
**Questions:**
1. Do you want the Practice play screen drawn separately, or is "the lesson player with − / + tempo" enough?
2. Keep the library on this page, or move it behind "All exercises" so For you gets more room?

## Progress (`progress.html`)
**Shows:** Getting better (notes landed per day played with the coach's line, total notes landed, best take); This
week (days played, streak, minutes against the goal, the focus); the skill map in three groups; trophies earned
(ranks with "✓ proven", badges) and the two closest; your time (14 days against 25 min); your lessons in plain words.
**From the web revamp:** the same four questions, packed into one screen. "Coming up" (show-off set, your fills,
you vs you) and the teacher page aren't on it: RECON tags You vs you and the teacher view as later.
**Questions:**
1. Is "This month's report" (needs the coach) worth keeping in v1?
2. Should "Your fills" (kept fills with Hear it) come back in v1 below the fold?

## Setup (`setup.html`)
**Shows:** one sidebar section with grouped lists in two columns. Kit: e-Drum (USB, Medeli, connected), the last hit,
MIDI input. Pads: hit each pad once (10 of 10, Again), soft then loud, note map. Latency: 31 ms through the iPad
speakers, Measure. Sound and you: levels, which hand leads. Coach · home server: server URL, token (Keychain), **Test
connection** → "Connected · 140 ms". Coach · fallback: an optional Anthropic API key (Keychain), used only when the
server can't be reached (D2). While you play: live tips, kit gestures, autopilot.
**From the web revamp:** "Your kit" and "Coach and voice" become grouped lists; the checklist's "do this first" logic
stays (it would mark Latency when takes lean late). Kit test is a toolbar button. The web's Claude CLI status becomes
the server test, since the iPad never runs Claude itself.
**Questions:**
1. Find the laptop automatically on the Wi-Fi (Bonjour) and pair with a short code, instead of typing a URL and
   pasting a token?
2. What do you listen through at the kit: iPad speakers, wired headphones through a hub, or Bluetooth (150–250 ms
   more, so latency per output)?
3. Keep in-app note-map editing, or rely on the hit-each-pad wizard only?

## Coach (`coach.html`, `#offline`)
**Shows:** an inspector over the right side of the screen you're on (here the results, so the moves and notes stay in
view): the coach's feedback on the take, a drill card (Kick with the hat · 65 BPM, Play this drill), the suggested next
step as a big button with its gesture, your request, and "Your coach is thinking… this can take a minute. Keep playing;
the answer waits here." Offline: what failed (`drum-laptop.local:8787` didn't answer, no API key set), Try again and
Coach settings, the app's own verdict, what keeps working, and your question waiting to be sent.
**From the web revamp:** the bottom-right coach panel and the results' coach card become one inspector with one
remembering conversation. "Coach unavailable" gets its own clear state instead of a red line.
**Questions:**
1. Inspector (drawn) or a centred sheet?
2. Talking to the coach ("said at the kit") needs on-device speech-to-text. v1 or later (RECON tags it later)?
3. When the server is down, queue questions and send them later (drawn), or refuse them?

## Touch pads (`touch-pads.html`)
**Shows:** no kit connected → a banner ("touch pads are on; plug the e-Drum into the USB-C port and the kit takes
over"), a short highway, and a multi-touch kit laid out like the MPS-150 from the throne: crash, toms and ride on
top, hi-hat left, snare, kick and floor below, a hi-hat pedal strip. The lesson's pads are bright, the rest still play.
Two fingers land hi-hat + kick together. Touch timing is scored a little looser.
**From the web:** new. It replaces the keyboard fallback, which iOS can't do without a hardware-keyboard module.
**Questions:**
1. Velocity from where you tap (centre = loud, drawn), from the touch size, or fixed?
2. The real hi-hat sends open unless the pedal is down. On touch, should the hi-hat default to closed, or need the
   pedal strip held?
3. Should touch takes count for stars, ranks and the ladder, or be practice only?

## First run (`first-run.html`, `#s1`–`#s4`)
**Shows:** 1 Welcome: what the app does, then styles (Rock / pop, Funk / R&B, Jazz, Latin, Not sure yet), minutes a
day (25 recommended) and "played drums before?" (placement). 2 Plug in: module → USB-C cable → iPad, "e-Drum found",
"you hit the snare, it works", cable tips, or use touch pads. 3 Hit each pad: "Hit TOM 1" in huge type on a drawing of
the kit, what each pad sent (36, 38, 46, 44, 42 …), a wrong pad just says which one it was, and the duplicate-note
check with the module fix. 4 Latency: hit the snare with 16 clicks; the delay (31 ms) and how steady (±6 ms).
**From the web:** the same order as README "First time" and the revamp's "hit each pad" screen, as a 4-step flow
with a progress indicator instead of cards on Setup.
**Questions:**
1. Placement ("I've played before") in v1, or start everyone at Stage 1?
2. Should the coach server (URL + token) be a 5th step, or stay in Setup?
3. Let people skip latency on day one (and nag later), or require it?
