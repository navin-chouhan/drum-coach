import { useEffect, useState, useSyncExternalStore } from 'react';
import { beatsPerBar, type Chart } from '../engine/chart';
import { beatAt, songSecAt } from '../engine/tempo';
import { NotesView } from '../play/NotesView';
import { player, playerVersion, start, stop, subscribePlayer } from '../play/player';
import { Results, saveRun } from '../play/Results';
import { coachTake, onCoachAction } from '../coach/session';
import { flourish } from '../lesson/Celebration';
import type { ModeProps } from './SongView';

/** Your transcription on the note highway, synced to the video (drumless version recommended), scored like any exercise. */
export function PlayMode({ song, videoId, yt, rate }: ModeProps) {
  useSyncExternalStore(subscribePlayer, playerVersion);
  const grid = song.grids[videoId];
  const bpb = beatsPerBar(song);
  const notes = song.notes.filter(n => n.t >= 0);
  const lastBar = notes.length ? Math.floor(notes[notes.length - 1].t / bpb) + 1 : 1;
  const firstBar = notes.length ? Math.floor(notes[0].t / bpb) + 1 : 1;
  const [range, setRange] = useState({ from: firstBar, to: lastBar });
  const [stage, setStage] = useState(false); // Stage mode: for playing in front of friends
  const encore = stage && player.phase === 'done' ? player.finished : undefined;
  useEffect(() => { if (encore) { saveRun(encore); coachTake(encore); flourish(true); } }, [encore]); // the coach must hear this take, or it answers an older one
  useEffect(() => () => stop(), []);

  const chart: Chart & { id: string } = { id: song.id, title: song.title, kind: 'song', bpm: grid.bpm, timeSignature: song.timeSignature, bars: lastBar, notes };
  const go = () => start(chart, {
    fromBar: range.from, toBar: Math.max(range.from, range.to), repeats: 1, speed: rate,
    metronome: false, subdivision: 1, countInBars: 1, wait: false,
    external: {
      position: now => beatAt(yt.songTime(now), grid) - (range.from - 1) * bpb,
      begin: () => { yt.seek(Math.max(0, songSecAt((range.from - 2) * bpb, grid))); yt.play(); },
      end: () => yt.pause(),
    },
  });

  // the song can't change speed mid-way, so any step the coach suggests = play again
  useEffect(() => (notes.length ? onCoachAction(() => { go(); return true; }) : undefined));

  if (!notes.length) return <div className="card"><h3>Play (scored)</h3><p className="small">Transcribe some bars in "Learn by ear" first, then play them here with the song.</p></div>;
  if (encore) return (
    <div className="card encore stageOn">
      <div className="bigBurst">ENCORE!</div>
      <h2>{song.title}</h2>
      <p className="small">{encore.stats.accuracy}% on time</p>
      <div className="actions"><button className="primary big" autoFocus onClick={go}>Play it again</button><button onClick={stop}>Back</button></div>
    </div>
  );
  if (player.phase === 'done' && player.finished) return <Results f={player.finished} onAgain={go} onBack={stop} />;
  const playing = player.phase === 'playing';
  return (
    <div className={stage ? 'card form stageOn' : 'card form'}>
      <h3>Play (scored)</h3>
      {!playing && (
        <>
          <p className="small">Plays your transcription as a note highway with this video{videoId === song.drumlessId ? ' (drumless)' : ''}. Switch to the drumless version for the real thing.</p>
          <div className="row2">
            <label>Bars from <input type="number" min={1} max={lastBar} value={range.from} onChange={e => setRange({ ...range, from: +e.target.value || 1 })} /></label>
            <label>to <input type="number" min={range.from} max={lastBar} value={range.to} onChange={e => setRange({ ...range, to: +e.target.value || lastBar })} /></label>
          </div>
          <label className="check"><input type="checkbox" checked={stage} onChange={e => setStage(e.target.checked)} /> Stage mode: big video and an encore instead of the score sheet (for playing in front of friends)</label>
        </>
      )}
      <button className="primary big" onClick={playing ? stop : go}>{playing ? 'Stop (Esc)' : 'Start'}</button>
      {playing && <div className="highwayWrap ytHighway"><NotesView /></div>}
    </div>
  );
}
