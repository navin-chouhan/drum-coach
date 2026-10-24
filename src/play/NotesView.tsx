import { useEffect, useSyncExternalStore } from 'react';
import { loadTips } from '../coach/aiTips';
import { coachOpen } from '../coach/session';
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
  const idleBpm = idle?.bpm ?? idle?.chart.bpm ?? 0;
  // Tips ready before the first take; the coach knows what's next. Waits until you stay on an exercise:
  // browsing the list shouldn't cost two Claude calls per item.
  useEffect(() => {
    if (!idleChart) return;
    const t = setTimeout(() => { loadTips(idleChart, goal); coachOpen(idleChart, idleBpm); }, 1500);
    return () => clearTimeout(t);
  }, [idleChart, goal, idleBpm]);
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
        : idle ? <div className="sheetIdle"><SheetMusic notes={idle.chart.notes} timeSignature={idle.chart.timeSignature} fromBar={idle.fromBar} toBar={idle.toBar} title={idle.chart.title} bpm={idle.bpm ?? idle.chart.bpm} /></div>
        : <SheetPlayer />}
    </div>
  );
}

