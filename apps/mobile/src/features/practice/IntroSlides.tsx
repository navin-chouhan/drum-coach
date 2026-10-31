// Before the first take: three big slides (what, who plays what, count it), the web's src/play/IntroSlides.tsx.
// You move through them from the kit: one hi-hat hit forward, one snare hit back; forward on the last one starts the
// take (count-in as usual). While they're up the screen's other kit moves are off (a quick double snare mustn't start
// a take), so the host passes `enabled: false` to its useKitMoves. Keys: → / Enter forward, ← back, Esc closes.
// Built for Practice; the lesson player can mount it as is (the web's 4th "How it moves" slide is the lesson's).
import type { ChartNote } from '@drum-coach/core/engine/chart';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { introSlides } from './play';
import { Body, Button, Display, MAX_FONT_SCALE, color, getAppHitBus, hardShadow, stroke, useAppKey, useAppSettings } from '../../ui';

const TAP_GAP_MS = 250; // a stick bounce or a double hit counts once

export type IntroSlidesProps = {
  title: string; sub?: string; bpm: number; what: string; notes: (ChartNote & { mine?: boolean })[]; beatsPerBar: number; focus?: string;
  onDone: () => void; onClose: () => void;
};

export function IntroSlides({ title, sub, bpm, what, notes, beatsPerBar, focus, onDone, onClose }: IntroSlidesProps) {
  const [i, setI] = useState(0);
  const last = 2;
  const next = () => (i >= last ? onDone() : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));
  const moves = useRef({ next, back });
  moves.current = { next, back };
  useEffect(() => {
    let at = -Infinity;
    return getAppHitBus().onHit(h => {
      if (h.time - at < TAP_GAP_MS) return;
      if (h.pad === 'hhClosed' || h.pad === 'hhOpen') { at = h.time; moves.current.next(); }
      else if (h.pad === 'snare') { at = h.time; moves.current.back(); }
    });
  }, []);
  useAppKey('right', next);
  useAppKey('enter', next);
  useAppKey('left', back);
  useAppKey('escape', onClose);

  const { leftHanded } = useAppSettings();
  const v = introSlides(notes, beatsPerBar, !!leftHanded);

  return (
    <Modal transparent animationType="fade" supportedOrientations={['landscape']} onRequestClose={onClose}>
      <View style={styles.back} accessibilityViewIsModal accessibilityLabel={`About to play: ${title}`} testID="intro-slides">
        <View style={styles.slide}>
          <View style={styles.top}>
            <Body size={14} weight="800" color={color.muted}>{`${i + 1} / ${last + 1}`}</Body>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the slides" hitSlop={10} testID="intro-close" style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          {i === 0 ? <>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.kicker}>{`${title.toUpperCase()} · ${bpm} BPM`}</Text>
            <Display size={40}>{sub ?? title}</Display>
            <Body size={20}>{what}</Body>
          </> : null}
          {i === 1 ? <>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.kicker}>WHO PLAYS WHAT</Text>
            <View style={styles.limbs}>
              {v.plan.map(p => (
                <View key={p.limb} style={styles.limb} accessible accessibilityLabel={`${p.name}: ${p.drums.join(' and ')}, ${p.when}`}>
                  <Display size={34}>{p.limb}</Display>
                  <Body size={17} weight="800">{p.name}</Body>
                  <Body size={15}>{`${p.drums.join(' and ')}, ${p.when}`}</Body>
                </View>
              ))}
            </View>
            {v.pedalDown ? <Body size={16}>Left foot: keep the hi-hat pedal down.</Body> : null}
          </> : null}
          {i === 2 ? <>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.kicker}>COUNT IT LIKE THIS</Text>
            <View style={styles.count}>
              {v.firstBar.map(h => (
                <View key={h.t} style={[styles.countCell, Number.isInteger(h.t) && styles.beat]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.countText}>{h.count}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.countLimbs}>{h.limbs}</Text>
                </View>
              ))}
            </View>
            {focus ? <Body size={18}>{`💡 ${focus}`}</Body> : null}
          </> : null}
          <View style={styles.nav}>
            <Button tone="pop" label={i >= last ? 'Ready ▶' : 'Next ▶'} accessibilityHint="Or hit the hi-hat once" onPress={next} testID="intro-next" />
            {i > 0 ? <Button label="◀ Back" accessibilityHint="Or hit the snare once" onPress={back} testID="intro-back" /> : null}
            <Body size={14} color={color.muted}>hi-hat × 1 forward · snare × 1 back</Body>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(20,20,20,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  slide: { width: 820, maxWidth: '100%', minHeight: 440, backgroundColor: color.cream, borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(8), padding: 28, gap: 16 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 24, fontWeight: '900', color: color.ink },
  kicker: { fontSize: 15, fontWeight: '900', letterSpacing: 1, color: color.muted },
  limbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  limb: { flexGrow: 1, flexBasis: 170, backgroundColor: color.panel, borderWidth: stroke.thin, borderColor: color.ink, padding: 12, gap: 4 },
  count: { flexDirection: 'row', gap: 4 },
  countCell: { flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 10, backgroundColor: color.panel, borderWidth: stroke.thin, borderColor: color.ink },
  beat: { backgroundColor: color.pop },
  countText: { fontSize: 24, fontWeight: '900', color: color.ink },
  countLimbs: { fontSize: 14, fontWeight: '700', color: color.muted },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 'auto' },
});
