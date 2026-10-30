// The coach (A7e): the panel other screens open, and the hooks into the live session. See coach.ts for how a play
// screen tells the coach about exercises and takes.
export { CoachPanel, CoachInspector, PANEL_WIDTH, type CoachPanelProps } from './CoachPanel';
export { getCoach, setCoachPlaying, useCoachSession, useCoachEntry, useWeekPlan, drillRoute, lessonRoute, songRoute } from './coach';
export { coachLine, replyFor, thinkingAbout, type Act, type Action, type SessionTake } from './session';
export { summarizeTake, type RunSummary, type TakeExtras } from './summary';
export { hush } from './voice';
