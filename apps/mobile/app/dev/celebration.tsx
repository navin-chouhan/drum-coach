// Dev: the lesson's celebration sheet with fake values (the layout harness shoots it: a real one needs a passing take,
// which the silent web engine can't play). `?rank=1` shows the rank-up version.
import { MILESTONES } from '@drum-coach/core/content/curriculum';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CelebrationModal } from '../../src/features/lesson/parts';
import { DottedGround } from '../../src/ui';

export default function CelebrationPreview() {
  const { rank } = useLocalSearchParams<{ rank?: string }>();
  const stage = MILESTONES[2], next = MILESTONES[3];
  const up = rank === '1';
  return (
    <DottedGround>
      <Stack.Screen options={{ headerShown: false }} />
      <CelebrationModal
        c={{ title: up ? 'RANK UP!' : 'LESSON COMPLETE!', lessonTitle: 'The money beat', stars: up ? 3 : 2, rankUp: up, milestone: stage, next,
          done: up ? 2 : 1, total: 2, nextLabel: "Next in today's session →", canGoForMore: !up }}
        onNext={() => {}} onAgain={() => {}} onClose={() => {}} />
    </DottedGround>
  );
}
