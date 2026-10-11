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
 * La lista de UNA nevera: primero lo que falta (lo último apuntado, arriba) y
 * después lo ya comprado (lo último comprado, arriba).
 *
 * Lleva el id de la nevera por la misma razón que `fetchPriorityList`: la RLS
 * devuelve las líneas de TODAS las neveras de la persona, y sin filtrar la lista
 * del piso se mezclaría con la de casa.
 */
export async function fetchLista(householdId: string): Promise<LineaLista[]> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select(CAMPOS)
    .eq('household_id', householdId)
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

  const { data: existentes, error: errorLectura } = await supabase
    .from('shopping_list_items')
    .select('id, name, product_id')
    .eq('household_id', nueva.householdId)
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

/** Quita de golpe todo lo ya comprado de UNA nevera. */
export async function vaciarCompradas(householdId: string): Promise<void> {
  const { error } = await supabase
    .from('shopping_list_items')
    .delete()
    .eq('household_id', householdId)
    .eq('is_purchased', true);
  if (error) throw error;
}
