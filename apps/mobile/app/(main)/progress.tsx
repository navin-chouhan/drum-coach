// Progress: a placeholder in the kit's look until its screen is built (another agent replaces this file).
import { ComingNext, Screen, TitleBar } from '../../src/ui';

export default function ProgressScreen() {
  return (
    <Screen testID="screen-progress">
      <TitleBar title="Progress" />
      <ComingNext title="Progress" emoji="📈" what="Getting better, this week, the skill map, trophies, your time and your lessons in plain words." />
    </Screen>
  );
}
