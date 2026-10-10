import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { fetchMisNeveras, type Nevera } from '@/api/household';
import { queryKeys } from '@/shared/lib/query';
import { useSession } from '@/shared/lib/session';

/**
 * La nevera que estás mirando.
 *
 * Una persona tiene varias —la suya, privada, y las compartidas que quiera— y
 * hace falta UNA «activa» de la que sale todo lo demás: la lista de «Consumir
 * primero», dónde cae un alta nueva, de quién es el historial. Vive aquí, en un
 * proveedor, y no repartida por las pantallas: si cada una eligiera la suya con
 * su propio `find`, dos pantallas abiertas a la vez podrían discrepar.
 *
 * ── Qué se guarda y dónde ─────────────────────────────────────────────────
 *
 * Solo el ID de la nevera elegida, en el DISPOSITIVO (AsyncStorage) y no en la
 * cuenta, por lo mismo que el aspecto (ver `tokens.tsx`): es una preferencia del
 * aparato —el móvil en «mi casa» y la tableta de la cocina en «el piso» es
 * razonable—, funciona sin conexión y no necesitó una migración.
 *
 * La clave lleva el id DE LA PERSONA (`opsi.neveraActiva.<userId>`). Con una
 * sola clave global, dos cuentas en el mismo móvil —en desarrollo, `syreta` y
 * `compi`— se pisarían la elección la una a la otra; con una por persona, cada
 * una recuerda la suya y no hay nada que borrar al cerrar sesión. No es una
 * medida de seguridad: lo que la garantiza es la validación de más abajo.
 *
 * ── Lo que se guarda NO se cree ───────────────────────────────────────────
 *
 * El id guardado se valida contra `my_households()` cada vez, y si ya no
 * pertenece a la persona —salió de esa nevera, la echaron, es de otra cuenta—
 * se vuelve a la privada. Guardar un id es una petición de «llévame ahí», no
 * un derecho: el servidor es quien sabe a qué neveras perteneces, y la privada
 * existe siempre, así que siempre hay adónde volver.
 *
 * Un id que ya no vale NO se borra del disco: simplemente no se usa. Borrarlo
 * exigiría decidir cuándo la lista es lo bastante fresca para fiarse de ella
 * —una caché vieja puede no conocer aún una nevera recién creada, y borrar por
 * eso tiraría justo la elección que se acaba de hacer—, y no compensa: si la
 * persona vuelve a entrar en esa nevera, que vuelva a ser la activa es lo que
 * quien la eligió querría, y en cualquier otro caso el siguiente cambio de
 * nevera sobrescribe el valor.
 *
 * ── Qué pasa al cambiar ───────────────────────────────────────────────────
 *
 * Todas las consultas de inventario llevan el id de la nevera en la clave (ver
 * `queryKeys`), así que cambiar de nevera nunca enseña lo de la anterior. Aun
 * así se marca todo el inventario como rancio: la nevera a la que vuelves puede
 * llevar en caché un rato y otra persona haber tocado cosas mientras tanto.
 * Se marca y no se recarga en el acto (`refetchType: 'none'`), porque lo único
 * que se recargaría sería la lista de la nevera que se acaba de dejar.
 */

type Estado = {
  /** Todas las mías, con la privada la primera. Vacía mientras carga. */
  neveras: Nevera[];
  /**
   * La que estoy mirando. Es null solo mientras carga, si falla, o si no hay
   * ninguna —una sesión huérfana—: por eso la puerta de `(app)/_layout.tsx` no
   * monta ninguna pantalla hasta que existe, y las pantallas usan
   * `useNeveraActual()`, que ya la da sin null.
   */
  activa: Nevera | null;
  /** Cambia de nevera. Ignora un id que no sea de una nevera mía. */
  cambiar: (id: string) => void;
  /** Leyendo el disco o la lista de neveras por primera vez. */
  cargando: boolean;
  /**
   * El fallo de la primera carga, y solo ese. Si ya hay una lista y un
   * refresco posterior falla, NO es un error: sacar a alguien a una pantalla de
   * «sin conexión» por un refresco en segundo plano sería castigarle por tener
   * datos.
   */
  error: unknown;
  reintentar: () => void;
};

const NeveraActivaContext = createContext<Estado | null>(null);

const PREFIJO_CLAVE = 'opsi.neveraActiva.';

/** La misma lista vacía siempre: una nueva en cada render rompería los `useMemo`. */
const SIN_NEVERAS: Nevera[] = [];

