// KeepAwake (contracts.ts) on expo-keep-awake. iOS only honours it while the app is in the foreground anyway; the
// root layout also releases it on background (keepAwakeWhileForeground).
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { createKeepAwake } from './keepAwakeCore';

export const keepAwake = createKeepAwake({ activate: activateKeepAwakeAsync, deactivate: deactivateKeepAwake });
export { keepAwakeWhileForeground } from './keepAwakeCore';
