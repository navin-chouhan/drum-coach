// Journey's data on the iPad: settings (live), runs, coach lessons and the weekly plan (reloaded whenever Journey is
// focused, e.g. after a take, or when the coach saved a lesson: `reload`), built into the view model.
import type { RunRow } from '@drum-coach/core/engine/progress';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { getStorage } from '../../platform/storage';
import { useAppSettings } from '../../ui/hooks';
import { buildJourney, type JourneyView } from './model';
import { allLessons, planFocus } from './source';

type Loaded = { runs: RunRow[]; ai: unknown[]; plan?: Record<string, unknown> };

export function useJourney(swap: number): { view: JourneyView; loaded: boolean; reload: () => void } {
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
    ]).then(([runs, ai, plan]) => { if (live) setData({ runs, ai, plan: plan?.plan }); });
    return () => { live = false; };
  }, [loads]));
  // The minute matters (greeting, today's key); a new render after a take or a settings change is enough.
  const now = new Date();
  const dayHour = `${now.toDateString()} ${now.getHours()}`;
  const view = useMemo(() => {
    const at = new Date();
    return buildJourney({ settings, lessons: allLessons(data?.ai ?? []), runs: data?.runs ?? [], now: at, swap, focusIds: planFocus(data?.plan, at), aiLoaded: data !== null });
  }, [settings, data, swap, dayHour]); // eslint-disable-line react-hooks/exhaustive-deps
  return { view, loaded: data !== null, reload };
}
