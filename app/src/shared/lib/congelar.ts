/**
 * Cuándo recomendar «congélalo o úsalo».
 *
 * Es un consejo, no una regla: no cambia fechas ni bloquea nada, y NO dice que lo
 * que se congele «aguante» o «esté bueno». Solo avisa de que a algo de la nevera se
 * le acaba el plazo y de que congelarlo es una salida, igual que usarlo.
 *
 * ── «Por acabarse» ────────────────────────────────────────────────────────
 *
 * Se mide por la FECHA, no por lo que queda en el envase: congelar sirve para no
 * perder algo que va a vencer, y que quede poca cantidad no lo hace urgente. La
 * fecha es la efectiva que ya calcula la vista de prioridad (`days_left`: la del
 * envase, la de tras abrir…), así que este fichero no repite esa cuenta.
 *
 * El aviso sale con la fecha entre hoy y pasado mañana. La vista llama «prioridad
 * alta» a lo que vence hoy o mañana; un día más da margen para congelar sin que sea
 * a la carrera. Con la fecha ya pasada NO se recomienda congelar: congelar no arregla
 * lo vencido, y ahí manda el aviso rojo de siempre.
 *
 * ── Qué se puede congelar ─────────────────────────────────────────────────
 *
 * La app no tenía ninguna lista de lo congelable, así que esta es nueva y es un
 * criterio de trabajo, no una fuente autorizada (como la tabla de conservación
 * tras abrir: orientativo y pendiente de contrastar con una guía oficial). Ante la
 * duda, no se recomienda: aconsejar congelar algo que no se congela es peor que
 * callarse.
 *
 *   · Entran las categorías donde congelar es lo normal: carne, pescado y panadería.
 *   · Lácteos y huevos es un cajón mixto, así que solo entran por el nombre: queso,
 *     mantequilla y leche. Huevos, yogures, natas y natillas quedan fuera.
 *   · Fruta y verdura, despensa, bebidas, dulces y otros quedan fuera: o no aguantan
 *     bien el frío (lechuga, tomate), o no se congelan por plazo, o no se sabe qué son.
 *   · Lo ya congelado o descongelado no entra (ver `recomendarCongelar`).
 *
 * Sin JSX ni imports de React Native: se prueba con Node tal cual.
 */

import type { ItemState, StorageLocation } from '@/api/inventory';
import type { Categoria } from '@/shared/lib/categorias';

/** Hasta cuántos días de margen se avisa: hoy, mañana y pasado mañana. */
export const DIAS_PARA_CONGELAR = 2;

const CATEGORIAS_CONGELABLES: ReadonlySet<Categoria> = new Set<Categoria>([
  'carne',
  'pescado',
  'panaderia',
]);

/** En lácteos solo se congela esto. */
const LACTEO_CONGELABLE = /\b(queso|quesos|mantequilla|leche)\b/i;

/**
 * Lo que no se congela aunque su categoría sí: un huevo con cáscara, la mayonesa, una
 * lata abierta, la lechuga. Se mira ANTES que nada, así que gana siempre.
 */
const NUNCA_CONGELAR =
  /huevo|yogur|yogurt|natilla|\bnata\b|flan|cuajada|k[eé]fir|mayonesa|ensalada|lechuga|\blata\b|conserva/i;

export function esCongelable(categoria: Categoria, nombre: string): boolean {
  if (NUNCA_CONGELAR.test(nombre)) return false;
  if (categoria === 'lacteos') return LACTEO_CONGELABLE.test(nombre);
  return CATEGORIAS_CONGELABLES.has(categoria);
}

/** Lo mínimo que se mira de un elemento. Sirve la fila de la lista y el detalle. */
export type CandidatoCongelar = {
  name: string;
  category: Categoria;
  state: ItemState;
  location: StorageLocation;
  days_left: number | null;
  /** Cuándo se descongeló por última vez. Sigue puesto aunque el estado cambie. */
  thawed_at: string | null;
};

/**
 * ¿Toca decir «congélalo o úsalo»?
 *
 * Solo para lo que está en la nevera, sin congelar y sin haberse descongelado nunca.
 * Lo último se mira por `thawed_at` y NO por `state === 'thawed'`: al usar una parte
 * o abrir algo descongelado el estado pasa a «empezado» o «abierto», pero la fecha
 * de descongelación se queda, y recomendar congelar otra vez algo que ya se
 * descongeló es justo lo que la app prohíbe («no recongelar»).
 */
export function recomendarCongelar(e: CandidatoCongelar): boolean {
  if (e.state !== 'closed' && e.state !== 'open' && e.state !== 'partially_consumed') return false;
  if (e.location !== 'fridge') return false;
  if (e.thawed_at !== null) return false;
  if (e.days_left === null || e.days_left < 0 || e.days_left > DIAS_PARA_CONGELAR) return false;
  return esCongelable(e.category, e.name);
}
