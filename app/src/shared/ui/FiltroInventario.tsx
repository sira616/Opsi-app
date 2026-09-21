import { Pressable, ScrollView, Text, View } from 'react-native';

import { FunnelSimple, X } from 'phosphor-react-native';

import type { PriorityItem } from '@/api/inventory';
import { CATEGORIAS, etiquetaCategoria, type Categoria } from '@/shared/lib/categorias';
import { IconoCategoria } from '@/shared/lib/categorias-iconos';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

/**
 * Abierto o cerrado.
 *
 * No es un estado del elemento sino una fecha: `opened_at`. Lo abierto no se
 * vuelve a cerrar, y por eso no hay un estado «cerrado» en el enum. Mirar la
 * fecha en vez de inventarse una lista de estados evita que «descongelado» o
 * «medio usado» se queden fuera de las dos cajas.
 */
export type Apertura = 'todo' | 'abiertos' | 'cerrados';

export type Filtro = {
  apertura: Apertura;
  /** null es «todos los pasillos», que es lo de siempre. */
  categoria: Categoria | null;
};

export const FILTRO_VACIO: Filtro = { apertura: 'todo', categoria: null };

export function estaAbierto(item: PriorityItem): boolean {
  return item.opened_at !== null;
}

export function filtroActivo(filtro: Filtro): boolean {
  return filtro.apertura !== 'todo' || filtro.categoria !== null;
}

export function aplicarFiltro(items: PriorityItem[], filtro: Filtro): PriorityItem[] {
  return items.filter((item) => {
    if (filtro.apertura === 'abiertos' && !estaAbierto(item)) return false;
    if (filtro.apertura === 'cerrados' && estaAbierto(item)) return false;
    if (filtro.categoria !== null && item.category !== filtro.categoria) return false;
    return true;
  });
}

const APERTURAS: { valor: Apertura; etiqueta: string }[] = [
  { valor: 'todo', etiqueta: 'Todo' },
  { valor: 'abiertos', etiqueta: 'Abiertos' },
  { valor: 'cerrados', etiqueta: 'Sin abrir' },
];

/**
 * La barra de filtros del inventario.
 *
 * Dos decisiones que la mantienen usable en un móvil:
 *
 *   · **Por defecto no filtra nada.** «Consumir primero» ordenado por urgencia
 *     es la pantalla que hay que ver al abrir la app; el filtro es para cuando
 *     buscas algo concreto, que es la excepción.
 *   · **Solo se ofrecen los pasillos que existen.** Enseñar «Pescado» cuando no
 *     hay ninguno es prometer una lista vacía. La fila se acorta sola según lo
 *     que tengas guardado.
 */
export function FiltroInventario({
  items,
  filtro,
  onChange,
}: {
  items: PriorityItem[];
  filtro: Filtro;
  onChange: (filtro: Filtro) => void;
}) {
  const styles = useStyles();
  const c = useTheme();

  const abiertos = items.filter(estaAbierto).length;
  const cuenta: Record<Apertura, number> = {
    todo: items.length,
    abiertos,
    cerrados: items.length - abiertos,
  };

  // Se respeta el orden del supermercado de CATEGORIAS, no el de llegada de
  // los datos: una fila de filtros que se reordena sola es un sitio donde no
  // se aprende dónde estaba nada.
  const presentes = CATEGORIAS.map((cat) => cat.valor).filter((valor) =>
    items.some((item) => item.category === valor),
  );

  return (
    <View style={styles.wrapper}>
      <View style={styles.aperturas}>
        {APERTURAS.map(({ valor, etiqueta }) => {
          const on = filtro.apertura === valor;
          return (
            <Pressable
              key={valor}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${etiqueta}, ${cuenta[valor]}`}
              onPress={() => onChange({ ...filtro, apertura: valor })}
              style={[styles.apertura, on && styles.aperturaOn]}
            >
              <Text style={[styles.aperturaText, on && styles.aperturaTextOn]} numberOfLines={1}>
                {etiqueta}
              </Text>
              <Text style={[styles.cuenta, on && styles.cuentaOn]}>{cuenta[valor]}</Text>
            </Pressable>
          );
        })}
      </View>

      {presentes.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fila}>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ selected: filtro.categoria === null }}
            accessibilityLabel="Todos los pasillos"
            onPress={() => onChange({ ...filtro, categoria: null })}
            style={[styles.pasillo, filtro.categoria === null && styles.pasilloOn]}
          >
            <FunnelSimple
              size={14}
              color={filtro.categoria === null ? c.brand : c.inkMuted}
              weight="duotone"
            />
            <Text
              style={[styles.pasilloText, filtro.categoria === null && styles.pasilloTextOn]}
            >
              Todo
            </Text>
          </Pressable>

          {presentes.map((valor) => {
            const on = filtro.categoria === valor;
            return (
              <Pressable
                key={valor}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={etiquetaCategoria(valor)}
                onPress={() => onChange({ ...filtro, categoria: on ? null : valor })}
                style={[styles.pasillo, on && styles.pasilloOn]}
              >
                <IconoCategoria
                  categoria={valor}
                  size={14}
                  color={on ? c.brand : c.inkMuted}
                  weight="duotone"
                />
                <Text style={[styles.pasilloText, on && styles.pasilloTextOn]}>
                  {etiquetaCategoria(valor)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {filtroActivo(filtro) ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onChange(FILTRO_VACIO)}
          style={styles.limpiar}
        >
          <X size={12} color={c.inkMuted} weight="bold" />
          <Text style={styles.limpiarText}>Quitar el filtro</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrapper: { gap: space.sm },

  aperturas: {
    flexDirection: 'row',
    gap: 3,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
  },
  apertura: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: touchTarget - 8,
    borderRadius: radius.sm + 2,
  },
  aperturaOn: { backgroundColor: c.surface },
  aperturaText: { fontFamily: fonts.semibold, fontSize: 13, color: c.inkMuted },
  aperturaTextOn: { color: c.ink },
  cuenta: { fontFamily: fonts.semibold, fontSize: 11, color: c.inkFaint },
  cuentaOn: { color: c.brand },

  fila: { gap: space.sm - 3, paddingRight: space.lg },
  pasillo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: 34,
    paddingHorizontal: space.md - 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  pasilloOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  pasilloText: { fontFamily: fonts.semibold, fontSize: 12.5, color: c.inkMuted },
  pasilloTextOn: { color: c.brandInk },

  limpiar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    minHeight: 30,
  },
  limpiarText: { fontSize: 12, fontWeight: '600', color: c.inkMuted },
}));
