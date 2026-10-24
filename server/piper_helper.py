# Long-running Piper TTS helper: loads the voice once, then renders one WAV per JSON line on stdin.
# Input:  {"id": 1, "text": "...", "out": "/path/file.wav"}   Output: {"id": 1, "ok": true} or {"id": 1, "ok": false, "error": "..."}
import json, sys, wave
from piper import PiperVoice, SynthesisConfig

voice = PiperVoice.load(sys.argv[1])
slow = SynthesisConfig(length_scale=1.3)  # ~30% slower than the voice's default: a beginner is listening while holding sticks
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    try:
        req = json.loads(line)
        with wave.open(req["out"], "wb") as w:
            voice.synthesize_wav(req["text"], w, syn_config=slow)
        print(json.dumps({"id": req["id"], "ok": True}), flush=True)
    except Exception as e:  # keep serving after a bad request
        print(json.dumps({"id": req.get("id") if isinstance(req, dict) else None, "ok": False, "error": str(e)}), flush=True)
