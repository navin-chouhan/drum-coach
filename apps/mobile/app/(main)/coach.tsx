// Coach: a placeholder in the kit's look until its screen is built (another agent replaces this file).
import { ComingNext, Screen, TitleBar } from '../../src/ui';

export default function CoachScreen() {
  return (
    <Screen testID="screen-coach">
      <TitleBar title="Coach" />
      <ComingNext title="Coach" emoji="💬" what="Your coach's feedback, drills and the next step, from your home server (or your API key)." />
    </Screen>
  );
}
