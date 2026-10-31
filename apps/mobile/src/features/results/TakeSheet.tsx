// A finished take on the sheet with its marks, every page of it (the iPad's form of the web's Replay: expected vs
// played notes, extra hits ✕). Shared by the results details (Practice) and Songs' scored results.
import type { Finished } from '@drum-coach/core/play/take';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { NotationView } from '../../notation';
import { Body, SheetPager, color, stroke, useAppSettings, useSheetPages } from '../../ui';
import { replayResults, takenChart } from '../lesson/runChart';

export function TakeSheet({ f, height = 300, testID = 'results-sheet' }: { f: Finished; height?: number; testID?: string }) {
  const settings = useAppSettings();
  const taken = useMemo(() => (f.results.length ? { chart: takenChart(f), results: replayResults(f) } : undefined), [f]);
  const pager = useSheetPages(taken);
  if (!taken) return null;
  return (
    <View style={styles.stack}>
      <View style={[styles.sheet, { height }]}>
        <NotationView chart={taken.chart} bpm={f.chart.bpm * f.options.speed} zero={f.zero} now={() => f.zero} latencyMs={0} results={taken.results}
          hints={settings.hints !== false} leftHanded={!!settings.leftHanded} page={pager.page} onPages={pager.setPages} testID={testID} />
      </View>
      <SheetPager v={pager} onPrev={pager.prev} onNext={pager.next} tone="light" testID={`${testID}-pages`} />
      <Body size={13} weight="800">● on it  ● early / late  ◌ missed  ✕ extra</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  sheet: { backgroundColor: '#FFFDF6', borderWidth: stroke.thin, borderColor: color.ink, overflow: 'hidden' },
});
