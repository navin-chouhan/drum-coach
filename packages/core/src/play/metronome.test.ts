import { describe, expect, it } from 'vitest';
import type { AudioEvent } from './audioPort.ts';
import { createFakeAudioPort, createFakeClock, SPEAKER } from './fakeAudio.ts';
import { AHEAD_MS } from './feeder.ts';
import { createMetronome } from './metronome.ts';

const kinds = (events: AudioEvent[]) => events.map(e => (e.kind === 'sound' ? e.sound : e.kind));

describe('createMetronome (Practice, no take)', () => {
  it('clicks forever in chunks, ≥ 2 s ahead, on the Clock', async () => {
    const clock = createFakeClock(1e9), audio = createFakeAudioPort(clock);
    const m = createMetronome({ clock, audio }, { bpm: 120, subdivision: 2 });
    expect(m.running).toBe(false);
    expect(m.stats).toBeNull();
    await m.start();
    expect(m.running).toBe(true);
    expect(m.zero).toBe(1e9 + 300);
    expect(m.beatMs).toBe(500);
    expect(kinds(audio.events).slice(0, 3)).toEqual(['click.bar', 'click.sub', 'click.beat']);
    for (let i = 0; i < 6000; i++) {
      clock.advance(100);
      m.tick(clock.now());
      expect(m.zero + m.stats!.plannedTo * m.beatMs).toBeGreaterThanOrEqual(clock.now() + AHEAD_MS);
    }
    expect(m.position(m.zero + 600_000)).toBe(1200);
    const clicks = audio.events.filter(e => e.at >= m.zero && e.at < m.zero + 600_000);
    expect(clicks).toHaveLength(2400);
    clicks.forEach((e, k) => expect(e.at).toBe(m.zero + k * 250));
    expect(m.stats!.late).toBe(0);
    m.stop();
    expect(m.running).toBe(false);
    expect(audio.cancels).toHaveLength(1);
    m.tick(clock.now() + 10_000);
    expect(audio.events.filter(e => e.at > clock.now())).toEqual([]);
  });

  it('counts in, in 7/8 groups, and leaves out a missing word', async () => {
    const clock = createFakeClock(0), audio = createFakeAudioPort(clock);
    audio.missing = new Set(['seven']);
    const m = createMetronome({ clock, audio }, { bpm: 120, timeSignature: [7, 8], countInBars: 1, countVoice: true });
    await m.start();
    expect(m.zero).toBe(300 + 3.5 * 500);
    const words = kinds(audio.events).filter(k => k.startsWith('word.'));
    expect(words).toEqual(['word.one', 'word.two', 'word.three', 'word.four', 'word.five', 'word.six']);
    expect(kinds(audio.events.filter(e => e.at >= m.zero)).slice(0, 7)).toEqual(['click.bar', 'click.sub', 'click.beat', 'click.sub', 'click.beat', 'click.sub', 'click.sub']);
  });

  it('without audio it stays silent; stop while starting; start again', async () => {
    const clock = createFakeClock(0), audio = createFakeAudioPort(clock, null);
    const m = createMetronome({ clock, audio }, { bpm: 60, clickOn: '2and4', gapBars: 2 });
    await m.start();
    expect(m.running).toBe(true);
    m.stop();
    const live = createFakeAudioPort(clock, SPEAKER), n = createMetronome({ clock, audio: live }, { bpm: 60 });
    const p = n.start();
    void n.start(); // already starting: a no-op
    n.stop();
    await p;
    expect(n.running).toBe(false);
    expect(live.calls).toEqual([]);
    await n.start();
    expect(n.running).toBe(true);
    expect(live.calls).toHaveLength(1);
  });
});
