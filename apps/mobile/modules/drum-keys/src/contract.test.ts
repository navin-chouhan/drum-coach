import { describe, expectTypeOf, it } from 'vitest';

import type { KeyEventLike, KeysApi } from '../../../src/platform/keyboardCore';
import type * as DrumKeys from '../index';
import type { KeyEvent } from './DrumKeys.types';

// The module's shapes fit what src/platform/keyboardCore.ts reads (the module stays independent of the app).
describe('module types match the keyboard core', () => {
  it('KeyEvent carries every field the core reads', () => {
    expectTypeOf<KeyEvent>().toExtend<KeyEventLike>();
  });

  it('the wrapper is a KeysApi', () => {
    type Wrapper = typeof DrumKeys;
    expectTypeOf<Pick<Wrapper, 'available' | 'onKey' | 'setEnabled'>>().toExtend<KeysApi>();
  });
});
