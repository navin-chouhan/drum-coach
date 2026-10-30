// Journey: the home screen (A7a). The screen itself lives in src/features/journey.
import { ComingNext, Screen, TitleBar } from '../../src/ui';

export default function JourneyRoute() {
  return (
    <Screen testID="screen-journey">
      <TitleBar title="Journey" />
      <ComingNext title="Journey" emoji="🗺️" what="Your next lesson, today's set, your rank and the stage trail." />
    </Screen>
  );
}
