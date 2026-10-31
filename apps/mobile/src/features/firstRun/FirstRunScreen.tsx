// The first run (mockup first-run-1…4; web Onboarding + KitSetup): Welcome → Plug in → Your pads → Latency, full
// screen under the black bar with the step pills. Welcome saves the profile (and queues the placement test for
// players who have played before); the kit steps can be skipped (touch pads, Skip for now) and are nagged later in
// Setup and the sidebar, as on the web. The coach server stays in Setup. Each step's instruction is spoken (D10).
import { Stack, router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getStorage } from '../../platform/storage';
import {
  BigMove, Body, Button, Card, Display, DottedGround, Mascot, Segmented, color, font, gesturesFor, hardShadow, readSettings, slopFor, stroke, useAppSettings,
  useKitMoves, writeSettings,
} from '../../ui';
import { speakMoment } from '../coach/voice';
import { LatencyPanel } from '../latency/LatencyPanel';
import { PadWizardView } from '../pads/PadWizardView';
import { firstHitLine, kitStatus } from '../setup/kit';
import { useKitConnection, useKitData, useLastHit, useLatencyRouteSync } from '../setup/useSetup';
import {
  GOALS, KIT_STEP_TEXT, MINUTES, STEP_SPOKEN, RECOMMENDED_MINUTES, WELCOME, finishKitSteps, nextStep, notSureYet, placementQueued, queuePlacement, saveWelcome, stepPills, toggleGoal,
  welcomeForm, type FirstRunStep, type WelcomeForm,
} from './firstRun';

const kv = () => getStorage().kv;

export function FirstRunScreen() {
  useLatencyRouteSync();
  const s = useAppSettings();
  const [step, setStep] = useState<FirstRunStep>(s.profile.onboarded ? 'plug' : 'welcome');
  const [form, setForm] = useState<WelcomeForm>(() => welcomeForm(s));
  const insets = useSafeAreaInsets();

  const finish = (done: boolean) => {
    writeSettings(kv(), finishKitSteps(readSettings(kv()), done));
    // Played before: the placement test comes next, as the web's Onboarding → kit steps → PlacementView.
    router.replace((placementQueued(kv()) ? '/lesson/placement' : '/'));
  };
  const go = (from: FirstRunStep) => { const n = nextStep(from); if (n === 'finish') finish(true); else setStep(n); };
  const continueWelcome = () => {
    writeSettings(kv(), saveWelcome(readSettings(kv()), form));
    queuePlacement(kv(), form.playedBefore);
    setStep('plug');
  };
  // D10 voice first: each step says its instruction once when it opens (the coach's voice setting decides).
  useEffect(() => { speakMoment({ kind: 'notice', text: STEP_SPOKEN[step] }); }, [step]); // R6's voice moments: off when the voice is off
  // Hands-free on the two steps without pad answers: the "yes" gesture is Continue.
  useKitMoves({ yes: () => (step === 'welcome' ? continueWelcome() : go('plug')) }, { enabled: step === 'welcome' || step === 'plug' });

  return (
    <DottedGround>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.top, { paddingTop: Math.max(insets.top, 20), paddingLeft: insets.left + 26, paddingRight: insets.right + 24 }]}>
        <View style={styles.brand}><View style={styles.logo} /><Display size={20} color={color.white}>Drum Coach</Display></View>
        <View style={styles.prog} accessibilityRole="progressbar" accessibilityLabel={`Step ${stepPills(step).findIndex(p => p.state === 'cur') + 1} of 4`}>
          {stepPills(step).map((p, i) => (
            <View key={p.id} style={styles.progItem}>
              {i > 0 ? <View style={styles.progLine} /> : null}
              <View style={[styles.pill, p.state === 'done' && styles.pillDone, p.state === 'cur' && styles.pillCur]}>
                <View style={[styles.pillN, p.state === 'done' && { backgroundColor: color.good }]}><Text style={[styles.pillNText, p.state === 'done' && { color: color.white }]}>{p.state === 'done' ? '✓' : p.n}</Text></View>
                <Text style={styles.pillText}>{p.label}</Text>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.topRight}>
          {step === 'pads' ? <TopLink label={KIT_STEP_TEXT.padsFine} onPress={() => setStep('latency')} testID="firstrun-pads-fine" /> : null}
          {step !== 'welcome' ? <TopLink label={KIT_STEP_TEXT.skip} onPress={() => finish(false)} testID="firstrun-skip" /> : null}
        </View>
      </View>
      <View style={[styles.body, { paddingLeft: insets.left + 40, paddingRight: insets.right + 46, paddingBottom: Math.max(insets.bottom, 12) + 58 }]} testID={`firstrun-${step}`}>
        {step === 'welcome' ? <Welcome form={form} setForm={setForm} onContinue={continueWelcome} /> : null}
        {step === 'plug' ? <PlugIn onTouchPads={() => finish(false)} onContinue={() => go('plug')} /> : null}
        {step === 'pads' ? <Pads onSaved={() => setStep('latency')} /> : null}
        {step === 'latency' ? <LatencyPanel firstRun onSaved={() => finish(true)} testID="firstrun-latency-test" /> : null}
      </View>
    </DottedGround>
  );
}

