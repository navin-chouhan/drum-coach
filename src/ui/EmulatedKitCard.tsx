import { useSyncExternalStore } from 'react';
import { getEmulatedKit, setEmulatedKit, subscribeEmulatedKit } from '../input/emulatedKit';

/** Testing without the kit: an emulated MPS-150 and player plays every take through the real MIDI input path. */
export function EmulatedKitCard() {
  const k = useSyncExternalStore(subscribeEmulatedKit, getEmulatedKit);
  const num = (label: string, value: number, set: (v: number) => void, min: number, max: number) => (
    <label>{label} <input type="number" min={min} max={max} value={value} onChange={e => set(Math.max(min, Math.min(max, +e.target.value || 0)))} /></label>
  );
  return (
    <section className="card form">
      <h3>Emulated kit</h3>
      <p className="small">For testing without the kit. It plays every take (not wait mode or songs) like a steady player on an MPS-150,
        sending the same MIDI as the real module: clock messages, pad retriggers, soft-snare → hi-hat crosstalk. Not saved.</p>
      <label className="check"><input type="checkbox" checked={k.on} onChange={e => setEmulatedKit({ on: e.target.checked })} /> Play my takes with the emulated kit</label>
      <div className="row2">
        {num('Late (ms)', k.lateMs, v => setEmulatedKit({ lateMs: v }), -200, 200)}
        {num('Jitter ± (ms)', k.jitterMs, v => setEmulatedKit({ jitterMs: v }), 0, 100)}
        {num('Weak hand (%)', Math.round(k.weakHand * 100), v => setEmulatedKit({ weakHand: v / 100 }), 10, 100)}
      </div>
      <label className="check"><input type="checkbox" checked={k.retriggers} onChange={e => setEmulatedKit({ retriggers: e.target.checked })} /> Pad retriggers (as measured on your kit)</label>
      <label className="check"><input type="checkbox" checked={k.crosstalk} onChange={e => setEmulatedKit({ crosstalk: e.target.checked })} /> Snare → hi-hat crosstalk</label>
    </section>
  );
}
