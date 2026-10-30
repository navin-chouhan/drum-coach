// Latency per audio output (D6; AUDIO-DESIGN §3.3, §5): each route (AudioPort route.key: the iPad speaker, the USB-C
// hub into the module's AUX IN, Bluetooth …) keeps its own measured latency. The core keeps reading one number,
// settings.latencyMs; this file sets it from the current route's measurement on every route event. Stored under its
// own key (the web has one value and no such key). Pure: takes the store.
import type { Settings } from '@drum-coach/core/input/settings';
import type { KeyValueStore } from '@drum-coach/core/platform';
import type { AudioRoute } from '@drum-coach/core/play/audioPort';

export const LATENCY_BY_ROUTE_KEY = 'drumcoach.latencyByRoute';

export type RouteLatency = { ms: number; measuredAt: string; name: string; kind: AudioRoute['kind'] };
export type LatencyByRoute = Record<string, RouteLatency>;

export function readLatencyByRoute(kv: Pick<KeyValueStore, 'get'>): LatencyByRoute {
  try {
    const v: unknown = JSON.parse(kv.get(LATENCY_BY_ROUTE_KEY) ?? '{}');
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    return Object.fromEntries(Object.entries(v as Record<string, RouteLatency>).filter(([, r]) => r && Number.isFinite(r.ms)));
  } catch { return {}; }
}

/** Saves a measurement for this route; returns the settings patch (the number core reads, and "checked"). */
export function saveRouteLatency(kv: KeyValueStore, route: Pick<AudioRoute, 'key' | 'name' | 'kind'>, ms: number, now = new Date()): Pick<Settings, 'latencyMs' | 'latencyChecked'> {
  const all = readLatencyByRoute(kv);
  all[route.key] = { ms: Math.round(ms), measuredAt: now.toISOString(), name: route.name, kind: route.kind };
  kv.set(LATENCY_BY_ROUTE_KEY, JSON.stringify(all));
  return { latencyMs: Math.round(ms), latencyChecked: true };
}

/** "Reset to 0" for this route. */
export function clearRouteLatency(kv: KeyValueStore, routeKey: string): Pick<Settings, 'latencyMs' | 'latencyChecked'> {
  const all = readLatencyByRoute(kv);
  delete all[routeKey];
  kv.set(LATENCY_BY_ROUTE_KEY, JSON.stringify(all));
  return { latencyMs: 0, latencyChecked: false };
}

/**
 * On a route event: the settings patch that makes latencyMs this route's, or null when nothing changes. An output never
 * measured reads as not checked (Setup's "do this first" and the sidebar say so); its old number stays until measured.
 */
export function syncToRoute(all: LatencyByRoute, route: Pick<AudioRoute, 'key'> | null, s: Pick<Settings, 'latencyMs' | 'latencyChecked'>): Partial<Settings> | null {
  if (!route) return null;
  const r = all[route.key];
  if (r) return r.ms === s.latencyMs && s.latencyChecked ? null : { latencyMs: r.ms, latencyChecked: true };
  return s.latencyChecked ? { latencyChecked: false } : null;
}

/** "iPad speakers", "USB audio (USB)", "AirPods (Bluetooth)". */
export function routeLabel(route: Pick<AudioRoute, 'kind' | 'name'> | null): string {
  if (!route) return 'the iPad’s output';
  switch (route.kind) {
    case 'speaker': return 'iPad speakers';
    case 'wired': return route.name && route.name !== 'Headphones' ? `${route.name} (wired)` : 'wired headphones';
    case 'usb': return `${route.name} (USB)`;
    case 'bluetooth': return `${route.name} (Bluetooth)`;
    case 'airplay': return `${route.name} (AirPlay)`;
    default: return route.name;
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "28 Oct" from an ISO time or a YYYY-MM-DD day. */
export function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : iso;
}

export type LatencyRow = { title: string; sub: string; measured: boolean };

/** Setup's latency row (mockup: "31 ms" · "iPad speakers · measured 28 Oct"), for the current route. */
export function latencyRow(all: LatencyByRoute, route: Pick<AudioRoute, 'key' | 'kind' | 'name'> | null, s: Pick<Settings, 'latencyMs' | 'latencyChecked'>): LatencyRow {
  const r = route ? all[route.key] : undefined;
  if (r) return { title: `${r.ms} ms`, sub: `${routeLabel(route)} · measured ${shortDate(r.measuredAt)}`, measured: true };
  if (route) return { title: 'Not measured', sub: `${routeLabel(route)} · new output: measure latency (30 s)`, measured: false };
  return s.latencyChecked ? { title: `${s.latencyMs} ms`, sub: 'measured', measured: true } : { title: 'Not measured', sub: 'Tap a pad with 16 clicks', measured: false };
}

/** The other outputs measured before ("AirPods (Bluetooth) 212 ms"). */
export function otherRoutes(all: LatencyByRoute, currentKey: string | null): string[] {
  return Object.entries(all).filter(([k]) => k !== currentKey).map(([, r]) => `${routeLabel(r)} ${r.ms} ms`);
}

export const LATENCY_FOOT = 'Bluetooth headphones add 150–250 ms. Measure again when you change what you listen through.';
