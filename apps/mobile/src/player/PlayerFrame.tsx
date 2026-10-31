// The shared full-screen player (D10, docs/mobile/REORG-PROPOSAL.md "Max screen", wireframes docs/mobile/reorg/
// lesson-ready-after.png, lesson-take-after.png, lesson-results-after.png). One frame for the lesson player, placement,
// Practice and Songs (R3): the screen brings its music, moves and ⋯ sheet; the frame lays them out and owns the
// getting-out rules.
//
// - ready / results: a slim black bar (‹, title + subtitle, the goal or a chip, BPM, ⋯), the coach's line, the music
//   across the full width (results: with the score card beside it), one row of moves with their gestures.
// - take: no bar. "Bar 3 / 4", one live tip, the BPM, the music as large as it fits, the touch pads when no kit is
//   connected, and a small ■ Stop corner (crash × 4, or Esc).
// - Esc: a take stops, otherwise the player is left (‹); a sheet or panel that's open handles Esc itself (pass
//   `overlayOpen`).
// The voice is the screen's (R6's speakMoment): the frame shows the line, the screen says it.
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  BigMove, Body, Button, CoachLine, Display, DottedGround, GestureChip, RoundButton, color, gesturesFor, hardShadow, shadow, stroke, useAppKey,
  type Gesture,
} from '../ui';
import { escAction, type BarGoal, type PlayerPhase } from './model';

export type PlayerMove = {
  id: string;
  label: string;
  emoji?: string;
  /** The kit gestures that do it (shown as chips). */
  gestures?: Gesture[];
  /** A short line under the label instead of (or after) the gestures. */
  note?: string;
  onPress?: () => void;
  /** The first move is the main one (blue) unless a tone is given. */
  tone?: 'go' | 'white' | 'alt';
  disabled?: boolean;
  testID?: string;
};

export type PlayerTake = {
  /** "Bar 3 / 4" or "Count-in" (model.takeBarText). */
  bar: string;
  /** One live tip, or a short line (the count-in's words, flow's meter). */
  tip?: string;
  /** Stop the take (■ Stop, Esc; crash × 4 is the screen's kit moves). */
  onStop: () => void;
  /** The big count-in number over the music, while it counts in. */
  countIn?: number;
};

export type PlayerFrameProps = {
  phase: PlayerPhase;
  /** testID prefix: `${testID}-back`, `${testID}-more-button`, `${testID}-stop`, `${testID}-coach-line`, … */
  testID: string;
  title: string;
  /** "Step 3 of 4 · + snare" */
  subtitle?: string;
  /** The goal in the bar (□□ 2 clean → 75). */
  goal?: BarGoal;
  /** Instead of (or after) the goal: a chip such as "→ 75 next", Practice's Climb. */
  barChip?: ReactNode;
  /** The tempo; with `onBpm` the − / + sit beside it (Practice). */
  bpm?: number;
  onBpm?: (delta: -5 | 5) => void;
  /** ‹ and Esc (not playing): leave the player. */
  onBack: () => void;
  /** ⋯: the screen opens its PlayerSheet. */
  onMore?: () => void;
  /** The coach's line (ready / results), and a small pill beside it ("Coach is listening back…"). */
  coach?: { line: string; under?: string; pill?: string };
  /** The music (a NotationView or NoteHighway, or a work area such as a quiz); the frame gives it the room. */
  music: ReactNode;
  /** Above the music, inside its black panel: "Your bar · + snare", the legend. */
  musicLabel?: ReactNode;
  /** Under the music, inside its panel: the results sheet's pager. */
  musicFoot?: ReactNode;
  /** Measures the paper (for the sheet's zoom, lesson/sheetFit.ts). */
  onPaperHeight?: (h: number) => void;
  /** Beside the music on results: the score card (PlayerScore). */
  side?: ReactNode;
  /** Under the music (ready and take): the touch pads when no kit is connected, the kit drawing when asked for. */
  bottom?: ReactNode;
  /** One row of moves (ready and results). */
  moves?: PlayerMove[];
  /** During a take. */
  take?: PlayerTake;
  /** A sheet, panel or slides is open over the frame: it handles Esc (and the frame doesn't). */
  overlayOpen?: boolean;
  /** Replaces the music area (rest steps, quizzes, a break): the bar, coach line and moves stay. */
  body?: ReactNode;
  /** Overlays: the ⋯ sheet, the coach panel, the celebration, slides. */
  children?: ReactNode;
};

