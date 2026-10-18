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
import { leerClaves, leerSalud, type ClaveSalud, type SaludProducto } from '@/shared/lib/salud';
import { supabase } from '@/shared/lib/supabase';

const TABLA = 'user_health_preferences';

/**
 * Lo que la persona evita. Sin fila (no ha marcado nada nunca) es la lista vacía, no un
 * error: la fila solo existe desde la primera vez que se guarda algo.
 */
export async function fetchPreferenciasSalud(): Promise<ClaveSalud[]> {
  const { data, error } = await supabase.from(TABLA).select('avoid').maybeSingle();
  if (error) throw error;
  return leerClaves((data as { avoid?: unknown } | null)?.avoid);
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
 * Guarda la lista entera de lo que se evita y devuelve lo que quedó guardado (el
 * servidor la deja ordenada y sin repetidos). Vaciarla es guardar `[]`: no hay DELETE.
 *
 * Es un UPDATE y, si no había fila, un INSERT, y no un `upsert`. Con los permisos de la
 * tabla —`insert (user_id, avoid)` y `update (avoid)`, nada más— un `upsert` falla
 * siempre: PostgREST lo traduce a `ON CONFLICT … DO UPDATE SET user_id = excluded.user_id,
 * avoid = …`, y Postgres exige permiso de UPDATE sobre CADA columna del SET, la clave
 * incluida (probado contra la base local: «permission denied», también la primera vez,
 * cuando no hay conflicto). Abrir ese permiso solo para esto sería regalar la posibilidad
 * de reescribir la identidad de la fila.
 *
 * Si dos dispositivos crean la fila a la vez, el segundo INSERT choca (23505) y se
 * resuelve con otro UPDATE: gana la última escritura, que es lo esperable.
 */
export async function guardarPreferenciasSalud(
  userId: string,
  avoid: readonly ClaveSalud[],
): Promise<ClaveSalud[]> {
  const lista = [...avoid];
  const actualizar = () =>
    supabase.from(TABLA).update({ avoid: lista }).eq('user_id', userId).select('avoid');

  const primera = await actualizar();
  if (primera.error) throw sinDetalle(primera.error);
  const existente = (primera.data as { avoid?: unknown }[] | null)?.[0];
  if (existente) return leerClaves(existente.avoid);

  const nueva = await supabase
    .from(TABLA)
    .insert({ user_id: userId, avoid: lista })
    .select('avoid')
    .single();
  if (!nueva.error) return leerClaves((nueva.data as { avoid?: unknown } | null)?.avoid);
  if (nueva.error.code !== '23505') throw sinDetalle(nueva.error);

  const segunda = await actualizar();
  if (segunda.error) throw sinDetalle(segunda.error);
  const creada = (segunda.data as { avoid?: unknown }[] | null)?.[0];
  if (!creada) throw sinDetalle(nueva.error);
  return leerClaves(creada.avoid);
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
