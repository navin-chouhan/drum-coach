// Practice: a placeholder in the kit's look until its screen is built (another agent replaces this file).
import { ComingNext, Screen, TitleBar } from '../../src/ui';

export default function PracticeScreen() {
  return (
    <Screen testID="screen-practice">
      <TitleBar title="Practice" />
      <ComingNext title="Practice" emoji="🎯" what="Pick up where you left off, the 5-minute warm-up, exercises picked for you and the whole library with your best clean tempo." />
    </Screen>
  );
}
