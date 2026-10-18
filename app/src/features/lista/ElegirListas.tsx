import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Check } from 'phosphor-react-native';

import { fetchListas, type Lista } from '@/api/lista';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

/**
 * Qué listas de una nevera hay y cuáles están elegidas, para apuntar algo en una o en
 * varias de un toque.
 *
 * La elección por omisión es la lista principal (la más antigua): quien no toca nada
 * apunta donde siempre. Es estado DERIVADO —lo elegido, o la principal si aún no se ha
 * elegido nada— y no un valor que se rellene con un efecto cuando llegan las listas.
 */
export function useListasElegidas(householdId: string) {
  const consulta = useQuery({
    queryKey: queryKeys.listasDe(householdId),
    queryFn: () => fetchListas(householdId),
  });
  // Lo elegido va ligado a la NEVERA para la que se eligió: si se cambia de nevera, lo
  // elegido en la anterior no vale y se vuelve a la principal.
  const [seleccion, setSeleccion] = useState<{ para: string; ids: string[] } | null>(null);

  const listas = consulta.data ?? [];
  const principal = listas[0]?.id;
  const elegidas = seleccion && seleccion.para === householdId ? seleccion.ids : null;
  // Lo elegido que ya no existe (se borró la lista) se descarta.
  const validas = (elegidas ?? (principal ? [principal] : [])).filter((id) =>
    listas.some((l) => l.id === id),
  );

  function alternar(id: string) {
    setSeleccion((actual) => {
      const previas = actual && actual.para === householdId ? actual.ids : null;
      const base = previas ?? (principal ? [principal] : []);
      return {
        para: householdId,
        ids: base.includes(id) ? base.filter((x) => x !== id) : [...base, id],
      };
    });
  }

  return {
    listas,
    elegidas: validas,
    alternar,
    cargando: consulta.isPending,
    error: consulta.error ? describeDbError(consulta.error) : null,
  };
}

type Props = {
  listas: Lista[];
  elegidas: string[];
  onAlternar: (id: string) => void;
};

/** Las listas con una casilla cada una. */
export function ElegirListas({ listas, elegidas, onAlternar }: Props) {
  const styles = useStyles();
  const c = useTheme();

  return (
    <View style={styles.cuerpo}>
      {listas.map((lista) => {
        const on = elegidas.includes(lista.id);
        return (
          <Pressable
            key={lista.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={lista.name}
            onPress={() => onAlternar(lista.id)}
            style={({ pressed }) => [styles.fila, on && styles.filaOn, pressed && styles.pulsado]}
          >
            <View style={[styles.casilla, on && styles.casillaOn]}>
              {on ? <Check size={14} color={c.onBrand} weight="bold" /> : null}
            </View>
            <Text style={[styles.nombre, on && styles.nombreOn]} numberOfLines={1}>
              {lista.name}
            </Text>
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
  nombre: { flex: 1, fontFamily: fonts.medium, fontSize: 15, color: c.ink },
  nombreOn: { fontFamily: fonts.semibold, color: c.brandInk },
}));
