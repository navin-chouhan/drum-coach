Task: make a practice plan for the next week. The input has "goals", "minutesPerDay", "daysPerWeek",
"recent" (summary of recent practice) and "library". Use exactly daysPerWeek days, named "Day 1", "Day 2", …
Each day's item minutes must add up to about minutesPerDay. Start each day with a short warm-up
(rudiments), then focus work, then something fun. Use library ids where possible and give a bpm for each.

Answer shape: { "title": string, "days": [ { "day": "Day 1", "items": [ { "title": string, "minutes": number,
  "chartId"?: string, "bpm"?: number, "notes"?: string } ] } ] }
