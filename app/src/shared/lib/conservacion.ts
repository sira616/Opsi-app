/**
 * Conservación tras abrir: las cuentas y las palabras.
 *
 * Lo que NO está aquí, y es lo importante: la precedencia entre lo que dice el
 * catálogo para ese alimento y lo que dice la referencia por categoría. Esa
 * decisión vive en `shelf_life_for_item()`, en el servidor, y se resuelve en un
 * solo sitio a propósito. Copiarla aquí sería tener dos reglas que un día
 * dejarán de coincidir, y la que se vería en pantalla sería la equivocada.
 *
 * Este fichero solo hace dos cosas: sumar días a una fecha y escribir en
 * español el resultado. Sin JSX, así que se puede ejecutar con Node tal cual.
 */

import type { ShelfLifeOrigin, StorageLocation } from '@/api/inventory';
import { etiquetaCategoria, type Categoria } from '@/shared/lib/categorias';

/** El sitio, como nombre suelto. Para una etiqueta o un valor. */
export const UBICACION: Record<StorageLocation, string> = {
  pantry: 'Despensa',
  fridge: 'Nevera',
  freezer: 'Congelador',
  other: 'Otro sitio',
};

/**
 * El sitio, dentro de una frase: «Lo tienes en la despensa».
 *
 * Existe aparte de UBICACION porque el artículo cambia con el sitio y pegar
 * «en la» delante de «Congelador» da «en la congelador».
 */
export function enUbicacion(donde: StorageLocation): string {
  switch (donde) {
    case 'pantry':
      return 'en la despensa';
    case 'fridge':
      return 'en la nevera';
    case 'freezer':
      return 'en el congelador';
    default:
      return 'en otro sitio';
  }
}

/** «3 días», «1 día». En cifras, como manda la guía de voz. */
export function diasTexto(dias: number): string {
  return dias === 1 ? '1 día' : `${dias} días`;
}

/**
 * De dónde sale el plazo, dicho para leerse.
 *
 * Los dos orígenes son ORIENTATIVOS, y por eso los dos acaban en «no del
 * envase»: ni siquiera el del catálogo es un dato del producto que tienes en la
 * mano. `products.open_shelf_life_days` lo dice su propia migración: siempre es
 * `date_source = reference`. Enseñarlo como si viniera del envase sería
 * inventarse el único dato que este proyecto se comprometió a no inventarse.
 */
export function describeOrigenConservacion(
  origen: ShelfLifeOrigin,
  categoria: Categoria,
): string {
  return origen === 'producto'
    ? 'Plazo del catálogo para este alimento, no del envase.'
    : `Plazo general de ${etiquetaCategoria(categoria).toLowerCase()}, no del envase.`;
}

/**
 * Cuándo se acaba el plazo de algo ya abierto.
 *
 * Se cuenta por DÍAS DE CALENDARIO, no por horas, igual que `diasDesde` y que
 * las restas de fechas del servidor. Abrir un yogur a las 23:50 no se puede
 * comer un día entero de plazo por diez minutos.
 *
 * Devuelve null cuando no hay nada que sumar —sin abrir, o con una marca de
 * tiempo que no se puede leer—, y ese null se pinta como «no lo sé», no como
 * una fecha de hoy.
 */
export function fechaTrasAbrir(openedAt: string | null, dias: number): Date | null {
  if (!openedAt) return null;
  const desde = new Date(openedAt);
  if (Number.isNaN(desde.getTime())) return null;

  const fecha = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate());
  fecha.setDate(fecha.getDate() + dias);
  return fecha;
}

/** «25 de septiembre». Sin año: en una nevera nunca hace falta. */
export function formatFechaLarga(fecha: Date): string {
  return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
}

/**
 * ¿Ese plazo orientativo cae DESPUÉS de la fecha límite del elemento?
 *
 * Hace falta porque esta tabla no está enchufada a `inventory_with_priority`:
 * el plazo tras abrir que se calcula aquí no ha pasado por el mínimo que hace
 * la vista, así que puede salir más tarde que la fecha límite real. Enseñarlo
 * entonces sería regalar días que el elemento no tiene, que es exactamente lo
 * que un consejo orientativo no puede hacer nunca.
 *
 * `effective_limit_date` es una fecha sin hora («2026-09-25»), así que se
 * compara a medianoche local y no con `new Date(iso)`, que la interpretaría en
 * UTC y desplazaría el día entero en media España.
 */
export function posteriorALimite(fecha: Date, limiteIso: string | null): boolean {
  if (!limiteIso) return false;

  const [anio, mes, dia] = limiteIso.slice(0, 10).split('-').map(Number);
  if (!anio || !mes || !dia) return false;

  return fecha.getTime() > new Date(anio, mes - 1, dia).getTime();
}
