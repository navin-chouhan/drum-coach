// The shared full-screen player (D10). Lesson player and placement use it (R2); Practice and Songs (R3) too.
//
//   <PlayerFrame phase={phaseOf({ playing, hasResults })} testID="practice" title subtitle goal bpm onBpm onBack onMore
//     coach={{ line }} music={<NotationView … scale={sheetScaleFor(paperH)} />} onPaperHeight={setPaperH}
//     side={results ? <PlayerScore … /> : undefined} bottom={kit ? undefined : <TouchPads … />}
//     moves={[{ id: 'main', label: 'Play', emoji: '▶', gestures: gesturesFor('yes'), onPress }]} take={playing ? { bar, tip, onStop } : undefined}
//     overlayOpen={sheetOpen}>
//     <PlayerSheet open onClose><PlayToggles … /><KeysLine /></PlayerSheet>
//   </PlayerFrame>
export { PlayerFrame, GoalInBar, type PlayerFrameProps, type PlayerMove, type PlayerTake } from './PlayerFrame';
export { PlayerSheet, SheetSection, PlayToggles, KeysLine } from './PlayerSheet';
export { PlayerScore, type PlayerScoreProps } from './PlayerScore';
export { barGoal, escAction, phaseOf, scoreParts, takeBarText, type BarGoal, type PlayerPhase } from './model';
export { sheetScaleFor, SHEET_H_AT_1_6 } from './sheetFit';
