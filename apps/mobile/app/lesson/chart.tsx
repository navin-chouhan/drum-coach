// /lesson/chart?chartId=…&bpm=…: one chart (a coach drill or a plan item) in the lesson player, as one take.
import { Stack, useLocalSearchParams } from 'expo-router';
import { parseBpm } from '../../src/features/lesson/drill';
import { LessonRoute } from '../../src/features/lesson/LessonRoute';

export default function DrillPage() {
  const p = useLocalSearchParams<{ chartId?: string; bpm?: string }>();
  const chartId = Array.isArray(p.chartId) ? p.chartId[0] : p.chartId ?? '';
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <LessonRoute params={{ id: 'chart', item: -1, mode: 'play' }} drill={{ chartId, bpm: parseBpm(p.bpm) }} />
  </>;
}
