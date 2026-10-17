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

type FilaGasto = Database['public']['Functions']['most_used_products']['Returns'][number];

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
