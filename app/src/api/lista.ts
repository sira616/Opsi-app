/**
 * La lista de la compra, en un sitio.
 *
 * Funciones planas, sin hooks, como `inventory.ts`: los hooks de TanStack Query
 * viven en las pantallas.
 *
 * ── Qué decide el servidor y qué la app ───────────────────────────────────
 *
 * La tabla es de la nevera y la RLS deja a sus miembros leerla y escribirla. Lo que
 * la RLS no dice lo impone un trigger (`check_shopping_item`): que `auto_restock`
 * solo entre si la persona lo encendió, que `created_by` sea quien escribe, que el
 * producto sea global o de la misma nevera y que haya un tope por nevera. Aquí no
 * se repite nada de eso: los errores del servidor ya vienen en español y se enseñan
 * tal cual (ver `db-errors.ts`).
 *
 * Una nevera tiene varias listas (`shopping_lists`): cada línea cuelga de una. El tope
 * —3 en el plan básico— lo impone el servidor, y su mensaje se enseña tal cual.
 *
 * Una sola cosa va por función y no por la tabla: pasar de «comprado» a inventario
 * (`stock_from_list`, desde `createItem` con `listaId`), porque son dos escrituras
 * que tienen que pasar juntas o no pasar.
 */

import type { Database } from '@/lib/database.types';
import { supabase } from '@/shared/lib/supabase';
import type { MeasurementUnit, UnitFamily } from '@/shared/lib/units';

type Fila = Database['public']['Tables']['shopping_list_items']['Row'];

/** De dónde salió la línea. `auto_restock` solo existe si la persona lo encendió. */
export type OrigenLinea = 'manual' | 'auto_restock' | 'chat';

/** Una lista de la compra de una nevera. */
export type Lista = Pick<
  Database['public']['Tables']['shopping_lists']['Row'],
  'id' | 'household_id' | 'name' | 'created_at'
>;

/** Las listas de UNA nevera, la más antigua primero (es la «principal»). */
export async function fetchListas(householdId: string): Promise<Lista[]> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('id, household_id, name, created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Lista[];
}

/** Crea una lista y devuelve su id. El servidor impone el tope del plan. */
export async function crearLista(householdId: string, nombre: string): Promise<string> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .insert({ household_id: householdId, name: nombre.trim() })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function renombrarLista(id: string, nombre: string): Promise<void> {
  const { error } = await supabase.from('shopping_lists').update({ name: nombre.trim() }).eq('id', id);
  if (error) throw error;
}

/** Borra una lista con sus líneas. El servidor no deja borrar la última. */
export async function borrarLista(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_lists').delete().eq('id', id);
  if (error) throw error;
}

export type LineaLista = Pick<
  Fila,
  'id' | 'household_id' | 'product_id' | 'name' | 'quantity' | 'is_purchased' | 'purchased_at' | 'created_at'
> & {
  unit_family: UnitFamily | null;
  display_unit: MeasurementUnit | null;
  source: OrigenLinea;
};

const CAMPOS =
  'id, household_id, product_id, name, unit_family, display_unit, quantity, is_purchased, ' +
  'purchased_at, source, created_at';

/**
 * Una lista de UNA nevera: primero lo que falta (lo último apuntado, arriba) y
 * después lo ya comprado (lo último comprado, arriba).
 *
 * Lleva el id de la nevera por la misma razón que `fetchPriorityList`: la RLS
 * devuelve las líneas de TODAS las neveras de la persona, y sin filtrar la lista
 * del piso se mezclaría con la de casa.
 */
export async function fetchLista(householdId: string, listaId: string): Promise<LineaLista[]> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select(CAMPOS)
    .eq('household_id', householdId)
    .eq('list_id', listaId)
    .order('is_purchased', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(400);

  if (error) throw error;
  const filas = (data ?? []) as unknown as LineaLista[];
  // Lo comprado, por fecha de compra: el orden por creación no dice qué se tachó último.
  const pendientes = filas.filter((l) => !l.is_purchased);
  const compradas = filas
    .filter((l) => l.is_purchased)
    .sort((a, b) => (b.purchased_at ?? '').localeCompare(a.purchased_at ?? ''));
  return [...pendientes, ...compradas];
}

/** Una línea concreta, para rellenar el alta cuando se guarda lo comprado. */
export async function fetchLinea(id: string): Promise<LineaLista | null> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select(CAMPOS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as LineaLista | null;
}

export type NuevaLinea = {
  householdId: string;
  /** En qué lista. Sin ella, la principal de la nevera (la más antigua). */
  listaId?: string;
  name: string;
  origen?: OrigenLinea;
  productId?: string | null;
  /** En unidad base. Va con su familia y su unidad, o no va. */
  cantidad?: { unitFamily: UnitFamily; displayUnit: MeasurementUnit; quantity: number } | null;
};

