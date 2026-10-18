import { Pressable, ScrollView, Text, View } from 'react-native';

import type { Nevera } from '@/api/household';
import { IconoNevera } from '@/shared/lib/iconos-nevera';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

type Props = {
  neveras: Nevera[];
  valor: string;
  onValor: (id: string) => void;
};

/**
 * En qué nevera. Una fila de píldoras con el icono y el nombre de cada una.
 *
 * Con una sola nevera no hay nada que elegir y no se pinta nada: quien llama puede
 * ponerla siempre, sin comprobar cuántas hay.
 */
export function ElegirNevera({ neveras, valor, onValor }: Props) {
  const styles = useStyles();
  const c = useTheme();

  if (neveras.length < 2) return null;

  return (
    <View style={styles.cuerpo}>
      <Text style={styles.etiqueta}>Nevera</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
        {neveras.map((n) => {
          const on = n.id === valor;
          return (
            <Pressable
              key={n.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Nevera ${n.name}`}
              onPress={() => onValor(n.id)}
              style={[styles.pildora, on && styles.pildoraOn]}
            >
              <IconoNevera icono={n.icon} size={16} color={on ? c.brand : c.inkMuted} />
              <Text style={[styles.nombre, on && styles.nombreOn]} numberOfLines={1}>
                {n.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  cuerpo: { gap: space.sm - 2 },
  etiqueta: { fontSize: 12.5, color: c.inkMuted },
  fila: { gap: space.sm, paddingRight: space.lg },
  pildora: {
    minHeight: touchTarget - 4,
    maxWidth: 200,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  pildoraOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  nombre: { fontFamily: fonts.semibold, fontSize: 13.5, color: c.inkMuted },
  nombreOn: { color: c.brandInk },
}));
