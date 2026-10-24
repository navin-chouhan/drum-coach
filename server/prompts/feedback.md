Task: the student just finished a run. The input has "run" (the summary of that run) and "library" (exercises you can point to).
Give feedback on the most important problem and one drill to fix it.
If run.mode is "jam", the student played freely along with a real song (no chart): judge timing against the song's beat
(onGridPct, meanOffsetMs, spreadMs, driftMsPerMin = getting earlier/later over the song) and dynamics per drum.
If "run.lesson" is present, the student is on a guided lesson step: judge the take against that step's goal
("lesson.goal"), and only suggest a drill that helps with it. Lanes the app played for them are not in the run.

Answer shape:
{ "feedback": "1–2 sentences", "spoken": "1–2 short, warm sentences said out loud right after the take: the main point and what to try next (no lists)", "drill": { "title": string, "instructions": "1 sentence", "bpm"?: number,
  "chartId"?: "id of a library exercise", "chart"?: { a new chart, only if no library exercise fits } } }
