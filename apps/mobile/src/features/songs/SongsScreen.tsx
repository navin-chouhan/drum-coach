// Practice › Songs (D10): the Songs shelf on its own route (/songs, under Practice: the sidebar lights Practice).
import { ScrollView, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen, TitleBar } from '../../ui';
import { SongsShelf } from './SongsShelf';

export function SongsScreen() {
  return (
    <Screen testID="screen-songs">
      <TitleBar title="Songs" coach="Learn a real song a few bars at a time, then play it with the band."
        right={<Button label="Practice" emoji="‹" size="small" onPress={() => router.navigate('/practice' as never)} testID="songs-to-practice" />} />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <SongsShelf />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingTop: 16, paddingBottom: 40, paddingRight: 6 },
});
