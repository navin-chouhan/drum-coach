import { DEFAULTS, type Settings } from '@drum-coach/core/input/settings';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { describe, expect, it } from 'vitest';
import type { ApiFailure, ServerHealth } from '../../platform/contracts';
import { validateServerConfig } from '../../data/homeServer';
import { doneCount, kitNag, levelsShort, orderedChecks, setupChecks } from './checklist';
import { apiKeyValue, hasApiKey, saveApiKey, saveServer, testConnection, validateApiKey, type SecretStore, type ServerClient } from './coachServer';
import { connectedInput, firstHitLine, kitStatus, lastHitView, savedInput } from './kit';
import { THRONE_BEAT_MS, answerForKey, answerForPad, busLevels, clampLevel, loopEvents, nudgeLevel, throneAnswer, throneAsk } from './sound';

describe('sound check loop', () => {
  it('plans clicks and the band beat by beat, never twice', () => {
    const a = loopEvents('click', 1000, 0, 1000 + 2 * THRONE_BEAT_MS + 1);
    expect(a.next).toBe(3);
    expect(a.events.map(e => e.kind === 'sound' && e.sound)).toEqual(['click.bar', 'click.beat', 'click.beat']);
    expect(loopEvents('click', 1000, a.next, 1000 + 2 * THRONE_BEAT_MS + 1).events).toHaveLength(0);
    const b = loopEvents('band', 0, 0, THRONE_BEAT_MS * 2 - 1);
    expect(b.events.map(e => e.kind === 'band' && e.part)).toEqual(['bass', 'keys', 'bass']);
  });
});

const S = (p: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, ...p });
const run = (meanOffset: number) => ({ meanOffset } as RunRow);

describe('setup checklist', () => {
  it('puts latency first when never measured, with the late-takes reason', () => {
    const rows = setupChecks({ settings: S(), padCal: {}, runs: [run(90), run(110), run(95), run(100), run(105)], device: 'e-Drum' });
    const lat = rows.find(r => r.id === 'latency')!;
    expect(lat.first).toBe(true);
    expect(lat.why).toBe("Your last 5 takes all landed about 0.1 s after the click. If that's the setup, this fixes it.");
    expect(orderedChecks(rows)[0].id).toBe('latency');
    expect(doneCount(rows)).toBe(2); // hand + kit
  });
  it('marks checks done the web way', () => {
    const rows = setupChecks({ settings: S({ latencyChecked: true, latencyMs: 31, padsCheckedAt: '2026-10-28', clickVolume: 1.25 }), padCal: { kick: { soft: 1, loud: 2 } }, runs: [], device: null });
    expect(rows.every(r => !r.first)).toBe(true);
    expect(rows.find(r => r.id === 'latency')!.text).toMatch(/takes 31 ms off every hit/);
    expect(rows.find(r => r.id === 'pads')!.text).toMatch(/Last checked 28 Oct\.$/);
    expect(rows.find(r => r.id === 'velocity')!.text).toMatch(/^Done for 1 pad:/);
    expect(rows.find(r => r.id === 'kit')!.done).toBe(false);
    expect(doneCount(rows)).toBe(5);
  });
  it('nags until pads and latency are done', () => {
    expect(kitNag(S())).toBe('Pads and latency not checked yet');
    expect(kitNag(S({ setupDone: true }))).toBe('Latency not checked yet');
    expect(kitNag(S({ setupDone: true, latencyChecked: true }))).toBeNull();
    expect(levelsShort(S({ clickVolume: 1.25, voiceVolume: 0.45 }))).toBe('click 125% · band 60% · coach voice 45%');
  });
});

