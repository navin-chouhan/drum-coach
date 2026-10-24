# Hardware notes — Millenium MPS-150

## Module
- Thomann house brand, 8 trigger inputs, 10 kits, 108 voices, 40 patterns, metronome 30–280 BPM.
- Back panel: PHONES (3.5 mm), AUX IN (3.5 mm), OUTPUT L/MONO + R (6.3 mm), MIDI OUT (5-pin DIN),
  USB-B (**MIDI only, no audio**), 9 V DC, power switch.
- USB is class-compliant: no driver needed on Linux, macOS or iPadOS.
- Manual: https://images.static-thomann.de/pics/atg/atgdata/document/manual/c_360221_modul_v4_en_online.pdf

## Useful module operations
- **Factory reset:** switch off → hold [–] and [+] → switch on.
- **Change a pad's MIDI note:** MODE until VOICE lights → hit the pad → PAGE until display shows `Nxx`
  → set with [–]/[+] (0–99).
- Turn the module VOLUME down when the app plays its own sounds, otherwise you hear both.

## Verified MIDI behaviour (captured with MIDI Wrench on iPad and MIDI Monitor on macOS)
| Pad | Note | Notes |
|---|---|---|
| Kick | 36 | |
| Snare | 38 | |
| Tom 1 (low tom, user's name) | 48 | was wrongly 49 until fixed on the module |
| Tom 2 | 45 | |
| Floor tom | 43 | |
| Crash | 49 | |
| Ride | 51 | |
| Hi-hat | 46 open / 42 closed | open unless pedal is down |
| Hi-hat pedal | 44 | also sends poly aftertouch 127 on 42/44/46 (choke) |

Channel 10 for everything. Background messages: MIDI Clock (0xF8) ~every 24 ms, Active Sensing (0xFE).

## Linux checks
```
amidi -l                      # should list: hw:1,0,0  e-Drum MIDI 1
amidi -p hw:1,0,0 -d          # raw dump; close before opening the browser
```

## Audio latency (Linux)
App sounds (clicks, browser drum sounds) reach the speakers `baseLatency + outputLatency` late; the Latency card shows it.
On PipeWire, start Chrome with `PIPEWIRE_LATENCY=128/48000 google-chrome` for a smaller output buffer. The kit module's
own sound has no such delay: for playing, headphones on the module with browser drum sounds off is the fastest path.