function TopLink({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={slopFor(24)} accessibilityRole="button" accessibilityLabel={label} testID={testID} style={styles.topLink}>
      <Text style={styles.topLinkText}>{label}</Text>
    </Pressable>
  );
}

function Foot({ children }: { children: ReactNode }) {
  return <View style={styles.foot}>{children}</View>;
}

function Welcome({ form, setForm, onContinue }: { form: WelcomeForm; setForm: (f: WelcomeForm) => void; onContinue: () => void }) {
  const chip = (label: string, on: boolean, onPress: () => void, testID: string) => (
    <Pressable key={testID} onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={label} testID={testID}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.8 }]}>
      <Text style={[styles.chipText, on && { color: color.white }]}>{on ? '✓ ' : ''}{label}</Text>
    </Pressable>
  );
  return (
    <>
      <View style={styles.cols}>
        <Card elevation={10} style={styles.welcomeL}>
          <Mascot size="lg" />
          <Display size={44} accessibilityRole="header">{WELCOME.title}</Display>
          <Body size={17}>{WELCOME.lead}</Body>
          <View style={styles.bullets}>
            {[['🗺️', 'A daily set: 15–45 minutes, planned for you'], ['🥢', 'Sticks in hand: the kit drives the app'], ['💬', 'A coach that writes your next lesson']].map(([e, t]) => (
              <View key={t} style={styles.bullet}><Text style={styles.bulletEm}>{e}</Text><Text style={styles.bulletText}>{t}</Text></View>
            ))}
          </View>
        </Card>
        <Card tone="cream" style={styles.welcomeR}>
          <View style={styles.q}>
            <Display size={20}>🎸 {WELCOME.goalsQ}</Display>
            <Body size={14}>{WELCOME.goalsSub}</Body>
            <View style={styles.chips}>
              {GOALS.map(g => chip(g.label, form.goals.includes(g.id), () => setForm(toggleGoal(form, g.id)), `firstrun-goal-${g.id}`))}
              {chip('Not sure yet', !form.goals.length, () => setForm(notSureYet(form)), 'firstrun-goal-none')}
            </View>
          </View>
          <View style={styles.q}>
            <Display size={20}>⏱ {WELCOME.minutesQ}</Display>
            <Body size={14}>{WELCOME.minutesSub}</Body>
            <Segmented accessibilityLabel="Minutes a day" value={String(form.minutes)} onChange={v => setForm({ ...form, minutes: Number(v) })} testID="firstrun-minutes"
              options={MINUTES.map(m => ({ value: String(m), label: m === RECOMMENDED_MINUTES ? `${m} (recommended)` : String(m) }))} />
          </View>
          <View style={styles.q}>
            <Display size={20}>🥁 {WELCOME.playedQ}</Display>
            <Body size={14}>{WELCOME.playedSub}</Body>
            <Segmented accessibilityLabel="Played drums before?" value={form.playedBefore ? 'yes' : 'no'} onChange={v => setForm({ ...form, playedBefore: v === 'yes' })} testID="firstrun-played"
              options={[{ value: 'no', label: 'New to drums' }, { value: 'yes', label: 'I’ve played before' }]} />
          </View>
        </Card>
      </View>
      <Foot>
        <View style={styles.sp} />
        <BigMove tone="go" label="Continue ▶" gestures={gesturesFor('yes').slice(0, 1)} onPress={onContinue} testID="firstrun-continue" style={styles.footMove} />
      </Foot>
    </>
  );
}

