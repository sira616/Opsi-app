/**
 * La lista de la compra, en un sitio.
 *
 * Funciones planas, sin hooks, como `inventory.ts`: los hooks de TanStack Query
 * viven en las pantallas.
 *
 * ── Qué decide el servidor y qué la app ───────────────────────────────────
 *
 * Las listas (`shopping_lists`) son de la CUENTA o de una NEVERA: una lista individual es de
 * quien la crea y se usa desde cualquier nevera; una compartida cuelga de una nevera y la
 * ven todos sus miembros. La RLS reparte quién ve qué y devuelve, en una sola consulta, todas
 * las que la persona puede usar. Lo que la RLS no dice lo impone un trigger
 * (`check_shopping_item`): que `auto_restock` solo entre si la persona lo encendió, que
 * `created_by` sea quien escribe, que la nevera de la línea sea la de su lista y que el
 * producto sea global o de esa nevera. Aquí no se repite nada de eso: los errores del
 * servidor ya vienen en español y se enseñan tal cual (ver `db-errors.ts`).
 *
 * Cada línea cuelga de una lista. El tope de listas es POR CUENTA (básico: 1 compartida y
 * 1 individual; premium: 5) y lo impone el servidor; su mensaje se enseña tal cual.
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

/** `personal` = individual, de la cuenta; `shared` = compartida, de una nevera. */
export type TipoLista = 'personal' | 'shared';

/**
 * Una lista de la compra. `household_id` es la nevera de una compartida y NULL en una
 * individual (que no cuelga de ninguna). `created_by` sirve para contar cuántas ha creado
 * la persona y saber si todavía caben más.
 */
export type Lista = Pick<
  Database['public']['Tables']['shopping_lists']['Row'],
  'id' | 'household_id' | 'name' | 'created_at' | 'created_by'
> & { kind: TipoLista };

/**
 * TODAS las listas que la persona puede usar: sus individuales y las compartidas de cada una
 * de sus neveras, la más antigua primero. Quien las enseña filtra las de la nevera que mira
 * (`listasDeLaNevera`); quien elige dónde apuntar algo las enseña todas.
 */
export async function fetchListas(): Promise<Lista[]> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .select('id, household_id, name, created_at, created_by, kind')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Lista[];
}

/**
 * Crea una lista y devuelve su id. Una compartida necesita la nevera; una individual no (si se
 * manda, el servidor la ignora). El servidor impone el tope por cuenta.
 */
export async function crearLista(
  nueva: { tipo: 'personal' } | { tipo: 'shared'; householdId: string },
  nombre: string,
): Promise<string> {
  const { data, error } = await supabase
    .from('shopping_lists')
    .insert({
      kind: nueva.tipo,
      household_id: nueva.tipo === 'shared' ? nueva.householdId : null,
      name: nombre.trim(),
    })
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
 * Una lista: primero lo que falta (lo último apuntado, arriba) y después lo ya comprado (lo
 * último comprado, arriba).
 *
 * Se pide por el id de la LISTA, que ya es de una sola nevera o de la cuenta: la RLS devuelve
 * las líneas de todas las listas de la persona, y es este filtro el que separa una de otra.
 */
export async function fetchLista(listaId: string): Promise<LineaLista[]> {
  const { data, error } = await supabase
    .from('shopping_list_items')
    .select(CAMPOS)
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

/** Adónde se apunta: basta el id de la lista y su nevera (NULL si es individual). */
export type ListaDestino = Pick<Lista, 'id' | 'household_id'>;

export type NuevaLinea = {
  /**
   * En qué lista. La nevera de la línea es la de su lista: en una compartida, la suya; en una
   * individual, ninguna. El servidor exige que coincidan, así que no se elige aparte.
   */
  lista: ListaDestino;
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
  const { id: listaId, household_id: householdId } = nueva.lista;

  const { data: existentes, error: errorLectura } = await supabase
    .from('shopping_list_items')
    .select('id, name, product_id')
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
    household_id: householdId,
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
 * Apunta lo mismo en VARIAS listas, una por una (pueden ser individuales y de distintas neveras).
 *
 * Devuelve, por lista, `true` si se apuntó y `false` si ya estaba pendiente allí. Si una
 * falla (el servidor rechaza, se cae la red), las anteriores ya quedaron apuntadas y la
 * excepción sale tal cual: es lo que se puede decir con verdad. Sin listas, no hace nada.
 */
export async function agregarLineaEnListas(
  nueva: Omit<NuevaLinea, 'lista'>,
  listas: ListaDestino[],
): Promise<boolean[]> {
  const resultados: boolean[] = [];
  for (const lista of listas) {
    resultados.push(await agregarLinea({ ...nueva, lista }));
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