/**
 * Lo que se sabe de lo guardado en el disco, atado a QUÉ clave se leyó.
 *
 * Con la clave dentro, un valor leído para otra persona se ignora solo, sin
 * tener que borrar estado a mano cuando cambia la sesión.
 */
type Leida = { clave: string; id: string | null };

export function NeveraActivaProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const usuario = session?.user.id ?? null;
  const clave = usuario ? `${PREFIJO_CLAVE}${usuario}` : null;
  const queryClient = useQueryClient();

  // Sin reintentos: es la misma comprobación que antes hacía el layout con el
  // hogar, y un servidor apagado tiene que ver «Sin conexión» al momento, no
  // tras dos intentos más.
  const lista = useQuery({
    queryKey: queryKeys.neveras,
    queryFn: fetchMisNeveras,
    enabled: usuario !== null,
    retry: false,
  });

  const [leida, setLeida] = useState<Leida | null>(null);
  // undefined = todavía no he leído el disco; null = leído y no hay nada.
  const elegida = leida !== null && leida.clave === clave ? leida.id : undefined;

  useEffect(() => {
    if (!clave) return;
    let vivo = true;
    void AsyncStorage.getItem(clave)
      .then((guardada) => {
        if (vivo) setLeida({ clave, id: guardada });
      })
      // Si el almacenamiento falla —modo incógnito, permisos— se sigue con la
      // privada. Quedarse esperando a un disco que no contesta sería peor.
      .catch(() => {
        if (vivo) setLeida({ clave, id: null });
      });
    return () => {
      vivo = false;
    };
  }, [clave]);

  const neveras = lista.data ?? SIN_NEVERAS;

  const activa = useMemo<Nevera | null>(() => {
    if (neveras.length === 0) return null;
    return (
      neveras.find((n) => n.id === elegida) ??
      // La privada va primera en la lista, pero se busca por lo que ES y no por
      // dónde está: el orden es un detalle del servidor.
      neveras.find((n) => n.kind === 'personal') ??
      neveras[0] ??
      null
    );
  }, [neveras, elegida]);

  const cambiar = useCallback(
    (id: string) => {
      if (!clave) return;
      // Se valida contra lo último que se sabe, leído AHORA y no del render que
      // creó esta función: quien acaba de crear una nevera la mete en la caché
      // justo antes de llamar aquí.
      const conocidas = queryClient.getQueryData<Nevera[]>(queryKeys.neveras) ?? [];
      if (!conocidas.some((n) => n.id === id)) return;

      void queryClient.invalidateQueries({ queryKey: queryKeys.inventario, refetchType: 'none' });
      setLeida({ clave, id });
      void AsyncStorage.setItem(clave, id).catch(() => {});
    },
    [clave, queryClient],
  );

  const { refetch } = lista;
  const reintentar = useCallback(() => void refetch(), [refetch]);

  const valor = useMemo<Estado>(
    () => ({
      neveras,
      activa,
      cambiar,
      cargando: usuario !== null && (lista.isPending || elegida === undefined),
      error: lista.data ? null : lista.error,
      reintentar,
    }),
    [neveras, activa, cambiar, usuario, lista.isPending, lista.data, lista.error, elegida, reintentar],
  );

  return <NeveraActivaContext value={valor}>{children}</NeveraActivaContext>;
}

/**
 * El estado completo, con su carga y su error. Es para QUIEN DECIDE si se puede
 * pintar algo: la puerta de `(app)/_layout.tsx`. Las pantallas quieren
 * `useNeveraActual()`.
 */
export function useNeveraActiva(): Estado {
  const valor = use(NeveraActivaContext);
  if (!valor) throw new Error('useNeveraActiva se ha usado fuera de <NeveraActivaProvider>');
  return valor;
}

/**
 * La nevera que se está mirando, ya SIN null, con la lista para cambiar.
 *
 * Es lo que usa cualquier pantalla de dentro de `(app)`: la puerta de su layout
 * no monta nada hasta que hay nevera, así que aquí siempre la hay. Si algún día
 * se usa fuera de esa puerta, lanza en vez de devolver un null que alguien
 * acabaría asumiendo que no puede pasar.
 */
export function useNeveraActual(): {
  neveras: Nevera[];
  activa: Nevera;
  cambiar: (id: string) => void;
} {
  const { neveras, activa, cambiar } = useNeveraActiva();
  if (!activa) {
    throw new Error(
      'useNeveraActual se ha usado sin nevera activa: solo vale dentro de la puerta de (app)/_layout.tsx',
    );
  }
  return { neveras, activa, cambiar };
}
