// Songs: a placeholder in the kit's look until its screen is built (another agent replaces this file).
import { ComingNext, Screen, TitleBar } from '../../src/ui';

export default function SongsScreen() {
  return (
    <Screen testID="screen-songs">
      <TitleBar title="Songs" />
      <ComingNext title="Songs" emoji="🎵" what="Real songs from YouTube, played inline, a few bars at a time." />
    </Screen>
  );
}
