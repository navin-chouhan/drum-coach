import { describe, expect, expectTypeOf, it } from 'vitest';

import type { YtEvent } from '../../../src/youtube/ytController';
import { toYtEvent, type NativeYtEvent } from './events';

const LOAD = 'Could not load YouTube. Are you online?';

describe('the native player events (PlayerPage.swift messages) as YtEvents', () => {
  it('fits the controller\'s YtEvent', () => {
    expectTypeOf<NativeYtEvent>().toExtend<YtEvent>();
  });

  it('maps each message, keeping `at` (host clock) when it has one', () => {
    expect(toYtEvent({ event: { type: 'ready', raw: 0, rate: 1, at: 5000, duration: 212, title: 'Song', rates: [0.5, 1, 'x'] } }, LOAD))
      .toEqual({ type: 'ready', raw: 0, rate: 1, at: 5000, duration: 212, title: 'Song', rates: [0.5, 1] });
    expect(toYtEvent({ event: { type: 'state', state: 1, raw: 3, rate: 0.75, duration: 212, title: 'Song' } }, LOAD))
      .toEqual({ type: 'state', state: 1, raw: 3, rate: 0.75, duration: 212, title: 'Song' });
    expect(toYtEvent({ event: { type: 'sample', raw: 3.05, rate: 1, at: 5050, duration: 212 } }, LOAD))
      .toEqual({ type: 'sample', raw: 3.05, rate: 1, at: 5050, duration: 212 });
    expect(toYtEvent({ event: { type: 'rate', raw: 4, rate: 0.5, at: Number.NaN } }, LOAD)).toEqual({ type: 'rate', raw: 4, rate: 0.5 });
  });

  it('errors: YouTube\'s code, or the app\'s text when the API didn\'t load', () => {
    expect(toYtEvent({ event: { type: 'error', code: 153 } }, LOAD)).toEqual({ type: 'error', code: 153 });
    expect(toYtEvent({ event: { type: 'error', load: true } }, LOAD)).toEqual({ type: 'error', message: LOAD });
  });

  it('ignores anything else', () => {
    expect(toYtEvent(null, LOAD)).toBeNull();
    expect(toYtEvent({}, LOAD)).toBeNull();
    expect(toYtEvent({ event: { type: 'hello' } }, LOAD)).toBeNull();
    expect(toYtEvent({ event: 'ready' }, LOAD)).toBeNull();
  });
});
