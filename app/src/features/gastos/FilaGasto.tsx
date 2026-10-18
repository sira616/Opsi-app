import { Text, View } from 'react-native';

import type { ProductoGastado } from '@/api/premium';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { fonts, makeStyles, space, tabular, touchTarget, useTheme } from '@/shared/theme/tokens';

type Props = {
  /** El puesto en la lista, empezando en 1. */
  puesto: number;
  producto: ProductoGastado;
};

/** Una fila de «lo que más gastas»: puesto, producto y cuántas veces se terminó. */
export function FilaGasto({ puesto, producto: p }: Props) {
  const styles = useStyles();
  const c = useTheme();
  return (
    <View style={styles.gasto}>
      <Text style={styles.puesto}>{puesto}</Text>
      <IconoComida nombre={p.nombre} size={20} color={c.brandInk} weight="duotone" />
      <View style={styles.texto}>
        <Text style={styles.nombre} numberOfLines={1}>
          {p.nombre}
        </Text>
        {p.tirado > 0 ? (
          <Text style={styles.tirado}>
            {p.tirado === 1 ? 'Y 1 vez se tiró' : `Y ${p.tirado} veces se tiró`}
          </Text>
        ) : null}
      </View>
      <Text style={styles.veces}>
        {p.agotado} {p.agotado === 1 ? 'vez' : 'veces'}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  gasto: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touchTarget },
  puesto: { ...tabular, width: 22, fontFamily: fonts.bold, fontSize: 13, color: c.inkFaint, textAlign: 'center' },
  texto: { flex: 1, minWidth: 0 },
  nombre: { fontFamily: fonts.semibold, fontSize: 14.5, color: c.ink },
  tirado: { fontSize: 11.5, color: c.inkFaint },
  veces: { ...tabular, fontFamily: fonts.semibold, fontSize: 13.5, color: c.brandInk },
}));
