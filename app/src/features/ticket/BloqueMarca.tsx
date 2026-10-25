import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { CheckCircle, MagnifyingGlass, Question, Tag } from 'phosphor-react-native';

import { fonts, makeStyles, radius, space, useTheme } from '@/shared/theme/tokens';

import type { LineaRevision } from './lineas';
import { indicador, marcaMostrada, opcionesDisponibles, textoTamano } from './marcas';

/** De dónde viene una sugerencia, dicho como lo entiende quien la lee. */
export function nombreDeFuente(fuente: string): string {
  if (fuente === 'historial') return 'lo que confirmaste';
  if (fuente === 'catalogo') return 'el catálogo de Opsi';
  if (fuente === 'off') return 'Open Food Facts';
  if (fuente.startsWith('supermercado')) return 'el catálogo del supermercado';
  return 'una fuente externa';
}

/** «mercadona» → «Mercadona»: las fichas de la comunidad traen las marcas en minúsculas a veces. */
export function marcaLegible(marca: string): string {
  return marca === marca.toLowerCase() ? marca.charAt(0).toUpperCase() + marca.slice(1) : marca;
}

type Props = {
  linea: LineaRevision;
  onConfirmar: () => void;
  onAbrir: () => void;
  onBuscar: () => void;
};

/**
 * La marca de una fila del ticket: lo que se propone, de qué fuente y con qué seguridad, y lo que se puede
 * hacer con ello (confirmar, cambiar, elegir otra, buscarla). Nunca obliga a nada: «Marca sin identificar»
 * es un estado normal y no impide guardar.
 */
export function BloqueMarca({ linea, onConfirmar, onAbrir, onBuscar }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const ind = indicador(linea);
  const marca = marcaMostrada(linea);
  const e = linea.eleccion;
  const opciones = opcionesDisponibles(linea);
  const nombre = linea.nombre.trim();
  const buscando = ind.nivel === 'buscando';

  const candidato = e?.tipo === 'candidato' ? e.candidato : null;
  const detalle = candidato
    ? [candidato.nombre, textoTamano(candidato.tamano), nombreDeFuente(candidato.fuente)].filter(Boolean).join(' · ')
    : null;

  const puedeBuscar = !buscando && nombre !== '' && (linea.busqueda === 'fallida' || linea.busqueda === 'no_aplica');
  const etiqueta = buscando ? ind.texto : marca !== null ? marcaLegible(marca) : candidato ? 'Sin marca en la ficha' : 'Marca sin identificar';
  const textoAbrir = e?.tipo === 'candidato' || e?.tipo === 'manual' ? 'Cambiar' : opciones > 0 ? `Elegir (${opciones})` : 'Añadir marca';

  return (
    <View style={styles.bloque}>
      <View style={styles.linea}>
        {buscando ? (
          <ActivityIndicator size="small" color={c.inkMuted} />
        ) : marca !== null ? (
          <Tag size={14} color={ind.nivel === 'fiable' ? c.brandInk : c.inkMuted} weight="duotone" />
        ) : (
          <Question size={14} color={c.inkFaint} weight="regular" />
        )}
        <Text
          style={[styles.marca, marca === null && styles.marcaVacia, ind.nivel === 'fiable' && marca !== null && styles.marcaFiable]}
          numberOfLines={1}
          accessibilityLabel={marca !== null ? `Marca: ${etiqueta}. ${ind.texto}` : etiqueta}
        >
          {etiqueta}
        </Text>
        {!buscando && marca !== null ? (
          <View style={[styles.etiqueta, ind.nivel === 'fiable' ? styles.etiquetaFiable : styles.etiquetaSugerida]}>
            {ind.nivel === 'fiable' ? <CheckCircle size={11} color={c.brandInk} weight="fill" /> : null}
            <Text style={[styles.etiquetaTexto, ind.nivel === 'fiable' && { color: c.brandInk }]}>{ind.nivel === 'fiable' ? 'Fiable' : 'Sugerida'}</Text>
          </View>
        ) : null}
      </View>

      {/* Lo que se dijo con la marca: qué producto es, de dónde sale. Solo si hay algo que decir. */}
      {!buscando && detalle !== null ? <Text style={styles.detalle} numberOfLines={2}>{detalle}</Text> : null}
      {!buscando && ind.nivel === 'dudosa' ? <Text style={styles.detalle}>No me atrevo a elegir sola: mira las opciones.</Text> : null}
      {!buscando && ind.nivel === 'ninguna' && linea.busqueda === 'fallida' ? (
        <Text style={styles.detalle}>No he podido consultarlo ahora. Puedes volver a intentarlo.</Text>
      ) : null}

      {!buscando && !linea.guardada ? (
        <View style={styles.acciones}>
          {ind.nivel === 'sugerida' ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Confirmar esta marca" onPress={onConfirmar} hitSlop={8} style={[styles.accion, styles.accionPrimaria]}>
              <Text style={styles.accionPrimariaTexto}>Confirmar</Text>
            </Pressable>
          ) : null}
          {linea.busqueda !== 'no_aplica' || e !== undefined ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${textoAbrir} la marca`} onPress={onAbrir} hitSlop={8} style={styles.accion}>
              <Text style={styles.accionTexto}>{textoAbrir}</Text>
            </Pressable>
          ) : null}
          {puedeBuscar ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Buscar la marca de este producto" onPress={onBuscar} hitSlop={8} style={[styles.accion, styles.accionBuscar]}>
              <MagnifyingGlass size={13} color={c.brandInk} weight="bold" />
              <Text style={styles.accionTexto}>Buscar marca</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bloque: { gap: 3, paddingTop: 2 },
  linea: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, minHeight: 20 },
  marca: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 13, color: c.inkMuted },
  marcaVacia: { color: c.inkFaint, fontFamily: fonts.body },
  marcaFiable: { color: c.brandInk },
  etiqueta: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill },
  etiquetaFiable: { backgroundColor: c.brandSoft },
  etiquetaSugerida: { borderWidth: 1, borderColor: c.borderStrong },
  etiquetaTexto: { fontFamily: fonts.medium, fontSize: 10.5, color: c.inkMuted },
  detalle: { fontSize: 11.5, lineHeight: 15, color: c.inkMuted },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingTop: 2 },
  accion: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 32, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: c.surfaceAlt },
  accionPrimaria: { backgroundColor: c.brandSoft },
  accionBuscar: { backgroundColor: c.brandSoft },
  accionTexto: { fontFamily: fonts.semibold, fontSize: 12.5, color: c.inkMuted },
  accionPrimariaTexto: { fontFamily: fonts.semibold, fontSize: 12.5, color: c.brandInk },
}));