function PlugIn({ onTouchPads, onContinue }: { onTouchPads: () => void; onContinue: () => void }) {
  const conn = useKitConnection();
  const last = useLastHit();
  const status = kitStatus(conn.midi, conn.connected);
  return (
    <>
      <Card elevation={10} style={styles.plug}>
        <Display size={44} style={styles.center} accessibilityRole="header">{KIT_STEP_TEXT.plugTitle}</Display>
        <Body size={18} style={styles.center}>{KIT_STEP_TEXT.plugLead}</Body>
        <View style={styles.drawing} accessible accessibilityLabel="The drum module's USB port, a cable, the iPad's USB-C port">
          <View style={styles.module}><View style={styles.moduleScreen}><Text style={styles.moduleText}>VOICE</Text></View><View style={styles.knob} /></View>
          <View style={styles.cable} />
          <View style={styles.ipad}><View style={styles.ipadScreen} /></View>
        </View>
        <View style={styles.drawLabels}><Text style={styles.drawLabel}>DRUM MODULE · USB</Text><Text style={styles.drawLabel}>IPAD · USB-C</Text></View>
        <View style={styles.found} accessibilityLiveRegion="polite">
          <View style={styles.foundRow} testID="firstrun-kit-status">
            <View style={[styles.sym, { backgroundColor: status.connected ? color.good : color.toggleOff }]}><Text style={styles.symText}>{status.connected ? '✓' : '…'}</Text></View>
            <View style={styles.grow}>
              <Text style={styles.foundTitle}>{status.connected ? `${status.title} found` : status.noMidi ? 'Touch pads only in this build' : 'Looking for your kit…'}</Text>
              <Text style={styles.foundSub}>{status.connected ? `${status.sub.replace(' · connected', '')} · MIDI clock filtered` : status.sub}</Text>
            </View>
            {status.connected ? <Text style={[styles.foundVal, { color: color.good }]}>● connected</Text> : null}
          </View>
          {last ? (
            <View style={[styles.foundRow, styles.sep]} testID="firstrun-first-hit">
              <View style={[styles.sym, { backgroundColor: color.teal }]}><Text style={styles.symText}>🥁</Text></View>
              <View style={styles.grow}><Text style={styles.foundTitle}>{firstHitLine(last)}</Text><Text style={styles.foundSub}>note {last.note} · velocity {last.velocity}</Text></View>
              <Text style={[styles.foundVal, { color: color.good }]}>{last.pad ? 'it works' : 'not mapped yet'}</Text>
            </View>
          ) : null}
        </View>
      </Card>
      <View style={styles.tips}>{KIT_STEP_TEXT.plugTips.map(t => <View key={t} style={styles.tip}><Text style={styles.tipText}>{t}</Text></View>)}</View>
      <Foot>
        <Button label={KIT_STEP_TEXT.touchPads} onPress={onTouchPads} testID="firstrun-touch-pads" style={styles.footBtn} />
        <View style={styles.sp} />
        <BigMove tone="go" label="Continue ▶" gestures={gesturesFor('yes').slice(0, 1)} onPress={onContinue} testID="firstrun-plug-continue" style={styles.footMove} />
      </Foot>
    </>
  );
}

function Pads({ onSaved }: { onSaved: () => void }) {
  const { kit, map } = useKitData();
  const conn = useKitConnection();
  return (
    <View style={styles.grow}>
      {!conn.connected ? <Body size={15} weight="800" color={color.ink} style={styles.warn}>{KIT_STEP_TEXT.noKit}</Body> : null}
      <PadWizardView kit={kit} map={map} onSaved={onSaved} testID="firstrun-pads-wizard" />
    </View>
  );
}

