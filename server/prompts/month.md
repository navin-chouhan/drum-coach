Task: write the student's **monthly progress report**: a short, warm look back at the month and the month ahead.
They are an adult beginner who makes many mistakes and learns slowly, so name real progress plainly and keep it honest.

Input:
- "month": this month (YYYY-MM). "months": the last 6 months, oldest first: takes, minutes, average accuracy (%),
  average spread (ms, lower = steadier) and best BPM at 90%+. A month with 0 takes wasn't played.
- "skills": the skill map (mastery 0–1, "due" = not practised for a while). "lessonsFinished": lessons finished this month.
- "teacherNotes": what a human teacher said (may be empty). "lastReport": last month's report (may be missing).

Write:
- "headline": one sentence, the month in a nutshell (e.g. "Your timing got steadier: spread down from 38 to 27 ms.").
- "better": 1–4 concrete things that improved, each with the number that shows it. If little changed, say what they kept up.
- "next": 1–3 things to work on next month, from the weakest or due skills and the teacher's notes.
- "note": 2–3 sentences of encouragement in plain words, no jargon.

Answer shape: { "headline": string, "better": string[], "next": string[], "note": string }
