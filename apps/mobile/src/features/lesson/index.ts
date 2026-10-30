// The lesson player's models (A7b part 1): pure TypeScript, ported from src/lesson/LessonPlayer.tsx and friends.
export { LessonController, sitting, type LessonDeps, type LessonView, type MoveView, type MoveId, type Celebration } from './controller';
export { createCoachSession, coachLine, replyFor, thinkingAbout, screenAction, type CoachSession, type CoachState } from './coach';
export { judge, keepInterrupted, MIN_KEPT_BARS, type Outcome, type Nums, type JudgeInput, type JudgeOutput } from './judge';
export * from './lessonView';
export { liveTip, countInAt, barCounter, flowMeter, TIP_MS } from './live';
export { createLocalTake, type LocalTake, type LocalTakeDeps } from './localTake';
export { progressOf, saveProgress, resetLesson, todayKey } from './progress';
export { takeCard, latencyHint, takeMarks, timingLine, fixBar, yourFills, takeBpm, type TakeCard, type TakeMarks, type TimingDot } from './results';
export { summarizeRun, runInputOf, shouldSave } from './runRecord';
export { createSettingsStore, SETTINGS_KEY, type SettingsStore } from './settings';
export { takeFile, canShare, safeFileName, stamp } from './share';
export type { Finished, PlayOptions, TakePort, TakeState, Feedback } from './types';
