Task: write ONE short lesson for this student, aimed at their current milestone. You are curating their
path: the milestones and their checkpoint lessons are fixed; the lessons in between are yours to choose.

The input has:
- "milestone": what the student must be able to do ("canDo") and the checkpoint lessons that prove it.
- "student": goals and minutes per day. "progress": lessons they started (step, BPM, passed).
- "recentRuns": their latest takes with timing (negative mean offset = rushing), per-drum accuracy,
  velocity and the weakest beat positions. "struggle" (optional): a take they just failed and why.
- "examples": built-in lessons for this milestone, to show the format and the level of difficulty.
- "yourEarlierLessons": lessons you already wrote for this milestone. Don't repeat one.

How to choose:
- Look at the evidence first. Target the single weakest skill that blocks the next unpassed checkpoint
  (a drum that keeps missing, rushing, uneven hands, a beat position, a limb combination). If there is no
  data yet, prepare the first unpassed checkpoint.
- One skill per lesson. 1–4 steps that build it up: isolate it, then add limbs back. Use "activeLanes"
  for the lanes the student plays; the app plays the other lanes in the chart. Omit it to play everything.
- Start tempo a little below where they break down (look at their BPM and accuracy); target tempo at or
  just under the checkpoint's. Never ask for something above this milestone.
- Plain words for an adult beginner. "how" gives 2–4 concrete physical tips. "focus" is one sentence telling
  the student why this lesson, for them, citing their data (for example "your kick on the & of 3 is 40 ms late").
- Charts follow the chart format; keep them 1–4 bars. For a step's chart, "bpm" = that step's target.
- You are building this student's path: each lesson is the next small step toward passing this milestone's
  checkpoints (the stage finale). Set "checkpoint" to the id of the unpassed checkpoint this lesson prepares:
  finishing your lesson passes that checkpoint, so its last step must prove the same skill at the checkpoint's
  target tempo. Leave it out for a lesson that only builds toward it. "stars" on a passed lesson is 1–3; 1 star means it is shaky, so a lesson that
  strengthens it beats a new topic. Keep it fun: one clear win per lesson.

Answer shape:
{ "title": string (≤ 60 chars), "kind": "exercise" | "rudiment" | "groove" | "fill",
  "focus": string, "checkpoint"?: string, "what": string, "why": string, "how": string,
  "steps": [ { "title": string (≤ 40 chars), "text": "one instruction line",
    "chart": { chart }, "activeLanes"?: [lanes], "bpm": { "start": number, "target": number },
    "pass"?: { "accuracy"?: %, "maxAbsOffsetMs"?: ms, "maxVelocityCv"?: %, "maxGhostToAccent"?: 0–1,
      "maxSpreadMs"?: ms (hit consistency), "maxFlamMs"?: ms (limbs landing together), "maxPairDropPct"?: % (weak 2nd note of doubles) },
    "gapBars"?: 2 } ] }
