import { useEffect, useRef } from 'react';
import { beatsPerBar, type Chart } from '../engine/chart';
import { beatAt, songSecAt, type BeatGrid } from '../engine/tempo';
import type { PlayOptions } from '../play/player';
import { useYtSongs } from '../youtube/api';
import { YtPlayer } from '../youtube/yt';

// Real music in lessons (N3): a song bite plays over the song's drumless YouTube upload, timed on the YouTube clock
// like Songs → Play. Nothing is downloaded or recorded: it's the official embedded player.
export type RealSong = { yt: YtPlayer; grid: BeatGrid; bpb: number };

/** The drumless video for a bite (small, under the bite card); reports the player once it's ready. */
export function RealSongBox({ songId, onPlayer }: { songId: string; onPlayer: (r: RealSong | null) => void }) {
  const [songs] = useYtSongs();
  const song = songs.find(s => s.id === songId), vid = song?.drumlessId ?? undefined, grid = vid ? song?.grids[vid] : undefined;
  const host = useRef<HTMLDivElement>(null);
  const bpm = grid?.bpm, offset = grid?.offsetSec, bpb = song ? beatsPerBar(song) : 4;
  useEffect(() => {
    if (!vid || bpm === undefined || offset === undefined) return;
    const el = document.createElement('div');
    host.current!.replaceChildren(el);
    const p = new YtPlayer(el, vid);
    let live = true;
    void p.ready.then(() => { if (live) onPlayer({ yt: p, grid: { bpm, offsetSec: offset }, bpb }); });
    return () => { live = false; onPlayer(null); p.destroy(); };
  }, [vid, bpm, offset, bpb, onPlayer]);
  if (!song) return null;
  if (!vid) return <p className="small">Add a drumless upload of this song in Songs, and these bars play with the real band.</p>;
  if (!grid) return <p className="small">Set the beat grid of the drumless upload in Songs (Tempo), and these bars play with the real band.</p>;
  return <div className="realSong" ref={host} />;
}

/** Take options for a bite on the real song: one pass of the bars, at the nearest speed YouTube offers. */
export function realTake(r: RealSong, fromBar: number, chart: Chart, bpm: number): Partial<PlayOptions> {
  const rate = r.yt.setRate(bpm / r.grid.bpm);
  return {
    fromBar: 1, toBar: chart.bars, repeats: 1, speed: (r.grid.bpm * rate) / chart.bpm, metronome: false, band: undefined,
    external: {
      position: now => beatAt(r.yt.songTime(now), r.grid) - (fromBar - 1) * r.bpb,
      begin: () => { r.yt.seek(songSecAt((fromBar - 2) * r.bpb, r.grid)); r.yt.play(); }, // a bar of the song as the count-in
      end: () => r.yt.pause(),
    },
  };
}
