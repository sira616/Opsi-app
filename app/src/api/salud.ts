/**
 * Salud: qué evita una persona y qué lleva cada producto.
 *
 * Son dos lecturas que NUNCA se cruzan en el servidor. Las preferencias son un dato de
 * salud (RGPD, categoría especial) que solo ve su dueña: la RLS de
 * `user_health_preferences` es la única barrera, y ninguna función de la base de datos
 * ni de la Edge Function las lee. El cruce con los productos —`evaluarSalud`— ocurre en
 * el móvil, y de ahí las preferencias no salen: ni a una URL, ni a un registro, ni al
 * historial, ni al disco del aparato. Viven en esa tabla y en la caché en memoria de
 * TanStack Query, que se vacía al cambiar de persona (`session.tsx`).
 *
 * Los productos sí los ve cualquiera de la nevera (la ficha de catálogo es de todos) y
 * su contenido de salud sale de Open Food Facts, o sea de un wiki público: entrada no
 * confiable. Todo pasa por `leerSalud` antes de usarse.
 */

import { idDeRuta } from '@/api/catalogo';
import {
  VERSION_AVISO_SALUD,
  leerClaves,
  leerConsentimiento,
  leerSalud,
  type ClaveSalud,
  type ConsentimientoSalud,
  type SaludProducto,
} from '@/shared/lib/salud';
import { supabase } from '@/shared/lib/supabase';

const TABLA = 'user_health_preferences';
const COLUMNAS_PREFERENCIAS = 'avoid, consent_version, consented_at';

/**
 * Lo que hay guardado de la persona: la lista y el permiso con el que se guardó. Que la
 * lista exista NO quiere decir que se use: sin permiso vigente no se cruza nada
 * (`preferenciasEfectivas`).
 */
export type PreferenciasGuardadas = {
  claves: ClaveSalud[];
  consentimiento: ConsentimientoSalud | null;
};

type FilaPreferencias = { avoid?: unknown; consent_version?: unknown; consented_at?: unknown };

/** Una fila de la tabla, sin fiarse de su forma. Sin fila: nada guardado y sin permiso. */
function leerPreferencias(fila: FilaPreferencias | null | undefined): PreferenciasGuardadas {
  return {
    claves: leerClaves(fila?.avoid),
    consentimiento: leerConsentimiento(fila?.consent_version, fila?.consented_at),
  };
}

/**
 * Lo que la persona evita y el permiso que dio. Sin fila (no ha marcado nada nunca) es la
 * lista vacía y sin permiso, no un error: la fila solo existe desde la primera vez que se
 * da el permiso o se guarda algo.
 */
export async function fetchPreferenciasSalud(): Promise<PreferenciasGuardadas> {
  const { data, error } = await supabase.from(TABLA).select(COLUMNAS_PREFERENCIAS).maybeSingle();
  if (error) throw error;
  return leerPreferencias(data as FilaPreferencias | null);
}

/**
 * Un error del servidor sin su `details`.
 *
 * PostgREST copia en `details` la fila que falló («Failing row contains (…)»), y esa
 * fila ES la lista de lo que la persona evita. Los errores acaban, tal cual, en
 * `describeDbError` y de ahí —en desarrollo— a la consola, así que se quedan solo el
 * mensaje, el código y la pista: lo que hace falta para mostrarlo y decidir qué hacer.
 * El mensaje se conserva entero y sin tocar (docs/VOZ.md §7).
 */
function sinDetalle(error: { message: string; code?: string; hint?: string | null }): Error {
  return Object.assign(new Error(error.message), {
    code: error.code,
    hint: error.hint ?? undefined,
  });
}

/**
 * Escribe en la fila de la persona y devuelve lo que quedó guardado.
 *
 * Es un UPDATE y, si no había fila, un INSERT, y no un `upsert`. Con los permisos de la
 * tabla —`insert (user_id, avoid, consent_version)` y `update (avoid, consent_version)`,
 * nada más— un `upsert` falla siempre: PostgREST lo traduce a `ON CONFLICT … DO UPDATE
 * SET user_id = excluded.user_id, …`, y Postgres exige permiso de UPDATE sobre CADA
 * columna del SET, la clave incluida (probado contra la base local: «permission denied»,
 * también la primera vez, cuando no hay conflicto). Abrir ese permiso solo para esto
 * sería regalar la posibilidad de reescribir la identidad de la fila.
 *
 * Si dos dispositivos crean la fila a la vez, el segundo INSERT choca (23505) y se
 * resuelve con otro UPDATE: gana la última escritura, que es lo esperable.
 *
 * El permiso NUNCA se manda por detrás de una lista: solo `darPermisoSalud` escribe
 * `consent_version`. Una lista sin permiso la rechaza el servidor.
 */