export function PlayerFrame(p: PlayerFrameProps) {
  const insets = useSafeAreaInsets();
  const playing = p.phase === 'take';
  useAppKey('escape', () => {
    const a = escAction({ overlayOpen: !!p.overlayOpen, playing });
    if (a === 'stop') p.take?.onStop();
    else if (a === 'back') p.onBack();
    return a !== 'none';
  }, { enabled: !p.overlayOpen });
  const side = { paddingLeft: insets.left + 22, paddingRight: insets.right + 22 };

  return (
    <DottedGround>
      {playing ? (
        <View style={[styles.takeTop, side, { paddingTop: Math.max(insets.top, 20) + 8 }]} testID={`${p.testID}-take-top`}>
          <View style={styles.barBadge}><Display size={26} numberOfLines={1}>{p.take?.bar ?? ''}</Display></View>
          <View style={styles.tip} accessibilityLiveRegion="polite" testID={`${p.testID}-tip`}>
            {p.take?.tip ? <Display size={24} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{p.take.tip}</Display> : null}
          </View>
          {p.bpm !== undefined ? <View style={styles.bpmBadge}><Display size={26}>{p.bpm}</Display></View> : null}
        </View>
      ) : (
        <View style={[styles.bar, side, { paddingTop: Math.max(insets.top, 20) + 6 }]} testID={`${p.testID}-bar`}>
          <RoundButton label="Back" glyph="‹" onPress={p.onBack} testID={`${p.testID}-back`} />
          <View style={styles.titleBox}>
            <Display size={22} color={color.white} numberOfLines={1}>{p.title}</Display>
            {p.subtitle ? <Body size={13} weight="700" color="#CFCFCF" numberOfLines={1}>{p.subtitle}</Body> : null}
          </View>
          <View style={styles.flex} />
          {p.goal ? <GoalInBar goal={p.goal} /> : null}
          {p.barChip}
          {p.bpm !== undefined ? (
            <View style={styles.bpm} accessible accessibilityLabel={`${p.bpm} BPM`}>
              {p.onBpm ? <Button size="small" tone="pop" label="−" accessibilityLabel="5 BPM slower" onPress={() => p.onBpm!(-5)} testID={`${p.testID}-bpm-down`} /> : null}
              <Text style={styles.bpmN}>{p.bpm}</Text><Text style={styles.bpmUnit}>BPM</Text>
              {p.onBpm ? <Button size="small" tone="pop" label="+" accessibilityLabel="5 BPM faster" onPress={() => p.onBpm!(5)} testID={`${p.testID}-bpm-up`} /> : null}
            </View>
          ) : null}
          {p.onMore ? <RoundButton label="More" glyph="⋯" onPress={p.onMore} testID={`${p.testID}-more-button`} /> : null}
        </View>
      )}

      <View style={[styles.body, side, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
        {!playing && p.coach ? (
          <View style={styles.coachRow}>
            <CoachLine size={22} style={styles.flexShrink} testID={`${p.testID}-coach-line`}>{p.coach.line}{p.coach.under ? `\n${p.coach.under}` : ''}</CoachLine>
            {p.coach.pill ? <View style={styles.pill}><Body size={13} weight="800">{p.coach.pill}</Body></View> : null}
          </View>
        ) : null}

        {p.body ?? (
          <View style={p.side ? styles.mainRow : styles.mainCol}>
            <View style={styles.musicPanel} testID={`${p.testID}-music`}>
              {p.musicLabel ? <View style={styles.musicHead}>{p.musicLabel}</View> : null}
              <View style={styles.paper} onLayout={p.onPaperHeight ? e => p.onPaperHeight!(Math.round(e.nativeEvent.layout.height)) : undefined}>
                {p.music}
                {playing && p.take?.countIn !== undefined ? (
                  <View style={styles.countWrap} pointerEvents="none" accessible accessibilityLabel={`Count-in ${p.take.countIn}`} testID={`${p.testID}-countin-number`}>
                    <View style={styles.countCircle}><Text style={styles.countN}>{p.take.countIn}</Text></View>
                  </View>
                ) : null}
              </View>
              {p.musicFoot}
            </View>
            {p.side ? <View style={styles.side}>{p.side}</View> : null}
            {!p.side && p.bottom ? <View style={styles.bottom}>{p.bottom}</View> : null}
          </View>
        )}

        {!playing && p.moves?.length ? (
          <View style={styles.moves}>
            {p.moves.map((m, i) => (
              <BigMove key={m.id} label={m.label} emoji={m.emoji} tone={m.tone ?? (i === 0 ? 'go' : 'alt')} gestures={m.gestures} note={m.note}
                onPress={m.onPress} disabled={m.disabled} testID={m.testID ?? `${p.testID}-${m.id}`} style={i === 0 ? styles.mainMove : styles.move} />
            ))}
          </View>
        ) : null}

        {playing && p.take ? (
          <View style={styles.stopCorner}>
            <GestureChip gesture={gesturesFor('stop')[0]} />
            <Body size={13} weight="800">or Esc</Body>
            <Button tone="red" emoji="■" label="Stop" onPress={p.take.onStop} testID={`${p.testID}-stop`} accessibilityHint="Or crash four times, or Esc" />
          </View>
        ) : null}
      </View>
      {p.children}
    </DottedGround>
  );
}

/** □□ 2 clean → 75, in the bar. */
export function GoalInBar({ goal }: { goal: BarGoal }) {
  return (
    <View style={styles.goal} accessible accessibilityLabel={`${goal.boxes.ok} of ${goal.boxes.n} clean takes; ${goal.text.replace('→', 'then')}`} testID="player-goal">
      {Array.from({ length: goal.boxes.n }, (_, k) => (
        <View key={k} style={[styles.box, k < goal.boxes.ok && styles.boxOk]}>{k < goal.boxes.ok ? <Text style={styles.boxTick}>✓</Text> : null}</View>
      ))}
      <Text style={styles.goalText}>{goal.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.ink, paddingBottom: 10, borderBottomWidth: 4, borderBottomColor: color.pop },
  titleBox: { flexShrink: 1, minWidth: 120 },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  box: { width: 22, height: 22, borderWidth: 3, borderColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  boxOk: { backgroundColor: color.good, borderColor: color.good },
  boxTick: { color: color.white, fontWeight: '900', fontSize: 13 },
  goalText: { color: color.pop, fontWeight: '800', fontSize: 16, marginLeft: 4 },
  bpm: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  bpmN: { color: color.white, fontWeight: '900', fontSize: 40, lineHeight: 44 },
  bpmUnit: { color: '#CFCFCF', fontWeight: '800', fontSize: 13 },
  takeTop: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 10 },
  barBadge: { backgroundColor: color.pop, borderWidth: stroke.card, borderColor: color.ink, paddingHorizontal: 16, paddingVertical: 8, boxShadow: hardShadow(shadow.card) },
  tip: { flex: 1, minHeight: 56, justifyContent: 'center', backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, borderRadius: 18, paddingHorizontal: 18, boxShadow: hardShadow(shadow.card) },
  bpmBadge: { backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, paddingHorizontal: 14, paddingVertical: 8, boxShadow: hardShadow(shadow.card) },
  body: { flex: 1, paddingTop: 14, gap: 14 },
  coachRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: { backgroundColor: color.pop, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  mainCol: { flex: 1, gap: 14 },
  mainRow: { flex: 1, flexDirection: 'row', gap: 16 },
  musicPanel: { flex: 1, minHeight: 0, minWidth: 0, backgroundColor: color.ink, padding: 14, gap: 10, boxShadow: hardShadow(shadow.card, color.pop) },
  musicHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  paper: { flex: 1, backgroundColor: color.cream, overflow: 'hidden' },
  side: { width: 300, gap: 12 },
  bottom: { height: 210 },
  moves: { flexDirection: 'row', gap: 14 },
  mainMove: { flex: 2, minWidth: 0 },
  move: { flex: 1, minWidth: 0 },
  stopCorner: { position: 'absolute', right: 26, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10 },
  countWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  countCircle: { width: 150, height: 150, borderRadius: 75, backgroundColor: color.pop, borderWidth: stroke.card, borderColor: color.ink, alignItems: 'center', justifyContent: 'center', boxShadow: hardShadow(shadow.card) },
  countN: { fontSize: 90, fontWeight: '900', color: color.ink },
});
