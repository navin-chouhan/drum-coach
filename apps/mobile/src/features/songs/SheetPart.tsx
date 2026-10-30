// A song's part as still sheet music (no cursor): bars A–B of the notes, through A6n's NotationView. Used by Learn
// by ear ("Show as sheet music") and the Sheet music mode, which pages through the song 8 bars at a time.
import { cutBars } from '@drum-coach/core/engine/transcribe';
import type { ChartNote } from '@drum-coach/core/engine/chart';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { NotationView } from '../../notation';
import { Button, Body } from '../../ui';
import { Row } from './bits';

const FAR = 1e12; // beat 0 far in the future: no cursor, no count, the first page

export function SheetPart({ notes, timeSignature, fromBar, toBar, title, height = 300, testID }: {
  notes: ChartNote[]; timeSignature: [number, 2 | 4 | 8 | 16]; fromBar: number; toBar: number; title?: string; height?: number; testID?: string;
}) {
  const bpb = (timeSignature[0] * 4) / timeSignature[1];
  const chart = useMemo(() => ({
    bpm: 100, timeSignature, bars: Math.max(1, toBar - fromBar + 1), notes: cutBars(notes, bpb, fromBar, toBar), ...(title && { title }),
  }), [notes, timeSignature, fromBar, toBar, title, bpb]);
  const now = useMemo(() => () => 0, []);
  return (
    <View style={[styles.sheet, { height }]} testID={testID}>
      <NotationView chart={chart} bpm={100} zero={FAR} now={now} latencyMs={0} hints={false} scale={1.2} />
    </View>
  );
}

/** The whole transcription, 8 bars a page. */
export function SheetPages({ notes, timeSignature, bars, title }: { notes: ChartNote[]; timeSignature: [number, 2 | 4 | 8 | 16]; bars: number; title: string }) {
  const PER = 8, pages = Math.max(1, Math.ceil(bars / PER));
  const [p, setP] = useState(0);
  const from = p * PER + 1, to = Math.min(bars, from + PER - 1);
  return (
    <View style={styles.pages}>
      <SheetPart notes={notes} timeSignature={timeSignature} fromBar={from} toBar={to} title={title} height={420} testID="song-sheet" />
      {pages > 1 ? (
        <Row>
          <Button size="small" label="◀ Earlier bars" disabled={p === 0} onPress={() => setP(p - 1)} />
          <Body weight="700">Bars {from}–{to} of {bars}</Body>
          <Button size="small" label="Later bars ▶" disabled={p >= pages - 1} onPress={() => setP(p + 1)} />
        </Row>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { borderWidth: 3, borderColor: '#141414', overflow: 'hidden' },
  pages: { gap: 10 },
});
