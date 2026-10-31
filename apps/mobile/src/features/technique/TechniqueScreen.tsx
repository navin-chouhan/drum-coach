// /technique: Stick technique (web src/ui/TechniqueView.tsx, from Journey's "More ways to play"), full screen: the
// movements on the left, the big animated "How it moves" (the web's TechniqueDemo in a DOM component) on the right,
// with its tempo. Touch only, as on the web (no kit or key commands); Esc goes back, as a sheet closes.
import type { DemoId } from '@drum-coach/core/content/demos';
import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Body, Button, Card, Choice, Display, Label, Screen, useAppKey } from '../../ui';
import { HowItMoves } from '../lesson/HowItMoves';
import { demoOptions, FIRST, INTRO, START_BPM, TEMPOS, TITLE } from './technique';

const OPTIONS = demoOptions();

export function TechniqueScreen() {
  const [id, setId] = useState<DemoId>(FIRST), [bpm, setBpm] = useState<number>(START_BPM);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  useAppKey('escape', back);

  return (
    <Screen withSidebar={false} testID="screen-technique">
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.top}>
        <Button label="Journey" emoji="←" size="small" onPress={back} testID="technique-back" />
        <Display size={28} accessibilityRole="header">{TITLE}</Display>
      </View>
      <View style={styles.body}>
        <Card style={styles.side}>
          <Body size={16}>{INTRO}</Body>
          <Label>Movements</Label>
          <View style={styles.demos} accessibilityRole="radiogroup" accessibilityLabel="Movement">
            {OPTIONS.map(o => (
              <Button key={o.value} label={o.label} tone={o.value === id ? 'pop' : 'white'} onPress={() => setId(o.value)}
                accessibilityLabel={`${o.label}${o.value === id ? ', selected' : ''}`} testID={`technique-demo-${o.value}`} />
            ))}
          </View>
          <Choice label="Tempo (BPM)" options={TEMPOS.map(b => ({ value: b, label: String(b) }))} value={bpm} onChange={setBpm} testID="technique-tempo" />
        </Card>
        <Card style={styles.stage}>
          <HowItMoves key={id} id={id} bpm={bpm} style={styles.demo} testID="technique-demo" />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 12 },
  body: { flex: 1, flexDirection: 'row', gap: 20, paddingHorizontal: 24, paddingBottom: 24 },
  side: { width: 330, gap: 12 },
  demos: { gap: 10 },
  stage: { flex: 1, padding: 12 },
  demo: { flex: 1 },
});
