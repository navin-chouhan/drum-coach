// Form pieces: a text Field, a labelled toggle row (CheckRow), one-of Choice buttons, Tabs whose tabs can be off,
// a red Warn line and a Small muted note. Promoted from features/songs/bits.tsx (A8) and features/coach/PlanCard.tsx
// (A7e) by I2.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { Button, slopFor, Toggle } from './controls';
import { digitsOnly } from './kitMath';
import { Body, MAX_FONT_SCALE } from './Text';
import { color, font, hardShadow, shadow, stroke, type } from './tokens';

export type FieldProps = {
  /** What it is, for VoiceOver; drawn small above the field with `showLabel`. */
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Return runs it (the key reads "search"). */
  onSubmit?: () => void;
  /** Digits only (the number pad), at most `maxLength` of them (3 by default). */
  numeric?: boolean;
  maxLength?: number;
  showLabel?: boolean;
  /** The outer box (flex, width). */
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** A one-line text field: white, ink outline, 3 pt shadow, at least 44 pt high. */
export function Field({ label, value, onChange, placeholder, onSubmit, numeric, maxLength, showLabel, style, testID }: FieldProps) {
  const input = (
    <TextInput
      testID={testID} value={value} onChangeText={t => onChange(numeric ? digitsOnly(t, maxLength ?? 3) : t)} placeholder={placeholder}
      placeholderTextColor={color.faint} accessibilityLabel={label} onSubmitEditing={onSubmit} returnKeyType={onSubmit ? 'search' : 'done'}
      keyboardType={numeric ? 'number-pad' : 'default'} autoCorrect={false} autoCapitalize="none" maxLength={numeric ? undefined : maxLength}
      maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.field}
    />
  );
  return (
    <View style={style}>
      {showLabel ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={styles.fieldLabel}>{label}</Text> : null}
      {input}
    </View>
  );
}

/** A toggle with its words (and a small hint line) beside it. */
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

export type ChoiceOption<T> = { value: T; label: string; disabled?: boolean };

/** One-of choices as small buttons, the chosen one yellow (a select on the web). Disabled options are dimmed. */
export function Choice<T extends string | number>({ label, options, value, onChange, disabled, testID }: {
  label?: string; options: readonly ChoiceOption<T>[]; value: T; onChange: (v: T) => void; disabled?: boolean; testID?: string;
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

/** A small muted line. */
export const Small = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={style}><Body size={type.small} color={color.muted}>{children}</Body></View>
);

/** A red warning line (VoiceOver reads it as an alert). */
export const Warn = ({ children, testID }: { children: ReactNode; testID?: string }) => (
  <View style={styles.warn} testID={testID} accessibilityRole="alert"><Body weight="700" color={color.bad}>{children}</Body></View>
);

export type TabItem<T extends string> = { id: T; label: string; disabled?: boolean; hint?: string };

/** A tab strip whose tabs can be off, with the reason as their hint (the web's mode tabs: "Set the tempo first"). */
export function Tabs<T extends string>({ tabs, value, onChange, testID }: { tabs: readonly TabItem<T>[]; value: T; onChange: (v: T) => void; testID?: string }) {
  return (
    <View style={styles.tabs} testID={testID} accessibilityRole="tablist">
      {tabs.map(t => {
        const on = t.id === value;
        return (
          <Pressable key={t.id} testID={testID ? `${testID}-${t.id}` : undefined} disabled={t.disabled} onPress={() => onChange(t.id)} hitSlop={slopFor(40)}
            accessibilityRole="tab" accessibilityState={{ selected: on, disabled: !!t.disabled }} accessibilityLabel={t.label} accessibilityHint={t.hint}
            style={[styles.tab, on && styles.tabOn, t.disabled && styles.dim]}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.tabText, on && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { minHeight: 44, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, paddingHorizontal: 12, fontSize: 16, fontWeight: '600', color: color.ink, boxShadow: hardShadow(shadow.button) },
  fieldLabel: { fontSize: 12, fontWeight: '800', color: color.muted, marginBottom: 3 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  grow: { flex: 1 },
  dim: { opacity: 0.5 },
  choice: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  warn: { backgroundColor: color.badSoft, borderWidth: stroke.thin, borderColor: color.bad, paddingHorizontal: 10, paddingVertical: 6 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tab: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderWidth: stroke.card, borderColor: color.ink, backgroundColor: color.panel, boxShadow: hardShadow(shadow.button) },
  tabOn: { backgroundColor: color.pop },
  tabText: { ...font.heavy, fontSize: 14, color: color.ink },
  tabTextOn: { ...font.display },
});
