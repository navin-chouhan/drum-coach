// "Hit each pad once", big and readable from the throne (mockup first-run-3-pads; web PadWizard `big`): the pad to hit
// in huge type on the web wizard's black stage with the kit drawing, what each pad sent on the right, and Back /
// Skip / Stop. Hitting the pad is the answer. Used by Setup → Pads and by the first run's step 3.
import { useEffect, useReducer, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BigMove, Body, Card, Group, GroupRow, MAX_FONT_SCALE, PadMap, color, font, getAppHitBus, hardShadow, stroke, tabular, writeSettings } from '../../ui';
import { getStorage } from '../../platform/storage';
import { writeNoteMap } from './kitStore';
import { startWizard, wizardReduce, wizardSave, wizardView, type WizardAction, type WizardState } from './padWizard';
import type { NoteMap } from '@drum-coach/core/engine/kit';

type Props = {
  kit: string;
  map: NoteMap;
  /** Saved: the note map and padsCheckedAt are written. */
  onSaved: () => void;
  /** ✕ Stop (nothing saved). Absent in the first run, where "Skip for now" sits in the top bar. */
  onStop?: () => void;
  testID?: string;
};

export function PadWizardView({ kit, map, onSaved, onStop, testID = 'pads' }: Props) {
  const mapRef = useRef(map);
  mapRef.current = map;
  const [state, dispatch] = useReducer((s: WizardState, a: WizardAction) => wizardReduce(s, a, mapRef.current), undefined, startWizard);
  useEffect(() => getAppHitBus().onHit(h => dispatch({ kind: 'hit', note: h.note, time: h.time })), []);
  const v = wizardView(state, map, kit);

  const save = () => {
    const out = wizardSave(state, map);
    const kv = getStorage().kv;
    writeNoteMap(kv, kit, out.map);
    writeSettings(kv, out.settings);
    onSaved();
  };

  return (
    <View style={styles.wrap} testID={testID} accessibilityLiveRegion="polite">
      <View style={styles.cols}>
        <Card tone="night" elevation={6} style={styles.stage}>
          <View style={styles.kicker}><Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.kickerText}>{v.kicker.toUpperCase()}</Text></View>
          <Text maxFontSizeMultiplier={1.1} style={styles.big} testID={`${testID}-prompt`} accessibilityRole="header">
            {v.padWord ? <>Hit <Text style={styles.bigPad}>{v.padWord}</Text></> : v.title}
          </Text>
          <Body size={17} color="#DDDDDD" weight="700" style={styles.center}>{v.hint}</Body>
          {v.toast ? <View style={styles.toast}><Text style={styles.toastText}>{v.toast}</Text></View> : null}
          <PadMap spots={v.spots} />
        </Card>
        <View style={styles.side}>
          <Group title="What each pad sent" foot="If two pads send the same note, it stops and shows how to fix it on the module (VOICE, then PAGE to Nxx).">
            {v.rows.map((r, i) => (
              <GroupRow key={r.pad} first={i === 0} testID={`${testID}-row-${r.pad}`}>
                <Text style={[styles.ck, r.state === 'ok' && { color: color.good }]}>{r.state === 'ok' ? '✓' : r.state === 'now' ? '●' : ''}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.rowName, r.state === 'now' && styles.rowNow]}>{r.name}</Text>
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.rowVal, tabular]}>{r.value}</Text>
              </GroupRow>
            ))}
          </Group>
        </View>
      </View>
      {v.conflict ? <Card tone="pop" style={styles.conflict} testID={`${testID}-conflict`}><Body size={15} weight="700">⚠️ {v.conflict}</Body></Card> : null}
      <View style={styles.moves}>
        {v.done
          ? <BigMove tone="go" emoji="✓" label="Save" onPress={save} testID={`${testID}-save`} style={styles.move} />
          : <BigMove tone="alt" label="Skip this pad" note={v.skipKeeps ?? undefined} onPress={() => dispatch({ kind: 'skip' })} testID={`${testID}-skip`} style={styles.move} />}
        <BigMove tone="alt" emoji="↶" label="Back" disabled={!v.canBack} onPress={() => dispatch({ kind: 'back' })} testID={`${testID}-back`} style={styles.move} />
        {onStop ? <BigMove tone="alt" emoji="✕" label="Stop" note="nothing is saved" onPress={onStop} testID={`${testID}-stop`} style={styles.move} /> : null}
        <View style={styles.answer}><Text style={styles.answerText}>🥢 Hitting the pad is the answer: no need to touch the screen</Text></View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 14 },
  cols: { flex: 1, flexDirection: 'row', gap: 26 },
  stage: { flex: 1.9, alignItems: 'center', paddingTop: 14, gap: 4 },
  kicker: { backgroundColor: color.pop, paddingHorizontal: 10, paddingVertical: 2 },
  kickerText: { ...font.display, fontSize: 14, letterSpacing: 0.7, color: color.ink },
  big: { ...font.display, fontSize: 64, lineHeight: 70, color: color.white, textAlign: 'center' },
  bigPad: { color: color.pop },
  center: { textAlign: 'center' },
  toast: { marginTop: 6, backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, boxShadow: hardShadow(3, color.ground), paddingHorizontal: 14, paddingVertical: 6, transform: [{ rotate: '-1.5deg' }] },
  toastText: { ...font.display, fontSize: 15, color: color.ink },
  side: { flex: 1, maxWidth: 380 },
  ck: { width: 16, fontWeight: '900', color: color.ink },
  rowName: { flex: 1, fontSize: 15, fontWeight: '700', color: color.ink },
  rowNow: { fontWeight: '900' },
  rowVal: { ...font.display, fontSize: 15, color: color.ink },
  conflict: { paddingVertical: 10 },
  moves: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  move: { minHeight: 64, minWidth: 170 },
  answer: { marginLeft: 'auto', backgroundColor: color.panel, borderWidth: stroke.card, borderColor: color.ink, paddingHorizontal: 14, paddingVertical: 8, flexShrink: 1 },
  answerText: { ...font.display, fontSize: 15, color: color.ink },
});
