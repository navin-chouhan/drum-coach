import { DEFAULTS } from '@drum-coach/core/input/settings';
import { describe, expect, it } from 'vitest';
import { PARENT, coachCard, lastHitLine, rowLines, setupViewOf } from './setupHome';

describe('Setup home (D10: is everything working)', () => {
  it('opens pages and tools by name; the old Coach and voice link lands on Coach connection; tools close back to their page', () => {
    expect([setupViewOf('kitpads'), setupViewOf('notemap'), setupViewOf('coach'), setupViewOf('nope'), setupViewOf(undefined)]).toEqual(['kitpads', 'notemap', 'connection', null, null]);
    expect([PARENT.notemap, PARENT.input, PARENT.apikey, PARENT.latency, PARENT.kitpads]).toEqual(['kitpads', 'kitpads', 'connection', undefined, undefined]);
  });

  it('the Kit card says the last hit', () => {
    expect(lastHitLine({ note: 38, velocity: 96, name: 'Snare' })).toBe('last hit: snare 38 · v96');
    expect(lastHitLine(undefined)).toBe('hit a pad: it shows here');
  });

  it('the Coach card: where the coach answers from, and the one fix', () => {
    expect(coachCard('reachable', 'drum-laptop.local:8787', false)).toEqual({ title: 'Home server', sub: 'drum-laptop.local:8787', dot: 'on' });
    expect(coachCard('reachable', 'h', true).sub).toBe('h · API key as fallback');
    expect(coachCard('not-configured', undefined, false)).toMatchObject({ title: 'Not set up', dot: 'bad', fix: 'Set up' });
    expect(coachCard('not-configured', undefined, true)).toMatchObject({ title: 'API key only', dot: 'off', fix: 'Set up' });
    expect(coachCard('unreachable', 'h', false)).toMatchObject({ title: 'Server offline', sub: 'h doesn’t answer', fix: 'Check' });
    expect(coachCard('unknown', undefined, false).title).toBe('Checking…');
  });

  it("the rows' lines (setup-after.png)", () => {
    const l = rowLines(DEFAULTS, { clash: false, serverSet: true, hasKey: true });
    expect(l.kitpads).toBe('Hit each pad · soft then loud · note map · MIDI input');
    expect(l.sound).toBe('Click 100% · band 60% · coach voice 100%');
    expect(l.voice).toBe('On · Normal · verdicts and count spoken');
    expect(l.play).toBe('Kit gestures on · autopilot off · right hand leads');
    expect(l.connection).toBe('Home server · API key fallback · 25 min a day');
    const quiet = rowLines({ ...DEFAULTS, voice: false, countIn: false, liveTips: 'voice', chattiness: 'quiet', leftHanded: true, autopilot: true, padCommands: false }, { clash: true, serverSet: false, hasKey: false });
    expect(quiet.voice).toBe('On · Short · tips spoken');
    expect(quiet.play).toBe('Kit gestures off · autopilot on · left hand leads');
    expect(quiet.kitpads).toBe('two pads share a note: hit each pad again');
    expect(quiet.connection).toBe('No home server · no API key · 25 min a day');
    expect(rowLines({ ...DEFAULTS, voice: false, countIn: false }, { clash: false, serverSet: false, hasKey: false }).voice).toBe('Off · Normal');
    expect(rowLines({ ...DEFAULTS, liveTips: 'voice' }, { clash: false, serverSet: false, hasKey: false }).voice).toBe('On · Normal · verdicts, tips and count spoken');
  });
});
