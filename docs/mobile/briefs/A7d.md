# Brief: A7d, Practice and Progress
Read `SCREENS-COMMON.md` first.

**Mockups:** `practice`, `progress`. **Web source:** `src/lesson/TodayView.tsx` (practice parts), the web Practice
screen (find it via `src/ui/nav.ts` and `App.tsx`), `src/ui/{ProgressView,SkillMapView,YouVsYou,TechniqueView,
TechniqueDemo}.tsx`, `src/play/PlayView.tsx` (the Practice play screen: − / + tempo, loop bars, Climb),
`packages/core/src/engine/{progress,skills,history,health,profile,planner}.ts`, `packages/core/src/content/library.ts`.

**Owns:** `apps/mobile/app/(main)/practice.tsx`, `apps/mobile/app/(main)/progress.tsx` (+ sub-routes, e.g.
`app/(main)/progress/skills.tsx`), `apps/mobile/app/practice/**` (the full-screen practice play route, if separate
from the lesson player; else reuse A7b's player with a practice mode prop: coordinate through the orchestrator),
`apps/mobile/src/features/{practice,progress}/**`.

**Builds:** Practice: pick up where you left off, the 5-minute warm-up, For you cards (ride × 2 moves the ring),
the library by kind (segmented) with your best clean tempo, and the play screen as the web does it (Climb mode, loop
bars, ± tempo, a metronome-only mode via `createMetronome`). Progress: getting better (per-day landed with the coach
line), this week, skill map, trophies and the closest, your time vs the daily goal, your lessons in plain words, and
"This month's report" (needs the server; unreachable state). Days with no data render the web's empty states (the
iPad starts fresh, D3).
