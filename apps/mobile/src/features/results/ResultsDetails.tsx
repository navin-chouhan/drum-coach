// A finished take in detail (the web's Results, src/play/Results.tsx): the head with Play again / Back, accuracy,
// timing, dynamics, per drum, where in the bar, the tips during the take, the take on the sheet with its marks, and
// the coach ("Detailed feedback and a drill", the coach panel's TakeFeedback: the web's CoachFeedback). The coach
// hears the take once (coachTake is once per take) and its line shows at the top. Laid out with the UI kit for the
// iPad (cards in rows, as the lesson results); the screen around it scrolls. Practice's "Details" and Songs' scored
// results use it.
import type { Finished } from '@drum-coach/core/play/take';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BigMove, Body, Button, Card, CardTitle, CoachLine, Display, MAX_FONT_SCALE, Notice, Pill, Track, color, drumColor, gesturesFor, resultColor, stroke, tabular,
} from '../../ui';
import { TakeFeedback, getCoach, replyFor, thinkingAbout, useCoachSession, type TakeExtras } from '../coach';
import { detailsView } from './details';
import { TakeSheet } from './TakeSheet';

export type ResultsDetailsProps = {
  f: Finished;
  onAgain: () => void;
  onBack: () => void;
  /** What the coach and its summary call this take (Practice: the exercise id; Songs: the song id). */
  extras?: TakeExtras;
  /** Back's label (Practice: "Back"; the web's). */
  backLabel?: string;
  testID?: string;
};

