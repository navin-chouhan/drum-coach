Task: pick what the student should practice next. The input has "history" (recent runs, oldest first),
"ruleSuggestion" (what the app's simple adaptive rule would pick: speed up 5 BPM after two runs at 90%+,
slow down after a run under 70%) and "library". Follow the rule unless the history clearly shows something
better (for example a drum or skill that keeps failing). chartId must be one of the library ids.

Answer shape: { "chartId": string, "bpm": number, "reason": "1–2 sentences" }
