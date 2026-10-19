/**
 * Los ganchos de salud: qué evita la persona y qué lleva un producto.
 *
 * Los tres son lectura. Nada de aquí escribe ni manda las preferencias a ningún sitio:
 * se leen de su tabla, viven en la caché en memoria y se cruzan al pintar.
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchProducto } from '@/api/inventory';
import { fetchPreferenciasSalud } from '@/api/salud';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import {
  consentimientoVigente,
  evaluarSalud,
  faltaPermisoSalud,
  preferenciasEfectivas,
  type ClaveSalud,
  type Evaluacion,
  type SaludProducto,
} from '@/shared/lib/salud';

/** Una sola lista vacía: si fuera nueva en cada render, todo lo que depende de ella se recalcularía. */
const SIN_PREFERENCIAS: readonly ClaveSalud[] = Object.freeze([]);

/** Una ficha del catálogo casi no cambia: no se vuelve a pedir en cada apertura. */
export const FRESCURA_FICHA_MS = 30 * 60_000;

/**
 * Lo que evita la persona, y con qué permiso.
 *
 * `preferencias` es lo que se CRUZA con los productos: la lista guardada si hay permiso
 * vigente, y vacía si no (`preferenciasEfectivas`). Es vacía también mientras carga o si
 * falla, y eso NO es «no evita nada»: por eso se devuelve también `error`, y quien pinta
 * avisos lo enseña. Callar un fallo aquí dejaría una pantalla sin marcas que se leería
 * como «todo bien».
 *
 * Lo mismo vale para el permiso: `faltaPermiso` dice que hay una lista guardada que NO se
 * está usando porque no se ha aceptado el aviso (o cambió desde que se aceptó). Una
 * persona que se fiaba de las marcas no puede quedarse sin ellas en silencio.
 *
 * `guardadas` es lo que hay en la tabla, para la pantalla de Ajustes: ahí se ve lo
 * marcado aunque todavía no se use.
 */
export function usePreferenciasSalud() {
  const consulta = useQuery({
    queryKey: queryKeys.preferenciasSalud,
    queryFn: fetchPreferenciasSalud,
    // Solo se cambian desde Ajustes, que escribe esta clave al guardar.
    staleTime: 5 * 60_000,
  });
  const error = consulta.error;
  const mensaje = useMemo(() => (error ? describeDbError(error) : null), [error]);

  const datos = consulta.data;
  const efectivas = useMemo(
    () => (datos ? preferenciasEfectivas(datos.claves, datos.consentimiento) : SIN_PREFERENCIAS),
    [datos],
  );

  return {
    preferencias: efectivas,
    guardadas: datos?.claves ?? SIN_PREFERENCIAS,
    consentimiento: datos?.consentimiento ?? null,
    permiso: datos ? consentimientoVigente(datos.consentimiento) : false,
    faltaPermiso: datos ? faltaPermisoSalud(datos.claves, datos.consentimiento) : false,
    cargando: consulta.isPending,
    error: mensaje,
    recargar: consulta.refetch,
  };
}

/**
 * La ficha de salud de un producto de catálogo, para el aviso de antes de guardar.
 *
 *   · `undefined`: todavía no se sabe (cargando). No se pinta nada.
 *   · `null`: no hay ficha de la que fiarse (sin producto, o la consulta falló). Cuenta
 *     como «sin datos», que es la dirección segura.
 *
 * Con `conocida` no se pide nada: es la que ya trajo quien abrió la hoja (la respuesta de
 * `lookup-barcode`). Solo se pide la ficha cuando hay preferencias que cruzar.
 */
export function useFichaSalud(
  productoId: string | null,
  conocida?: SaludProducto | null,
): SaludProducto | null | undefined {
  const { preferencias } = usePreferenciasSalud();
  const consulta = useQuery({
    queryKey: queryKeys.producto(productoId ?? ''),
    queryFn: () => fetchProducto(productoId as string),
    enabled: conocida === undefined && productoId !== null && preferencias.length > 0,
    staleTime: FRESCURA_FICHA_MS,
  });

  if (conocida !== undefined) return conocida;
  if (productoId === null) return null;
  if (consulta.isError) return null;
  if (consulta.isSuccess) return consulta.data?.salud ?? null;
  return undefined;
}

/**
 * Cruza lo que evita la persona con una ficha. `evaluacion` es null mientras no se pueda
 * decir nada: sin preferencias, o con la ficha aún cargando (`undefined`).
 */
export function useAvisoSalud(ficha: SaludProducto | null | undefined): {
  evaluacion: Evaluacion | null;
  error: string | null;
} {
  const { preferencias, error } = usePreferenciasSalud();
  const evaluacion = useMemo(
    () => (ficha === undefined || preferencias.length === 0 ? null : evaluarSalud(preferencias, ficha)),
    [ficha, preferencias],
  );
  return { evaluacion, error };
}
