// The lesson player's local pieces, drawn as the mockups draw them (docs/mockups/ipad/lesson-*.png) with the UI kit's
// tokens. StepPills, TempoLadder, TimingLineView, RoundButton and SheetPager are the kit's now (src/ui), and the keyboard is
// app-wide (modules/drum-keys through the hit bus).
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { refocusKeyboard } from '../../platform/keyboard';
import { Body, Button, Card, Display, GestureChip, Label, Stars, Strong, color, font, hardShadow, shadow, stroke, type, useAppKey } from '../../ui';
import type { Celebration } from './controller';
import type { Goal } from './lessonView';
import type { TakeCard } from './results';

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

/** The moment after a lesson: stars, the stage, what's next (src/lesson/Celebration.tsx). */
export function CelebrationModal({ c, onNext, onAgain, onClose }: { c: Celebration; onNext: () => void; onAgain: () => void; onClose: () => void }) {
  // Keys: Enter is the main move (the web autofocuses it), Esc stays on this lesson (closes the sheet).
  useAppKey('enter', onNext);
  useAppKey('escape', onClose);
  return (
    <Modal transparent animationType="fade" supportedOrientations={['landscape']} onRequestClose={onClose} onShow={refocusKeyboard} onDismiss={refocusKeyboard}>
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
  useAppKey('escape', onClose, { enabled: open }); // a hardware keyboard's Esc closes it
  return (
    <Modal visible={open} transparent animationType="fade" supportedOrientations={['landscape']} onRequestClose={onClose} onShow={refocusKeyboard} onDismiss={refocusKeyboard}>
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

export { GestureChip };

/** Under the results sheet of a long take: ‹ Page 2 of 3 ›. Nothing for a one-page take. */
const s = StyleSheet.create({
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
  scrim: { flex: 1, backgroundColor: 'rgba(20,20,20,0.55)', alignItems: 'center', justifyContent: 'center' },
  scrimRight: { flex: 1, backgroundColor: 'rgba(20,20,20,0.35)', alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 96, paddingRight: 24 },
  celebrate: { width: 640, gap: 12, paddingVertical: 26, paddingHorizontal: 30 },
  celebrateMoves: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 8 },
  center: { textAlign: 'center' },
  rest: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  restN: { ...font.display, fontSize: 120, lineHeight: 130, color: color.ink },
});

export { type };
