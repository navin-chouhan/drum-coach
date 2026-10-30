import { createHitBus } from '../../packages/core/src/input/hits.ts';
import { getNoteMap, getPadCal } from './store';

// The input path lives in @drum-coach/core (packages/core/src/input/hits.ts). This is the web's one hit bus: on the
// performance.now() clock (the same clock as MIDIMessageEvent.timeStamp), with the note map and pad calibration of
// the current kit from the local store.
export { BOUNCE_MS, BOUNCE_RATIO, CROSSTALK_MS, CROSSTALK_SNARE_MAX, type Hit } from '../../packages/core/src/input/hits.ts';

const bus = createHitBus({ now: () => performance.now(), getNoteMap, getPadCal });

export const { onHit, emitNote, onRawMidi, receiveMidi, emitPad } = bus;
