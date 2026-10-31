# Brief: A7e, the coach panel
Read `SCREENS-COMMON.md` first.

**Mockups:** `coach`, `coach-offline`. **Web source:** `src/coach/{CoachView,CoachFeedback,session,aiTips,weekPlan,
api,summary}.ts(x)`, `src/voice/*` (the web's voice: here use the AudioPort's words or `expo-speech` only if the
version SDK 58.0.17 names is ≥ 7 days old with no install scripts: you may add exactly that package),
`server/coachContext.ts`, `apps/mobile/src/data/{homeServer,coachContext,sse}.ts`.

**Owns:** `apps/mobile/app/(main)/coach.tsx`, `apps/mobile/src/features/coach/**` (including an exported
`<CoachPanel/>` inspector that other screens can open; A7b mounts it on results), and the tips cache.

**Builds:** the feedback after a take, a drill card ("Play this drill" opens the lesson player route with that
chart), the next step with its gesture, the chat with the live session over SSE (`HomeServer.stream`, `expo/fetch`),
"thinking… keep playing", the week plan (GET/PUT plan as the web, now with context from the iPad), AI tips written
ahead of time (`/api/coach/tips`) and cached in Storage for the rule-based live tips, and the offline state as drawn:
what failed, Try again, coach settings, what keeps working, and the question queued and sent when the server is back
(the mockup's choice; the web has no queue, so keep it simple: one queued question).
