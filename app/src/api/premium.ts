/**
 * Lo que es de Opsi Premium ⭐.
 *
 * Todo lo premium se comprueba en el SERVIDOR: la función `most_used_products` rechaza
 * (42501, con la pista `premium`) a quien no tiene el plan, y el color solo lo guarda
 * el trigger de `user_settings` si lo tiene. Esto solo pide los datos; la app enseña
 * candados antes de pedir lo que sabe que se va a rechazar, pero que lo oculte no es
 * la protección.
 */

import type { Database } from '@/lib/database.types';
import type { Categoria } from '@/shared/lib/categorias';
import { supabase } from '@/shared/lib/supabase';
import type { MeasurementUnit, UnitFamily } from '@/shared/lib/units';

type FilaGasto = Database['public']['Functions']['most_used_products']['Returns'][number];
type FilaConocido = Database['public']['Functions']['my_known_products']['Returns'][number];

export type ProductoGastado = {
  /** Cómo se llamó la última vez que se agotó (la persona lo teclea distinto cada vez). */
  nombre: string;
  /** Cuántas veces se agotó en el periodo: lo que ordena la lista. */
  agotado: number;
  /** Cuántas veces se tiró. Va aparte: comprar algo que se tira es lo que de verdad cuesta. */
  tirado: number;
  ultimaVez: string;
};

/** El periodo que se mira. Tres meses: lo bastante para que se note, sin que mande lo viejo. */
export const DIAS_PERIODO = 90;

/** Cuántos salen en la pestaña de Premium. La lista completa tiene su pantalla. */
export const GASTOS_EN_RESUMEN = 5;

/**
 * Lo más agotado en una nevera, del más gastado al menos. `limite` es cuántos pide: 6 para
 * el resumen (5 y uno más, para saber si hay «ver todos») y 200 para la lista entera.
 */
export async function fetchMasUsados(householdId: string, limite: number): Promise<ProductoGastado[]> {
  const { data, error } = await supabase.rpc('most_used_products', {
    p_household_id: householdId,
    p_days: DIAS_PERIODO,
    p_limit: limite,
  });
  if (error) throw error;
  return ((data ?? []) as FilaGasto[]).map((fila) => ({
    nombre: fila.product_name,
    agotado: fila.finished_count,
    tirado: fila.discarded_count,
    ultimaVez: fila.last_at,
  }));
}

/**
 * Un producto del almacén: lo que ya has añadido alguna vez, con su ficha, listo para volver
 * a guardarlo o apuntarlo. Es un almacén de productos, no un recuento: no lleva cuántas
 * veces se ha comprado ni cuánto hay ahora.
 */
export type ProductoConocido = {
  /** El producto del catálogo, si se escaneó. Lo escrito a mano no lo tiene. */
  productoId: string | null;
  nombre: string;
  marca: string | null;
  /** El código de barras. Solo lo escaneado lo tiene. */
  codigo: string | null;
  /** De dónde salió la ficha del producto: `openfoodfacts` (catálogo) o `user` (de tu nevera). */
  origen: string | null;
  /** Escaneado (tiene código) o añadido a mano. Es lo que separa las dos listas. */
  escaneado: boolean;
  categoria: Categoria;
  unitFamily: UnitFamily;
  displayUnit: MeasurementUnit;
  /** Lo que traía la última vez, en unidad base. */
  cantidad: number;
  /**
   * La nevera en la que se añadió la última vez. Hace falta para saber si una ficha privada
   * de esa nevera se puede enlazar al guardarlo en otra (`productoParaNevera`).
   */
  neveraId: string | null;
};

/**
 * Lo que ha añadido ESTA persona, en todas sus neveras, sin repetidos y por orden alfabético.
 *
 * Tus productos son de la cuenta, no de la nevera que se esté mirando. No hay una tabla de
 * «productos guardados»: sale de los elementos que ya añadió (ver `my_known_products`), así
 * que no hay nada que mantener al día. Lo que se escaneó y nunca se guardó no aparece.
 */
export async function fetchProductosConocidos(): Promise<ProductoConocido[]> {
  const { data, error } = await supabase.rpc('my_known_products', {
    p_limit: 200,
  });
  if (error) throw error;
  const productos: ProductoConocido[] = ((data ?? []) as FilaConocido[]).map((fila) => ({
    neveraId: fila.household_id,
    productoId: fila.product_id,
    nombre: fila.product_name,
    marca: fila.brand,
    codigo: fila.barcode,
    origen: fila.data_source,
    escaneado: fila.barcode !== null,
    categoria: fila.category as Categoria,
    unitFamily: fila.unit_family as UnitFamily,
    displayUnit: fila.display_unit as MeasurementUnit,
    cantidad: Number(fila.quantity),
  }));
  return productos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
}
