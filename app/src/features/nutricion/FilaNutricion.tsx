import { Pressable, Text, View } from 'react-native';

import type { ProductoConocido } from '@/api/premium';
import { IconoComida } from '@/shared/lib/iconos-comida';
import {
  SIN_DATOS,
  SIN_SELLOS,
  hayDatos,
  resumenNutricion,
  type Nutricion,
} from '@/shared/lib/nutricion';
import { fonts, makeStyles, radius, space, tabular, useTheme } from '@/shared/theme/tokens';

import { FichaNutriScore } from './SelloNutriScore';

/** Cómo va la consulta de la nutrición de la lista. */
export type EstadoNutricion = 'cargando' | 'listo' | 'error';

type Props = {
  producto: ProductoConocido;
  /** Lo que devolvió el servidor para este producto. Sin nada: no consta. */
  nutricion: Nutricion | undefined;
  estado: EstadoNutricion;
  onPress: (producto: ProductoConocido) => void;
};

/**
 * Una fila de la lista de nutrición: el producto, su Nutri-Score en pequeño si lo hay y su
 * grupo NOVA.
 *
 * Sin datos dice «Sin datos nutricionales»: ni una letra inventada ni un cero. Un producto
 * hecho a mano (sin ficha de catálogo) no tiene nada que consultar y no se puede pulsar.
 * Mientras la nutrición carga, o si falló, la fila no dice nada de ella: «cargando» y «no
 * consta» no son lo mismo y callar es lo único que no miente.
 */
export function FilaNutricion({ producto: p, nutricion, estado, onPress }: Props) {
  const styles = useStyles();
  const c = useTheme();

  const conFicha = p.productoId !== null;
  const datos = nutricion !== undefined && hayDatos(nutricion) ? nutricion : null;
  const nova = datos?.nova ?? null;
  const grado = datos?.nutriscore ?? null;
  const resuelta = !conFicha || estado === 'listo';

  const secundaria = !resuelta
    ? null
    : datos === null
      ? SIN_DATOS
      : nova === null && grado === null
        ? SIN_SELLOS
        : null;

  const contenido = (
    <>
      <View style={styles.avatar}>
        <IconoComida nombre={p.nombre} size={22} color={c.brand} weight="duotone" />
      </View>
      <View style={styles.texto}>
        <Text style={styles.nombre} numberOfLines={1}>
          {p.nombre}
        </Text>
        {p.marca ? (
          <Text style={styles.marca} numberOfLines={1}>
            {p.marca}
          </Text>
        ) : null}
        {nova !== null ? (
          <View style={styles.pastilla}>
            <Text style={styles.pastillaTexto}>NOVA {nova}</Text>
          </View>
        ) : null}
        {secundaria !== null ? <Text style={styles.sinDatos}>{secundaria}</Text> : null}
      </View>
      {grado !== null ? <FichaNutriScore grado={grado} /> : null}
    </>
  );

  // Hecho a mano: nada que abrir, y no se finge que se pueda.
  if (!conFicha) {
    return (
      <View accessible accessibilityLabel={`${p.nombre}. ${resumenNutricion(undefined)}`} style={styles.fila}>
        {contenido}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver la nutrición de ${p.nombre}${
        resuelta ? `. ${resumenNutricion(nutricion)}` : ''
      }`}
      onPress={() => onPress(p)}
      style={({ pressed }) => [styles.fila, pressed && styles.pulsado]}
    >
      {contenido}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  fila: {
    minHeight: 44 + space.md * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  pulsado: { opacity: 0.75 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  texto: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.semibold, fontSize: 15, color: c.ink },
  marca: { fontSize: 12.5, color: c.inkMuted },
  // NOVA en neutro: es una clasificación, no un semáforo.
  pastilla: {
    alignSelf: 'flex-start',
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
  },
  pastillaTexto: { ...tabular, fontFamily: fonts.semibold, fontSize: 11, color: c.inkMuted },
  sinDatos: { fontSize: 12.5, lineHeight: 17, color: c.inkMuted, marginTop: 2 },
}));
