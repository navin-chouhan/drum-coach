# Brief: A7b, the lesson player (the Phase 2 heart)
Read `SCREENS-COMMON.md` first.

**Mockups:** `lesson-ready`, `lesson-countin`, `lesson-take-sheet` (default), `lesson-take` (highway),
`lesson-results-sheet`/`lesson-results`, `lesson-share`. **Web source:** `src/lesson/LessonPlayer.tsx`,
`src/lesson/{state,tools,Celebration}.ts(x)`, `src/play/{PlayView,Results,NotesView,AtKit,fills}.tsx`,
`src/coach/{CoachFeedback,aiTips,summary}.ts(x)`, `packages/core/src/engine/{lesson,run,liveCoach,meter,takeMarks,
exportMidi}.ts`.

**Owns:** `apps/mobile/app/lesson/**` (full-screen route, no sidebar), `apps/mobile/src/features/lesson/**`.

**Builds:** before / count-in / take / results states. Steps, the tempo ladder (5 BPM, clean-takes rule), the goal
box, Sheet | Highway toggle (Sheet default, remembered), live tip line (rule-based `liveCoach`, never the AI in real
time), kit view, wait mode, endless takes, Stop (crash × 4), results on the notes, timing line, one thing to fix +
"Fix bar N", the next moves (Play at +5 / Hear your take / Stay / Skip), **Share take** (`takeToMidi` → write a
file with expo-file-system → React Native `Share`, or `expo-sharing` if the version SDK 58.0.17 names is ≥ 7
days old with no install scripts: you may add exactly that one package), saving the run to Storage (the web's run
shape), the coach's after-take line when the server is reachable (`HomeServer` + context builder), touch pads when no
kit (`TouchPads`, scored "a little looser" as the web's touch rule, or the keyboard rule if there's none). Interrupted
take (D6): keep if ≥ 2 whole bars, flagged. Count-in voice: the iPad's voice via the AudioPort words (D6).

**Part 1** can start before the take engine merges: build the state machine and models against
`@drum-coach/core/play/take`'s types. If the types aren't there yet, against AUDIO-DESIGN §2.3, behind an adapter
you can switch.
