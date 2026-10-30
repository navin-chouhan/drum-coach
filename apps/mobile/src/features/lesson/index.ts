// The lesson player's models (A7b part 1): pure TypeScript, ported from src/lesson/LessonPlayer.tsx and friends.
export { LessonController, sitting, type LessonDeps, type LessonView, type MoveView, type MoveId, type Celebration } from './controller';
export { judge, keepInterrupted, MIN_KEPT_BARS, type Outcome, type Nums, type JudgeInput, type JudgeOutput } from './judge';
export * from './lessonView';
export { liveTip, countInAt, barCounter, flowMeter, TIP_MS } from './live';
export { createTakePort, type CoreTakePort, type TakePortDeps } from './takePort';
export { parseLessonParams, setItemOf, nextItem, itemDonePatch, lessonHref, type LessonParams, type LessonMode } from './route';
export { runChart, idleChart, takenChart, replayResults } from './runChart';
export { progressOf, saveProgress, resetLesson, todayKey } from './progress';
export { takeCard, latencyHint, takeMarks, timingLine, fixBar, yourFills, takeBpm, type TakeCard, type TakeMarks, type TimingDot } from './results';
export { runInputOf, shouldSave } from './runRecord';
export { createSettingsStore, SETTINGS_KEY, type SettingsStore } from './settings';
export { takeFile, canShare, safeFileName, stamp } from './share';
export type { Finished, PlayOptions, TakePort, TakeState } from './types';
