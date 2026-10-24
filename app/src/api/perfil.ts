/**
 * El perfil personal: lectura y escritura de la fila de `user_profile`.
 *
 * Es un dato sensible que solo ve su dueña (RLS) y que NUNCA sale de aquí: ni a una URL, ni
 * a un registro, ni al disco del aparato. Vive en esa tabla y en la caché en memoria de
 * TanStack Query, que se vacía al cambiar de persona (`session.tsx`). Ninguna función de la
 * base de datos ni la Edge Function lo leen.
 */

import {
  VERSION_AVISO_PERFIL,
  leerConsentimientoPerfil,
  leerPerfil,
  type ClaveActividad,
  type ClaveAlimento,
  type ClaveDieta,
  type PerfilGuardado,
} from '@/shared/lib/perfil';
import { supabase } from '@/shared/lib/supabase';

const TABLA = 'user_profile';
const COLUMNAS = 'activity_level, diet, likes, dislikes, dislikes_custom, consent_version, consented_at';

type Fila = Record<string, unknown>;

function leerFila(fila: Fila | null | undefined): PerfilGuardado {
  return {
    perfil: leerPerfil(fila),
    consentimiento: leerConsentimientoPerfil(fila?.consent_version, fila?.consented_at),
  };
}

/** Lo que hay guardado. Sin fila (nunca se ha dado el permiso ni contado nada): vacío y sin permiso. */
export async function fetchPerfil(): Promise<PerfilGuardado> {
  const { data, error } = await supabase.from(TABLA).select(COLUMNAS).maybeSingle();
  if (error) throw error;
  return leerFila(data as Fila | null);
}

/**
 * Un error del servidor sin su `details`: PostgREST copia en `details` la fila que falló
 * («Failing row contains (…)») y esa fila ES el perfil. Se queda solo el mensaje, el código y
 * la pista. El mensaje se conserva entero y sin tocar (docs/VOZ.md §7).
 */
function sinDetalle(error: { message: string; code?: string; hint?: string | null }): Error {
  return Object.assign(new Error(error.message), {
    code: error.code,
    hint: error.hint ?? undefined,
  });
}

/** Lo que se puede cambiar de una vez. Lo que no viene no se toca. */
export type CambiosPerfil = {
  activity_level?: ClaveActividad | null;
  diet?: ClaveDieta | null;
  likes?: ClaveAlimento[];
  dislikes?: ClaveAlimento[];
  dislikes_custom?: string[];
  consent_version?: number;
};

/**
 * Escribe en la fila de la persona y devuelve lo que quedó guardado. UPDATE y, si no había
 * fila, INSERT (y no `upsert`: con permisos por columna, un `upsert` pediría UPDATE sobre
 * `user_id`; ver `api/salud.ts`). Si dos dispositivos crean la fila a la vez, el segundo
 * INSERT choca (23505) y se resuelve con otro UPDATE.
 */
async function escribir(userId: string, cambios: CambiosPerfil): Promise<PerfilGuardado> {
  const actualizar = () => supabase.from(TABLA).update(cambios).eq('user_id', userId).select(COLUMNAS);

  const primera = await actualizar();
  if (primera.error) throw sinDetalle(primera.error);
  const existente = (primera.data as Fila[] | null)?.[0];
  if (existente) return leerFila(existente);

  const nueva = await supabase.from(TABLA).insert({ user_id: userId, ...cambios }).select(COLUMNAS).single();
  if (!nueva.error) return leerFila(nueva.data as Fila | null);
  if (nueva.error.code !== '23505') throw sinDetalle(nueva.error);

  const segunda = await actualizar();
  if (segunda.error) throw sinDetalle(segunda.error);
  const creada = (segunda.data as Fila[] | null)?.[0];
  if (!creada) throw sinDetalle(nueva.error);
  return leerFila(creada);
}

/** Cambia una o varias cosas del perfil. Sin permiso lo rechaza el servidor, con su mensaje. */
export function guardarPerfil(userId: string, cambios: Omit<CambiosPerfil, 'consent_version'>): Promise<PerfilGuardado> {
  return escribir(userId, cambios);
}

/** La persona acepta el aviso: guarda la versión que vio (la fecha la pone el servidor). */
export function darPermisoPerfil(userId: string): Promise<PerfilGuardado> {
  return escribir(userId, { consent_version: VERSION_AVISO_PERFIL });
}

/** Borra el perfil y retira el permiso: la fila entera, sin dejar nada detrás. */
export async function borrarPerfil(userId: string): Promise<void> {
  const { error } = await supabase.from(TABLA).delete().eq('user_id', userId);
  if (error) throw sinDetalle(error);
}
