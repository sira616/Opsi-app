import { Pressable, ScrollView, Text, View } from 'react-native';
import { makeStyles, radius, space, touchTarget } from '@/shared/theme/tokens';

export type ChipOption<T extends string> = {
  value: T;
  label: string;
  /** Marca la opción con el color de caducidad: es seguridad, no calidad. */
  danger?: boolean;
};

type Props<T extends string> = {
  /** Opcional: dentro de un bloque que ya lleva título, sobra. */
  label?: string;
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  hint?: string;
};

/**
 * Selector de una opción entre pocas.
 *
 * Con cinco unidades o cuatro ubicaciones, un desplegable esconde las opciones
 * detrás de un toque y obliga a recordar cuáles hay. En una pantalla de alta,
 * que se usa con una mano y con prisa, verlas todas gana.
 */
export function Chips<T extends string>({ label, options, value, onChange, hint }: Props<T>) {
  const styles = useStyles();

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={[
                styles.chip,
                selected && (option.danger ? styles.chipDanger : styles.chipOn),
              ]}
            >
              <Text
                style={[
                  styles.chipText,
                  selected && (option.danger ? styles.chipTextDanger : styles.chipTextOn),
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrapper: { gap: space.sm - 2 },
  label: { fontSize: 12.5, color: c.inkMuted },
  row: { gap: space.sm, paddingRight: space.lg },
  chip: {
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  chipOn: { borderColor: c.brand, borderWidth: 1.5, backgroundColor: c.brandSoft },
  chipDanger: { borderColor: c.expiry, borderWidth: 1.5, backgroundColor: c.expirySoft },
  chipText: { fontSize: 14, fontWeight: '600', color: c.inkMuted },
  chipTextOn: { color: c.brand },
  chipTextDanger: { color: c.expiry },
  hint: { fontSize: 11.5, color: c.inkFaint },
}));