export function ResultsDetails({ f, onAgain, onBack, extras, backLabel = 'Back', testID = 'results-details' }: ResultsDetailsProps) {
  const v = useMemo(() => detailsView(f, color.cream), [f]);
  const coach = useCoachSession();
  const [opened] = useState(Date.now);
  // the web's Results: coachTake(f) (once per take; wait mode and empty takes aren't told)
  useEffect(() => { void getCoach().session.coachTake(f, { ...extras, wait: !!f.options.wait }); }, [f]); // eslint-disable-line react-hooks/exhaustive-deps -- once per take
  const reply = replyFor(coach, f, opened);
  const thinking = !reply && thinkingAbout(coach, f);
  const [slot, setSlot] = useState<number>();
  const a = v.accuracy;
  // A narrow column (Songs' left column, 470 pt) stacks the cards; the full screen (Practice) puts them in rows.
  const [width, setWidth] = useState(1000);
  const narrow = width < 720;
  const row = narrow ? styles.column : styles.row, cell = narrow ? styles.cellNarrow : styles.cell;

  return (
    <View style={styles.stack} testID={testID} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      <Card style={[styles.head, narrow && styles.headNarrow]}>
        <View style={styles.grow}>
          <Display size={26} numberOfLines={1}>{v.title}</Display>
          <Body size={14} color={color.muted} style={tabular}>{v.sub}</Body>
        </View>
        <BigMove tone="go" emoji="↻" label="Play again" gestures={gesturesFor('yes')} onPress={onAgain} testID={`${testID}-again`} style={narrow ? styles.againNarrow : styles.again} />
        <Button label={backLabel} emoji="←" onPress={onBack} testID={`${testID}-back`} />
      </Card>
      {reply || thinking ? (
        <View style={styles.row}>
          {reply ? <CoachLine size={18} style={styles.grow} testID={`${testID}-coach-line`}>{reply.show ?? reply.say}</CoachLine> : null}
          {thinking ? <View testID={`${testID}-coach-thinking`}><Pill tone="pop">Coach is listening back…</Pill></View> : null}
        </View>
      ) : null}

      <View style={row}>
        <Card style={cell} testID={`${testID}-accuracy`}>
          <CardTitle size={17}>Accuracy</CardTitle>
          <Display size={34} style={tabular}>{a.big}</Display>
          {a.waitNote ? <Body size={13}>{a.waitNote}</Body> : (
            <Body size={13} style={tabular}>
              <Text style={{ color: resultColor.onIt }}>{`${a.perfect} perfect`}</Text>{' · '}
              <Text style={{ color: resultColor.early }}>{`${a.good} good`}</Text>{' · '}
              <Text style={{ color: resultColor.missed }}>{`${a.miss} missed`}</Text>{` · ${a.extra} extra`}
            </Body>
          )}
        </Card>
        {v.timing ? (
          <Card style={cell} testID={`${testID}-timing`}>
            <CardTitle size={17}>Timing</CardTitle>
            <Display size={24}>{v.timing.big}</Display>
            <Body size={13} style={tabular}>{v.timing.small}</Body>
            {v.timing.latency ? <Notice text={v.timing.latency} testID={`${testID}-latency`} /> : null}
          </Card>
        ) : null}
        <Card style={cell} testID={`${testID}-dynamics`}>
          <CardTitle size={17}>Dynamics</CardTitle>
          <Display size={34} style={tabular}>{v.dynamics.big}</Display>
          <Body size={13} style={tabular}>{v.dynamics.small}</Body>
        </Card>
      </View>

      {!v.wait ? (
        <View style={row}>
          <Card style={cell} testID={`${testID}-per-drum`}>
            <CardTitle size={17}>Per drum</CardTitle>
            {v.perDrum.map(r => (
              <View key={r.drum} style={styles.drumRow} accessible accessibilityLabel={`${r.name}: ${r.accuracy}%`}>
                <Body size={14} weight="700" style={styles.drumName}>{r.name}</Body>
                <Track done={r.accuracy / 100} height={14} fill={r.lane === 'kick' ? color.ink : drumColor[r.lane]} style={styles.grow} />
                <Body size={14} weight="800" style={[styles.pct, tabular]}>{`${r.accuracy}%`}</Body>
              </View>
            ))}
          </Card>
          <Card style={cell} testID={`${testID}-heat`}>
            <CardTitle size={17}>Where in the bar</CardTitle>
            <View style={styles.heat}>
              {v.heat.map((c, i) => (
                <Pressable key={i} onPress={() => setSlot(slot === i ? undefined : i)} accessibilityRole="button" accessibilityLabel={c.detail}
                  accessibilityState={{ selected: slot === i }} testID={`${testID}-heat-${i}`}
                  style={[styles.heatCell, { backgroundColor: c.color }, slot === i && styles.heatOn]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.heatLabel, !c.total && styles.heatEmpty]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
            <Body size={13} color={color.muted}>{slot !== undefined && v.heat[slot] ? v.heat[slot].detail : 'Green = solid, red = missed or off-time. Tap a cell for details.'}</Body>
          </Card>
        </View>
      ) : null}

      {v.tips.length ? (
        <Card testID={`${testID}-tips`}>
          <CardTitle size={17}>Tips during this take</CardTitle>
          {v.tips.map((t, i) => <Body key={i} size={14}>{`• ${t}`}</Body>)}
        </Card>
      ) : null}

      <Card testID={`${testID}-replay`}>
        <CardTitle size={17}>Your take on the sheet: every note marked, extra hits ✕</CardTitle>
        <TakeSheet f={f} testID={`${testID}-sheet`} />
      </Card>

      {!v.wait ? (
        <Card tone="cream" testID={`${testID}-coach`}>
          <CardTitle size={17}>Coach</CardTitle>
          <TakeFeedback take={f} extras={extras} />
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  again: { width: 230, minHeight: 72 },
  grow: { flex: 1, minWidth: 0 },
  headNarrow: { flexWrap: 'wrap' },
  againNarrow: { flexGrow: 1, minHeight: 64 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'stretch' },
  column: { gap: 14 },
  cellNarrow: { gap: 6 },
  cell: { flexGrow: 1, flexBasis: 0, minWidth: 0, gap: 6 },
  drumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 28 },
  drumName: { width: 104 },
  pct: { width: 48, textAlign: 'right' },
  heat: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  heatCell: { flexGrow: 1, flexBasis: 28, minWidth: 28, height: 44, alignItems: 'center', justifyContent: 'center', borderWidth: stroke.thin, borderColor: color.ink },
  heatOn: { borderWidth: 3 },
  heatLabel: { fontSize: 13, fontWeight: '800', color: color.white },
  heatEmpty: { color: color.muted },
});
