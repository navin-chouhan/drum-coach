// The lesson player's local pieces, drawn as the mockups draw them (docs/mockups/ipad/lesson-*.png) with the UI kit's
// tokens. Candidates for the kit: TempoLadder, StepPills, TimingLineView, KeyboardKit (listed in the report).
import type { PadId } from '@drum-coach/core/engine/kit';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Body, Button, Card, Display, GestureChip, Label, Stars, Strong, color, font, hardShadow, shadow, slopFor, stroke, type } from '../../ui';
import type { Celebration } from './controller';
import type { Goal, Pill, Rung } from './lessonView';
import type { TakeCard } from './results';
import type { timingLine } from './results';

/** The step (or layer) pills: ✓ for done, the number, the current one named. */
export function StepPills({ pills, label }: { pills: Pill[]; label: string }) {
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

/** The tempo and its ladder: a rung per 5 BPM, start dashed, goal white, the current one yellow. */
export function TempoLadder({ bpm, ladder }: { bpm: number; ladder?: { rungs: Rung[]; caption: string } }) {
  return (
    <View style={s.tempo} accessible accessibilityLabel={`${bpm} BPM${ladder ? `, ${ladder.caption}` : ''}`}>
      <Text style={s.tempoN}>{bpm}</Text>
      <Text style={s.tempoUnit}>BPM</Text>
      {ladder ? (
        <View style={s.ladder}>
          <View style={s.rungs}>
            {ladder.rungs.map((r, k) => {
              const below = !!ladder.rungs.find(x => x.at) && r.bpm < (ladder.rungs.find(x => x.at)?.bpm ?? 0);
              return <View key={r.bpm} style={[s.rung, { height: 9 + (k * 18) / Math.max(1, ladder.rungs.length - 1) },
                below && { backgroundColor: color.good }, r.at && { backgroundColor: color.pop }, r.goal && !r.at && { backgroundColor: color.white },
                r.start && !r.at && !below && { borderStyle: 'dashed' }]} />;
            })}
          </View>
          <Text style={s.ladderCap}>{ladder.caption}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** A small round icon button in the top bar (back, ⋯). */
export function RoundButton({ label, glyph, onPress, testID }: { label: string; glyph: string; onPress: () => void; testID: string }) {
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={slopFor(40)}
      style={({ pressed }) => [s.round, pressed && { opacity: 0.7 }]}>
      <Text style={s.roundGlyph}>{glyph}</Text>
    </Pressable>
  );
}

/** The goal, in words: bold first, then the rest, with the small line under it. */
export function GoalText({ goal, size = 22 }: { goal: Goal; size?: number }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={[s.goal, { fontSize: size, lineHeight: Math.round(size * 1.25) }]}><Strong>{goal.bold}</Strong>{goal.text}</Text>
      {goal.small ? <Body size={15} color={color.muted} style={{ marginTop: 4 }}>{goal.small}</Body> : null}
    </View>
  );
}

/** The tick boxes: clean takes so far. */
export function Boxes({ n, ok }: { n: number; ok: number }) {
  return (
    <View style={s.boxes} accessible accessibilityLabel={`${ok} of ${n} clean takes`}>
      {Array.from({ length: n }, (_, k) => (
        <View key={k} style={[s.box, k < ok && s.boxOk]}>{k < ok ? <Text style={s.boxTick}>✓</Text> : null}</View>
      ))}
    </View>
  );
}

/** The live tip (yellow) or the count-in line (cream), across the top of the take. */
export function Banner({ emoji, text, right, tone, testID }: { emoji: string; text: string; right?: string; tone: 'pop' | 'cream'; testID: string }) {
  return (
    <View testID={testID} style={[s.banner, { backgroundColor: tone === 'pop' ? color.pop : color.cream }]} accessibilityLiveRegion="polite">
      <Text style={s.bannerEmoji}>{emoji}</Text>
      <Display size={24} style={{ flex: 1 }} numberOfLines={1} adjustsFontSizeToFit>{text}</Display>
      {right ? <Body size={14} weight="700" color={color.ink}>{right}</Body> : null}
    </View>
  );
}

/** The big count-in number on the beat. */
export function CountInBadge({ n }: { n: number }) {
  return (
    <View style={s.countWrap} testID="lesson-countin-number" accessible accessibilityLabel={`Count-in ${n}`}>
      <View style={s.countCircle}><Text style={s.countN}>{n}</Text></View>
      <View style={s.countTag}><Text style={s.countTagText}>SAY IT WITH THE CLICK</Text></View>
    </View>
  );
}

/** The take card on the results: notes landed, stars, chips, the ladder line. */
export function TakeCardView({ card, head }: { card: TakeCard; head: string }) {
  return (
    <Card testID="lesson-take-card" style={s.takeCard}>
      <Label>{head}</Label>
      <View style={s.takeTop}>
        <Text style={s.takeBig}>{card.big}</Text>
        <Body size={17} weight="800" style={{ flexShrink: 1 }}>{card.unit ? `of ${card.unit.slice(1)} ` : ''}{card.label}</Body>
      </View>
      <Stars n={card.stars} size={26} />
      {card.needed ? <Body size={14} color={color.muted}>{card.needed}</Body> : null}
      {card.chips.map(c => <Body key={c} size={15} weight="600">{c}</Body>)}
      {card.small ? <Body size={13} color={color.muted}>{card.small}</Body> : null}
    </Card>
  );
}

/** Where your hits landed against the click: dots, the "right on it" zone, early ← → late. */
export function TimingLineView({ line }: { line: NonNullable<ReturnType<typeof timingLine>> }) {
  const [w, setW] = useState(0);
  const x = (v: number) => (v / 1000) * w;
  return (
    <View style={s.timing} accessible accessibilityLabel={line.label} testID="lesson-timing-line">
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

/** The moment after a lesson: stars, the stage, what's next (src/lesson/Celebration.tsx). */
export function CelebrationModal({ c, onNext, onAgain, onClose }: { c: Celebration; onNext: () => void; onAgain: () => void; onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" supportedOrientations={['landscape']} onRequestClose={onClose}>
      <View style={s.scrim}>
        <Card tone="pop" elevation={8} style={s.celebrate} testID="lesson-celebration">
          <Display size={44} style={{ textAlign: 'center' }}>{c.title}</Display>
          {c.rankUp && c.milestone ? <>
            <Body size={18} style={s.center}>You're now a</Body>
            <Display size={34} style={s.center}>{c.milestone.rank}</Display>
            <Body size={15} weight="700" style={s.center}>You can: {c.milestone.canDo.join(' · ')}</Body>
            <Body size={14} style={s.center}>Earned today. Play its challenges again on another day for the ✓ proven mark.</Body>
            {c.next ? <Body size={15} style={s.center}>Next stage: <Strong>{c.next.title}</Strong>, on the way to <Strong>{c.next.rank}</Strong>.</Body> : null}
          </> : <Display size={26} style={s.center}>{c.lessonTitle}</Display>}
          <View style={{ alignItems: 'center' }}><Stars n={c.stars} size={54} /></View>
          {!c.rankUp && c.milestone ? (
            <Body size={15} style={s.center}>Stage {c.milestone.level + 1}, {c.milestone.title}: {c.done} of {c.total} checkpoints to <Strong>{c.milestone.rank}</Strong></Body>
          ) : null}
          <View style={s.celebrateMoves}>
            <Button tone="blue" label={c.nextLabel} onPress={onNext} testID="lesson-celebration-next" />
            {c.canGoForMore ? <Button label={`Go for ${'★'.repeat(c.stars + 1)}`} onPress={onAgain} testID="lesson-celebration-again" /> : null}
            <Button tone="plain" label="Stay on this lesson" onPress={onClose} testID="lesson-celebration-stay" />
          </View>
        </Card>
      </View>
    </Modal>
  );
}

/** ⋯ More: the lesson card, help from the coach, reset, the keys. */
export function MoreSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <Modal visible={open} transparent animationType="fade" supportedOrientations={['landscape']} onRequestClose={onClose}>
      <Pressable style={s.scrimRight} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
        <Pressable onPress={() => {}} style={{ width: 460, maxHeight: '86%' }}>
          <Card style={{ maxHeight: '100%' }} testID="lesson-more">
            <ScrollView contentContainerStyle={{ gap: 10 }}>{children}</ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A rest step's countdown (RestCountdown). */
export function RestCountdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => { const t = setInterval(() => setLeft(l => Math.max(0, l - 1)), 1000); return () => clearInterval(t); }, []);
  return (
    <Card tone="cream" style={s.rest} testID="lesson-rest">
      <Text style={s.restN} accessibilityRole="timer">{left > 0 ? left : '🙂'}</Text>
      <Body size={20} weight="700">{left > 0 ? 'Breathe out, let your shoulders drop.' : 'Ready when you are.'}</Body>
    </Card>
  );
}

// The keyboard fallback (CLAUDE.md keys; src/input/keyboard.ts KEYMAP) for an iPad hardware keyboard.
export const KEYMAP: Record<string, PadId> = { ' ': 'kick', x: 'kick', s: 'snare', a: 'hhClosed', q: 'hhOpen', z: 'hhPedal', e: 'tom1', r: 'tom2', f: 'floor', w: 'crash', t: 'ride' };
/**
 * A hidden text field that keeps focus and turns hardware-keyboard keys into strokes (iOS delivers them to a focused
 * TextInput; the on-screen keyboard is suppressed). H toggles hints, B the band. Unverified on the iPad (no device here).
 */
export function KeyboardKit({ emitPad, onKey }: { emitPad: (pad: PadId, velocity: number) => void; onKey?: (key: string) => void }) {
  const ref = useRef<{ focus(): void } | null>(null);
  return (
    <TextInput
      ref={ref as never} autoFocus showSoftInputOnFocus={false} caretHidden autoCorrect={false} autoCapitalize="none" spellCheck={false}
      value="" onBlur={() => setTimeout(() => ref.current?.focus(), 300)}
      onKeyPress={e => {
        const k = e.nativeEvent.key, low = k.toLowerCase();
        const pad = KEYMAP[low];
        if (pad) emitPad(pad, k !== low ? 127 : 96); // Shift = accent
        else onKey?.(low);
      }}
      style={s.hiddenInput} accessibilityElementsHidden importantForAccessibility="no"
    />
  );
}

export { GestureChip };

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
  rung: { width: 13, borderWidth: 2, borderColor: color.white, backgroundColor: 'transparent' },
  ladderCap: { fontSize: 11.5, fontWeight: '700', color: color.white },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: color.white, borderWidth: 2.5, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  roundGlyph: { ...font.display, fontSize: 20, color: color.ink, lineHeight: 24 },
  goal: { color: color.ink, fontWeight: '700' },
  boxes: { flexDirection: 'row', gap: 10 },
  box: { width: 50, height: 50, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  boxOk: { backgroundColor: color.good },
  boxTick: { ...font.display, fontSize: 26, color: color.white },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: stroke.card, borderColor: color.ink, paddingHorizontal: 20, height: 58, boxShadow: hardShadow(shadow.card) },
  bannerEmoji: { fontSize: 30 },
  countWrap: { alignItems: 'center', justifyContent: 'center', gap: 14, width: 210 },
  countCircle: { width: 144, height: 144, borderRadius: 72, backgroundColor: color.pop, alignItems: 'center', justifyContent: 'center' },
  countN: { ...font.display, fontSize: 92, color: color.ink, lineHeight: 104 },
  countTag: { backgroundColor: color.white, borderWidth: 2, borderColor: color.ink, paddingHorizontal: 12, paddingVertical: 5 },
  countTagText: { ...font.display, fontSize: 15, color: color.ink },
  takeCard: { gap: 6 },
  takeTop: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  takeBig: { ...font.display, fontSize: 58, lineHeight: 62, color: color.ink },
  timing: { backgroundColor: color.cream, borderWidth: 2, borderColor: color.ink, padding: 10, gap: 4 },
  timingHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  timingTrack: { height: 54 },
  zone: { position: 'absolute', top: 6, height: 42, backgroundColor: '#1E9E5A22', borderWidth: 2, borderColor: color.good },
  axis: { position: 'absolute', left: 0, right: 0, top: 26, height: 3, backgroundColor: color.ink },
  click: { position: 'absolute', top: 4, width: 3, height: 46, backgroundColor: color.ink },
  dot: { position: 'absolute', width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: color.ink },
  timingFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  scrim: { flex: 1, backgroundColor: 'rgba(20,20,20,0.55)', alignItems: 'center', justifyContent: 'center' },
  scrimRight: { flex: 1, backgroundColor: 'rgba(20,20,20,0.35)', alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 96, paddingRight: 24 },
  celebrate: { width: 640, gap: 12, paddingVertical: 26, paddingHorizontal: 30 },
  celebrateMoves: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 8 },
  center: { textAlign: 'center' },
  rest: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  restN: { ...font.display, fontSize: 120, lineHeight: 130, color: color.ink },
  hiddenInput: { position: 'absolute', width: 1, height: 1, opacity: 0, left: -10, top: -10 },
});

export { type };
