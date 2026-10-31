// The player's ⋯ sheet (D10: "the rest behind ⋯"): Sheet / Highway, Hints, Band, How it moves, the lesson's why,
// Share take, Reset, the keys and gestures. The screen fills it; the sheet is a panel on the right that Esc or a tap
// outside closes. (R1's shared ⋯ sheet in src/ui replaces the panel itself once merged; this API stays.)
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { refocusKeyboard } from '../platform/keyboard';
import { Body, Button, Card, Label, Segmented, Toggle, color, useAppKey } from '../ui';

export function PlayerSheet({ open, onClose, testID = 'player-more', children }: { open: boolean; onClose: () => void; testID?: string; children: ReactNode }) {
  useAppKey('escape', () => { onClose(); }, { enabled: open });
  return (
    <Modal visible={open} transparent animationType="fade" supportedOrientations={['landscape']} onRequestClose={onClose} onShow={refocusKeyboard} onDismiss={refocusKeyboard}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
        <Pressable onPress={() => {}} style={styles.panelWrap}>
          <Card style={styles.panel} testID={testID}>
            <ScrollView contentContainerStyle={styles.content}>
              {children}
              <Button label="Close" onPress={onClose} testID={`${testID}-close`} />
            </ScrollView>
          </Card>
        </Pressable>
      </Pressable>
    </Modal>
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

/** The keys and kit gestures, at the bottom of every player's sheet. */
export function KeysLine({ extra }: { extra?: string }) {
  return (
    <Body size={13} color={color.muted}>
      {`Keys: H hints · B band · Esc stops a take or leaves${extra ? ` · ${extra}` : ''}. Kit: hi-hat pedal × 3 or crash × 2 = yes, tom 2 × 2 = hear, floor × 2 = slower, tom 1 × 2 = faster, ride × 2 = next, crash × 4 = stop.`}
    </Body>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, backgroundColor: 'rgba(20,20,20,0.45)', alignItems: 'flex-end', justifyContent: 'flex-start', paddingTop: 70, paddingRight: 20 },
  panelWrap: { width: 470, maxHeight: '88%' },
  panel: { maxHeight: '100%' },
  content: { gap: 14 },
  section: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
});
