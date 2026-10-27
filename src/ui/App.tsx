import { useEffect, useState, useSyncExternalStore } from 'react';
import { CoachSettings } from '../coach/CoachView';
import { SongsPage } from '../youtube/SongsPage';
import { onHit } from '../input/hits';
import { startKeyboard } from '../input/keyboard';
import { getSettings, subscribeSettings } from '../input/settings';
import { useMidi } from '../input/useMidi';
import { TodayView } from '../lesson/TodayView';
import { audio, playDrum } from '../play/audio';
import { PlayView } from '../play/PlayView';
import { onCue, player, playerVersion, stop, subscribePlayer } from '../play/player';
import { NUMBERS, prepare, say } from '../voice/voice';
import { dropCoachAction, padAction } from '../coach/session';
import { padCommands } from '../engine/padCommands';
import { TalkToCoach } from '../voice/TalkToCoach';
import { SPOKEN_CUES } from '../engine/liveCoach';
import { Calibrate } from './Calibrate';
import { KitView } from './KitView';
import { LastHit } from './LastHit';
import { onLessonRequest, onPlayRequest, onSongRequest, type PlayRequest, type SongBars } from './nav';
import { ProgressView } from './ProgressView';
import { Timeline } from './Timeline';

const TABS = { today: 'Journey', songs: 'Songs', play: 'Practice', progress: 'Progress' } as const;
// Setup is used on day one and when a pad acts up, so it sits behind the gear instead of in the tab bar.
const SETUP = { pads: 'Your kit', kit: 'Kit test', coach: 'Coach and voice' } as const;
type Tab = keyof typeof TABS | 'setup';

