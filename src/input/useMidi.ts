import { useEffect, useRef, useState } from 'react';
import { parseMidiMessage } from '../engine/midi';
import { emitNote } from './hits';
import { setKit } from './store';

export type MidiStatus = 'starting' | 'unsupported' | 'blocked' | 'ready';
const SELECTED_KEY = 'drumcoach.midiInput';

/** Web MIDI with hot-plug. Listens only to the selected input; the note map follows the selected device. */
export function useMidi() {
  const [status, setStatus] = useState<MidiStatus>(() => ('requestMIDIAccess' in navigator ? 'starting' : 'unsupported'));
  const [inputs, setInputs] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelectedState] = useState(() => {
    try { return localStorage.getItem(SELECTED_KEY) ?? ''; } catch { return ''; }
  });
  const [retry, setRetry] = useState(0);
  const selectedRef = useRef(selected);

  const effective = inputs.find(i => i.name === selected) ?? inputs[0];
  useEffect(() => {
    selectedRef.current = effective?.name ?? '';
    setKit(effective?.name ?? 'keyboard');
  }, [effective?.name]);

  useEffect(() => {
    if (!('requestMIDIAccess' in navigator)) return;
    let access: MIDIAccess | undefined;
    const onMessage = (e: MIDIMessageEvent) => {
      if ((e.currentTarget as MIDIInput).name !== selectedRef.current || !e.data) return;
      const n = parseMidiMessage(e.data);
      if (n) emitNote(n.note, n.velocity, e.timeStamp);
    };
    const refresh = () => {
      const list: { id: string; name: string }[] = [];
      access!.inputs.forEach(inp => {
        inp.onmidimessage = onMessage;
        if (inp.state === 'connected') list.push({ id: inp.id, name: inp.name ?? inp.id });
      });
      setInputs(list);
    };
    navigator.requestMIDIAccess({ sysex: false }).then(a => {
      access = a;
      setStatus('ready');
      refresh();
      a.onstatechange = refresh;
    }, () => setStatus('blocked'));
    return () => {
      if (!access) return;
      access.onstatechange = null;
      access.inputs.forEach(inp => { inp.onmidimessage = null; });
    };
  }, [retry]);

  const select = (name: string) => {
    setSelectedState(name);
    try { localStorage.setItem(SELECTED_KEY, name); } catch { /* ignore */ }
  };

  return { status, inputs, device: effective?.name, select, retry: () => setRetry(r => r + 1) };
}
