import { toWav16k } from './wav';

// Microphone capture for talking to the coach. The mic is only open while recording; recordings go to the
// local speech-to-text (server/stt.ts) and are deleted there.

export type Recording = { stop: () => Promise<Blob | null> };

async function open() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mr = new MediaRecorder(stream), chunks: Blob[] = [];
  mr.ondataavailable = e => chunks.push(e.data);
  mr.start();
  const stop = async () => {
    if (mr.state !== 'inactive') await new Promise(r => { mr.onstop = r; mr.stop(); });
    stream.getTracks().forEach(t => t.stop());
    return chunks.length ? new Blob(chunks, { type: mr.mimeType }) : null;
  };
  return { stream, stop };
}

/** Push-to-talk: records until stop(). */
export async function recordWhileHeld(): Promise<Recording> {
  const r = await open();
  return { stop: r.stop };
}

/**
 * Hands-free: listens up to `maxMs`; once speech starts, stops after `silenceMs` of quiet.
 * Returns null if nobody spoke (so drum noise or silence never reaches the coach).
 */
export async function listenForAnswer(maxMs = 6000, silenceMs = 1000): Promise<Blob | null> {
  const r = await open();
  const ctx = new AudioContext(), an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(r.stream).connect(an);
  const data = new Float32Array(an.fftSize);
  let heard = 0, lastVoice = 0;
  const t0 = performance.now();
  await new Promise<void>(done => {
    const tick = () => {
      an.getFloatTimeDomainData(data);
      const rms = Math.sqrt(data.reduce((a, x) => a + x * x, 0) / data.length), now = performance.now();
      if (rms > 0.02) { heard += 1; lastVoice = now; }
      if (now - t0 > maxMs || (heard > 8 && now - lastVoice > silenceMs)) return done();
      setTimeout(tick, 30);
    };
    tick();
  });
  const blob = await r.stop();
  void ctx.close();
  return heard > 8 ? blob : null; // > ~0.25 s of voice-level sound
}

/** Recording → text via the local speech model. */
export async function transcribe(blob: Blob): Promise<string> {
  const res = await fetch('/api/stt', { method: 'POST', headers: { 'content-type': 'audio/wav' }, body: await toWav16k(blob) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error ?? 'Speech recognition failed');
  return String(j.text ?? '').trim();
}
