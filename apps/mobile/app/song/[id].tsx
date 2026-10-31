// One song, full screen (A8): /song/<yt_song id>, optionally ?from=&to= (bars, e.g. a bite lesson or a concert).
import { useLocalSearchParams } from 'expo-router';
import { SongScreen } from '../../src/features/songs/SongScreen';
import { barsParam } from '../../src/features/songs/songsModel';

export default function SongRoute() {
  const p = useLocalSearchParams<{ id: string; from?: string; to?: string }>();
  return <SongScreen id={String(p.id ?? '')} bars={barsParam(p.from, p.to)} />;
}
