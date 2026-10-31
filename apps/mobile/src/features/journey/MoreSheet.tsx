// Journey's fold-out (the web's "More ways to play" row and the "Your coach" card under "Full path, coach lessons…"):
// the one-screen Journey has no room for them, so "⋯ More" opens them in the kit's full-screen ToolFrame.
// Flow opens the lesson in flow mode (as the web's tile); Stick technique is G3's /technique route.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Body, Button, Card, CardTitle, ToolFrame, color } from '../../ui';
import type { JourneyView } from './model';
import { Tile } from './Tiles';

export const COACH_WRITING = 'Your coach is writing a lesson from your recent playing… this can take a minute. You can keep playing; the answer will wait here.';
export const COACH_ABOUT = 'The coach looks at your recent takes and writes the next lesson for this stage: a jam, an echo game, a challenge or a drill.';

export function MoreSheet({ v, visible, onClose, onOpen, onFlow, onAskNew, coach }: {
  v: JourneyView; visible: boolean; onClose: () => void;
  onOpen: (lessonId: string) => void; onFlow: () => void; onAskNew: () => void;
  coach: { thinking: boolean; error?: string };
}) {
  const go = (fn: () => void) => () => { onClose(); fn(); };
  return (
    <ToolFrame visible={visible} title="More" onClose={onClose} testID="journey-more">
      <View style={styles.body}>
        <Card style={styles.card}>
          <CardTitle size={18}>More ways to play</CardTitle>
          <View style={styles.tiles}>
            {v.flow ? <Tile emoji="🌊" title="Flow" sub={v.flow.lessonId !== v.jamLessonId ? v.flow.title : 'play along, no score'} testID="journey-more-flow" onPress={go(onFlow)} /> : null}
            <Tile emoji="🥢" title="Stick technique" sub="how it moves" testID="journey-more-technique" onPress={go(() => router.push('/technique' as never))} />
            <Tile emoji="🎵" title="Learn a new song" testID="journey-more-song" onPress={go(() => router.navigate('/songs' as never))} />
            {v.trail ? <Tile emoji="✍" title="Ask the coach" sub="for a different lesson" testID="journey-more-ask"
              onPress={coach.thinking ? undefined : go(onAskNew)} /> : null}
          </View>
        </Card>
        {v.trail ? (
          <Card style={styles.card} testID="journey-more-coach">
            <CardTitle size={18}>Your coach</CardTitle>
            {coach.thinking ? <Body size={15} weight="700" accessibilityLiveRegion="polite">{`✍ ${COACH_WRITING}`}</Body> : <>
              {coach.error ? <Body size={14} weight="700" color={color.bad}>{coach.error}</Body> : null}
              {v.coachLessons.length ? (
                <View style={styles.chips}>
                  <Body size={15}>Lessons written for you:</Body>
                  {v.coachLessons.map(l => <Button key={l.lessonId} size="small" tone="pop" label={l.title} onPress={go(() => onOpen(l.lessonId))} />)}
                </View>
              ) : <Body size={14} color={color.muted}>{COACH_ABOUT}</Body>}
              <View style={styles.row}><Button label="Ask the coach for a new lesson" emoji="✍" testID="journey-more-ask-new" onPress={onAskNew} /></View>
            </>}
          </Card>
        ) : null}
      </View>
    </ToolFrame>
  );
}

const styles = StyleSheet.create({
  body: { gap: 18, paddingTop: 18 },
  card: { gap: 10 },
  tiles: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row' },
});
