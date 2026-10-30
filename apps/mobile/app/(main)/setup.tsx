// Setup: a placeholder in the kit's look until its screen is built (another agent replaces this file).
import { ComingNext, Screen, TitleBar } from '../../src/ui';

export default function SetupScreen() {
  return (
    <Screen testID="screen-setup">
      <TitleBar title="Setup" />
      <ComingNext title="Setup" emoji="⚙️" what="Your kit, hit each pad, latency, sound, the coach server and what happens while you play." />
    </Screen>
  );
}
