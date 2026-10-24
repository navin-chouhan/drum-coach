import { useEffect, useRef, useState } from 'react';
import { askCoach, Thinking, useCoachEntry } from '../coach/api';
import type { ChatReply } from '../coach/schemas';
import { beatsPerBar, DRUM_PAD, type ChartNote } from '../engine/chart';
import { beatAt, songSecAt } from '../engine/tempo';
import { quantizeTake, replaceRange, toggleNote } from '../engine/transcribe';
import { consensus, onsetsToNotes, type Band } from '../engine/onsets';
import type { PadId } from '../engine/kit';
import { onHit } from '../input/hits';
import { getSettings } from '../input/settings';
import { playDrum } from '../play/audio';
import { patchSong } from './api';
import { GridEditor } from './GridEditor';
import { SheetMusic } from '../notation';
import type { ModeProps } from './SongView';

/** Loop a few bars, play what you hear, keep the best take, fix it by clicking, hear it back over the song. */
export function LearnMode({ song, videoId, yt, rate, tab }: ModeProps) {
  const grid = song.grids[videoId];
  const bpb = beatsPerBar(song);
  const [range, setRange] = useState({ from: 1, to: 2 });
  const [steps, setSteps] = useState(4);
  const fromBeat = (range.from - 1) * bpb, toBeat = range.to * bpb;
  const inRange = (n: ChartNote) => n.t >= fromBeat && n.t < toBeat;
  const [draft, setDraft] = useState<ChartNote[]>(() => song.notes.filter(inRange));
  const [take, setTake] = useState<ChartNote[]>([]);
  const [looping, setLooping] = useState(false);
  const [hear, setHear] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [suggest, setSuggest] = useState(true);
  const [passes, setPasses] = useState<ChartNote[][]>([]); // suggestions per loop pass (last 4)
  const heard = useRef<{ beat: number; band: Band }[]>([]);
  const suggestions = consensus(passes);
  const [msg, setMsg] = useState('');
  const pass = useRef<{ beat: number; pad: PadId; velocity: number }[]>([]);
  const live = useRef({ draft, hear, suggest: false });
  useEffect(() => { live.current = { draft, hear, suggest: suggest && !!tab }; });

  const setBars = (from: number, to: number) => {
    const f = Math.max(1, from), t = Math.max(f, to);
    setRange({ from: f, to: t });
    setDraft(song.notes.filter(n => n.t >= (f - 1) * bpb && n.t < t * bpb));
    setTake([]); setPasses([]);
  };

  // Record hits during the loop.
  useEffect(() => {
    if (!looping) return;
    return onHit(h => {
      if (h.pad && yt.playing) pass.current.push({ beat: beatAt(yt.songTime(h.time - getSettings().latencyMs), grid), pad: h.pad, velocity: h.velocity });
    });
  }, [looping, yt, grid]);

  // Listen to the song for drum hits while looping (needs the song audio connected).
  useEffect(() => {
    if (!looping || !suggest || !tab) return;
    heard.current = [];
    return tab.analyse(o => { heard.current.push({ beat: beatAt(yt.songTime(o.perf), grid), band: o.band }); });
  }, [looping, suggest, tab, yt, grid]);

  // Loop A–B with a one-bar pre-roll; each pass becomes a take. Optionally play your part with the synth.
  useEffect(() => {
    if (!looping) return;
    const preroll = songSecAt(fromBeat - bpb, grid), end = songSecAt(toBeat, grid);
    yt.seek(Math.max(0, preroll)); yt.play();
    let raf = 0, prev = yt.songTime();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = yt.songTime();
      if (t < prev) prev = t;
      if (live.current.hear && yt.playing) {
        for (const n of live.current.draft) {
          const at = songSecAt(n.t, grid);
          if (at > prev && at <= t) playDrum(DRUM_PAD[n.drum][0], n.accent ? 120 : n.ghost ? 40 : 90);
        }
      }
      prev = t;
      if (t >= end + 0.05) {
        const q = quantizeTake(pass.current, fromBeat, toBeat, steps);
        if (q.length) setTake(q);
        pass.current = [];
        if (live.current.suggest) { const found = onsetsToNotes(heard.current, fromBeat, toBeat, steps); setPasses(p => [...p, found].slice(-4)); }
        heard.current = [];
        yt.seek(Math.max(0, preroll)); prev = preroll;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); yt.pause(); };
  }, [looping, yt, grid, fromBeat, toBeat, bpb, steps]);

  async function save() {
    await patchSong(song.id, { notes: replaceRange(song.notes, draft, fromBeat, toBeat) });
    setMsg(`Saved bars ${range.from}–${range.to}. Move on to the next bars, or try Play (scored).`);
  }

  // Coach's guess of the groove (from knowledge, not from hearing), tiled over the bars.
  const grooveKey = `groove:${song.id}:${Math.round(grid.bpm)}:${song.timeSignature.join('/')}`;
  const groove = useCoachEntry<ChatReply>(grooveKey);
  const loadGroove = () => {
    const c = groove?.data?.chart;
    if (!c) return;
    const len = c.bars * beatsPerBar(c), tiled: ChartNote[] = [];
    for (let off = fromBeat; off < toBeat; off += len) for (const n of c.notes) if (n.t + off < toBeat) tiled.push({ ...n, t: n.t + off });
    setDraft(tiled.sort((a, b) => a.t - b.t));
  };

  return (
    <div className="card form">
      <h3>Learn by ear</h3>
      <p className="small">Loop a few bars (slow them down with Speed), listen, and play what you hear. Each pass shows up as rings;
        "Use take" copies it into your part, then click cells to fix notes. Turn on "Hear my part" to compare with the recording.</p>
      <div className="row2">
        <label>Bars from <input type="number" min={1} value={range.from} onChange={e => setBars(+e.target.value || 1, Math.max(range.to, +e.target.value || 1))} /></label>
        <label>to <input type="number" min={range.from} value={range.to} onChange={e => setBars(range.from, +e.target.value || range.from)} /></label>
        <label>Grid <select value={steps} onChange={e => { setSteps(+e.target.value); setPasses([]); }}><option value={4}>16ths</option><option value={3}>triplets</option><option value={2}>8ths</option></select></label>
      </div>
      <div className="actions">
        <button className="primary" onClick={() => setLooping(l => !l)}>{looping ? 'Stop loop' : `Loop bars ${range.from}–${range.to}`}</button>
        <label className="check"><input type="checkbox" checked={hear} onChange={e => setHear(e.target.checked)} /> Hear my part</label>
        <label className="check"><input type="checkbox" checked={sheet} onChange={e => setSheet(e.target.checked)} /> Show as sheet music</label>
        <label className="check" title={tab ? '' : 'Connect the song audio first (left)'}><input type="checkbox" checked={suggest && !!tab} disabled={!tab} onChange={e => setSuggest(e.target.checked)} /> Suggest notes from the song</label>
        <span className="small">{Math.round(grid.bpm * rate)} BPM</span>
      </div>
      <GridEditor notes={draft} take={take} suggestions={suggestions} fromBeat={fromBeat} toBeat={toBeat} stepsPerBeat={steps} beatsPerBar={bpb} yt={yt} grid={grid}
        onToggle={(t, d) => setDraft(n => toggleNote(n, t, d))} />
      {sheet && <SheetMusic notes={draft} timeSignature={song.timeSignature} fromBar={range.from} toBar={range.to} />}
      <div className="actions">
        <button onClick={() => setDraft(take)} disabled={!take.length}>Use take ({take.length} notes)</button>
        <button onClick={() => setDraft(d => [...d, ...suggestions.filter(s => !d.some(n => n.t === s.t && n.drum === s.drum)).map(({ t, drum }) => ({ t, drum }))].sort((a, b) => a.t - b.t))}
          disabled={!suggestions.length}>Use suggestions ({suggestions.length})</button>
        <button onClick={() => setDraft([])}>Clear</button>
        <button className="primary" onClick={save}>Save bars {range.from}–{range.to}</button>
        <button onClick={() => askCoach(grooveKey, 'groove', { title: song.title, bpm: Math.round(grid.bpm), timeSignature: song.timeSignature })} disabled={groove?.status === 'thinking'}>
          Ask coach for the groove</button>
      </div>
      {tab && suggest && <p className="small">Suggestions (dashed squares): {passes.length ? `${suggestions.length} notes heard in ${passes.length > 1 ? 'at least 2 of the last ' + passes.length + ' passes' : 'the first pass'}` : 'listening… finish one loop'}.
        Only kick, snare and hi-hat are detected, and busy mixes confuse it: check every note by ear.</p>}
      {!tab && <p className="small">Tip: connect the song audio (left) to get suggested notes.</p>}
      {msg && <p className="small">{msg}</p>}
      {groove?.status === 'thinking' && <Thinking />}
      {groove?.status === 'error' && <p className="warn">{groove.error}</p>}
      {groove?.status === 'done' && groove.data && (
        <div className="drill">
          <p>{groove.data.reply}</p>
          {groove.data.chart && <button onClick={loadGroove}>Load the coach's guess into bars {range.from}–{range.to}</button>}
          <p className="small">The coach can't hear the recording: treat this as a starting point and check it by ear.</p>
        </div>
      )}
    </div>
  );
}
