import { toolOf, type Lesson, type Step, type Tool } from '../engine/lesson';

// How each coach tool (engine/lesson.ts toolOf) is named and drawn on Journey and the lesson screen.
export const TOOL_LABEL: Record<Tool, string> = { jam: 'Play along', copy: 'I play, you copy', trade: 'Trade bars', free: 'Your own fill', bite: 'Song bite', challenge: 'Mini challenge', layers: 'One limb at a time', drill: 'Practice' };
const KIND_ICON: Record<string, string> = { groove: '🥁', rudiment: '🥢', fill: '💥', song: '🎵', exercise: '🎯' };
const TOOL_ICON: Record<Tool, string> = { jam: '🎸', copy: '🔁', trade: '🤜', free: '✨', bite: '🎵', challenge: '🔥', layers: '🧱', drill: '' };
export const stepIcon = (s: Step, kind: string) => TOOL_ICON[toolOf(s)] || KIND_ICON[kind] || '🎯';
export const iconOf = (l: Lesson) => stepIcon(l.steps[0], l.kind);
