// Gate 0 probe: names one framed MIDI message for the counters and the log. New for the spike (the web app has no
// equivalent; parseMidiMessage only answers "is it a hit"). The hit decision itself stays parseMidiMessage's.

import { padForNote, PAD_NAMES, type NoteMap } from './kit';

export type MsgKind =
  | 'clock' | 'activeSensing' | 'otherRealtime'
  | 'noteOn' | 'noteOff' | 'polyAftertouch' | 'controlChange' | 'programChange' | 'channelPressure' | 'pitchBend'
  | 'sysex' | 'systemCommon' | 'unknown';

export type Classified = {
  kind: MsgKind;
  status: number;
  /** 1–16 for channel messages. */
  channel?: number;
  note?: number;
  velocity?: number;
  /** Poly aftertouch value, CC value, … */
  value?: number;
  /** Poly aftertouch 127 on a hi-hat note: the pedal choke (CLAUDE.md), not a hit. */
  choke?: boolean;
  padName?: string;
};

const CHANNEL_KINDS: Record<number, MsgKind> = {
  0x80: 'noteOff', 0x90: 'noteOn', 0xa0: 'polyAftertouch', 0xb0: 'controlChange',
  0xc0: 'programChange', 0xd0: 'channelPressure', 0xe0: 'pitchBend',
};

export function classify(msg: ArrayLike<number>, map: NoteMap): Classified {
  const status = msg[0];
  if (status === 0xf8) return { kind: 'clock', status };
  if (status === 0xfe) return { kind: 'activeSensing', status };
  if (status >= 0xf8) return { kind: 'otherRealtime', status };
  if (status === 0xf0) return { kind: 'sysex', status };
  if (status >= 0xf1) return { kind: 'systemCommon', status };
  if (status < 0x80) return { kind: 'unknown', status };
  const type = status & 0xf0, channel = (status & 0x0f) + 1;
  let kind = CHANNEL_KINDS[type];
  const c: Classified = { kind, status, channel };
  if (type === 0x80 || type === 0x90 || type === 0xa0) {
    c.note = msg[1];
    const pad = padForNote(map, msg[1]);
    if (pad) c.padName = PAD_NAMES[pad];
    if (type === 0xa0) {
      c.value = msg[2];
      c.choke = msg[2] === 127 && (msg[1] === map.hhClosed || msg[1] === map.hhOpen || msg[1] === map.hhPedal);
    } else {
      c.velocity = msg[2];
      if (type === 0x90 && msg[2] === 0) kind = c.kind = 'noteOff'; // Note On velocity 0 is a Note Off
    }
  } else if (type === 0xb0) c.value = msg[2];
  return c;
}

export const toHex = (msg: ArrayLike<number>) => Array.from(msg, b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
