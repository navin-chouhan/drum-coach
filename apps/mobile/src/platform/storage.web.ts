// Storage on the web: the layout harness only (scripts/screenshots.mjs; the app is iPad-only). In memory, seeded with
// fake data for the state in the URL (src/dev/harness/seeds.ts). Metro picks this file for `--platform web` only.
import type { RunRow } from '@drum-coach/core/engine/progress';
import { createDataStore, type AppStorage } from '../data/store';
import type { AiLesson, AiLessonsRepo, PlansRepo, SettingsRepo } from '../data/records';
import type { RunsRepo } from '../data/runs';
import type { ChartsRepo, SongsRepo } from '../data/songs';
import type { Grid, YtSong } from '@drum-coach/core/youtube/schemas';
import { harnessState, seedFor } from '../dev/harness/seeds';
import { KV_KEYS } from '../data/kv';

export const DATABASE_NAME = 'drumcoach.db';

let instance: AppStorage | null = null;

export function getStorage(): AppStorage {
  if (instance) return instance;
  const seed = seedFor(harnessState());
  const base = createDataStore(() => { throw new Error('web harness: in memory'); }, () => {});
  base.kv.set(KV_KEYS.settings, JSON.stringify(seed.settings));
  const runs: RunRow[] = [...seed.runs];
  const runsRepo: RunsRepo = {
    add: async () => String(runs.length),
    list: async () => runs,
    take: async () => null,
    recent: async n => runs.slice(-n).reverse() as never,
  };
  let ai = [...seed.ai] as AiLesson[];
  const aiLessons: AiLessonsRepo = {
    list: async () => ai, put: l => { ai = [...ai.filter(x => x.id !== l.id), l]; }, remove: id => { const n = ai.length; ai = ai.filter(x => x.id !== id); return ai.length < n; },
    replace: (l, ids) => { ai = [...ai.filter(x => x.id !== l.id && !ids.includes(x.id)), l]; },
  };
  const plans: PlansRepo = { latest: async () => (seed.plan ? { id: 1, plan: seed.plan, checks: {} } as never : null), add: () => 1, setChecks: () => true };
  // Progress's show-off set and the teacher page read the settings rows; the Songs library uses the in-memory songs
  const rows: Record<string, unknown> = { ...seed.rows };
  const settings: SettingsRepo = { get: k => rows[k], put: (k, v) => { rows[k] = v; }, all: () => ({ ...rows }) };
  instance = { ...base, runs: runsRepo, aiLessons, plans, settings, ...(seed.songs && { songs: memorySongs(seed.songs), charts: noCharts, openError: null }) };
  return instance;
}

/** No imported files in the harness (the Songs states): an empty charts table that refuses writes. */
const noCharts: ChartsRepo = {
  list: () => [], get: () => null, save: () => { throw new Error('web harness: no imports'); },
  setSyncOffset: () => false, setAudio: () => false, remove: () => null, restore: () => false,
};

/** The Songs library in memory (the `songs` state): enough of SongsRepo for the screens to list, open and edit. */
function memorySongs(seeded: YtSong[]): SongsRepo {
  let songs = seeded.map(s => ({ ...s }));
  const grids: Record<string, Grid> = Object.assign({}, ...songs.map(s => s.grids));
  const withGrids = (s: YtSong): YtSong => ({ ...s, grids: Object.fromEntries([s.originalId, s.drumlessId, s.coverId].flatMap(v => (v && grids[v] ? [[v, grids[v]]] : []))) });
  return {
    list: () => songs.map(withGrids),
    get: id => { const s = songs.find(x => x.id === id); return s ? withGrids(s) : null; },
    add: input => {
      const old = songs.find(x => x.originalId === input.originalId);
      if (old) return withGrids(old);
      const s: YtSong = { id: `yt-${input.originalId}`, title: input.title, originalId: input.originalId, drumlessId: input.drumlessId ?? null, coverId: input.coverId ?? null, timeSignature: [4, 4], notes: [], grids: {} };
      songs = [s, ...songs];
      return withGrids(s);
    },
    patch: (id, p) => {
      songs = songs.map(x => (x.id === id ? { ...x, ...(p as Partial<YtSong>) } : x));
      const s = songs.find(x => x.id === id);
      return s ? withGrids(s) : null;
    },
    remove: id => { songs = songs.filter(x => x.id !== id); },
    saveGrid: (videoId, g) => { grids[videoId] = g; },
  };
}

export type { AppStorage } from '../data/store';
export { KV_KEYS } from '../data/kv';
