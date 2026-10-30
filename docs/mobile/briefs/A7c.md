# Brief: A7c, Setup and first run
Read `SCREENS-COMMON.md` first.

**Mockups:** `setup`, `first-run-1-welcome` … `first-run-4-latency`. **Web source:** `src/ui/{Calibrate,PadCalibration,
LatencyCard,SoundCheckCard,LastHit,EmulatedKitCard,KitView}.tsx`, the onboarding in `src/ui/App.tsx` /
`src/lesson/TodayView.tsx`, `src/input/{settings,store}.ts`, `packages/core/src/engine/{calibration,padCal,kit}.ts`,
`apps/mobile/src/dev/{midi,server,audio}` (the debug screens already wire MIDI, the server and audio: reuse their
logic, not their looks).

**Owns:** `apps/mobile/app/(main)/setup.tsx` (+ `app/(main)/setup/**` if you use sub-routes), `apps/mobile/app/welcome/**`,
`apps/mobile/src/features/{setup,firstRun,latency,pads}/**`.

**Builds:** Kit (e-Drum status, select, last hit, MIDI input list, hot-plug), Pads (hit each pad → note map, duplicate
note check with the module fix text, soft/loud calibration, note-map editing as on the web), Latency (the tap test with
16 snare hits, per audio route (D6: hub + AUX IN; the key is AudioPort's route.key), saved per route, "do this first"
nudges like the web), Sound (levels, which hand leads), **Coach · home server** (URL + token → Keychain, Test
connection → `/api/health`, status) and **Coach · fallback API key** (Keychain; mark "used later", since the
API-key coach path isn't built: say so in the UI the web way), While you play (live tips, kit gestures, autopilot).
First run: 4 steps as drawn, with placement as on the web, skippable latency as on the web (nagged later), and the
coach server staying in Setup. The first-run "done" flag lives in the KV store (web key if there is one).
