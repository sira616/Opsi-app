import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { makeStyles, radius, touchTarget, useTheme } from '@/shared/theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet';
  loading?: boolean;
  disabled?: boolean;
  /** Se pinta a la izquierda de la etiqueta. */
  icon?: ReactNode;
};

export function Button({ label, onPress, variant = 'primary', loading, disabled, icon }: Props) {
  const styles = useStyles();
  const c = useTheme();
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
        <ActivityIndicator color={primary ? c.ground : c.brand} />
      ) : (
        <>
          {icon}
          <Text style={[styles.label, primary ? styles.labelPrimary : styles.labelQuiet]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  base: {
    minHeight: touchTarget + 8,
    borderRadius: radius.md,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: c.brand },
  quiet: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.85 },
  inactive: { opacity: 0.5 },
  label: { fontSize: 15.5, fontWeight: '600' },
  labelPrimary: { color: c.ground },
  labelQuiet: { color: c.inkMuted },
}));
