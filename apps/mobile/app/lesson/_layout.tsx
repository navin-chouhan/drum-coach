// The lesson player's routes: full screen (no sidebar, no header), outside the (main) group.
import { Stack } from 'expo-router';

export default function LessonLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
