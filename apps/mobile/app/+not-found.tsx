// Any route that isn't in this build (e.g. /dev/midi before A3's screen lands) shows this instead of crashing.
import { Link, Stack, usePathname } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../src/theme';

export default function NotFound() {
  const path = usePathname();
  return (
    <View style={styles.container} testID="not-found">
      <Stack.Screen options={{ title: 'Not in this build' }} />
      <Text style={styles.title}>This screen isn't in this build yet</Text>
      <Text style={styles.path}>{path}</Text>
      <Link href="/" style={styles.link} testID="not-found-home">
        Back to the home screen
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32, backgroundColor: colors.background },
  title: { fontSize: 22, fontWeight: '600', color: colors.text },
  path: { fontSize: 16, color: colors.muted, fontFamily: 'Menlo' },
  link: { fontSize: 17, color: colors.primary, textDecorationLine: 'underline', paddingVertical: 8 },
});
