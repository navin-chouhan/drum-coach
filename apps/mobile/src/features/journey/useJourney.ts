// Journey's data on the iPad: settings (live), runs, coach lessons and the weekly plan (reloaded whenever Journey is
// focused, e.g. after a take, or when the coach saved a lesson: `reload`), built into the view model.
import type { RunRow } from '@drum-coach/core/engine/progress';
import type { YtSong } from '@drum-coach/core/youtube/schemas';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { getStorage } from '../../platform/storage';
import { useAppSettings } from '../../ui/hooks';
import { progressModel } from '../progress/progress';
import { buildJourney, type JourneyView } from './model';
import { allLessons, planFocus, planWeekFocus } from './source';

type Loaded = { runs: RunRow[]; ai: unknown[]; plan?: Record<string, unknown>; songs: YtSong[] };

export function useJourney(swap: number, asks = 0): { view: JourneyView; loaded: boolean; reload: () => void } {
  const settings = useAppSettings();
  const [data, setData] = useState<Loaded | null>(null);
  const [loads, setLoads] = useState(0);
  const reload = useCallback(() => setLoads(n => n + 1), []);
  useFocusEffect(useCallback(() => {
    let live = true;
    const st = getStorage();
    void Promise.all([
      (st.runs.list() as Promise<RunRow[]>).catch(() => [] as RunRow[]),
      st.aiLessons?.list().catch(() => []) ?? Promise.resolve([]),
      st.plans?.latest().catch(() => null) ?? Promise.resolve(null),
    ]).then(([runs, ai, plan]) => {
      let songs: YtSong[] = [];
      try { songs = st.songs?.list() ?? []; } catch { /* no songs table: no show-off */ }
      if (live) setData({ runs, ai, plan: plan?.plan, songs });
    });
    return () => { live = false; };
  }, [loads])); // eslint-disable-line react-hooks/exhaustive-deps -- `loads` changes on reload(): it re-runs the load
  // The minute matters (greeting, today's key); a new render after a take or a settings change is enough.
  const now = new Date();
  const dayHour = `${now.toDateString()} ${now.getHours()}`;
  const lessons = useMemo(() => allLessons(data?.ai ?? []), [data]);
  // The show-off set is Progress' (songs checked by ear with every bar ready); only its songs are used here.
  const readySongs = useMemo(() => (data?.songs.length
    ? progressModel({ runs: data.runs, progress: settings.lessons, profile: settings.profile, lessons, songs: data.songs }).showoff.songs : []), [data, lessons, settings.lessons, settings.profile]);
  const view = useMemo(() => {
    const at = new Date();
    return buildJourney({ settings, lessons, readySongs, runs: data?.runs ?? [], now: at, swap, focusIds: planFocus(data?.plan, at), aiLoaded: data !== null, asks, weekFocus: planWeekFocus(data?.plan, at) });
  }, [settings, data, lessons, readySongs, swap, asks, dayHour]); // eslint-disable-line react-hooks/exhaustive-deps -- dayHour: rebuilt when the hour changes (the view reads the clock)
  return { view, loaded: data !== null, reload };
}
