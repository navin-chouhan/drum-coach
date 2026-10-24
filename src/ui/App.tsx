import { useEffect, useState } from 'react';
import { CoachView } from '../coach/CoachView';
import { SongsPage } from '../youtube/SongsPage';
import { onHit } from '../input/hits';
import { startKeyboard } from '../input/keyboard';
import { getSettings } from '../input/settings';
import { useMidi } from '../input/useMidi';
import { playDrum } from '../play/audio';
import { PlayView } from '../play/PlayView';
import { stop } from '../play/player';
import { Calibrate } from './Calibrate';
import { KitView } from './KitView';
import { LastHit } from './LastHit';
import { onPlayRequest, type PlayRequest } from './nav';
import { ProgressView } from './ProgressView';
import { Timeline } from './Timeline';

const TABS = { kit: 'Kit', play: 'Play', songs: 'Songs', coach: 'Coach', progress: 'Progress', calibrate: 'Calibrate' } as const;
type Tab = keyof typeof TABS;

export function App() {
  const midi = useMidi();
  const [tab, setTabState] = useState<Tab>('kit');
  const [pending, setPending] = useState<PlayRequest>();
  const setTab = (t: Tab) => { if (t !== 'play') stop(); setTabState(t); };
  useEffect(startKeyboard, []);
  useEffect(() => onHit(h => { if (h.pad && getSettings().browserSounds) playDrum(h.pad, h.velocity); }), []);
  useEffect(() => onPlayRequest(r => { stop(); setPending(r); setTabState('play'); }), []);

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
          {(Object.keys(TABS) as Tab[]).map(t => (
            <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{TABS[t]}</button>
          ))}
        </nav>
      </header>
      {tab === 'kit' && (
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
      )}
      {tab === 'play' && <PlayView pending={pending} />}
      {tab === 'songs' && <SongsPage />}
      {tab === 'coach' && <CoachView />}
      {tab === 'progress' && <ProgressView />}
      {tab === 'calibrate' && <Calibrate device={midi.device ?? 'keyboard'} />}
    </div>
  );
}
