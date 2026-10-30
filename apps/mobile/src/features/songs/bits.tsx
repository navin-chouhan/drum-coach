// Small local pieces the Songs screens need that the UI kit doesn't have (listed for promotion in A8's report):
// a text field, a number stepper, a labelled toggle row, a choice row, notes and warnings, and the hardware-keyboard
// pads (CLAUDE.md keys) for testing without the kit.
import { useRef, type ComponentRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import type { PadId } from '@drum-coach/core/engine/kit';
import { Body, Button, MAX_FONT_SCALE, Toggle, color, font, hardShadow, shadow, slopFor, stroke, type } from '../../ui';

export function Field({ value, onChange, placeholder, label, onSubmit, testID, style, maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label: string; onSubmit?: () => void; testID?: string; style?: StyleProp<ViewStyle>; maxLength?: number;
}) {
  return (
    <TextInput
      testID={testID} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={color.faint}
      accessibilityLabel={label} onSubmitEditing={onSubmit} returnKeyType={onSubmit ? 'search' : 'done'} autoCorrect={false}
      autoCapitalize="none" maxLength={maxLength} maxFontSizeMultiplier={MAX_FONT_SCALE}
      style={[styles.field, style]}
    />
  );
}

/** A whole number with − and + (the web's number inputs). */
export function Stepper({ label, value, min = 1, max = 9999, onChange, testID }: { label: string; value: number; min?: number; max?: number; onChange: (v: number) => void; testID?: string }) {
  const set = (v: number) => onChange(Math.max(min, Math.min(max, v)));
  return (
    <View style={styles.stepper} testID={testID}>
      <Body weight="700">{label}</Body>
      <Button size="small" label="−" accessibilityLabel={`${label}: less`} onPress={() => set(value - 1)} disabled={value <= min} />
      <Text style={styles.stepValue} accessibilityLabel={`${label} ${value}`} maxFontSizeMultiplier={MAX_FONT_SCALE}>{value}</Text>
      <Button size="small" label="+" accessibilityLabel={`${label}: more`} onPress={() => set(value + 1)} disabled={value >= max} />
    </View>
  );
}

export function CheckRow({ label, value, onChange, disabled, testID, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; testID?: string; hint?: string }) {
  return (
    <View style={styles.check}>
      <Toggle value={value} onChange={onChange} label={label} disabled={disabled} testID={testID} />
      <View style={styles.grow}>
        <Body weight="700" style={disabled ? styles.dim : undefined}>{label}</Body>
        {hint ? <Small>{hint}</Small> : null}
      </View>
    </View>
  );
}

/** One-of choices as small buttons, the chosen one yellow (a select on the web). Disabled options are dimmed. */
export function Choice<T extends string | number>({ label, options, value, onChange, disabled, testID }: {
  label?: string; options: readonly { value: T; label: string; disabled?: boolean }[]; value: T; onChange: (v: T) => void; disabled?: boolean; testID?: string;
}) {
  return (
    <View style={styles.choice} testID={testID} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {label ? <Body weight="700">{label}</Body> : null}
      {options.map(o => (
        <Button key={String(o.value)} size="small" label={o.label} tone={o.value === value ? 'pop' : 'white'} disabled={disabled || o.disabled}
          accessibilityLabel={`${label ? `${label}: ` : ''}${o.label}${o.value === value ? ', selected' : ''}`} onPress={() => onChange(o.value)} />
      ))}
    </View>
  );
}

export const Small = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={style}><Body size={type.small} color={color.muted}>{children}</Body></View>
);
export const Warn = ({ children, testID }: { children: ReactNode; testID?: string }) => (
  <View style={styles.warn} testID={testID} accessibilityRole="alert"><Body weight="700" color={color.bad}>{children}</Body></View>
);
export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[styles.row, style]}>{children}</View>;

/** A tab strip whose tabs can be off (the web's mode tabs: "Set the tempo first"). */
export function Tabs<T extends string>({ tabs, value, onChange, testID }: { tabs: { id: T; label: string; disabled?: boolean; hint?: string }[]; value: T; onChange: (v: T) => void; testID?: string }) {
  return (
    <View style={styles.tabs} testID={testID} accessibilityRole="tablist">
      {tabs.map(t => {
        const on = t.id === value;
        return (
          <Pressable key={t.id} testID={`${testID}-${t.id}`} disabled={t.disabled} onPress={() => onChange(t.id)} hitSlop={slopFor(40)}
            accessibilityRole="tab" accessibilityState={{ selected: on, disabled: !!t.disabled }} accessibilityLabel={t.label} accessibilityHint={t.hint}
            style={[styles.tab, on && styles.tabOn, t.disabled && styles.dim]}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** CLAUDE.md's keyboard fallback: Space kick, S snare, A/Q hi-hat closed/open, Z pedal, E/R/F toms, W crash, T ride. */
export const KEY_PADS: Record<string, PadId> = { ' ': 'kick', s: 'snare', a: 'hhClosed', q: 'hhOpen', z: 'hhPedal', e: 'tom1', r: 'tom2', f: 'floor', w: 'crash', t: 'ride' };

/**
 * A hardware keyboard on the iPad plays pads: an invisible, focused text field turns key presses into hits on the
 * app's hit bus (iOS gives React Native no other key events). Tap "⌨ Keys" to focus it again after typing elsewhere.
 */
export function KeyboardPads({ emitPad, enabled = true }: { emitPad: (pad: PadId, velocity: number) => void; enabled?: boolean }) {
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  if (!enabled) return null;
  return (
    <View style={styles.keys}>
      <TextInput
        ref={input} autoFocus value="" onChangeText={() => {}} caretHidden autoCorrect={false} autoCapitalize="none" showSoftInputOnFocus={false}
        onKeyPress={e => { const pad = KEY_PADS[e.nativeEvent.key.toLowerCase()]; if (pad) emitPad(pad, 96); }}
        style={styles.keysInput} accessibilityElementsHidden importantForAccessibility="no"
      />
      <Button size="small" tone="plain" label="⌨ Keys" accessibilityLabel="Play pads from a hardware keyboard" onPress={() => input.current?.focus()} testID="songs-keys" />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 44, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, paddingHorizontal: 12, fontSize: 16, fontWeight: '600', color: color.ink, boxShadow: hardShadow(shadow.button) },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepValue: { ...font.display, fontSize: 18, minWidth: 34, textAlign: 'center', color: color.ink },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  grow: { flex: 1 },
  dim: { opacity: 0.5 },
  choice: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  warn: { backgroundColor: color.badSoft, borderWidth: stroke.thin, borderColor: color.bad, paddingHorizontal: 10, paddingVertical: 6 },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, boxShadow: hardShadow(shadow.button) },
  tabOn: { backgroundColor: color.pop },
  tabText: { ...font.heavy, fontSize: 14, color: color.ink },
  tabTextOn: { ...font.display },
  keys: { flexDirection: 'row', alignItems: 'center' },
  keysInput: { width: 1, height: 1, opacity: 0, position: 'absolute' },
});
