// Practice and Progress read their runs, lessons and plan from storage each time the screen comes into view, so a
// take saved by the lesson player shows straight away.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { getStorage } from '../../platform/storage';
import { loadStoredData, type StoredData } from './data';

export function useStoredData(): { data: StoredData | null; reload: () => void } {
  const [data, setData] = useState<StoredData | null>(null);
  const reload = useCallback(() => {
    let live = true;
    void loadStoredData(getStorage()).then(d => { if (live) setData(d); });
    return () => { live = false; };
  }, []);
  useFocusEffect(reload);
  return { data, reload };
}
