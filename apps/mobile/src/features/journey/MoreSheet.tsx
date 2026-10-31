// Journey's ⋯ sheet (D10, docs/mobile/reorg/journey-after.png): what the one-job Journey no longer shows: more ways
// to play (Just jam, Flow, the after-set moves, the stage song, a new song, show-off songs), your coach (ask for a
// different lesson, this week's focus, lessons written for you, the challenge) and where you are (Find my level,
// Skill map, Full path, Check my kit, Stick technique). The entries are moreSections (more.ts, tested); the sheet is
// the shell's ⋯ pattern (src/ui/MoreSheet.tsx).
import { Body, MoreSheet, SheetHeading, SheetItem, color } from '../../ui';
import type { JourneyView } from './model';
import { moreSections, type MoreEntry } from './more';

export const COACH_WRITING = 'Your coach is writing a lesson from your recent playing… this can take a minute. You can keep playing; the answer will wait here.';

export function JourneyMoreSheet({ v, visible, onClose, onRun, coach }: {
  v: JourneyView; visible: boolean; onClose: () => void;
  /** Runs an entry's action (Journey knows how to open lessons, routes and coach asks). */
  onRun: (e: MoreEntry) => void;
  coach: { thinking: boolean; error?: string };
}) {
  return (
    <MoreSheet open={visible} onClose={onClose} title="More" testID="journey-more">
      {moreSections(v, coach).map(s => [
        <SheetHeading key={`h-${s.key}`}>{s.title}</SheetHeading>,
        s.key === 'coach' && coach.thinking ? <Body key="thinking" size={14} weight="700" accessibilityLiveRegion="polite">{`✍ ${COACH_WRITING}`}</Body> : null,
        s.key === 'coach' && coach.error ? <Body key="error" size={14} weight="700" color={color.bad}>{coach.error}</Body> : null,
        ...s.entries.map(e => (
          <SheetItem key={e.key} emoji={e.emoji} label={e.title} sub={e.sub} testID={e.testID} disabled={e.disabled}
            onPress={() => { onClose(); onRun(e); }} />
        )),
      ])}
    </MoreSheet>
  );
}
