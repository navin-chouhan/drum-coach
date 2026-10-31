// The lesson player's pieces as the mockups draw them (docs/mockups/ipad/lesson-*.png): the step pills, the tempo
// with its 5-BPM ladder (both on the black top bar) and the timing line on the results. Promoted from
// features/lesson/parts.tsx (A7b) by I2; their data comes from features/lesson/lessonView.ts and results.ts.
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { rungLooks, type LadderRung } from './kitMath';
import { Body } from './Text';
import { color, font } from './tokens';

export type { LadderRung } from './kitMath';
export type StepPill = { name: string; state: 'done' | 'now' | '' };

/** The step (or layer) pills: ✓ for done, the number, the current one named. */
export function StepPills({ pills, label }: { pills: readonly StepPill[]; label: string }) {
  if (!pills.length) return null;
  return (
    <View style={s.pills} accessible accessibilityLabel={label}>
      {pills.map((p, i) => (
        <View key={i} style={[s.pill, p.state === 'done' && s.pillDone, p.state === 'now' && s.pillNow]}>
          <View style={[s.pillNum, p.state === 'done' && s.pillNumDone]}>
            <Text style={[s.pillNumText, p.state === 'done' && { color: color.white }]}>{p.state === 'done' ? '✓' : i + 1}</Text>
          </View>
          {p.state === 'now' ? <Text numberOfLines={1} style={s.pillName}>{p.name}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** The tempo and its ladder: a rung per 5 BPM, start dashed, goal white, done green, the current one yellow. */
export function TempoLadder({ bpm, ladder }: { bpm: number; ladder?: { rungs: readonly LadderRung[]; caption: string } }) {
  return (
    <View style={s.tempo} accessible accessibilityLabel={`${bpm} BPM${ladder ? `, ${ladder.caption}` : ''}`}>
      <Text style={s.tempoN}>{bpm}</Text>
      <Text style={s.tempoUnit}>BPM</Text>
      {ladder ? (
        <View style={s.ladder}>
          <View style={s.rungs}>
            {rungLooks(ladder.rungs).map(r => (
              <View key={r.bpm} style={[s.rung, { height: r.height, backgroundColor: RUNG_FILL[r.fill] }, r.dashed && { borderStyle: 'dashed' }]} />
            ))}
          </View>
          <Text style={s.ladderCap}>{ladder.caption}</Text>
        </View>
      ) : null}
    </View>
  );
}
const RUNG_FILL = { none: 'transparent', done: color.good, at: color.pop, goal: color.white } as const;

/** Where the hits landed (x in 0–1000, 500 = the click; row −1/0/1 spreads the dots). */
export type TimingLine = {
  zone: { from: number; to: number };
  dots: readonly { x: number; onIt: boolean; row: -1 | 0 | 1 }[];
  caption: string;
  label: string;
};

/** Where your hits landed against the click: dots, the "right on it" zone, early ← → late. */
export function TimingLineView({ line, testID = 'lesson-timing-line' }: { line: TimingLine; testID?: string }) {
  const [w, setW] = useState(0);
  const x = (v: number) => (v / 1000) * w;
  return (
    <View style={s.timing} accessible accessibilityLabel={line.label} testID={testID}>
      <View style={s.timingHead}>
        <Body size={14} weight="900">Where your hits landed</Body>
        <Body size={13} weight="600" color={color.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{line.caption}</Body>
      </View>
      <View style={s.timingTrack} onLayout={e => setW(e.nativeEvent.layout.width)}>
        {w > 0 ? <>
          <View style={[s.zone, { left: x(line.zone.from), width: x(line.zone.to) - x(line.zone.from) }]} />
          <View style={s.axis} />
          <View style={[s.click, { left: w / 2 - 1.5 }]} />
          {line.dots.map((d, k) => <View key={k} style={[s.dot, { left: x(d.x) - 7, top: 20 + d.row * 8, backgroundColor: d.onIt ? color.good : color.orange }]} />)}
        </> : null}
      </View>
      <View style={s.timingFoot}>
        <Body size={12} weight="800" color={color.muted}>← EARLY</Body>
        <Body size={12} weight="900">THE CLICK</Body>
        <Body size={12} weight="800" color={color.muted}>LATE →</Body>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  pills: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, minWidth: 38, borderRadius: 19, borderWidth: 2.5, borderColor: color.ink, backgroundColor: color.white, paddingHorizontal: 3 },
  pillDone: { backgroundColor: color.good, borderColor: color.white },
  pillNow: { backgroundColor: color.pop, paddingRight: 12 },
  pillNum: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: color.ink, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  pillNumDone: { backgroundColor: color.good, borderColor: color.white },
  pillNumText: { ...font.display, fontSize: 14, color: color.ink },
  pillName: { ...font.display, fontSize: 14, color: color.ink, maxWidth: 160 },
  tempo: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  tempoN: { ...font.display, fontSize: 46, lineHeight: 50, color: color.white },
  tempoUnit: { ...font.heavy, fontSize: 14, color: color.white, marginBottom: 8 },
  ladder: { marginLeft: 10, marginBottom: 4, gap: 3 },
  rungs: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 28 },
  rung: { width: 13, borderWidth: 2, borderColor: color.white },
  ladderCap: { fontSize: 11.5, fontWeight: '700', color: color.white },
  timing: { backgroundColor: color.cream, borderWidth: 2, borderColor: color.ink, padding: 10, gap: 4 },
  timingHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  timingTrack: { height: 54 },
  zone: { position: 'absolute', top: 6, height: 42, backgroundColor: '#1E9E5A22', borderWidth: 2, borderColor: color.good },
  axis: { position: 'absolute', left: 0, right: 0, top: 26, height: 3, backgroundColor: color.ink },
  click: { position: 'absolute', top: 4, width: 3, height: 46, backgroundColor: color.ink },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: color.ink },
  timingFoot: { flexDirection: 'row', justifyContent: 'space-between' },
});
