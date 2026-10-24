import { Pressable, Text, View, ActivityIndicator } from 'react-native';

import { JarLabel } from 'phosphor-react-native';

import { ErrorBusqueda } from '@/api/catalogo';
import type { ProductoCatalogo } from '@/api/inventory';
import { Nota } from '@/features/ajustes/ui';
import { describeDbError } from '@/shared/lib/db-errors';
import { SIN_DATOS, hayDatos } from '@/shared/lib/nutricion';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { fonts, makeStyles, space, touchTarget, useTheme } from '@/shared/theme/tokens';

import { DatosNutricion, PieNutricion } from './DatosNutricion';
import { esFalloDePlan, useNutricionProducto } from './useNutricion';

/**
 * La nutrición de un producto del catálogo: su Nutri-Score, su grupo NOVA, la tabla por 100 g
 * o 100 ml, la ración y los aditivos, tal y como los declara Open Food Facts (OFF).
 *
 * Es el CONTENIDO, sin pantalla ni hoja alrededor, y existe aparte por lo mismo que
 * `ContenidoIngredientes`: lo enseñan la pantalla de detalle y la hoja de la ficha de un
 * producto, y en iOS dos hojas a la vez no se presentan; la ficha lo pinta en su lugar,
 * con su propio «Atrás».
 *
 * ── Una ficha antigua se renueva al abrir ─────────────────────────────────
 *
 * Una ficha anterior a estos datos no tiene fila de nutrición. Abrir el detalle de un
 * producto de OFF con código la renueva (`useNutricionProducto`): una consulta a
 * `lookup-barcode`, que GASTA CUOTA, sin reintento automático. Si sigue sin haber datos, se
 * dice y hay un «Reintentar» que es de la persona. El listado no renueva nada.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────
 *
 *   · No opina. Opsi no es nutricionista: ni «sano», ni «poco sano», ni cuánto conviene
 *     comer. Datos con su origen (docs/VOZ.md).
 *   · No inventa. Sin fila, o con la fila vacía, es «Sin datos nutricionales» y nada más:
 *     ni escala, ni tabla de guiones, ni un cero.
 *   · No sabe el plan. Si el servidor dice que esto es de Premium (un plan caducado, por
 *     ejemplo), se enseña SU mensaje, tal cual y sin rojo (docs/VOZ.md §7).
 */

function mensajeDeError(error: unknown): string {
  // El mensaje de la función ya viene escrito en español y dice qué hacer: tal cual.
  return error instanceof ErrorBusqueda ? error.message : describeDbError(error);
}

export function ContenidoNutricion({ productoId }: { productoId: string }) {
  const styles = useStyles();
  const c = useTheme();
  const consulta = useNutricionProducto(productoId);

  if (consulta.isPending) {
    return <ActivityIndicator color={c.brand} style={styles.cargando} />;
  }

  if (consulta.isError) {
    // Que el plan no llega es un aviso, no un fallo: el mensaje es del servidor y va sin rojo.
    if (esFalloDePlan(consulta.error)) {
      return <Nota texto={describeDbError(consulta.error)} tono="aviso" alerta />;
    }
    return (
      <View style={styles.bloque}>
        <ErrorNote message={mensajeDeError(consulta.error)} />
        <Button label="Reintentar" onPress={() => void consulta.refetch()} loading={consulta.isFetching} />
      </View>
    );
  }

  const { producto, nutricion, renovable } = consulta.data;
  if (!producto) return <Text style={styles.texto}>Su ficha ya no está.</Text>;

  return (
    <View style={styles.bloque}>
      <Cabecera producto={producto} />
      {nutricion !== null && hayDatos(nutricion) ? (
        <DatosNutricion nutricion={nutricion} />
      ) : (
        <View style={styles.sinDatos}>
          <Text style={styles.sinDatosTexto}>{SIN_DATOS}</Text>
          {/* Con la fila vacía OFF ya se consultó y no declara nada: volver a pedirlo no
              cambiaría nada. «Reintentar» es para cuando NO hay fila y se puede renovar. */}
          {nutricion === null && renovable ? (
            <Button label="Reintentar" onPress={() => void consulta.refetch()} loading={consulta.isFetching} />
          ) : null}
        </View>
      )}
      <PieNutricion />
    </View>
  );
}

function Cabecera({ producto }: { producto: ProductoCatalogo }) {
  const styles = useStyles();
  return (
    <View style={styles.cabecera}>
      <Text accessibilityRole="header" style={styles.nombre}>
        {producto.name}
      </Text>
      {producto.brand ? <Text style={styles.marca}>{producto.brand}</Text> : null}
    </View>
  );
}

/** El botón de «Ver nutrición», solo, para quien lo pone dentro de una hoja. */
export function BotonNutricion({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ver nutrición"
      onPress={onPress}
      style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
    >
      <JarLabel size={18} color={c.brand} weight="bold" />
      <Text style={styles.botonTexto}>Ver nutrición</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  cargando: { paddingVertical: space.xl },
  bloque: { gap: space.lg },
  cabecera: { gap: 2 },
  nombre: { fontFamily: fonts.displaySemi, fontSize: 22, lineHeight: 27, color: c.ink },
  marca: { fontSize: 13.5, color: c.inkMuted },
  texto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  sinDatos: { gap: space.sm },
  sinDatosTexto: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: c.ink },

  boton: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm - 2,
  },
  pulsado: { opacity: 0.7 },
  botonTexto: { fontSize: 14.5, fontWeight: '600', color: c.brand },
}));
