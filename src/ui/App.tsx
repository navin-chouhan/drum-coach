import { useEffect, useState } from 'react';
import { startKeyboard } from '../input/keyboard';
import { useMidi } from '../input/useMidi';
import { Calibrate } from './Calibrate';
import { KitView } from './KitView';
import { LastHit } from './LastHit';
import { Timeline } from './Timeline';

export function App() {
  const midi = useMidi();
  const [tab, setTab] = useState<'kit' | 'calibrate'>('kit');
  useEffect(startKeyboard, []);

  const status =
    midi.status === 'unsupported' ? { text: 'MIDI not supported — open in Google Chrome', cls: 'bad' }
    : midi.status === 'blocked' ? { text: 'MIDI blocked — allow it via the icon left of the address bar, then click here', cls: 'bad' }
    : midi.status === 'starting' ? { text: 'Starting…', cls: '' }
    : midi.device ? { text: `${midi.device} connected`, cls: 'ok' }
    : { text: 'No MIDI device — plug in the kit (keyboard works)', cls: 'bad' };

  return (
    <div className="app">
      <header>
        <div className="brand"><span className="logo" />Drum Coach</div>
        <button className={`chip ${status.cls}`} onClick={midi.status === 'blocked' ? midi.retry : undefined}
          aria-live="polite"><span className="dot" />{status.text}</button>
        {midi.inputs.length > 1 && (
          <select value={midi.device} onChange={e => midi.select(e.target.value)} aria-label="MIDI input">
            {midi.inputs.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
          </select>
        )}
        <div className="spacer" />
        <nav className="tabs">
          <button className={tab === 'kit' ? 'on' : ''} onClick={() => setTab('kit')}>Kit</button>
          <button className={tab === 'calibrate' ? 'on' : ''} onClick={() => setTab('calibrate')}>Calibrate</button>
        </nav>
      </header>
      {tab === 'kit' ? (
        <>
          <main>
            <KitView />
            <aside>
              <LastHit onCalibrate={() => setTab('calibrate')} />
              <div className="card small">
                No kit? Keys: <kbd>Space</kbd> kick · <kbd>S</kbd> snare · <kbd>A</kbd>/<kbd>Q</kbd> hi-hat closed/open ·
                {' '}<kbd>Z</kbd> pedal · <kbd>E</kbd> <kbd>R</kbd> <kbd>F</kbd> toms · <kbd>W</kbd> crash · <kbd>T</kbd> ride ·
                {' '}<kbd>Shift</kbd> = accent. Or click a pad.
              </div>
            </aside>
          </main>
          <Timeline />
        </>
      ) : (
        <Calibrate device={midi.device ?? 'keyboard'} />
      )}
    </div>
  );
}
