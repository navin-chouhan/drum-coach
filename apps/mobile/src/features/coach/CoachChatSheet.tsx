// The coach chat as a sheet (D10): a tap on the coach's bubble on any screen opens it (src/ui/coachChat.ts), over the
// right side of that screen. app/_layout.tsx draws one per screen of the root stack (screenLayout); only the focused
// screen's shows. ✕, Esc or a tap outside close it. The kit stays the screen's: its gestures don't drive the chat here.
import { useIsFocused } from 'expo-router';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { refocusKeyboard } from '../../platform/keyboard';
import { closeCoachChat, color, useAppKey, useCoachChatOpen } from '../../ui';
import { CoachPanel } from './CoachPanel';

export function CoachChatSheet() {
  const open = useCoachChatOpen();
  const focused = useIsFocused();
  const show = open && focused;
  useAppKey('escape', closeCoachChat, { enabled: show });
  if (!show) return null;
  return (
    <Modal visible transparent animationType="fade" supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={closeCoachChat} onShow={refocusKeyboard} onDismiss={refocusKeyboard}>
      <View style={styles.row}>
        <Pressable style={styles.scrim} onPress={closeCoachChat} accessibilityRole="button" accessibilityLabel="Close the chat" testID="coach-chat-scrim" />
        <View style={styles.panel} accessibilityViewIsModal testID="coach-chat">
          <CoachPanel onClose={closeCoachChat} kitMoves={false} style={styles.fill} testID="coach-chat-panel" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: 'row' },
  scrim: { flex: 1, backgroundColor: 'rgba(20,20,20,0.35)' },
  panel: { boxShadow: `-8px 0px 0px 0px ${color.pop}` }, // CoachPanel's own width
  fill: { flex: 1 },
});
