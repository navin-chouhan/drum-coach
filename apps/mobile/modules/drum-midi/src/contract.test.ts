import { describe, expectTypeOf, it } from 'vitest';

import type { MidiInputInfo, MidiPort, NativeMidiPacket } from '../../../src/platform/contracts';
import type * as DrumMidi from '../index';
import type { MidiInput, MidiPacket } from './DrumMidi.types';

// The module's types are the contract's shapes (contracts.ts is the orchestrator's; the module stays independent of it).
describe('module types match the MidiPort contract', () => {
  it('MidiInput = MidiInputInfo', () => {
    expectTypeOf<MidiInput>().toEqualTypeOf<MidiInputInfo>();
  });

  it('MidiPacket = NativeMidiPacket', () => {
    expectTypeOf<MidiPacket>().toEqualTypeOf<NativeMidiPacket>();
  });

  it("the wrapper's listeners fit MidiPort's", () => {
    type Wrapper = typeof DrumMidi;
    expectTypeOf<Wrapper['onPackets']>().toExtend<MidiPort['onPackets']>();
    expectTypeOf<Wrapper['onInputsChanged']>().toExtend<MidiPort['onInputsChanged']>();
    expectTypeOf<Wrapper['setPreferredNames']>().toExtend<MidiPort['setPreferredNames']>();
    expectTypeOf<Wrapper['select']>().toExtend<MidiPort['select']>();
    expectTypeOf<Wrapper['listInputs']>().toExtend<MidiPort['listInputs']>();
  });
});
