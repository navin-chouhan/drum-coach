# Long-running speech-to-text helper (faster-whisper, offline). Loads the model once, then transcribes files.
# Input:  {"id": 1, "path": "/tmp/q.webm"}   Output: {"id": 1, "ok": true, "text": "..."} or {"id": 1, "ok": false, "error": "..."}
import json, sys, wave
import numpy as np
from faster_whisper import WhisperModel


def load_wav(path):
    # 16-bit PCM WAV (the browser sends 16 kHz mono) -> float32 at 16 kHz, without ffmpeg/PyAV
    with wave.open(path, "rb") as w:
        rate, ch = w.getframerate(), w.getnchannels()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0
    if ch > 1:
        x = x.reshape(-1, ch).mean(axis=1)
    if rate != 16000:
        x = np.interp(np.arange(0, len(x), rate / 16000), np.arange(len(x)), x).astype(np.float32)
    return x

# drum vocabulary so "the and of three" isn't heard as "the end of three"
VOCAB = "Drum lesson. Kick, snare, hi-hat, ride, crash, toms, the and of three, the e and a, ghost notes, accents, fills, grooves, paradiddle, BPM, click, rushing, dragging."

model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8", download_root=sys.argv[2])
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    req = {}
    try:
        req = json.loads(line)
        with open(req["path"], "rb") as f:
            is_wav = f.read(4) == b"RIFF"
        audio = load_wav(req["path"]) if is_wav else req["path"]
        segments, _ = model.transcribe(audio, language="en", beam_size=1, vad_filter=True, initial_prompt=VOCAB)
        print(json.dumps({"id": req["id"], "ok": True, "text": " ".join(s.text.strip() for s in segments).strip()}), flush=True)
    except Exception as e:  # keep serving after a bad file
        print(json.dumps({"id": req.get("id"), "ok": False, "error": str(e)}), flush=True)
