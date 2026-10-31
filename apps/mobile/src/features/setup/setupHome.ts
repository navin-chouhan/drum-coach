// Setup's one job (D10 reorganisation, docs/mobile/reorg/setup-after.png): is everything working? Three status cards
// (Kit, Latency, Coach, each with its one fix) and six rows that open their pages (Pads, Sound, Coach's voice, While
// you play, Coach connection, About). The words on the cards and rows, from what the app knows. Pure.
import type { Hit } from '@drum-coach/core/input/hits';
import type { Settings } from '@drum-coach/core/input/settings';
import type { Capabilities } from '../../platform/contracts';
import { levelsShort } from './checklist';
import { CHATTINESS } from './whilePlaying';

/** The pages behind the rows, and the tools inside them. A tool's parent page is where its Close goes back to. */
export type SetupPage = 'kitpads' | 'sound' | 'voice' | 'play' | 'connection' | 'about';
export type SetupTool = 'pads' | 'velocity' | 'notemap' | 'input' | 'latency' | 'kittest' | 'apikey';
export type SetupView = SetupPage | SetupTool;
export const SETUP_VIEWS: readonly SetupView[] = ['kitpads', 'sound', 'voice', 'play', 'connection', 'about', 'pads', 'velocity', 'notemap', 'input', 'latency', 'kittest', 'apikey'];
export const PARENT: Partial<Record<SetupView, SetupPage>> = { pads: 'kitpads', velocity: 'kitpads', notemap: 'kitpads', input: 'kitpads', apikey: 'connection' };
export const VIEW_TITLE: Record<SetupView, string> = {
  kitpads: 'Pads', sound: 'Sound', voice: 'Coach’s voice', play: 'While you play', connection: 'Coach connection', about: 'About',
  pads: 'Hit each pad once', velocity: 'Soft, then loud', notemap: 'Note map', input: 'MIDI input', latency: 'Latency', kittest: 'Kit test', apikey: 'Coach · fallback API key',
};
/** `/setup?tool=…` opens a page or tool at once. `coach` (the old Coach and voice tool) is now Coach connection, where the goals are. */
export function setupViewOf(v: unknown): SetupView | null {
  if (v === 'coach') return 'connection';
  return (SETUP_VIEWS as readonly unknown[]).includes(v) ? v as SetupView : null;
}

/** "last hit: snare 38 · v96" (the Kit card), or the hint before the first hit. */
export function lastHitLine(hit: Pick<Hit, 'note' | 'velocity'> & { name?: string } | undefined): string {
  return hit ? `last hit: ${(hit.name ?? 'note').toLowerCase()} ${hit.note} · v${hit.velocity}` : 'hit a pad: it shows here';
}

export type CoachCard = { title: string; sub: string; dot: 'on' | 'off' | 'bad'; fix?: string };
/** The Coach card: where the coach answers from, and the one fix when it can't. */
export function coachCard(status: Capabilities['coachServer'], host: string | undefined, hasKey: boolean): CoachCard {
  const key = hasKey ? ' · API key as fallback' : '';
  switch (status) {
    case 'reachable': return { title: 'Home server', sub: `${host ?? 'connected'}${key}`, dot: 'on' };
    case 'unreachable': return { title: hasKey ? 'API key (server away)' : 'Server offline', sub: `${host ?? 'your home server'} doesn’t answer`, dot: hasKey ? 'off' : 'bad', fix: 'Check' };
    case 'not-configured': return { title: hasKey ? 'API key only' : 'Not set up', sub: hasKey ? 'add your home server to use your subscription' : 'add your home server: the rest works without it', dot: hasKey ? 'off' : 'bad', fix: 'Set up' };
    default: return { title: 'Checking…', sub: host ?? '', dot: 'off' };
  }
}

const onOff = (b: boolean) => (b ? 'on' : 'off');
/** The rows' second lines (setup-after.png). */
export function rowLines(s: Settings, o: { clash: boolean; serverSet: boolean; hasKey: boolean }) {
  const spoken = [s.voice && 'verdicts', s.liveTips === 'voice' && 'tips', s.countIn && 'count'].filter(Boolean) as string[];
  const chat = CHATTINESS.find(([v]) => v === s.chattiness)?.[1] ?? 'Normal';
  return {
    kitpads: o.clash ? 'two pads share a note: hit each pad again' : 'Hit each pad · soft then loud · note map · MIDI input',
    sound: levelsShort(s).replace(/^c/, 'C'),
    voice: s.voice || spoken.length ? `On · ${chat} · ${spoken.length ? `${spoken.join(', ').replace(/, ([^,]*)$/, ' and $1')} spoken` : 'nothing spoken'}` : `Off · ${chat}`,
    play: `Kit gestures ${onOff(s.padCommands !== false)} · autopilot ${onOff(!!s.autopilot)} · ${s.leftHanded ? 'left' : 'right'} hand leads`,
    connection: [o.serverSet ? 'Home server' : 'No home server', o.hasKey ? 'API key fallback' : 'no API key', `${s.profile.minutesPerDay} min a day`].join(' · '),
    about: 'Build · debug tools (dev builds)',
  } satisfies Record<SetupPage, string>;
}
