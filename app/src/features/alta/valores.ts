/**
 * Lo que el alta propone antes de que nadie toque nada.
 *
 * Vive aparte, sin JSX, porque lo usan dos pantallas que tienen que proponer LO
 * MISMO: el formulario completo (`alta.tsx`) y la hoja rápida que sale al escanear
 * un producto conocido (`HojaAltaRapida`). Si cada una tuviera sus reglas, «Editar»
 * en la hoja abriría un formulario con otros valores que la hoja que acaba de
 * enseñar.
 */

import type { StorageLocation } from '@/api/inventory';
import type { LineaLista } from '@/api/lista';
import type { Categoria } from '@/shared/lib/categorias';
import {
  fromBase,
  unidadSugerida,
  type MeasurementUnit,
  type UnitFamily,
} from '@/shared/lib/units';

/** Cinco años. Más que eso no es una conserva: es un error de tecleo. */
export const DIAS_MAX = 1825;

/** Los plazos de la hoja rápida: la respuesta corta a «¿hasta cuándo?». Cuentan DÍAS desde hoy. */
export const ATAJOS: [string, number][] = [
  ['1 día', 1],
  ['3 días', 3],
  ['1 semana', 7],
  ['2 semanas', 14],
  ['1 mes', 30],
];

/**
 * Dónde se guarda lo que es de cada pasillo, casi siempre. Se propone y no se
 * impone: un toque lo cambia. Acertar aquí es lo que hace que guardar un yogur no
 * exija decir que va a la nevera.
 */
const UBICACION_DEL_PASILLO: Record<Categoria, StorageLocation> = {
  frutas_verduras: 'fridge',
  carne: 'fridge',
  pescado: 'fridge',
  lacteos: 'fridge',
  panaderia: 'pantry',
  despensa: 'pantry',
  congelados: 'freezer',
  bebidas: 'pantry',
  dulces: 'pantry',
  otros: 'pantry',
};

export function ubicacionSugerida(categoria: Categoria): StorageLocation {
  return UBICACION_DEL_PASILLO[categoria];
}

/** Lo que el catálogo sabe del contenido de un envase. */
export type Contenido = { unit_family: UnitFamily | null; net_quantity: number | null };

/** El contenido del envase, listo para el formulario: «1 L» → 1 l, «330 ml» → 330 ml. */
export function cantidadInicial(
  ficha: Contenido | null,
  linea: Pick<LineaLista, 'quantity' | 'display_unit'> | null,
): { quantity: string; unit: MeasurementUnit } {
  const texto = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  // Lo que se apuntó en la lista manda sobre lo que trae el envase: es lo que la
  // persona dijo que iba a comprar.
  if (linea?.quantity != null && linea.display_unit) {
    return { quantity: texto(fromBase(linea.quantity, linea.display_unit)), unit: linea.display_unit };
  }
  if (!ficha?.unit_family || !ficha.net_quantity) return { quantity: '1', unit: 'unit' };
  const sugerida = unidadSugerida(ficha.unit_family, ficha.net_quantity);
  return { quantity: texto(sugerida.amount), unit: sugerida.unit };
}

const UBICACIONES = new Set<string>(['pantry', 'fridge', 'freezer', 'other']);

/** Lo que llega por la ruta es entrada de fuera: solo se acepta un valor conocido. */
export function ubicacionDeRuta(valor: unknown): StorageLocation | null {
  return typeof valor === 'string' && UBICACIONES.has(valor) ? (valor as StorageLocation) : null;
}

/**
 * Un nombre que llega por la ruta: entrada de fuera, que solo rellena un campo de texto
 * que la persona ve y puede cambiar. Se limpia de caracteres de control y se acota.
 */
export function nombreDeRuta(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 200);
  return limpio === '' ? null : limpio;
}

/** Días que llegan por la ruta: un entero entre 1 y el máximo, o nada. */
export function diasDeRuta(valor: unknown): number | null {
  if (typeof valor !== 'string' || !/^[0-9]{1,4}$/.test(valor)) return null;
  const dias = Number(valor);
  return dias >= 1 && dias <= DIAS_MAX ? dias : null;
}
