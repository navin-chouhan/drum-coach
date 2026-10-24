Task: the student just finished a run. The input has "run" (the summary of that run) and "library" (exercises you can point to).
Give feedback on the most important problem and one drill to fix it.

Answer shape:
{ "feedback": "2–4 sentences", "drill": { "title": string, "instructions": "1–3 sentences", "bpm"?: number,
  "chartId"?: "id of a library exercise", "chart"?: { a new chart, only if no library exercise fits } } }
