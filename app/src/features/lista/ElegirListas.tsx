import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Check } from 'phosphor-react-native';

import { fetchListas, type Lista } from '@/api/lista';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

import { describirLista, listaPorDefecto } from './listas';

/**
 * Qué listas hay y cuáles están elegidas, para apuntar algo en una o en varias de un toque.
 *
 * Son TODAS las listas de la cuenta —las individuales y las compartidas de cada nevera—, no
 * las de la nevera que se esté mirando: una lista individual se usa desde cualquier nevera, y
 * quien tiene una compartida en otra nevera puede querer apuntar ahí.
 *
 * La elección por omisión (`listaPorDefecto`) es la primera compartida de la nevera de la que
 * sale lo que se apunta y, si no hay, la individual principal: quien no toca nada apunta donde
 * siempre. Es estado DERIVADO —lo elegido, o la lista por omisión si aún no se ha elegido
 * nada— y no un valor que se rellene con un efecto cuando llegan las listas.
 */
export function useListasElegidas(neveraId: string | null) {
  const consulta = useQuery({ queryKey: queryKeys.listas, queryFn: fetchListas });
  // Lo elegido va ligado a la NEVERA para la que se eligió: si se cambia de nevera, lo
  // elegido en la anterior no vale y se vuelve a la lista por omisión.
  const [seleccion, setSeleccion] = useState<{ para: string | null; ids: string[] } | null>(null);

  const listas = useMemo(() => consulta.data ?? [], [consulta.data]);
  const porDefecto = listaPorDefecto(listas, neveraId)?.id;
  const elegidas = seleccion && seleccion.para === neveraId ? seleccion.ids : null;
  // Lo elegido que ya no existe (se borró la lista) se descarta.
  const validas = (elegidas ?? (porDefecto ? [porDefecto] : [])).filter((id) =>
    listas.some((l) => l.id === id),
  );

  function alternar(id: string) {
    setSeleccion((actual) => {
      const previas = actual && actual.para === neveraId ? actual.ids : null;
      const base = previas ?? (porDefecto ? [porDefecto] : []);
      return {
        para: neveraId,
        ids: base.includes(id) ? base.filter((x) => x !== id) : [...base, id],
      };
    });
  }

  return {
    listas,
    elegidas: validas,
    /** Las listas elegidas enteras, que es lo que hace falta para apuntar (su id y su nevera). */
    destinos: listas.filter((l) => validas.includes(l.id)),
    alternar,
    cargando: consulta.isPending,
    error: consulta.error ? describeDbError(consulta.error) : null,
  };
}

type Props = {
  listas: Lista[];
  elegidas: string[];
  onAlternar: (id: string) => void;
  /** Para decir de qué nevera es cada compartida. */
  neveras: readonly { id: string; name: string }[];
};

/** Las listas con una casilla cada una: primero las individuales, luego las compartidas. */
export function ElegirListas({ listas, elegidas, onAlternar, neveras }: Props) {
  const styles = useStyles();
  const c = useTheme();

  // Estable: las individuales delante sin mover el orden de antigüedad dentro de cada tipo.
  const ordenadas = [...listas].sort((a, b) => Number(a.kind === 'shared') - Number(b.kind === 'shared'));

  return (
    <View style={styles.cuerpo}>
      {ordenadas.map((lista) => {
        const on = elegidas.includes(lista.id);
        return (
          <Pressable
            key={lista.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${lista.name}, ${describirLista(lista, neveras)}`}
            onPress={() => onAlternar(lista.id)}
            style={({ pressed }) => [styles.fila, on && styles.filaOn, pressed && styles.pulsado]}
          >
            <View style={[styles.casilla, on && styles.casillaOn]}>
              {on ? <Check size={14} color={c.onBrand} weight="bold" /> : null}
            </View>
            <View style={styles.texto}>
              <Text style={[styles.nombre, on && styles.nombreOn]} numberOfLines={1}>
                {lista.name}
              </Text>
              <Text style={styles.tipo} numberOfLines={1}>
                {describirLista(lista, neveras)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Mientras llegan las listas. */
export function CargandoListas() {
  const c = useTheme();
  return <ActivityIndicator color={c.brand} />;
}

const useStyles = makeStyles((c) => ({
  cuerpo: { gap: space.sm },
  fila: {
    minHeight: touchTarget + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  filaOn: { borderColor: c.brand, backgroundColor: c.brandSoft },
  pulsado: { opacity: 0.75 },
  casilla: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  casillaOn: { backgroundColor: c.brand, borderColor: c.brand },
  texto: { flex: 1, minWidth: 0, gap: 1 },
  nombre: { fontFamily: fonts.medium, fontSize: 15, color: c.ink },
  nombreOn: { fontFamily: fonts.semibold, color: c.brandInk },
  tipo: { fontSize: 12, color: c.inkMuted },
}));