export function App() {
  const midi = useMidi();
  const settings = useSyncExternalStore(subscribeSettings, getSettings);
  const [kitOpen, setKitOpen] = useState(false); // the kit chip's details
  useEffect(() => {
    if (!kitOpen) return;
    const close = (e: Event) => { if (!(e.target instanceof Element && e.target.closest('.kitChipWrap'))) setKitOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setKitOpen(false); };
    document.addEventListener('pointerdown', close); window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [kitOpen]);
  const [tab, setTabState] = useState<Tab>('today');
  const [setup, setSetup] = useState<keyof typeof SETUP>('pads');
  // D9: Chrome's MIDI permission prompt can sit unanswered; after 3 s the chip says what to do
  const [midiSlow, setMidiSlow] = useState(false);
  useEffect(() => { if (midi.status !== 'starting') return; const t = setTimeout(() => setMidiSlow(true), 3000); return () => clearTimeout(t); }, [midi.status]);
  const [pending, setPending] = useState<PlayRequest>();
  const [song, setSong] = useState<{ id: string; n: number; bars?: SongBars }>();
  const [lesson, setLesson] = useState<{ id: string; n: number }>();
  const setTab = (t: Tab) => { if (t !== tab) { stop(); dropCoachAction(); } setTabState(t); };
  useSyncExternalStore(subscribePlayer, playerVersion);
  const focus = player.phase === 'playing' && !player.options?.demo; // hide the chrome while you play
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') stop(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(startKeyboard, []);
  // Chrome keeps the sound off until a click or key press on the page; a pad hit doesn't count, so takes from the kit would wait silently.
  const [soundLocked, setSoundLocked] = useState(() => navigator.userActivation ? !navigator.userActivation.hasBeenActive : false);
  useEffect(() => {
    if (!soundLocked) return;
    const t = setInterval(() => { if (navigator.userActivation.hasBeenActive) { setSoundLocked(false); audio(); } }, 300); // any gesture counts
    return () => clearInterval(t);
  }, [soundLocked]);
  useEffect(() => onHit(h => { if (h.pad && getSettings().browserSounds) playDrum(h.pad, h.velocity); }), []);
  useEffect(() => {
    const detect = padCommands();
    return onHit(h => {
      const cmd = detect(h, player.phase === 'playing');
      if (!cmd || !getSettings().padCommands) return;
      if (cmd === 'stop') stop(); else padAction(cmd);
    });
  }, []);
  useEffect(() => onPlayRequest(r => { stop(); setPending(r); setTabState('play'); }), []);
  useEffect(() => onSongRequest((id, bars) => { stop(); setSong(o => ({ id, bars, n: (o?.n ?? 0) + 1 })); setTabState('songs'); }), []);
  useEffect(() => onLessonRequest(id => { stop(); setLesson(o => ({ id, n: (o?.n ?? 0) + 1 })); setTabState('today'); }), []);
  // The coach's voice: prepare the count-in and tips, speak tips when asked to.
  useEffect(() => { void prepare([...NUMBERS.slice(0, 8), 'and', ...SPOKEN_CUES]); }, []);
  useEffect(() => onCue(c => { if (getSettings().liveTips === 'voice') void say(c.spoken, true); }), []);

  // One kit chip: green when the kit and the sound work, else how many things need fixing; the details open under it.
  const turnOnSound = () => { setSoundLocked(false); audio(); };
  const fixes: { ic: string; title: string; text: React.ReactNode }[] = [
    ...(midi.status === 'unsupported' ? [{ ic: '🔴', title: 'MIDI not supported', text: 'Open the app in Google Chrome.' }] : []),
    ...(midi.status === 'blocked' ? [{ ic: '🔴', title: 'MIDI is blocked', text: <>Click the icon left of the address bar, allow MIDI, then <button className="link" onClick={midi.retry}>try again</button>.</> }] : []),
    ...(midi.status === 'starting' && midiSlow ? [{ ic: '🔴', title: 'MIDI is waiting for you', text: 'Click the icon left of the address bar and allow MIDI.' }] : []),
    ...(midi.status === 'ready' && !midi.device ? [{ ic: '🔌', title: 'No kit found', text: 'Plug the kit in over USB. The keyboard works meanwhile.' }] : []),
    ...(soundLocked ? [{ ic: '🔈', title: 'Sound is off', text: <>Chrome needs one click or key press first (a pad hit can't). <button className="link" onClick={turnOnSound}>Turn it on</button></> }] : []),
  ];
  const unchecked = !settings.setupDone || !settings.latencyChecked;
  const waiting = midi.status === 'starting' && !midiSlow;
  const chipText = fixes.length ? <><span className="long">Kit: </span>{fixes.length} thing{fixes.length === 1 ? '' : 's'} to fix</>
    : waiting ? 'Starting…' : <>{midi.device}<span className="long"> · sound on</span></>;

  return (
    <div className={focus ? 'app focus' : 'app'}>
      <header>
        <div className="brand"><span className="logo" />Drum Coach</div>
        <nav className="tabs">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map(t => (
            <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{TABS[t]}</button>
          ))}
        </nav>
        <div className="spacer" />
        <div className="kitChipWrap">
          <button className={`chip kitChip ${fixes.length ? 'bad' : waiting ? '' : 'ok'}`} aria-expanded={kitOpen} aria-live="polite" onClick={() => setKitOpen(!kitOpen)}>
            <span className="dot" />{chipText} {kitOpen ? '▴' : '▾'}</button>
          {kitOpen && <div className="popover" role="dialog" aria-label="Your kit">
            <ul>
              {fixes.map(f => <li key={f.title}><span aria-hidden>{f.ic}</span><span><b>{f.title}</b>{f.text}</span></li>)}
              {!fixes.length && !waiting && <li><span aria-hidden>🟢</span><span><b>{midi.device} connected</b>Sound is on.</span></li>}
              {unchecked && <li><span aria-hidden>⚙</span><span><b>Pads and latency</b>{settings.setupDone ? 'Latency' : 'Not'} checked yet · <button className="link" onClick={() => { setKitOpen(false); setSetup('pads'); setTab('setup'); }}>check my kit</button></span></li>}
              {midi.inputs.length > 1 && <li><span aria-hidden>🎹</span><label><b>MIDI input</b>
                <select value={midi.device} onChange={e => midi.select(e.target.value)}>{midi.inputs.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}</select></label></li>}
            </ul>
          </div>}
        </div>
        <button className={`gearBtn ${tab === 'setup' ? 'on' : ''}`} aria-label="Setup" title="Setup: your kit, kit test, coach and voice"
          aria-current={tab === 'setup' ? 'page' : undefined} onClick={() => setTab('setup')}>⚙</button>
        {tab === 'setup' && (
          <nav className="tabs subTabs" aria-label="Setup">
            {(Object.keys(SETUP) as (keyof typeof SETUP)[]).map(p => (
              <button key={p} className={setup === p ? 'on' : ''} aria-current={setup === p ? 'page' : undefined} onClick={() => setSetup(p)}>{SETUP[p]}</button>
            ))}
          </nav>
        )}
      </header>
      {tab === 'today' && <TodayView key={lesson?.n} openLessonId={lesson?.id} device={midi.device} />}
      {tab === 'setup' && setup === 'kit' && (
        <>
          <main>
            <KitView />
            <aside>
              <LastHit onCalibrate={() => setSetup('pads')} />
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
      {tab === 'songs' && <SongsPage key={song?.n} openId={song?.id} bars={song?.bars} />}
      {tab === 'progress' && <ProgressView />}
      {tab === 'setup' && setup === 'pads' && <Calibrate device={midi.device ?? 'keyboard'} />}
      {tab === 'setup' && setup === 'coach' && <CoachSettings />}
      <TalkToCoach />
    </div>
  );
}
