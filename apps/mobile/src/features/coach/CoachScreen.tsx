// The Coach section: the conversation (the same panel other screens open as an inspector) on the right, the week
// plan on the left. The web has no Coach tab: its coach sits bottom-right on every screen (src/voice/TalkToCoach.tsx)
// and the plan on Today (PlanCard); the iPad's sidebar gives them one place.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, Screen, TitleBar, color, hardShadow } from '../../ui';
import { CoachPanel } from './CoachPanel';
import { useCoachSession } from './coach';
import { PlanCard } from './PlanCard';

export function CoachScreen() {
  const s = useCoachSession();
  const line = s.reply ? s.reply.show ?? s.reply.say : 'Ask me anything, between takes or while you play.';
  return (
    <Screen testID="screen-coach">
      <TitleBar title="Coach" coach={line}
        right={<Button size="small" emoji="⚙️" label="Coach settings" testID="coach-open-settings" onPress={() => router.navigate('/setup' as never)} />} />
      <View style={styles.row}>
        <View style={styles.left}><PlanCard /></View>
        <CoachPanel style={styles.panel} testID="coach-panel" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row', gap: 22, minHeight: 0 },
  left: { flex: 1, minWidth: 0 },
  panel: { borderWidth: 3, borderLeftWidth: 4, borderColor: color.ink, boxShadow: hardShadow(5), marginRight: 4, marginBottom: 4 },
});
