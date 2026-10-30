// /lesson/<id>?item=N&mode=play|hear|jam: the lesson player (A7b), as Journey opens it.
import { Stack, useLocalSearchParams } from 'expo-router';
import { LessonRoute } from '../../src/features/lesson/LessonRoute';
import { parseLessonParams } from '../../src/features/lesson/route';

export default function LessonPage() {
  const p = useLocalSearchParams<{ id: string; item?: string; mode?: string }>();
  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <LessonRoute params={parseLessonParams(p)} />
  </>;
}