async function escribirPreferencias(
  userId: string,
  valores: { avoid?: ClaveSalud[]; consent_version?: number },
): Promise<PreferenciasGuardadas> {
  const actualizar = () =>
    supabase.from(TABLA).update(valores).eq('user_id', userId).select(COLUMNAS_PREFERENCIAS);

  const primera = await actualizar();
  if (primera.error) throw sinDetalle(primera.error);
  const existente = (primera.data as FilaPreferencias[] | null)?.[0];
  if (existente) return leerPreferencias(existente);

  const nueva = await supabase
    .from(TABLA)
    .insert({ user_id: userId, avoid: [], ...valores })
    .select(COLUMNAS_PREFERENCIAS)
    .single();
  if (!nueva.error) return leerPreferencias(nueva.data as FilaPreferencias | null);
  if (nueva.error.code !== '23505') throw sinDetalle(nueva.error);

  const segunda = await actualizar();
  if (segunda.error) throw sinDetalle(segunda.error);
  const creada = (segunda.data as FilaPreferencias[] | null)?.[0];
  if (!creada) throw sinDetalle(nueva.error);
  return leerPreferencias(creada);
}

/**
 * Guarda la lista entera de lo que se evita y devuelve lo que quedó guardado (el
 * servidor la deja ordenada y sin repetidos). Vaciarla es guardar `[]`.
 *
 * Con la lista vacía no hace falta permiso; con algo, sí: si no se dio antes, el servidor
 * contesta con su propio mensaje (P0001, «Antes de guardar lo que evitas necesito tu
 * permiso.») y la pantalla lo enseña tal cual.
 */
export function guardarPreferenciasSalud(
  userId: string,
  avoid: readonly ClaveSalud[],
): Promise<PreferenciasGuardadas> {
  return escribirPreferencias(userId, { avoid: [...avoid] });
}

/**
 * La persona acepta el aviso de consentimiento. Guarda la versión que vio (el servidor
 * pone la fecha, y la persona no puede escribirla) y no toca lo que hubiera guardado:
 * una lista de antes del permiso pasa a usarse al aceptar, no antes.
 */
export function darPermisoSalud(userId: string): Promise<PreferenciasGuardadas> {
  return escribirPreferencias(userId, { consent_version: VERSION_AVISO_SALUD });
}

/**
 * Borra lo guardado y retira el permiso: la fila entera. Es el derecho de supresión, y
 * no deja nada detrás (ni la lista, ni la fecha del permiso). Sin fila no hay nada que
 * borrar y no es un error.
 */
export async function borrarDatosSalud(userId: string): Promise<void> {
  const { error } = await supabase.from(TABLA).delete().eq('user_id', userId);
  if (error) throw sinDetalle(error);
}

/** Las columnas de salud de un producto, en el orden que lee `leerSalud`. */
export const COLUMNAS_SALUD =
  'data_source, allergens_tags, traces_tags, labels_tags, ingredients_text, health_data_at';

/**
 * Cuántos ids caben en una petición. Van en la URL (`id=in.(…)`), y 200 uuids pasan de los
 * 8 KB que corta la pasarela; con 50 quedan en unos 2 KB.
 */
const IDS_POR_PETICION = 50;

/**
 * La ficha de salud de varios productos, en UNA consulta por trozo y no una por fila.
 *
 * Es lo que pinta las marcas del inventario. Trae los ingredientes aunque aquí solo
 * importe si existen: PostgREST no sabe devolver «no es nulo» sin una vista, y la
 * alternativa (una segunda consulta con `not.is.null`) cuesta una ida y vuelta más para
 * ahorrar, como mucho, 2 KB por producto distinto. Se llama una vez por lista, no por fila.
 *
 * Lo que no vuelve (un producto que la RLS esconde) no está en el resultado, y quien lo
 * lea lo trata como «sin datos».
 */
export async function fetchSaludProductos(
  ids: readonly string[],
): Promise<Record<string, SaludProducto>> {
  const trozos: string[][] = [];
  for (let i = 0; i < ids.length; i += IDS_POR_PETICION) {
    trozos.push(ids.slice(i, i + IDS_POR_PETICION));
  }

  const respuestas = await Promise.all(
    trozos.map((trozo) =>
      supabase.from('products').select(`id, ${COLUMNAS_SALUD}`).in('id', trozo),
    ),
  );

  // Sin prototipo y con la clave comprobada como uuid: lo que llega es entrada de fuera.
  const fichas: Record<string, SaludProducto> = Object.create(null) as Record<string, SaludProducto>;
  for (const { data, error } of respuestas) {
    if (error) throw error;
    for (const fila of (data ?? []) as unknown as Record<string, unknown>[]) {
      const id = idDeRuta(fila.id);
      if (id) fichas[id] = leerSalud(fila);
    }
  }
  return fichas;
}
