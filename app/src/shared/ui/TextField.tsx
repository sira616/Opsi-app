import { Text, TextInput, View, type TextInputProps } from 'react-native';
import { makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

type Props = TextInputProps & {
  label: string;
  hint?: string;
};

/**
 * Campo con su <label> de verdad asociado por `nativeID`/`accessibilityLabelledBy`.
 * Un placeholder no es una etiqueta: desaparece justo cuando escribes, que es
 * cuando hace falta, y los lectores de pantalla no siempre lo anuncian.
 */
export function TextField({ label, hint, ...props }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const id = `field-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <View style={styles.wrapper}>
      <Text nativeID={id} style={styles.label}>
        {label}
      </Text>
      <TextInput
        accessibilityLabelledBy={id}
        accessibilityLabel={label}
        placeholderTextColor={c.inkFaint}
        style={styles.input}
        {...props}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrapper: { gap: space.xs + 2 },
  label: { fontSize: 12.5, color: c.inkMuted },
  input: {
    minHeight: touchTarget + 2,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.borderStrong,
    borderRadius: radius.sm + 2,
    paddingHorizontal: space.md,
    fontSize: 15.5,
    color: c.ink,
  },
  hint: { fontSize: 11.5, color: c.inkFaint },
}));
