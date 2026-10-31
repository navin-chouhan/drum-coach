// The sidebar's three status pills (kit, latency, coach) from what the app knows. Pure (no React Native).
import type { Capabilities } from '../platform/contracts';

export type Dot = 'on' | 'off' | 'warn' | 'bad';
export type StatusRow = { key: 'kit' | 'latency' | 'coach'; name: string; value: string; dot?: Dot; emoji?: string; accessibilityLabel: string };

export type StatusInput = {
  /** The MIDI module is in this build. */
  midi: boolean;
  /** The connected input's name ("e-Drum"), or null when no kit is plugged in. */
  kit: string | null;
  /** The saved latency (ms), or null when it was never measured. */
  latencyMs: number | null;
  coach: Capabilities['coachServer'];
};

const COACH: Record<Capabilities['coachServer'], { value: string; dot: Dot; spoken: string }> = {
  reachable: { value: 'home server', dot: 'on', spoken: 'connected to your home server' },
  unreachable: { value: 'offline', dot: 'bad', spoken: "can't reach your home server" },
  'not-configured': { value: 'not set up', dot: 'off', spoken: 'not set up yet' },
  unknown: { value: 'checking…', dot: 'off', spoken: 'checking' },
};

export function statusRows(s: StatusInput): StatusRow[] {
  const kitValue = !s.midi ? 'touch pads' : s.kit ? 'connected' : 'not plugged in';
  const coach = COACH[s.coach];
  const latency = s.latencyMs === null ? 'not measured' : `${Math.round(s.latencyMs)} ms`;
  return [
    { key: 'kit', name: s.kit ?? 'Kit', value: kitValue, dot: s.kit ? 'on' : s.midi ? 'warn' : 'off', accessibilityLabel: `Kit: ${s.kit ? `${s.kit} connected` : kitValue}` },
    { key: 'latency', name: 'Latency', value: latency, emoji: '⏱', accessibilityLabel: `Latency: ${latency}` },
    { key: 'coach', name: 'Coach', value: coach.value, dot: coach.dot, accessibilityLabel: `Coach: ${coach.spoken}` },
  ];
}

/**
 * The one kit dot at the bottom of the sidebar (D10: it replaces the three pills; latency and the coach show up where
 * they need something). Green: a kit is connected. Orange: no kit plugged in. Grey: touch pads only (no MIDI module).
 */
export type KitDot = { dot: Dot; name: string; value: string; accessibilityLabel: string };

export function kitDot(s: Pick<StatusInput, 'midi' | 'kit'>): KitDot {
  if (s.kit) return { dot: 'on', name: s.kit, value: 'ready', accessibilityLabel: `Kit: ${s.kit} connected. Opens Setup.` };
  if (s.midi) return { dot: 'warn', name: 'Kit', value: 'not plugged in', accessibilityLabel: 'Kit: not plugged in. Opens Setup.' };
  return { dot: 'off', name: 'Kit', value: 'touch pads', accessibilityLabel: 'Kit: touch pads. Opens Setup.' };
}
