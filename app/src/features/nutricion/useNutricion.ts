/**
 * Los ganchos de la nutrición: la de una lista de productos y la de uno solo.
 *
 * Los dos son lectura de `nutrition_of_products`, que es de Opsi Premium: el servidor
 * rechaza a quien no tiene el plan, y quien llama decide con `enabled` si merece la pena
 * preguntar. Nada de aquí escribe en el disco.
 */

import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { buscarPorCodigo } from '@/api/catalogo';
import { fetchProducto, type ProductoCatalogo } from '@/api/inventory';
import { fetchNutricion } from '@/api/nutricion';
import { pistaDeError } from '@/shared/lib/db-errors';
import { idDeProducto, type Nutricion } from '@/shared/lib/nutricion';
import { queryKeys } from '@/shared/lib/query';

/** Lo que Open Food Facts declara casi no cambia: no se vuelve a pedir en cada apertura. */
const FRESCURA_NUTRICION_MS = 30 * 60_000;

/** La pista con la que el servidor dice «esto es de Premium». Se lee, no se traduce. */
export function esFalloDePlan(error: unknown): boolean {
  return pistaDeError(error) === 'premium';
}

/**
 * La nutrición de los productos de una lista, por id. Solo LEE: no renueva nada, porque
 * renovar una ficha gasta cuota de consultas a Open Food Facts y listar no puede gastarla.
 *
 * Un id que no sale en `data` no consta. El que sale con todo en `null` es que Open Food
 * Facts se consultó y no declara nada. Para la pantalla es lo mismo («Sin datos
 * nutricionales»), pero solo el primero se puede renovar, al abrir el detalle.
 */
export function useNutricionDeLista(ids: readonly string[], activo: boolean) {
  // Ordenados y sin repetidos: el mismo conjunto de productos es la misma clave.
  const ordenados = useMemo(() => [...new Set(ids)].sort(), [ids]);

  return useQuery({
    queryKey: queryKeys.nutricionDe(ordenados),
    queryFn: () => fetchNutricion(ordenados),
    enabled: activo && ordenados.length > 0,
    staleTime: FRESCURA_NUTRICION_MS,
    // Repetir una petición que el servidor rechaza por el plan no la va a arreglar.
    retry: (intentos, error) => intentos < 1 && !esFalloDePlan(error),
  });
}

/** Lo que enseña el detalle de un producto. */
export type DetalleNutricion = {
  /** Null: la ficha ya no está. */
  producto: ProductoCatalogo | null;
  /** Null: no consta (no hay fila). Con fila y todo `null` es «Open Food Facts no declara nada». */
  nutricion: Nutricion | null;
  /** Se puede pedir a Open Food Facts otra vez: es un producto suyo y tiene código de barras. */
  renovable: boolean;
};

/**
 * Lo que cambia cuando `lookup-barcode` renueva una ficha. Esa función guarda también los
 * datos de salud, así que lo que ya estuviera a la vista de la ficha, de los ingredientes o
 * del aviso de salud queda desactualizado. Se marca como rancio y cada pantalla se pone al
 * día al volver a mirarla.
 */
function avisarDeFichaRenovada(queryClient: QueryClient, productoId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.nutricionListas });
  void queryClient.invalidateQueries({ queryKey: queryKeys.producto(productoId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.ingredientes(productoId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.fichasSalud });
}

/**
 * Carga el detalle y, si la ficha no tiene nutrición, la renueva UNA vez.
 *
 * Una ficha antigua (anterior a estos datos, que no tiene fila) se renueva llamando a
 * `lookup-barcode`, que es quien habla con Open Food Facts: el móvil nunca llama a un
 * tercero. Eso GASTA CUOTA, por eso es una consecuencia de que la persona abra el detalle y
 * no algo que se haga al listar. Si el servidor falla (demasiadas consultas, sin red…) lanza
 * con su mensaje, que ya viene escrito para leerse.
 *
 * Solo se renueva un producto de Open Food Facts con código: uno escrito a mano o privado de
 * una nevera no tiene nada que consultar, y el servidor tampoco guardaría nada.
 */
async function cargarDetalle(productoId: string, queryClient: QueryClient): Promise<DetalleNutricion> {
  const id = idDeProducto(productoId);
  const producto = id === null ? null : await fetchProducto(id);
  if (id === null || producto === null) return { producto: null, nutricion: null, renovable: false };

  const codigo = producto.barcode;
  const renovable = producto.data_source === 'openfoodfacts' && codigo !== null;

  let nutricion = (await fetchNutricion([id]))[id] ?? null;
  if (nutricion === null && renovable) {
    await buscarPorCodigo(codigo);
    avisarDeFichaRenovada(queryClient, id);
    nutricion = (await fetchNutricion([id]))[id] ?? null;
  }
  return { producto, nutricion, renovable };
}

/**
 * El detalle de la nutrición de un producto del catálogo. Sin reintento automático:
 * un fallo de renovación se repite solo si la persona pulsa «Reintentar», porque repetirlo
 * a los pocos segundos sería gastar otra consulta.
 */
export function useNutricionProducto(productoId: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.nutricionDeProducto(productoId),
    queryFn: () => cargarDetalle(productoId, queryClient),
    retry: false,
    staleTime: FRESCURA_NUTRICION_MS,
  });
}
