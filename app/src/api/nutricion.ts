/**
 * Nutrición de los productos (Opsi Premium ⭐): Nutri-Score, grupo NOVA, valores por 100 g o
 * 100 ml, niveles, ración y aditivos, de Open Food Facts (OFF).
 *
 * Se lee SOLO por `nutrition_of_products`, que comprueba el plan en el servidor: sin Premium
 * contesta 42501 con la pista `premium` («Esto es de Opsi Premium ⭐.»). Que la pantalla
 * enseñe un candado antes de pedir es una cortesía, no la protección. `lookup-barcode` NO
 * devuelve nutrición a propósito (esa función no mira el plan), y la tabla tiene su propia
 * RLS: son dos cerrojos y este fichero no abre ninguno.
 *
 * Lo que vuelve se trata como entrada no confiable aunque lo escriba nuestro servidor: sale
 * de un wiki público. Todo pasa por `leerNutricion` (shared/lib/nutricion.ts) antes de
 * usarse.
 *
 * Nada de lo leído se guarda en disco. Vive en la caché en memoria de TanStack Query, que
 * `session.tsx` vacía al cambiar de persona.
 */

import { agruparNutricion, trocearIds, type Nutricion } from '@/shared/lib/nutricion';
import { supabase } from '@/shared/lib/supabase';

/**
 * La nutrición de varios productos, por id de producto (en minúsculas).
 *
 * Un id que NO está en el resultado no consta: la ficha es anterior a estos datos, o el
 * producto se escribió a mano. Es distinto de uno que está y trae todo en `null` (OFF se
 * consultó y no declara nada). Quien lo lea tiene que distinguirlos.
 *
 * Va en trozos de 200, que es lo que acepta la función, y en paralelo. Sin ids no hay
 * llamada. Si falla cualquier trozo lanza el error del servidor tal cual, que es lo que
 * `describeDbError` sabe leer (VOZ §7: los mensajes del servidor no se traducen).
 */
export async function fetchNutricion(ids: readonly string[]): Promise<Record<string, Nutricion>> {
  const trozos = trocearIds(ids);
  if (trozos.length === 0) return agruparNutricion([]);

  const respuestas = await Promise.all(
    trozos.map((trozo) => supabase.rpc('nutrition_of_products', { p_product_ids: trozo })),
  );

  const filas: unknown[] = [];
  for (const { data, error } of respuestas) {
    if (error) throw error;
    if (Array.isArray(data)) filas.push(...(data as unknown[]));
  }
  return agruparNutricion(filas);
}
