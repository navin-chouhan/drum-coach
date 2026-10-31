// Your path: every stage with its challenges and lessons (the web's "Full path"). Tapping a lesson opens it. Under it,
// the web's actions: rebuild today's mix, find my level, goals (change: Setup → Coach and voice), reset all progress.
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Lesson, LessonProgress, Profile } from '@drum-coach/core/engine/lesson';
import { getStorage } from '../../platform/storage';
import { Body, Button, Card, CardTitle, Display, MAX_FONT_SCALE, color, slopFor, stroke, useAppSettings, writeSettings } from '../../ui';
import { lessonHref } from '../lesson/route';
import {
  FIND_LEVEL_LABEL, PATH_NOTE, REBUILD_CONFIRM, REBUILD_LABEL, RESET_CONFIRM, RESET_LABEL, goalsLabel, pathModel, rebuildNeedsConfirm, rebuildTodayPatch,
  resetAllLessonsPatch, type PathChip,
} from './path';

export function PathView({ lessons, progress, profile }: { lessons: Lesson[]; progress: Record<string, LessonProgress>; profile: Profile }) {
  const stages = useMemo(() => pathModel(lessons, progress, profile), [lessons, progress, profile]);
  return (
    <Card style={styles.card} testID="progress-path">
      <CardTitle>Your path</CardTitle>
      <ScrollView style={styles.fill}>
        {stages.map(s => (
          <View key={s.level} style={[styles.stage, s.state === 'current' && styles.current]}>
            <View style={styles.head}>
              <Display size={17} color={s.state === 'later' ? color.muted : color.ink}>{`${s.state === 'passed' ? '✓ ' : ''}${s.n}. ${s.title}`}</Display>
              {s.canDo.map(c => <Body key={c} size={13}>{`• ${c}`}</Body>)}
              {s.track ? <Body size={12.5} color={color.muted}>{`Your style track: ${s.track}`}</Body> : null}
            </View>
            <View style={styles.chips}>
              <Body size={12.5} color={color.muted}>Challenges:</Body>
              {s.chips.filter(c => c.checkpoint).map(c => <LessonChip key={c.id} c={c} />)}
              {s.chips.some(c => !c.checkpoint) ? <Body size={12.5} color={color.muted}>Lessons:</Body> : null}
              {s.chips.filter(c => !c.checkpoint).map(c => <LessonChip key={c.id} c={c} />)}
            </View>
          </View>
        ))}
        <Body size={13} color={color.muted} style={styles.note}>{PATH_NOTE}</Body>
        <PathActions />
      </ScrollView>
    </Card>
  );
}

function PathActions() {
  const s = useAppSettings();
  const save = (p: Parameters<typeof writeSettings>[1]) => writeSettings(getStorage().kv, p);
  const rebuild = () => {
    if (!rebuildNeedsConfirm(s)) { save(rebuildTodayPatch()); return; }
    Alert.alert(REBUILD_LABEL, REBUILD_CONFIRM, [{ text: 'Cancel', style: 'cancel' }, { text: 'Rebuild', onPress: () => save(rebuildTodayPatch()) }]);
  };
  const reset = () => Alert.alert(RESET_LABEL, RESET_CONFIRM, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: () => save(resetAllLessonsPatch(s.profile)) },
  ]);
  return (
    <View style={styles.actions}>
      <Button size="small" tone="plain" label={REBUILD_LABEL} onPress={rebuild} testID="path-rebuild" />
      <Button size="small" tone="plain" label={FIND_LEVEL_LABEL} onPress={() => router.push('/lesson/placement')} testID="path-find-level" />
      <Button size="small" tone="plain" label={goalsLabel(s.profile)} onPress={() => router.push('/setup?tool=connection')} testID="path-goals" />
      <Button size="small" tone="red" label={RESET_LABEL} onPress={reset} testID="path-reset" />
    </View>
  );
}

function LessonChip({ c }: { c: PathChip }) {
  return (
    <Pressable onPress={() => router.push(lessonHref(c.id))} hitSlop={slopFor(34)} accessibilityRole="button" accessibilityLabel={`${c.title}: ${c.detail}`}
      style={[styles.chip, c.state === 'done' && styles.done, c.state === 'started' && styles.started, c.checkpoint && styles.checkpoint, c.ai && styles.ai]}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.chipText}>
        {c.title}{c.stars ? <Text style={styles.stars}>{` ${'★'.repeat(c.stars)}${'☆'.repeat(3 - c.stars)}`}</Text> : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 8 },
  fill: { flex: 1 },
  stage: { flexDirection: 'row', gap: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: color.separator },
  current: { backgroundColor: color.cream, marginHorizontal: -8, paddingHorizontal: 8 },
  head: { width: 300, gap: 2 },
  chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 999, borderWidth: stroke.thin, borderColor: color.ink, backgroundColor: color.panel },
  done: { backgroundColor: color.goodSoft },
  started: { backgroundColor: color.pop },
  checkpoint: { borderWidth: stroke.card },
  ai: { borderStyle: 'dashed' },
  chipText: { fontSize: 13.5, fontWeight: '700', color: color.ink },
  stars: { color: color.star },
  note: { marginTop: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12, marginBottom: 6 },
});
