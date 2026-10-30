// Pads are what the module can send; drums are what the kit view draws.
// The hi-hat is one drum with three pads (articulations).
export const PADS = [
  'kick', 'snare', 'hhClosed', 'hhOpen', 'hhPedal', 'tom1', 'tom2', 'floor', 'crash', 'ride',
] as const;
export type PadId = (typeof PADS)[number];

export type DrumId = 'kick' | 'snare' | 'hihat' | 'tom1' | 'tom2' | 'floor' | 'crash' | 'ride';

export const PAD_INFO: Record<PadId, { name: string; drum: DrumId; hint?: string }> = {
  kick: { name: 'Kick', drum: 'kick' },
  snare: { name: 'Snare', drum: 'snare' },
  hhClosed: { name: 'Hi-hat closed', drum: 'hihat', hint: 'Hold the pedal down, then hit the hi-hat' },
  hhOpen: { name: 'Hi-hat open', drum: 'hihat', hint: 'Pedal up, then hit the hi-hat' },
  hhPedal: { name: 'Hi-hat pedal', drum: 'hihat', hint: 'Press the hi-hat pedal' },
  tom1: { name: 'Tom 1', drum: 'tom1' },
  tom2: { name: 'Tom 2', drum: 'tom2' },
  floor: { name: 'Floor tom', drum: 'floor' },
  crash: { name: 'Crash', drum: 'crash' },
  ride: { name: 'Ride', drum: 'ride' },
};

/** One MIDI note per pad. */
export type NoteMap = Record<PadId, number>;

// MPS-150 defaults, verified on the real kit (docs/KIT.md).
export const DEFAULT_NOTE_MAP: NoteMap = {
  kick: 36, snare: 38, hhClosed: 42, hhOpen: 46, hhPedal: 44,
  tom1: 48, tom2: 45, floor: 43, crash: 49, ride: 51,
};

/** Pad for a note; with duplicate notes the first pad in PADS order wins (see findConflicts). */
export function padForNote(map: NoteMap, note: number): PadId | undefined {
  return PADS.find(p => map[p] === note);
}

/** Groups of pads that share one note — they can't be told apart and must be fixed on the module. */
export function findConflicts(map: NoteMap): PadId[][] {
  const byNote = new Map<number, PadId[]>();
  for (const p of PADS) byNote.set(map[p], [...(byNote.get(map[p]) ?? []), p]);
  return [...byNote.values()].filter(g => g.length > 1);
}

/** Parses stored JSON into a full map, falling back to defaults for anything missing or invalid. */
export function parseNoteMap(json: string | null): NoteMap {
  const map = { ...DEFAULT_NOTE_MAP };
  try {
    const raw: unknown = JSON.parse(json ?? '{}');
    if (raw && typeof raw === 'object') {
      for (const p of PADS) {
        const n = (raw as Record<string, unknown>)[p];
        if (Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 127) map[p] = n as number;
      }
    }
  } catch { /* corrupt storage → defaults */ }
  return map;
}
