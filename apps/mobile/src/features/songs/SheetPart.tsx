// A song's part as still sheet music (no cursor): bars A–B of the notes, through A6n's NotationView. Used by Learn
// by ear ("Show as sheet music") and the Sheet music mode (the whole song). The notation draws a page at a time at
// the view's size (NotationView `page` / `onPages`, as the results sheet does), and the buttons under it turn the
// pages, so no bar is cut off (the web's sheet scrolls through every bar).
import { cutBars } from '@drum-coach/core/engine/transcribe';
import type { ChartNote } from '@drum-coach/core/engine/chart';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { NotationView } from '../../notation';
import { Body, Button, useSheetPages } from '../../ui';
import { Row } from './bits';

export function SheetPart({ notes, timeSignature, fromBar, toBar, title, height = 300, testID = 'song-sheet-part' }: {
  notes: ChartNote[]; timeSignature: [number, 2 | 4 | 8 | 16]; fromBar: number; toBar: number; title?: string; height?: number; testID?: string;
}) {
  const bpb = (timeSignature[0] * 4) / timeSignature[1];
  const chart = useMemo(() => ({
    bpm: 100, timeSignature, bars: Math.max(1, toBar - fromBar + 1), notes: cutBars(notes, bpb, fromBar, toBar), ...(title && { title }),
  }), [notes, timeSignature, fromBar, toBar, title, bpb]);
  const now = useMemo(() => () => 0, []);
  const pager = useSheetPages(`${fromBar}-${toBar}`); // back to the first page when the bars change
  return (
    <View style={styles.pages}>
      <View style={[styles.sheet, { height }]} testID={testID}>
        <NotationView chart={chart} bpm={100} zero={0} now={now} latencyMs={0} hints={false} scale={1.2} page={pager.page} onPages={pager.setPages} />
      </View>
      {pager.show ? (
        <Row>
          <Button size="small" label="◀ Earlier bars" accessibilityLabel="Earlier page of the sheet music" disabled={!pager.canPrev} onPress={pager.prev} testID={`${testID}-prev`} />
          <Body weight="700">{`${pager.label} (bars ${fromBar}–${toBar})`}</Body>
          <Button size="small" label="Later bars ▶" accessibilityLabel="Later page of the sheet music" disabled={!pager.canNext} onPress={pager.next} testID={`${testID}-next`} />
        </Row>
      ) : null}
    </View>
  );
}

/** The whole transcription, a page at a time. */
export function SheetPages({ notes, timeSignature, bars, title }: { notes: ChartNote[]; timeSignature: [number, 2 | 4 | 8 | 16]; bars: number; title: string }) {
  return <SheetPart notes={notes} timeSignature={timeSignature} fromBar={1} toBar={Math.max(1, bars)} title={title} height={420} testID="song-sheet" />;
}

const styles = StyleSheet.create({
  sheet: { borderWidth: 3, borderColor: '#141414', overflow: 'hidden' },
  pages: { gap: 10 },
});
