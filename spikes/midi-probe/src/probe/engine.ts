// The probe's single MIDI pipeline: one native subscription → the shared TS probe (framing, counters, filter).
// Lives outside React so re-renders, StrictMode and Fast Refresh can't add a second subscription (which would
// double every hit and look exactly like the M4 bug we are testing for).

import { AppState, type AppStateStatus } from 'react-native';
import type { EventSubscription } from 'expo';
import * as DrumMidi from '../../modules/drum-midi';
import { createProbe } from '../shared/probe';

let logRealtime = false;
export const setLogRealtime = (on: boolean) => { logRealtime = on; };
export const getLogRealtime = () => logRealtime;

export const probe = createProbe({ logRealtime: () => logRealtime });

export type InputsState = { inputs: DrumMidi.MidiInput[]; selectedId: string | null };
let inputsState: InputsState = { inputs: [], selectedId: null };
const inputListeners = new Set<(s: InputsState) => void>();
const setInputs = (next: Partial<InputsState>) => {
  inputsState = { ...inputsState, ...next };
  inputListeners.forEach(l => l(inputsState));
};
export const getInputs = () => inputsState;
export const subscribeInputs = (fn: (s: InputsState) => void) => { inputListeners.add(fn); return () => { inputListeners.delete(fn); }; };

/** App lifecycle transitions seen (M4 evidence: hits must stay one per stroke across them). */
export const lifecycle = { backgrounded: 0, foregrounded: 0, last: AppState.currentState as AppStateStatus };

// Survives Fast Refresh: a re-evaluated module first removes the previous module's subscriptions.
type G = { __drumProbeSubs?: EventSubscription[] };
const g = globalThis as G;

export function start() {
  g.__drumProbeSubs?.forEach(s => s.remove());
  const subs: EventSubscription[] = [];
  subs.push(DrumMidi.addMidiListener(ev => {
    const jsReceivedMs = DrumMidi.nowMs(); // first thing in the handler: the bridge delay is measured to here
    probe.ingest(ev, jsReceivedMs);
  }));
  subs.push(DrumMidi.addInputsListener(inputs => {
    setInputs({ inputs });
    autoSelect();
  }));
  const app = AppState.addEventListener('change', s => {
    if (s === 'background') lifecycle.backgrounded++;
    if (s === 'active' && lifecycle.last !== 'active') lifecycle.foregrounded++;
    lifecycle.last = s;
  });
  subs.push({ remove: () => app.remove() });
  g.__drumProbeSubs = subs;
  refreshInputs();
  autoSelect();
}

export function refreshInputs() {
  try { setInputs({ inputs: DrumMidi.listInputs() }); } catch (e) { console.warn('listInputs failed', e); }
}

/** The kit shows as "e-Drum" on iOS (CLAUDE.md); pick it when nothing is selected yet. */
function autoSelect() {
  if (inputsState.selectedId) return;
  const kit = inputsState.inputs.find(i => i.online && /e-drum/i.test(i.name));
  if (kit) select(kit.id);
}

export function select(id: string | null) {
  try { DrumMidi.select(id); } catch (e) { console.warn('select failed', e); }
  setInputs({ selectedId: id });
}