describe('kit status', () => {
  const inputs = [{ id: '1', name: 'e-Drum', manufacturer: 'Medeli', online: true }, { id: '2', name: 'Other', manufacturer: '', online: false }];
  it('names the kit, the input and the last hit', () => {
    expect(kitStatus(true, connectedInput(inputs, '1'))).toEqual({ title: 'e-Drum', sub: 'USB · Medeli · connected', connected: true, noMidi: false });
    expect(kitStatus(true, connectedInput(inputs, '2')).title).toBe('No kit plugged in');
    expect(kitStatus(false, null).noMidi).toBe(true);
    expect(savedInput(inputs, 'e-Drum')?.id).toBe('1');
    expect(savedInput(inputs, 'Other')).toBeNull();
    expect(lastHitView({ note: 38, velocity: 92, time: 0, pad: 'snare' })).toMatchObject({ name: 'Snare', sub: 'note 38 · velocity 92' });
    expect(lastHitView({ note: 52, velocity: 40, time: 0 })).toMatchObject({ name: 'Note 52', sub: 'not mapped · velocity 40' });
    expect(firstHitLine({ note: 38, velocity: 92, time: 0, pad: 'snare' })).toBe('BAM! You hit the snare');
  });
});

describe('coach server and API key', () => {
  const health: ServerHealth = { ok: true, version: '1', coach: true, tts: false, stt: false, youtube: false };
  const client = (answer: ServerHealth | ApiFailure, token = false): ServerClient & { saved: unknown } => {
    const c = {
      saved: null as unknown,
      configure: async (cfg: unknown) => { c.saved = cfg; },
      configured: () => null,
      health: async () => answer,
      hasToken: async () => token,
    };
    return c;
  };
  it('tests the connection with its time', async () => {
    let t = 0;
    const now = () => (t += 140) - 140;
    expect(await testConnection(client(health), now)).toMatchObject({ ok: true, text: 'Connected · 140 ms' });
    expect(await testConnection(client({ ok: false, reason: 'unauthorized', status: 401 }), now)).toMatchObject({ ok: false, title: 'Wrong token (HTTP 401)' });
  });
  it('validates before saving, and asks for the token again to change the address', async () => {
    const c = client(health);
    expect(await saveServer(c, validateServerConfig, 'drum-laptop:8787', 'x'.repeat(30), () => 0)).toHaveProperty('error');
    const ok = await saveServer(c, validateServerConfig, 'http://drum-laptop.local:8787/', 'x'.repeat(30), () => 0);
    expect(ok).toMatchObject({ ok: true });
    expect(c.saved).toEqual({ url: 'http://drum-laptop.local:8787', token: 'x'.repeat(30) });
    expect(await saveServer(client(health, true), validateServerConfig, 'http://a:1', '', () => 0)).toEqual({ error: expect.stringMatching(/Paste the token again/) });
  });
  it('keeps an API key in the secret store', async () => {
    const d = new Map<string, string>();
    const secrets: SecretStore = { get: async k => d.get(k) ?? null, set: async (k, v) => { d.set(k, v); }, remove: async k => { d.delete(k); } };
    expect(validateApiKey('abc')).toMatchObject({ ok: false });
    expect(await saveApiKey(secrets, ' sk-ant-api03-abcdefghijklmnop ')).toEqual({ ok: true });
    expect(await hasApiKey(secrets)).toBe(true);
    expect(apiKeyValue(true)).toBe('Set · used later');
  });
});

describe('sound', () => {
  it('maps levels and answers like the web', () => {
    expect(busLevels(S({ clickVolume: 1.2 }))).toEqual({ click: 1.2, drums: 1.2, band: 0.6, voice: 1 });
    expect(clampLevel('bandVolume', -1)).toBe(0);
    expect(clampLevel('clickVolume', 1.27)).toBe(1.25);
    expect(nudgeLevel(1.2, 0, 'clickVolume')).toBe(1.25);
    expect(nudgeLevel(0.25, 2, 'voiceVolume')).toBe(0.2);
    expect(answerForPad('hhOpen')).toBe(0);
    expect(answerForPad('floor')).toBe(2);
    expect(answerForPad('kick')).toBeNull();
    expect(answerForKey('2')).toBe(1);
    expect(throneAnswer(0, 0, S())).toEqual({ step: 0, patch: { clickVolume: 1.1 }, finished: false, replay: false });
    expect(throneAnswer(2, 2, S())).toMatchObject({ patch: { voiceVolume: 0.9 }, replay: true });
    expect(throneAnswer(2, 1, S())).toEqual({ step: 3, patch: { soundChecked: true }, finished: true, replay: false });
    expect(throneAsk(1, S())).toMatch(/\(now 60%\)$/);
  });
});
