import { DEFAULTS, type Settings } from '@drum-coach/core/input/settings';
import type { KeyValueStore } from '@drum-coach/core/platform';
import { describe, expect, it } from 'vitest';
import { finishKitSteps, needsFirstRun, nextStep, notSureYet, placementQueued, queuePlacement, saveWelcome, STEP_SPOKEN, STEPS, stepPills, toggleGoal, welcomeForm } from './firstRun';

const S = (p: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, ...p });

describe('first run', () => {
  it('shows until the welcome step is saved, with the web profile', () => {
    expect(needsFirstRun(S())).toBe(true);
    let f = welcomeForm(S());
    expect(f).toEqual({ goals: [], minutes: 25, playedBefore: false });
    f = toggleGoal(toggleGoal(f, 'rock'), 'funk');
    expect(f.goals).toEqual(['rock', 'funk']);
    expect(toggleGoal(f, 'rock').goals).toEqual(['funk']);
    expect(notSureYet(f).goals).toEqual([]);
    const patch = saveWelcome(S({ session: { date: 'x', items: [], done: [] } }), { ...f, minutes: 30 });
    expect(patch.profile).toMatchObject({ goals: ['rock', 'funk'], minutesPerDay: 30, onboarded: true });
    expect('session' in patch && patch.session).toBeUndefined();
    expect(needsFirstRun(S(patch))).toBe(false);
  });
  it('walks the steps and finishes like the web kit step', () => {
    expect(stepPills('pads').map(p => p.state)).toEqual(['done', 'done', 'cur', 'todo']);
    expect(nextStep('welcome')).toBe('plug');
    expect(nextStep('latency')).toBe('finish');
    expect(finishKitSteps(S(), true)).toEqual({ setupDone: true, setupNudged: true });
    expect(finishKitSteps(S(), false)).toEqual({ setupDone: false, setupNudged: true });
    expect(finishKitSteps(S({ setupDone: true }), false)).toEqual({ setupDone: true, setupNudged: true });
  });
  it('queues the placement test for players who have played before', () => {
    const d = new Map<string, string>();
    const kv: KeyValueStore = { get: k => d.get(k) ?? null, set: (k, v) => { d.set(k, v); }, remove: k => { d.delete(k); } };
    queuePlacement(kv, true);
    expect(placementQueued(kv)).toBe(true);
    queuePlacement(kv, false);
    expect(placementQueued(kv)).toBe(false);
  });
});

describe('first run, voice first (D10)', () => {
  it('every step has a short spoken instruction', () => {
    expect(Object.keys(STEP_SPOKEN)).toEqual(STEPS.map(s => s.id));
    for (const line of Object.values(STEP_SPOKEN)) expect(line.length).toBeLessThan(120);
    expect(STEP_SPOKEN.plug).toBe('Plug your kit into the iPad, then hit any pad.');
  });
});
