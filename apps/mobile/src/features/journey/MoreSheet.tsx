// Journey's ⋯ sheet (D10, docs/mobile/reorg/journey-after.png): what the one-job Journey no longer shows: more ways
// to play (Just jam, Flow, the after-set moves, the stage song, a new song, show-off songs), your coach (ask for a
// different lesson, this week's focus, lessons written for you, the challenge) and where you are (Find my level,
// Skill map, Full path, Check my kit, Stick technique). The entries are moreSections (more.ts, tested).
// The frame is the kit's full-screen ToolFrame until R1's ⋯ sheet component lands (swap `Frame` below).
import { StyleSheet, View } from 'react-native';
import { Body, Card, CardTitle, ToolFrame, color } from '../../ui';
import type { JourneyView } from './model';
import { moreSections, type MoreEntry } from './more';
import { Tile } from './Tiles';

export const COACH_WRITING = 'Your coach is writing a lesson from your recent playing… this can take a minute. You can keep playing; the answer will wait here.';

const Frame = ToolFrame; // placeholder for R1's ⋯ sheet

export function MoreSheet({ v, visible, onClose, onRun, coach }: {
  v: JourneyView; visible: boolean; onClose: () => void;
  /** Runs an entry's action (Journey knows how to open lessons, routes and coach asks). */
  onRun: (e: MoreEntry) => void;
  coach: { thinking: boolean; error?: string };
}) {
  const sections = moreSections(v, coach);
  return (
    <Frame visible={visible} title="More" onClose={onClose} testID="journey-more">
      <View style={styles.body}>
        {sections.map(s => (
          <Card key={s.key} style={styles.card} testID={`journey-more-${s.key}`}>
            <CardTitle size={18}>{s.title}</CardTitle>
            {s.key === 'coach' && coach.thinking ? <Body size={14} weight="700" accessibilityLiveRegion="polite">{`✍ ${COACH_WRITING}`}</Body> : null}
            {s.key === 'coach' && coach.error ? <Body size={14} weight="700" color={color.bad}>{coach.error}</Body> : null}
            <View style={styles.tiles}>
              {s.entries.map(e => (
                <Tile key={e.key} emoji={e.emoji} title={e.title} sub={e.sub} testID={e.testID} compact style={styles.tile}
                  onPress={e.disabled ? undefined : () => { onClose(); onRun(e); }} />
              ))}
            </View>
          </Card>
        ))}
      </View>
    </Frame>
  );
}

const styles = StyleSheet.create({
  body: { gap: 16, paddingTop: 16 },
  card: { gap: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexGrow: 0, flexBasis: '24%' },
});
