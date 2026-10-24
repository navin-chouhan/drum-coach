import { useEffect, useState, useSyncExternalStore } from 'react';
import { chartKey, loadTips } from '../coach/aiTips';
import { askCoach, useCoachEntry } from '../coach/api';
import { say } from '../voice/voice';
import type { Chart } from '../engine/chart';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { SheetMusic, SheetPlayer } from '../notation';
import { Highway } from './Highway';
import { player, playerVersion, subscribePlayer } from './player';

/**
 * The play area: animated sheet music (default) or the falling-note highway, with a switch.
 * Before a take starts, the sheet view shows `idle` (the music you're about to play).
 */
export function NotesView({ idle }: { idle?: { chart: Chart & { id?: string }; fromBar?: number; toBar?: number; bpm?: number; goal?: string } }) {
  const settings = useSyncExternalStore(subscribeSettings, getSettings), view = settings.playView;
  const idleChart = idle?.chart, goal = idle?.goal;
  useEffect(() => { if (idleChart) loadTips(idleChart, goal); }, [idleChart, goal]); // ready before the first take
  useSyncExternalStore(subscribePlayer, playerVersion);
  const playing = player.phase === 'playing';
  return (
    <div className="notesView">
      <div className="viewSwitch" role="group" aria-label="How to show the notes">
        {(['sheet', 'highway'] as const).map(v => (
          <button key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} onClick={() => setSettings({ playView: v })}>{v === 'sheet' ? 'Sheet' : 'Highway'}</button>
        ))}
      </div>
      {view === 'highway' ? <Highway />
        : playing ? <SheetPlayer />
        : idle ? <div className="sheetIdle">{settings.aiBriefing && <Briefing chart={idle.chart} goal={idle.goal} />}<SheetMusic notes={idle.chart.notes} timeSignature={idle.chart.timeSignature} fromBar={idle.fromBar} toBar={idle.toBar} title={idle.chart.title} bpm={idle.bpm ?? idle.chart.bpm} /></div>
        : <SheetPlayer />}
    </div>
  );
}

const spokenBriefs = new Set<string>();
let opens = 0; // a new briefing each time an exercise is opened (the server re-uses it while nothing new was played)

/** The coach's briefing before a take, based on your recent takes on this exercise. */
function Briefing({ chart, goal }: { chart: Chart & { id?: string }; goal?: string }) {
  const id = chartKey(chart);
  const [key] = useState(() => `brief:${id}:${++opens}`);
  const e = useCoachEntry<{ text: string; spoken: string }>(key);
  useEffect(() => {
    askCoach<{ text: string; spoken: string }>(key, 'briefing', { chartId: id, title: chart.title, goal }, d => {
      if (!spokenBriefs.has(key) && getSettings().voice) { spokenBriefs.add(key); void say(d.spoken); }
    });
  }, [key, id, chart.title, goal]);
  if (!e || e.status === 'error') return null;
  return (
    <div className="briefing" role="status">
      <span className="briefingWho">Coach</span>
      {e.status === 'thinking' ? <span className="small">thinking about your last takes…</span> : <span>{e.data?.text}</span>}
    </div>
  );
}
