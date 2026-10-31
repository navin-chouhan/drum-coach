// "This month's report" (the web's YouVsYou): you a month ago against you now, month by month, and the coach's monthly
// report. The first two work offline; the report needs the home server, and says so clearly when it can't be reached.
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { RunRow } from '@drum-coach/core/engine/progress';
import { getCoach } from '../coach/coach';
import { getStorage } from '../../platform/storage';
import { Body, Button, Card, CardTitle, Notice, Strong, color, stroke, tabular } from '../../ui';
import { practiceEngine } from '../practice/engine';
import { readPlayOptions } from '../practice/play';
import { askMonthReport, historyModel, keptReport, keptTakeChart, MONTH_REPORT_KEY, NO_TAKE_KEPT, type MonthReport } from './monthReport';

export function MonthReportView({ runs }: { runs: RunRow[] }) {
  const [now] = useState(() => Date.now());
  const h = useMemo(() => historyModel(runs, now), [runs, now]);
  const [report, setReport] = useState<MonthReport>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { setReport(keptReport(getStorage().settings?.get(MONTH_REPORT_KEY), new Date())); }, []);

  const ask = (again = false) => {
    setBusy(true); setErr('');
    const storage = getStorage();
    void askMonthReport({
      call: (method, path, body, opts) => getCoach().server.call(method, path, body, opts), // with the API-key fallback
      context: async () => (await storage.coachContext('month')).context,
      keep: v => storage.settings?.put(MONTH_REPORT_KEY, v),
    }, again).then(r => { if (r.ok) setReport(r.report); else setErr(r.message); }).finally(() => setBusy(false));
  };
  // Hear it (the web's hear()): the kept take's own hits, played as drums at its tempo; again stops it.
  const eng = useSyncExternalStore(practiceEngine.subscribe, practiceEngine.get);
  const hearing = eng.demo && (eng.phase === 'playing' || eng.phase === 'starting') && eng.chartId?.startsWith('take-') ? eng.chartId : undefined;
  useFocusEffect(useCallback(() => () => { if (practiceEngine.get().chartId?.startsWith('take-')) practiceEngine.stop(); }, []));
  const hear = (runId: number | undefined, title: string) => {
    if (hearing) { practiceEngine.stop(); if (hearing === `take-${runId}`) return; }
    if (runId == null) { setNotice(NO_TAKE_KEPT); return; }
    void getStorage().runs.take(String(runId)).then(t => {
      if (!t) { setNotice(NO_TAKE_KEPT); return; }
      const chart = keptTakeChart(t, runId, title);
      if (!chart) { setNotice(NO_TAKE_KEPT); return; }
      const ok = practiceEngine.start({ chart, options: { ...readPlayOptions(getStorage().kv), chartId: chart.id, speed: 1, metronome: true, subdivision: 1, countInBars: 1, wait: false },
        section: null, demo: true, repeats: 1 });
      setNotice(ok ? '' : practiceEngine.notReady);
    }, () => setNotice(NO_TAKE_KEPT));
  };

  return (
    <ScrollView style={styles.fill} contentContainerStyle={styles.cols}>
      <View style={styles.col}>
        <Card style={styles.card} testID="progress-you-vs-you">
          <CardTitle>You vs you</CardTitle>
          {h.pair ? <>
            <Body weight="700">{h.pair.line}</Body>
            <Table head={['', 'On time', 'Spread', 'Tempo', '']} rows={h.pair.rows.map(r => [r.label, r.accuracy, r.spread, r.tempo,
              <Button key="hear" label={hearing === `take-${r.runId}` ? 'Stop' : 'Hear it'} emoji={hearing === `take-${r.runId}` ? '■' : '🎧'} size="small"
                onPress={() => hear(r.runId, r.title)} accessibilityLabel={`Hear ${r.title}`} />])} />
            <Body size={13} color={color.muted}>Listen to both: steadier spacing is the thing to hear. Lower spread = steadier.</Body>
          </> : <Body color={color.muted}>Keep playing: once a take is a month old, you can hear "you a month ago" against "you now" here.</Body>}
          {notice ? <Notice text={notice} onClose={() => setNotice('')} /> : null}
        </Card>
        {h.months.length ? (
          <Card style={styles.card} testID="progress-months">
            <CardTitle>Month by month</CardTitle>
            <Table head={['Month', 'Minutes', 'Takes', 'On time', 'Spread', 'Best BPM at 90%+']}
              rows={h.months.map(m => [m.month, String(m.minutes), String(m.takes), m.onTime, m.spread, m.bestBpm])} />
          </Card>
        ) : null}
      </View>
      <Card style={[styles.col, styles.card]} testID="progress-coach-report">
        <CardTitle>The coach's monthly report</CardTitle>
        {report ? <>
          <Body size={17}><Strong>{report.headline}</Strong></Body>
          {report.better.length ? <><Body size={13} color={color.muted}>Got better:</Body>{report.better.map(b => <Body key={b}>{`• ${b}`}</Body>)}</> : null}
          {report.next.length ? <><Body size={13} color={color.muted}>Next month:</Body>{report.next.map(b => <Body key={b}>{`• ${b}`}</Body>)}</> : null}
          <Body>{report.note}</Body>
          <Button label={busy ? 'The coach is thinking…' : 'Ask again'} tone="plain" disabled={busy} onPress={() => ask(true)} testID="progress-report-again" />
        </> : (
          <Button label={busy ? 'The coach is thinking…' : "Write this month's report"} emoji="📝" tone="pop" disabled={busy} onPress={() => ask()} testID="progress-report-ask" />
        )}
        {busy ? <Body size={13} color={color.muted}>This can take a minute. Everything else keeps working.</Body> : null}
        {err ? <Notice text={err} onClose={() => setErr('')} testID="progress-report-error" /> : null}
      </Card>
    </ScrollView>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | ReactNode)[][] }) {
  return (
    <View style={styles.table} accessibilityRole="list">
      <View style={styles.tr}>{head.map((x, i) => <Body key={i} size={12.5} weight="800" color={color.muted} style={styles.td}>{x}</Body>)}</View>
      {rows.map((r, k) => (
        <View key={k} style={[styles.tr, styles.trSep]}>
          {r.map((x, i) => typeof x === 'string' ? <Body key={i} size={14} weight={i === 0 ? '800' : '600'} style={[styles.td, tabular]}>{x}</Body> : <View key={i} style={styles.td}>{x}</View>)}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cols: { flexDirection: 'row', gap: 18, alignItems: 'flex-start', paddingBottom: 12 },
  col: { flex: 1, minWidth: 0, gap: 18 },
  card: { gap: 10 },
  table: { borderTopWidth: stroke.thin, borderTopColor: color.ink },
  tr: { flexDirection: 'row', alignItems: 'center', minHeight: 40, gap: 8 },
  trSep: { borderTopWidth: 1, borderTopColor: color.separator },
  td: { flex: 1, minWidth: 0 },
});
