// The one small local piece the Songs screens still need that the UI kit doesn't have: a wrapping row. (Field,
// Stepper, CheckRow, Choice, Small, Warn and Tabs moved to src/ui; the hardware keyboard is app-wide, modules/drum-keys.)
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export const Row = ({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) => <View style={[styles.row, style]}>{children}</View>;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
});