export default FirstRunScreen;

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', backgroundColor: color.night, paddingBottom: 14, borderBottomWidth: stroke.card, borderBottomColor: color.ink, boxShadow: `0px 5px 0px 0px ${color.pop}`, gap: 16 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 200 },
  logo: { width: 26, height: 26, borderRadius: 13, backgroundColor: color.teal, borderWidth: 3, borderColor: color.white },
  prog: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  progItem: { flexDirection: 'row', alignItems: 'center' },
  progLine: { width: 18, height: 3, backgroundColor: color.white, marginHorizontal: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingLeft: 4, paddingRight: 13, borderRadius: 999, backgroundColor: color.panel, borderWidth: 2.5, borderColor: color.ink, boxShadow: `0px 0px 0px 2px ${color.white}` },
  pillDone: { backgroundColor: color.goodSoft },
  pillCur: { backgroundColor: color.pop },
  pillN: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color.ink, backgroundColor: color.white, alignItems: 'center', justifyContent: 'center' },
  pillNText: { ...font.display, fontSize: 12, color: color.ink },
  pillText: { ...font.display, fontSize: 14, color: color.ink },
  topRight: { width: 200, flexDirection: 'row', justifyContent: 'flex-end', gap: 16 },
  topLink: { minHeight: 44, justifyContent: 'center' },
  topLinkText: { color: color.white, fontWeight: '800', fontSize: 15, textDecorationLine: 'underline' },
  body: { flex: 1, paddingTop: 24 },
  cols: { flex: 1, flexDirection: 'row', gap: 26 },
  welcomeL: { flex: 1, gap: 12, paddingVertical: 28, paddingHorizontal: 30, borderWidth: 4 },
  bullets: { gap: 10, marginTop: 10 },
  bullet: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: color.cream, borderWidth: stroke.thin, borderColor: color.ink, paddingVertical: 7, paddingHorizontal: 12 },
  bulletEm: { fontSize: 22 },
  bulletText: { fontSize: 17, fontWeight: '700', color: color.ink, flexShrink: 1 },
  welcomeR: { flex: 1.05, gap: 20, paddingVertical: 22, paddingHorizontal: 24 },
  q: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { height: 46, paddingHorizontal: 18, borderRadius: 999, backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(3), justifyContent: 'center' },
  chipOn: { backgroundColor: color.blue },
  chipText: { ...font.display, fontSize: 15.5, color: color.ink },
  foot: { position: 'absolute', left: 40, right: 46, bottom: 58, flexDirection: 'row', alignItems: 'center', gap: 14 },
  footMove: { minHeight: 64, minWidth: 220 },
  footBtn: { height: 56 },
  sp: { flex: 1 },
  center: { textAlign: 'center' },
  plug: { alignSelf: 'center', width: 900, maxWidth: '100%', alignItems: 'center', gap: 8, paddingVertical: 22, paddingHorizontal: 30, borderWidth: 4 },
  drawing: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 0 },
  module: { width: 220, height: 120, borderRadius: 14, backgroundColor: color.night, flexDirection: 'row', alignItems: 'center', gap: 30, paddingHorizontal: 18 },
  moduleScreen: { width: 100, height: 42, backgroundColor: color.teal, borderWidth: 3, borderColor: color.white, alignItems: 'center', justifyContent: 'center' },
  moduleText: { ...font.display, fontSize: 15, color: color.ink },
  knob: { width: 44, height: 44, borderRadius: 22, backgroundColor: color.pop, borderWidth: 3, borderColor: color.white },
  cable: { width: 250, height: 9, borderRadius: 5, backgroundColor: color.ink },
  ipad: { width: 200, height: 146, borderRadius: 16, backgroundColor: color.night, padding: 10 },
  ipadScreen: { flex: 1, borderRadius: 8, backgroundColor: color.ground },
  drawLabels: { flexDirection: 'row', width: 670, justifyContent: 'space-between' },
  drawLabel: { ...font.display, fontSize: 14, color: color.ink },
  found: { width: 620, marginTop: 6, backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(4) },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 6 },
  sep: { borderTopWidth: stroke.thin, borderTopColor: color.separator },
  sym: { width: 34, height: 34, borderWidth: stroke.thin, borderColor: color.ink, alignItems: 'center', justifyContent: 'center' },
  symText: { fontSize: 18, fontWeight: '900', color: color.white },
  grow: { flex: 1, minWidth: 0 },
  foundTitle: { fontSize: 16, fontWeight: '800', color: color.ink },
  foundSub: { fontSize: 13, fontWeight: '600', color: color.muted },
  foundVal: { fontSize: 15, fontWeight: '700' },
  tips: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 24 },
  tip: { backgroundColor: color.panel, borderWidth: stroke.thin, borderColor: color.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 3 },
  tipText: { fontSize: 13.5, fontWeight: '800', color: color.ink },
  warn: { marginBottom: 8 },
});