/**
 * Apunta algo. Devuelve `false` si ya estaba pendiente y no se ha duplicado.
 *
 * El «ya estaba» se mira por el producto (si lo hay) o por el nombre sin mayúsculas
 * ni espacios de más. No es una restricción de la base de datos a propósito: dos
 * líneas «leche» pueden ser legítimas (una de entera y otra sin lactosa que se
 * llamaron igual), y bloquearlo en el servidor sería decidir por la persona. Aquí
 * solo se evita el duplicado que se produce SIN que nadie lo pida: apuntar lo que
 * se acaba cuando ya estaba apuntado.
 */
export async function agregarLinea(nueva: NuevaLinea): Promise<boolean> {
  const nombre = nueva.name.trim();
  const listaId = nueva.listaId ?? (await fetchListas(nueva.householdId))[0]?.id;
  if (!listaId) throw new Error('Esta nevera no tiene ninguna lista.');

  const { data: existentes, error: errorLectura } = await supabase
    .from('shopping_list_items')
    .select('id, name, product_id')
    .eq('household_id', nueva.householdId)
    .eq('list_id', listaId)
    .eq('is_purchased', false)
    .limit(400);
  if (errorLectura) throw errorLectura;

  const clave = nombre.toLowerCase();
  const yaEsta = ((existentes ?? []) as { name: string; product_id: string | null }[]).some(
    (l) =>
      (nueva.productId && l.product_id === nueva.productId) || l.name.trim().toLowerCase() === clave,
  );
  if (yaEsta) return false;

  const { error } = await supabase.from('shopping_list_items').insert({
    household_id: nueva.householdId,
    list_id: listaId,
    name: nombre,
    source: nueva.origen ?? 'manual',
    product_id: nueva.productId ?? null,
    unit_family: nueva.cantidad?.unitFamily ?? null,
    display_unit: nueva.cantidad?.displayUnit ?? null,
    quantity: nueva.cantidad?.quantity ?? null,
  });
  if (error) throw error;
  return true;
}

/**
 * Apunta lo mismo en VARIAS listas de una nevera, una por una.
 *
 * Devuelve, por lista, `true` si se apuntó y `false` si ya estaba pendiente allí. Si una
 * falla (el servidor rechaza, se cae la red), las anteriores ya quedaron apuntadas y la
 * excepción sale tal cual: es lo que se puede decir con verdad. Sin listas, no hace nada.
 */
export async function agregarLineaEnListas(
  nueva: Omit<NuevaLinea, 'listaId'>,
  listaIds: string[],
): Promise<boolean[]> {
  const resultados: boolean[] = [];
  for (const listaId of listaIds) {
    resultados.push(await agregarLinea({ ...nueva, listaId }));
  }
  return resultados;
}

/** Tacha o destacha una línea, sin tocar el inventario. */
export async function marcarComprada(id: string, comprada: boolean): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .update({ is_purchased: comprada, purchased_at: comprada ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

export async function quitarLinea(id: string): Promise<void> {
  const { error } = await supabase.from('shopping_list_items').delete().eq('id', id);
  if (error) throw error;
}

/** Quita de golpe todo lo ya comprado de UNA lista. */
export async function vaciarCompradas(listaId: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('list_id', listaId)
    .eq('is_purchased', true);
  if (error) throw error;
}

/** Algo que se acabó hace poco, listo para volver a apuntarlo con un toque. */
export type Sugerencia = {
  name: string;
  product_id: string | null;
  unit_family: UnitFamily;
  display_unit: MeasurementUnit;
  /** Lo que traía, en unidad base: es lo que se apunta para volver a comprar. */
  initial_quantity: number;
};

/**
 * Lo último que se agotó en UNA nevera, sin repetidos.
 *
 * Es la fuente de las sugerencias de la lista: «se te acabó la leche» es lo más
 * probable que haya que volver a comprar, y apuntarlo cuesta un toque en lugar de
 * escribirlo. Solo lo agotado (`finished`), no lo tirado: tirar algo caducado no
 * quiere decir que se quiera volver a comprar.
 */
export async function fetchSugerencias(householdId: string): Promise<Sugerencia[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('name, product_id, unit_family, display_unit, initial_quantity')
    .eq('household_id', householdId)
    .eq('state', 'finished')
    .order('closed_out_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  const vistas = new Set<string>();
  const unicas: Sugerencia[] = [];
  for (const s of (data ?? []) as unknown as Sugerencia[]) {
    const clave = s.name.trim().toLowerCase();
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    unicas.push(s);
  }
  return unicas.slice(0, 10);
}
