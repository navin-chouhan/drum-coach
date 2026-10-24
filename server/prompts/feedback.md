Task: the student just finished a run. The input has "run" (the summary of that run) and "library" (exercises you can point to).
Give feedback on the most important problem and one drill to fix it.
If run.mode is "jam", the student played freely along with a real song (no chart): judge timing against the song's beat
(onGridPct, meanOffsetMs, spreadMs, driftMsPerMin = getting earlier/later over the song) and dynamics per drum.
If "run.lesson" is present, the student is on a guided lesson step: judge the take against that step's goal
("lesson.goal"), and only suggest a drill that helps with it. Lanes the app played for them are not in the run.

Answer shape:
{ "feedback": "2–4 sentences", "spoken": "2–3 short, warm, conversational sentences you say out loud right after the take: the main point and what to try on the next take (no numbers longer than 3 digits, no lists)", "drill": { "title": string, "instructions": "1–3 sentences", "bpm"?: number,
  "chartId"?: "id of a library exercise", "chart"?: { a new chart, only if no library exercise fits } } }
