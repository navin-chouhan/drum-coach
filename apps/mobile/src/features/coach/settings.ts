// The coach's settings, read from the web's `drumcoach.settings` key (core input/settings: shape, defaults,
// migrations). Read-only here: Setup (A7c) changes them.
import { DEFAULTS, migrate, type Settings } from '@drum-coach/core/input/settings';
import type { KeyValueStore } from '@drum-coach/core/platform';
import { KV_KEYS } from '../../data/kv';

export type CoachSettings = Pick<Settings, 'liveCoach' | 'voice' | 'aiTips' | 'liveTips' | 'chattiness' | 'voiceVolume' | 'profile'>;

export function readSettings(kv: Pick<KeyValueStore, 'get'>): Settings {
  let saved: Partial<Settings> = {};
  try {
    const v: unknown = JSON.parse(kv.get(KV_KEYS.settings) ?? '{}');
    if (v && typeof v === 'object' && !Array.isArray(v)) saved = v as Partial<Settings>;
  } catch { /* broken: the defaults */ }
  return migrate({ ...DEFAULTS, ...saved, profile: { ...DEFAULTS.profile, ...saved.profile } });
}

