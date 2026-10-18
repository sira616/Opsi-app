import { Text, View } from 'react-native';

import { Snowflake } from 'phosphor-react-native';

import type { ItemDetail } from '@/api/inventory';
import { recomendarCongelar } from '@/shared/lib/congelar';
import { makeStyles, radius, space, useTheme } from '@/shared/theme/tokens';

/**
 * «Congélalo o úsalo», cuando a algo de la nevera se le acaba el plazo y se puede
 * congelar. El criterio vive en `shared/lib/congelar.ts`; aquí solo se pinta.
 *
 * Dos frases y las dos son seguridad, así que van secas. La primera dice por qué sale
 * el aviso. La segunda es lo que hay que saber ANTES de congelar, y es la misma que
 * lleva el botón «Descongelar»: esa solo se ve cuando ya está congelado, y entonces
 * es tarde para decidir. No dice que lo congelado «aguante» ni que esté bueno.
 *
 * Es un recuadro y no un botón: congelar sigue siendo la acción de abajo.
 */
export function AvisoCongelar({ item }: { item: ItemDetail }) {
  const styles = useStyles();
  const c = useTheme();

  if (!recomendarCongelar(item)) return null;

  return (
    <View style={styles.caja}>
      <Snowflake size={18} color={c.frostInk} weight="duotone" style={styles.icono} />
      <View style={styles.textos}>
        <Text style={styles.titulo}>Le queda poco plazo. Congélalo o úsalo.</Text>
        <Text style={styles.detalle}>Una vez descongelado, 24 horas para consumirlo.</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  caja: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: c.frostSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  icono: { marginTop: 1 },
  textos: { flex: 1, minWidth: 0, gap: 2 },
  titulo: { fontSize: 14, fontWeight: '700', color: c.frostInk },
  detalle: { fontSize: 13, lineHeight: 18, color: c.frostInk },
}));
