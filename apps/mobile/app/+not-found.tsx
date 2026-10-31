// Any route that isn't in this build (e.g. /dev/midi in a Release build) shows this instead of crashing, in the kit's
// look (QA m6): Screen + TitleBar + one way home.
import { Stack, router, usePathname } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Body, Button, Card, Screen, TitleBar, color, type } from '../src/ui';

export default function NotFound() {
  const path = usePathname();
  return (
    <Screen testID="not-found" withSidebar={false}>
      <Stack.Screen options={{ headerShown: false, title: 'Not in this build' }} />
      <TitleBar title="Not in this build" coach="This screen isn't in this build yet." testID="not-found-title" />
      <View style={styles.body}>
        <Card style={styles.card}>
          <Body size={type.coach} weight="800">Nothing lives at this address</Body>
          <Body color={color.muted} style={styles.path} testID="not-found-path">{path}</Body>
          <Button label="Back to Journey" emoji="🏠" tone="blue" onPress={() => router.replace('/')} testID="not-found-home" />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { alignItems: 'center', gap: 14, padding: 28, minWidth: 420 },
  path: { fontFamily: 'Menlo' },
});
