import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, touchTarget } from '@/theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet';
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled }: Props) {
  const inactive = disabled || loading;
  const primary = variant === 'primary';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        primary ? styles.primary : styles.quiet,
        pressed && !inactive && styles.pressed,
        inactive && styles.inactive,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.ground : colors.brand} />
      ) : (
        <Text style={[styles.label, primary ? styles.labelPrimary : styles.labelQuiet]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget + 8,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: colors.brand },
  quiet: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.5 },
  label: { fontSize: 15.5, fontWeight: '600' },
  labelPrimary: { color: colors.ground },
  labelQuiet: { color: colors.inkMuted },
});
