import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { fetchPerfil } from '@/api/perfil';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import {
  PERFIL_VACIO,
  consentimientoPerfilVigente,
  perfilEfectivo,
  type PerfilGuardado,
} from '@/shared/lib/perfil';

/** Un solo valor vacío: si fuera nuevo en cada render, lo que depende de él se recalcularía. */
const SIN_NADA: PerfilGuardado = Object.freeze({ perfil: PERFIL_VACIO, consentimiento: null }) as PerfilGuardado;

/**
 * El perfil personal y con qué permiso. Es lectura: nada de aquí escribe ni manda el perfil a
 * ningún sitio; vive en la caché en memoria.
 *
 *   · `guardado` es lo que hay en la tabla, para la pantalla del perfil.
 *   · `perfil` es lo que se USARÍA para recomendar: el guardado si hay permiso vigente, y
 *     vacío si no (`perfilEfectivo`). Hoy nada recomienda con él; cuando algo lo haga, lo
 *     lee por aquí.
 *
 * Mientras carga o si falla es el perfil vacío, y eso NO es «no ha contado nada»: por eso se
 * devuelve también `error`.
 */
export function usePerfil() {
  const consulta = useQuery({
    queryKey: queryKeys.perfil,
    queryFn: fetchPerfil,
    // Solo se cambia desde su pantalla, que escribe esta clave al guardar.
    staleTime: 5 * 60_000,
  });
  const error = consulta.error;
  const mensaje = useMemo(() => (error ? describeDbError(error) : null), [error]);
  const guardado = consulta.data ?? SIN_NADA;

  return {
    guardado,
    perfil: perfilEfectivo(guardado),
    permiso: consentimientoPerfilVigente(guardado.consentimiento),
    cargando: consulta.isPending,
    error: mensaje,
    recargar: consulta.refetch,
  };
}
