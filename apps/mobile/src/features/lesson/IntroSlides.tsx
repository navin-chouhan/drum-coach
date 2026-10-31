// The intro slides before a take (web src/play/IntroSlides.tsx): what · who plays what · count it like this · how it
// moves, full screen. The kit turns them (one hi-hat hit forward, one snare hit back: src/play/introSlides.ts), so do
// → / Enter, ← and Esc on a hardware keyboard; forward on the last one starts the take. The slide index is the
// controller's (introNext / introBack / introClose), so the coach's "yes" turns a slide too.
import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { refocusKeyboard } from '../../platform/keyboard';
import { introContent, introTap } from '../../play/introSlides';
import { BigMove, Body, Display, DottedGround, MAX_FONT_SCALE, Sticker, color, font, getAppHitBus, hardShadow, stroke, useAppKey } from '../../ui';
import type { LessonView } from './controller';
import { HowItMoves } from './HowItMoves';
import { useLatest } from '../../ui/useLatest';

// `demo` is optional: Practice's slides have no 4th "how it moves" slide (the web's PlayView passes none).
type Intro = Omit<NonNullable<LessonView['intro']>, 'demo'> & { demo?: NonNullable<LessonView['intro']>['demo'] };

export function IntroSlides({ intro, heelUp, onNext, onBack, onClose }: { intro: Intro; heelUp?: boolean; onNext: () => void; onBack: () => void; onClose: () => void }) {
  const c = introContent(intro);
  const acts = useLatest({ onNext, onBack });
  useEffect(() => {
    let at = -Infinity;
    return getAppHitBus().onHit(h => {
      const t = introTap(at, h);
      at = t.at;
      if (t.move === 'next') acts.current.onNext(); else if (t.move === 'back') acts.current.onBack();
    });
  }, [acts]);
  useAppKey('right', onNext);
  useAppKey('enter', onNext);
  useAppKey('left', onBack);
  useAppKey('escape', onClose);
  const { i, last } = intro;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" supportedOrientations={['landscape', 'landscape-left', 'landscape-right']}
      onRequestClose={onClose} onShow={refocusKeyboard} onDismiss={refocusKeyboard}>
      <DottedGround style={styles.ground}>
        <View style={styles.slide} testID="lesson-intro" accessibilityViewIsModal accessibilityLabel={`About to play: ${intro.title}`} accessibilityLiveRegion="polite">
          <Text style={styles.pg} testID="lesson-intro-page">{i + 1} / {last + 1}</Text>
          {i === 0 ? <>
            <Sticker tone="night" size={24} text={c.kicker} />
            <Display size={64} style={styles.center} numberOfLines={2}>{c.big}</Display>
            <Body size={28} weight="700" style={[styles.center, styles.wide]}>{intro.what}</Body>
          </> : null}
          {i === 1 ? <>
            <Sticker tone="night" size={24} text="WHO PLAYS WHAT" />
            <View style={styles.limbs}>
              {c.plan.map(p => (
                <View key={p.limb} style={styles.limb} accessible accessibilityLabel={`${p.name}: ${p.drums.join(' and ')}, ${p.when}`}>
                  <Display size={56}>{p.limb}</Display>
                  <Body size={24} weight="800">{p.name}</Body>
                  <Body size={19} color={color.muted} style={styles.center}>{p.drums.join(' and ')}, {p.when}</Body>
                </View>
              ))}
            </View>
            {c.pedalDown ? <Body size={22} weight="700">Left foot: keep the hi-hat pedal down.</Body> : null}
          </> : null}
          {i === 2 ? <>
            <Sticker tone="night" size={24} text="COUNT IT LIKE THIS" />
            <View style={styles.countBar}>
              {c.firstBar.map(h => (
                <View key={h.t} style={[styles.countCell, h.beat && { backgroundColor: color.pop }]}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.countText}>{h.count}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.countLimbs}>{h.limbs}</Text>
                </View>
              ))}
            </View>
            {intro.focus ? <Body size={24} weight="700" style={[styles.center, styles.wide]}>💡 {intro.focus}</Body> : null}
          </> : null}
          {i === 3 && intro.demo ? <>
            <Sticker tone="night" size={24} text="HOW IT MOVES" />
            <HowItMoves id={intro.demo} bpm={intro.bpm} compact heelUp={heelUp} style={styles.demo} testID="lesson-intro-demo" />
          </> : null}
          <View style={styles.nav}>
            <BigMove tone="go" label={i >= last ? 'Ready ▶' : 'Next ▶'} note="hi-hat × 1" onPress={onNext} testID="lesson-intro-next" style={styles.navMove} />
            {i > 0 ? <BigMove tone="alt" label="◀ Back" note="snare × 1" onPress={onBack} testID="lesson-intro-back" style={styles.navMove} /> : null}
          </View>
        </View>
      </DottedGround>
    </Modal>
  );
}

const styles = StyleSheet.create({
  ground: { padding: 30, justifyContent: 'center' },
  slide: {
    flex: 1, backgroundColor: color.panel, borderWidth: 4, borderColor: color.ink, boxShadow: hardShadow(10),
    alignItems: 'center', justifyContent: 'center', gap: 22, padding: 36, paddingBottom: 130,
  },
  pg: { position: 'absolute', top: 16, left: 22, ...font.display, fontSize: 20, color: color.ink },
  center: { textAlign: 'center' },
  wide: { maxWidth: 980 },
  limbs: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 20 },
  limb: { borderWidth: 4, borderColor: color.ink, boxShadow: hardShadow(6), backgroundColor: color.cream, paddingVertical: 18, paddingHorizontal: 24, alignItems: 'center', minWidth: 210, maxWidth: 260 },
  countBar: { flexDirection: 'row', gap: 10, width: '92%' },
  countCell: { flex: 1, borderWidth: stroke.card, borderColor: color.ink, paddingVertical: 12, paddingHorizontal: 2, backgroundColor: color.panel, alignItems: 'center' },
  countText: { ...font.display, fontSize: 36, color: color.ink },
  countLimbs: { ...font.heavy, fontSize: 18, color: color.blue },
  demo: { width: '78%', aspectRatio: 900 / 600 },
  nav: { position: 'absolute', bottom: 22, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 14 },
  navMove: { minWidth: 230 },
});
