import { useEffect, useState } from 'react';
import type { Chart } from '../engine/chart';
import { LIBRARY } from './library';

export type StoredChart = Chart & { id: string; source?: 'builtin' | 'import' | 'ai'; hasAudio?: boolean; syncOffsetMs?: number };

let saved: StoredChart[] = [];
const listeners = new Set<() => void>();

/** Reloads charts saved on the server (imported songs and AI-made exercises). */
export async function refreshCharts() {
  try {
    const r = await fetch('/api/charts');
    if (r.ok) { saved = await r.json(); listeners.forEach(l => l()); }
  } catch { /* server down: built-ins still work */ }
}

export function useCharts(): StoredChart[] {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force(x => x + 1);
    listeners.add(l);
    void refreshCharts();
    return () => { listeners.delete(l); };
  }, []);
  return [...LIBRARY.map(c => ({ ...c, source: 'builtin' as const })), ...saved];
}

export async function saveChart(chart: Chart & { id?: string }, source: 'import' | 'ai'): Promise<StoredChart> {
  const r = await fetch('/api/charts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chart, source }) });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `Save failed (${r.status})`);
  const out = await r.json();
  await refreshCharts();
  return out;
}

const buffers = new Map<string, Promise<AudioBuffer>>();
export function loadBacking(id: string, ctx: AudioContext) {
  if (!buffers.has(id)) {
    buffers.set(id, fetch(`/api/charts/${encodeURIComponent(id)}/audio`)
      .then(r => { if (!r.ok) throw new Error('No audio'); return r.arrayBuffer(); })
      .then(b => ctx.decodeAudioData(b))
      .catch(e => { buffers.delete(id); throw e; }));
  }
  return buffers.get(id)!;
}
