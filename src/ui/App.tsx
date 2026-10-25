import { useEffect, useState, useSyncExternalStore } from 'react';
import { CoachSettings } from '../coach/CoachView';
import { SongsPage } from '../youtube/SongsPage';
import { onHit } from '../input/hits';
import { startKeyboard } from '../input/keyboard';
import { getSettings } from '../input/settings';
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

const TABS = { today: 'Journey', songs: 'Songs', play: 'Practice', progress: 'Trophies' } as const;
// Setup is used on day one and when a pad acts up, so it sits behind the gear instead of in the tab bar.
const SETUP = { pads: 'Pads', kit: 'Kit test', coach: 'Coach and voice' } as const;
type Tab = keyof typeof TABS | 'setup';

export function App() {
  const midi = useMidi();
  const [tab, setTabState] = useState<Tab>('today');
  const [setup, setSetup] = useState<keyof typeof SETUP>('pads');
  const [pending, setPending] = useState<PlayRequest>();
  const [song, setSong] = useState<{ id: string; n: number; bars?: SongBars }>();
  const [lesson, setLesson] = useState<{ id: string; n: number }>();
  const setTab = (t: Tab) => { if (t !== tab) { stop(); dropCoachAction(); } setTabState(t); };
  const openPads = () => { setSetup('pads'); setTab('setup'); };
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

  const status =
    midi.status === 'unsupported' ? { text: 'MIDI not supported — open in Google Chrome', cls: 'bad' }
    : midi.status === 'blocked' ? { text: 'MIDI blocked — allow it via the icon left of the address bar, then click here', cls: 'bad' }
    : midi.status === 'starting' ? { text: 'Starting…', cls: '' }
    : midi.device ? { text: `${midi.device} connected`, cls: 'ok' }
    : { text: 'No MIDI device — plug in the kit (keyboard works)', cls: 'bad' };

  return (
    <div className={focus ? 'app focus' : 'app'}>
      <header>
        <div className="brand"><span className="logo" />Drum Coach</div>
        <button className={`chip ${status.cls}`} onClick={midi.status === 'blocked' ? midi.retry : undefined}
          aria-live="polite"><span className="dot" />{status.text}</button>
        {soundLocked && <button className="chip bad" aria-live="polite">🔈 Click or press any key to turn on the sound (a pad hit can't)</button>}
        {midi.inputs.length > 1 && (
          <select value={midi.device} onChange={e => midi.select(e.target.value)} aria-label="MIDI input">
            {midi.inputs.map(i => <option key={i.id} value={i.name}>{i.name}</option>)}
          </select>
        )}
        <div className="spacer" />
        <nav className="tabs">
          {(Object.keys(TABS) as (keyof typeof TABS)[]).map(t => (
            <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{TABS[t]}</button>
          ))}
          <button className={`gear ${tab === 'setup' ? 'on' : ''}`} aria-label="Setup" title="Setup: pads, kit test, coach and voice"
            aria-current={tab === 'setup' ? 'page' : undefined} onClick={() => setTab('setup')}>⚙</button>
        </nav>
        {tab === 'setup' && (
          <nav className="tabs subTabs" aria-label="Setup">
            {(Object.keys(SETUP) as (keyof typeof SETUP)[]).map(p => (
              <button key={p} className={setup === p ? 'on' : ''} aria-current={setup === p ? 'page' : undefined} onClick={() => setSetup(p)}>{SETUP[p]}</button>
            ))}
          </nav>
        )}
      </header>
      {tab === 'today' && <TodayView key={lesson?.n} openLessonId={lesson?.id} onCalibrate={openPads} />}
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
