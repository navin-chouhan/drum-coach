// Layout harness parts (scripts/screenshots.mjs, web): states a URL can't reach, drawn with the real components on
// fake data. /dev/parts?part=celebration (the lesson's celebration, a rank up), ?part=lesson-complete (the plain one, a
// star left to earn) or ?part=details (Practice's Details and history on a fake take). On the iPad it's a dev screen like the others.
import { MILESTONES, LESSON_BY_ID } from '@drum-coach/core/content/curriculum';
import type { Finished } from '@drum-coach/core/play/take';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { fakeFinishedTake } from '../../src/dev/harness/fakeTake';
import { CelebrationModal } from '../../src/features/lesson/parts';
import { ResultsDetails } from '../../src/features/results/ResultsDetails';
import { Body, Screen } from '../../src/ui';

const noop = () => {};

export default function HarnessParts() {
  const { part } = useLocalSearchParams<{ part?: string }>();
  const [take, setTake] = useState<Finished>();
  useEffect(() => { if (part === 'details') void fakeFinishedTake(LESSON_BY_ID['money-8ths'].steps[2].chart).then(setTake); }, [part]);
  return (
    <Screen withSidebar={false} testID="screen-dev-parts">
      <Stack.Screen options={{ headerShown: false }} />
      {part === 'celebration' || part === 'lesson-complete' ? (
        <CelebrationModal onNext={noop} onAgain={noop} onClose={noop} c={part === 'celebration' ? {
          title: 'RANK UP!', lessonTitle: 'The money beat', stars: 2, rankUp: true, milestone: MILESTONES[2], next: MILESTONES[3],
          done: 4, total: 4, nextLabel: "Next in today's session →", canGoForMore: true,
        } : {
          title: 'LESSON COMPLETE!', lessonTitle: 'The money beat', stars: 2, rankUp: false, milestone: MILESTONES[2], next: MILESTONES[3],
          done: 1, total: 2, nextLabel: 'Back to Journey', canGoForMore: true,
        }} />
      ) : part === 'details' ? (
        take ? <ScrollView style={styles.fill} contentContainerStyle={styles.details}>
          <ResultsDetails f={take} onAgain={noop} onBack={noop} extras={{ chartId: 'lesson/money-8ths/2' }} testID="practice-details" />
        </ScrollView> : null
      ) : <Body>Parts: ?part=celebration, ?part=lesson-complete or ?part=details</Body>}
    </Screen>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 }, details: { padding: 24, gap: 16 } });
