// The whole skill map (the web's SkillMapView): every skill with its bar, lessons done, the last 6 months, and Refresh
// for a skill you haven't touched for a while (opens its lesson played longest ago).
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { Lesson, LessonProgress } from '@drum-coach/core/engine/lesson';
import { Body, Button, Card, CardTitle, Dots, Track, color } from '../../ui';
import { lessonHref } from '../lesson/route';
import { dayKey } from './dates';
import { SKILL_MAP_INTRO, skillMapModel } from './skillMap';

export function SkillMapView({ lessons, progress }: { lessons: Lesson[]; progress: Record<string, LessonProgress> }) {
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => skillMapModel(lessons, progress, dayKey(new Date(now)), now), [lessons, progress, now]);
  return (
    <Card style={styles.card} testID="progress-skill-map-page">
      <CardTitle>🗺 Your skill map</CardTitle>
      <Body>{SKILL_MAP_INTRO}</Body>
      <ScrollView style={styles.fill}>
        {rows.map(k => (
          <View key={k.id} style={styles.row} accessible={!k.refresh} accessibilityLabel={`${k.name}: ${k.pct}%, ${k.count}`}>
            <View style={styles.name}><Body weight="800" numberOfLines={1}>{k.name}</Body><Body size={12.5} color={color.muted} numberOfLines={1}>{k.what}</Body></View>
            <Track done={k.fill} style={styles.track} />
            <Body size={13} weight="700" style={styles.count}>{k.count}</Body>
            <Dots values={k.growth} label={`${k.name}, the last 6 months, percent`} />
            <View style={styles.action}>{k.refresh ? <Button label="Refresh" emoji="🔁" size="small" onPress={() => router.push(lessonHref(k.refresh!))} accessibilityLabel={`Refresh ${k.name}`} /> : null}</View>
          </View>
        ))}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 10 },
  fill: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, borderTopWidth: 1, borderTopColor: color.separator },
  name: { width: 260 },
  track: { flex: 1 },
  count: { width: 120 },
  action: { width: 110, alignItems: 'flex-end' },
});
