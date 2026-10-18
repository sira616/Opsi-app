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

export async function fetchMasUsados(householdId: string): Promise<ProductoGastado[]> {
  const { data, error } = await supabase.rpc('most_used_products', {
    p_household_id: householdId,
    p_days: DIAS_PERIODO,
    p_limit: 10,
  });
  if (error) throw error;
  return ((data ?? []) as FilaGasto[]).map((fila) => ({
    nombre: fila.product_name,
    agotado: fila.finished_count,
    tirado: fila.discarded_count,
    ultimaVez: fila.last_at,
  }));
}

/** Algo que ya añadiste, listo para volver a guardarlo o apuntarlo de un toque. */
export type ProductoConocido = {
  /** El producto del catálogo, si se escaneó. Lo escrito a mano no lo tiene. */
  productoId: string | null;
  nombre: string;
  marca: string | null;
  unitFamily: UnitFamily;
  displayUnit: MeasurementUnit;
  /** Lo que traía la última vez, en unidad base. */
  cantidad: number;
  veces: number;
  ultimaVez: string;
};

/**
 * Lo que ha añadido ESTA persona a una nevera, sin repetidos y lo último primero.
 *
 * No hay una tabla de «productos guardados»: sale de los elementos que ya añadió (ver
 * `my_known_products`), así que no hay nada que mantener al día. Lo que se escaneó y nunca
 * se guardó no aparece.
 */
export async function fetchProductosConocidos(householdId: string): Promise<ProductoConocido[]> {
  const { data, error } = await supabase.rpc('my_known_products', {
    p_household_id: householdId,
    p_limit: 40,
  });
  if (error) throw error;
  return ((data ?? []) as FilaConocido[]).map((fila) => ({
    productoId: fila.product_id,
    nombre: fila.product_name,
    marca: fila.brand,
    unitFamily: fila.unit_family as UnitFamily,
    displayUnit: fila.display_unit as MeasurementUnit,
    cantidad: Number(fila.quantity),
    veces: fila.times_added,
    ultimaVez: fila.last_added_at,
  }));
}
