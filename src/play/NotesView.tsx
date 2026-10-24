import { useSyncExternalStore } from 'react';
import type { Chart } from '../engine/chart';
import { getSettings, setSettings, subscribeSettings } from '../input/settings';
import { SheetMusic, SheetPlayer } from '../notation';
import { Highway } from './Highway';
import { player, playerVersion, subscribePlayer } from './player';

/**
 * The play area: animated sheet music (default) or the falling-note highway, with a switch.
 * Before a take starts, the sheet view shows `idle` (the music you're about to play).
 */
export function NotesView({ idle }: { idle?: { chart: Chart; fromBar?: number; toBar?: number; bpm?: number } }) {
  const view = useSyncExternalStore(subscribeSettings, getSettings).playView;
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
