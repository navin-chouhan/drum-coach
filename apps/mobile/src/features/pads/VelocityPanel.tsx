// "Soft, then loud" (web VelocityWizard; N9): four soft taps then four loud strokes per pad. With the kit it reads the
// raw MIDI (retriggers included, which the hit filter would drop); with no kit, the hit bus (touch pads).
import { parseMidiMessage } from '@drum-coach/core/engine/midi';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getMidiPort } from '../../platform/midi';
import { getStorage } from '../../platform/storage';
import { BigMove, Body, Button, Card, Display, color, font, getAppHitBus, tabular } from '../../ui';
import { Group, GroupRow } from '../setup/parts';
import { readPadCal, writePadCal } from './kitStore';
import {
  VELOCITY_INTRO, VELOCITY_NO_KIT, calSummary, idleVelocity, nextPad, redoPad, startVelocity, stopVelocity, velocityNote, velocityTick,
  velocityView, type VelocityStep,
} from './velocityWizard';
import type { KitCalibration } from '@drum-coach/core/engine/padCal';
import type { NoteMap } from '@drum-coach/core/engine/kit';

export function VelocityPanel({ kit, map, padCal, kitConnected }: { kit: string; map: NoteMap; padCal: KitCalibration; kitConnected: boolean }) {
  const [state, setState] = useState(idleVelocity);
  const ref = useRef({ state, map });
  ref.current = { state, map };
  const apply = (step: VelocityStep) => {
    ref.current.state = step.state;
    setState(step.state);
    if (step.save) writePadCal(getStorage().kv, kit, step.save);
  };
  const existing = () => readPadCal(getStorage().kv, kit);

  useEffect(() => {
    if (!state.on) return;
    const bus = getAppHitBus();
    const take = (note: number, velocity: number, time: number) => apply(velocityNote(ref.current.state, ref.current.map, note, velocity, time));
    const offRaw = bus.onRawMidi((data, time) => { const n = kitConnected ? parseMidiMessage(data) : null; if (n) take(n.note, n.velocity, time); });
    const offHit = bus.onHit(h => { if (!kitConnected) take(h.note, h.velocity, h.time); });
    const t = setInterval(() => apply(velocityTick(ref.current.state, getMidiPort().clock.now(), existing())), 50);
    return () => { offRaw(); offHit(); clearInterval(t); };
  }, [state.on, kitConnected, kit]); // eslint-disable-line react-hooks/exhaustive-deps -- the handlers read the latest state through the ref

  const v = velocityView(state);
  const summary = calSummary(padCal);
  if (!state.on) return (
    <View style={styles.wrap} testID="velocity">
      <Card style={styles.intro}>
        <Display size={24}>Soft, then loud · {kit}</Display>
        <Body size={17}>{VELOCITY_INTRO}</Body>
        {!kitConnected ? <Body size={15} color={color.muted}>{VELOCITY_NO_KIT}</Body> : null}
        <View style={styles.row}>
          <Button tone="blue" label="Start: soft, then loud" onPress={() => apply({ state: startVelocity() })} testID="velocity-start" />
          {summary.length ? <Button label="Reset (plain MIDI velocity)" onPress={() => writePadCal(getStorage().kv, kit, {})} testID="velocity-reset" /> : null}
        </View>
      </Card>
      {summary.length ? (
        <Group title="Calibrated pads">
          {summary.map((s, i) => <GroupRow key={s.pad} first={i === 0} title={s.name} sub={s.text} />)}
        </Group>
      ) : null}
    </View>
  );
  return (
    <View style={styles.wrap} testID="velocity" accessibilityLiveRegion="polite">
      <View style={styles.cols}>
        <Card tone="night" elevation={6} style={styles.stage}>
          <Text style={styles.kicker}>{v.step.toUpperCase()}</Text>
          <Display size={40} color={color.white} style={styles.center} testID="velocity-prompt">{v.prompt}</Display>
          <Text style={[styles.dots, tabular]} accessibilityLabel={`Soft ${v.softDots.split('●').length - 1} of 4, loud ${v.loudDots.split('●').length - 1} of 4`}>
            Soft {v.softDots}   Loud {v.loudDots}
          </Text>
        </Card>
        <View style={styles.side}>
          <Group title="Each pad">
            {v.rows.map((r, i) => <GroupRow key={r.pad} first={i === 0} title={r.name} right={r.value} testID={`velocity-row-${r.pad}`} />)}
          </Group>
        </View>
      </View>
      <View style={styles.row}>
        <BigMove tone="alt" emoji="◀" label="Redo this pad" onPress={() => apply({ state: redoPad(state) })} testID="velocity-redo" style={styles.move} />
        <BigMove tone="alt" label="Skip this pad" onPress={() => apply(nextPad(state, existing()))} testID="velocity-skip" style={styles.move} />
        <BigMove tone="alt" emoji="✕" label="Stop" note="keeps what's done" onPress={() => apply(stopVelocity(state, existing()))} testID="velocity-stop" style={styles.move} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 18 },
  intro: { gap: 12, maxWidth: 760 },
  row: { flexDirection: 'row', gap: 14, alignItems: 'center', flexWrap: 'wrap' },
  cols: { flex: 1, flexDirection: 'row', gap: 26 },
  stage: { flex: 1.8, alignItems: 'center', justifyContent: 'center', gap: 18 },
  kicker: { ...font.display, fontSize: 14, color: color.ink, backgroundColor: color.pop, paddingHorizontal: 10, paddingVertical: 2 },
  center: { textAlign: 'center' },
  dots: { ...font.display, fontSize: 30, color: color.pop },
  side: { flex: 1, maxWidth: 380 },
  move: { minHeight: 64, minWidth: 190 },
});
