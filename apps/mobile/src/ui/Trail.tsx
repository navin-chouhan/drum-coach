// The stage trail: stops in equal columns on a line, solid green up to where you are, dashed after (ipad.css .stops).
// Done stops are green with ✓ and their stars, the current one is bigger and yellow, ★ checkpoints and coach-written
// lessons (✍) carry a little flag.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { trailGeometry } from './layout';
import { Stars } from './stats';
import { color, hardShadow, shadow, stroke } from './tokens';

export type TrailStop = {
  id: string;
  title: string;
  /** The emoji in the circle (a done stop shows ✓ instead). */
  icon: string;
  state: 'done' | 'now' | 'todo';
  /** Stars of a done lesson (1–3). */
  stars?: number;
  /** ★ = a checkpoint (stage challenge); ✍ = the coach wrote it. */
  flag?: 'checkpoint' | 'coach';
  /** Tried but not finished: a dashed ring. */
  started?: boolean;
};

const D = 44, NOW = 50, LINE_Y = 22;

export function Trail({ stops, onOpen, testID }: { stops: TrailStop[]; onOpen?: (id: string) => void; testID?: string }) {
  const [width, setWidth] = useState(0);
  const nowIdx = stops.findIndex(s => s.state === 'now');
  let lastDone = -1;
  stops.forEach((s, i) => { if (s.state === 'done') lastDone = i; });
  const g = trailGeometry(width, stops.length, nowIdx >= 0 ? nowIdx : lastDone);
  return (
    <View testID={testID} style={styles.wrap} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && g.done.width > 0 ? <View style={[styles.doneBar, { left: g.done.x, width: g.done.width }]} /> : null}
      {g.dashes.map(d => <View key={d.x} style={[styles.dash, { left: d.x, width: d.width }]} />)}
      <View style={styles.row}>
        {stops.map(s => <Stop key={s.id} stop={s} onOpen={onOpen} />)}
      </View>
    </View>
  );
}

function Stop({ stop: s, onOpen }: { stop: TrailStop; onOpen?: (id: string) => void }) {
  const now = s.state === 'now', done = s.state === 'done';
  const d = now ? NOW : D;
  const bg = done ? color.good : now ? color.pop : color.panel;
  const label = `${s.title}${done ? `, done${s.stars ? `, ${s.stars} of 3 stars` : ''}` : now ? ', you are here' : ''}${s.flag === 'checkpoint' ? ', stage challenge' : s.flag === 'coach' ? ', written by your coach' : ''}`;
  return (
    <Pressable onPress={onOpen ? () => onOpen(s.id) : undefined} disabled={!onOpen} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [styles.stop, pressed && styles.pressed]}>
      <View style={[styles.dot, { width: d, height: d, borderRadius: d / 2, marginTop: now ? -3 : 0, backgroundColor: bg, boxShadow: hardShadow(shadow.button) },
        s.started && !done && !now && styles.started]}>
        <Text style={[styles.icon, { fontSize: done ? 17 : now ? 22 : 19 }, done && styles.check]}>{done ? '✓' : s.icon}</Text>
        {s.flag ? (
          <View style={[styles.flag, s.flag === 'coach' && styles.flagPen]}>
            <Text style={[styles.flagText, s.flag === 'coach' && styles.flagPenText]}>{s.flag === 'coach' ? '✍' : '★'}</Text>
          </View>
        ) : null}
      </View>
      <Text maxFontSizeMultiplier={1.1} numberOfLines={2} style={[styles.name, now && styles.nameNow]}>{s.title}</Text>
      {done && s.stars ? <Stars n={s.stars} size={12} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', marginTop: 8 },
  row: { flexDirection: 'row' },
  doneBar: { position: 'absolute', top: LINE_Y - 3, height: 6, backgroundColor: color.good, borderTopWidth: stroke.thin, borderBottomWidth: stroke.thin, borderColor: color.ink, zIndex: 0 },
  dash: { position: 'absolute', top: LINE_Y - 2, height: 4, backgroundColor: color.ink },
  stop: { flex: 1, minWidth: 0, alignItems: 'center', gap: 3, minHeight: 44, zIndex: 1 },
  pressed: { opacity: 0.7 },
  dot: { borderWidth: stroke.card, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  started: { borderStyle: 'dashed' },
  icon: { lineHeight: 26, color: color.ink },
  check: { color: color.white, fontWeight: '900' },
  flag: { position: 'absolute', top: -9, right: -11, width: 22, height: 22, borderRadius: 11, backgroundColor: color.ink, borderWidth: stroke.thin, borderColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  flagPen: { backgroundColor: color.panel, borderColor: color.ink },
  flagText: { color: color.pop, fontSize: 11, lineHeight: 13 },
  flagPenText: { color: color.ink, fontSize: 12 },
  name: { fontSize: 11.5, lineHeight: 13, fontWeight: '700', textAlign: 'center', color: color.ink, maxWidth: 96 },
  nameNow: { fontWeight: '900' },
});
