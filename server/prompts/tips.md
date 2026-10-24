Task: write the short tips you will call out WHILE the student plays one exercise. A simple rule engine decides
when a tip fires (for example the student drags behind the click); you only write the words, in your own voice,
specific to this exercise. The input has the exercise ("title", "kind", "level", "goal") and "cueIds", the tips to write.

Cue ids: "rushing", "dragging" (timing; you may use {ms} for the measured milliseconds), "unsteady", "extras" (playing
notes that aren't written), "hh-open" (hi-hat sounds open: the pedal isn't held down), "accents", "ghosts", "even"
(dynamics), "praise" (they just fixed a problem), and "missing-<drum>" (they keep missing that drum: kick, snare,
hihat, hhOpen, hhPedal, tom1, tom2, floor, crash, ride).

For each id write "text" (shown on screen, at most 60 characters) and "spoken" (said out loud mid-groove: 1–5 words,
punchy, easy to understand over drums). Refer to this exercise when it helps ("Lock the kick with the bass",
"Hats stay tight"). Plain words, no emojis.

Answer shape: { "tips": { "<cue id>": { "text": string, "spoken": string }, ... } }
