// The player's ⋯ sheet (D10: "the rest behind ⋯"): Sheet / Highway, Hints, Band, How it moves, the lesson's why,
// Share take, Reset, the keys and gestures. The screen fills it; the panel is the app's ⋯ sheet (R1's MoreSheet in
// src/ui: Esc, ✕ or a tap outside close it).
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Body, GestureChip, Label, MoreSheet, Segmented, Toggle, color, gesturesFor } from '../ui';

export function PlayerSheet({ open, onClose, title = 'More', testID = 'player-more', children }: { open: boolean; onClose: () => void; title?: string; testID?: string; children: ReactNode }) {
  return (
    <MoreSheet open={open} onClose={onClose} title={title} width={470} testID={testID}>
      <ScrollView contentContainerStyle={styles.content}>{children}</ScrollView>
    </MoreSheet>
  );
}

/** A labelled group in the sheet. */
export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return <View style={styles.section}><Label>{title}</Label>{children}</View>;
}

/** The view and play toggles every player shares: Sheet / Highway (D8 opens on Sheet), Hints (H), Band (B). */
export function PlayToggles({ view, onView, hints, onHints, band, onBand, testID = 'player' }: {
  view: 'sheet' | 'highway'; onView: (v: 'sheet' | 'highway') => void;
  hints?: boolean; onHints?: () => void;
  /** Absent when the piece has no band. */
  band?: boolean; onBand?: () => void;
  testID?: string;
}) {
  return (
    <SheetSection title="How it shows">
      <Segmented testID={`${testID}-view-toggle`} accessibilityLabel="Notes view" value={view} onChange={onView}
        options={[{ value: 'sheet', label: 'Sheet' }, { value: 'highway', label: 'Highway' }]} />
      {onHints ? <Row label="💡 Hints (H)" on={!!hints} onChange={onHints} testID={`${testID}-hints`} /> : null}
      {onBand && band !== undefined ? <Row label="🎸 Band (B)" on={band} onChange={onBand} testID={`${testID}-band`} /> : null}
    </SheetSection>
  );
}

function Row({ label, on, onChange, testID }: { label: string; on: boolean; onChange: () => void; testID: string }) {
  return (
    <View style={styles.row}>
      <Body size={16} weight="700" style={styles.flex}>{label}</Body>
      <Toggle value={on} onChange={() => onChange()} label={label} testID={testID} />
    </View>
  );
}

/** The keys and kit gestures, at the bottom of every player's sheet; say it again (R6) has its own chip. */
export function KeysLine({ extra }: { extra?: string }) {
  return (
    <View style={styles.keys}>
      <View style={styles.row}>
        <GestureChip gesture={gesturesFor('again')[0]} />
        <Body size={14} weight="700">or G: the coach says it again</Body>
      </View>
      <Body size={13} color={color.muted}>
        {`Keys: H hints · B band · Esc stops a take or leaves${extra ? ` · ${extra}` : ''}. Kit: hi-hat pedal × 3 or crash × 2 = yes, tom 2 × 2 = hear, floor × 2 = slower, tom 1 × 2 = faster, ride × 2 = next, crash × 4 = stop.`}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 14, paddingBottom: 6 },
  keys: { gap: 6 },
  section: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
});
