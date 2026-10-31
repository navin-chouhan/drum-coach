// Songs (the sidebar section until the shell moves it under Practice, D10): the Songs shelf on its own screen.
import { ScrollView, StyleSheet } from 'react-native';
import { Screen, TitleBar } from '../../ui';
import { SongsShelf } from './SongsShelf';

export function SongsScreen() {
  return (
    <Screen testID="screen-songs">
      <TitleBar title="Songs" coach="Learn a real song a few bars at a time, then play it with the band." />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SongsShelf />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 16, paddingBottom: 40, paddingRight: 6 },
});
