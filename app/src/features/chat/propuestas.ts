/**
 * Las propuestas del chat: lo que Opsi PIDE hacer y la persona confirma o rechaza.
 *
 * El modelo no cambia nada. `opsi-chat` devuelve junto al texto una lista de propuestas
 * («apuntar esto», «guardar esto», «descontar esto»), la pantalla las enseña con «Sí» y «No» y
 * solo con el «Sí» la app llama a las funciones de siempre con la sesión de la persona. Este
 * módulo es la parte pura de eso: leer lo que llega y decir qué hay en cada tarjeta.
 *
 * Lo que llega es ENTRADA NO CONFIABLE aunque lo escriba nuestro servidor: sale de un modelo que
 * lee nombres que puede haber escrito cualquiera. Por eso `leerPropuestas` se queda solo con los
 * campos y tipos que espera, limpia los textos, acota las cantidades y tira lo que no cuadra; una
 * propuesta sin nada válido dentro no existe.
 */

import { borradorDeRuta } from './mensajes.ts';
import { formatQuantity, toBase, type MeasurementUnit, type UnitFamily } from '../../shared/lib/units.ts';

/** Las unidades que usa el servidor en las propuestas. */
export type UnidadChat = 'unidades' | 'g' | 'kg' | 'ml' | 'l';

/**
 * Una línea de una propuesta. `productoId` no viene nunca del servidor: lo pone la pantalla del ticket al
 * guardar, cuando la persona ya revisó con qué producto del catálogo se enlaza.
 */
export type LineaChat = { nombre: string; cantidad: number | null; unidad: UnidadChat | null; productoId?: string | null };
export type ElementoChat = {
  id: string;
  nombre: string;
  cantidad: number | null;
  unidad: UnidadChat | null;
  /** Se gasta entero: queda terminado. */
  todo: boolean;
};

export type PropuestaChat =
  | { tipo: 'apuntar' | 'guardar'; productos: LineaChat[] }
  | { tipo: 'gastar' | 'tirar'; elementos: ElementoChat[] };

/** En qué punto está una tarjeta. */
export type EstadoPropuesta =
  | { fase: 'pendiente' }
  | { fase: 'ejecutando' }
  | { fase: 'hecha'; resumen: string }
  | { fase: 'rechazada' }
  | { fase: 'error'; mensaje: string };

/** Los mismos topes que el servidor (`MAX_PROPUESTAS`, `MAX_LINEAS_PROPUESTA`): lo de más se tira. */
export const MAX_PROPUESTAS = 6;
export const MAX_LINEAS = 12;
const MAX_NOMBRE = 80;
const MAX_CANTIDAD = 1_000_000;
const UNIDADES: readonly UnidadChat[] = ['unidades', 'g', 'kg', 'ml', 'l'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Texto plano, sin caracteres que no se ven, en una línea y con tope. */
function nombreLimpio(v: unknown): string {
  return typeof v === 'string' ? [...borradorDeRuta(v)].slice(0, MAX_NOMBRE).join('') : '';
}

function cantidadLimpia(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= MAX_CANTIDAD ? v : null;
}

function unidadLimpia(v: unknown): UnidadChat | null {
  return UNIDADES.includes(v as UnidadChat) ? (v as UnidadChat) : null;
}

/** Una cantidad sin unidad no vale: sin saber en qué, ni se enseña ni se guarda. */
function conUnidad(cantidad: number | null, unidad: UnidadChat | null) {
  return cantidad !== null && unidad !== null ? { cantidad, unidad } : { cantidad: null, unidad: null };
}

function leerProductos(v: unknown): LineaChat[] {
  if (!Array.isArray(v)) return [];
  const salida: LineaChat[] = [];
  for (const crudo of v.slice(0, MAX_LINEAS)) {
    if (!esObjeto(crudo)) continue;
    const nombre = nombreLimpio(crudo.nombre);
    if (nombre === '') continue;
    salida.push({ nombre, ...conUnidad(cantidadLimpia(crudo.cantidad), unidadLimpia(crudo.unidad)) });
  }
  return salida;
}

function leerElementos(v: unknown): ElementoChat[] {
  if (!Array.isArray(v)) return [];
  const salida: ElementoChat[] = [];
  const vistos = new Set<string>();
  for (const crudo of v.slice(0, MAX_LINEAS)) {
    if (!esObjeto(crudo)) continue;
    const id = typeof crudo.id === 'string' && UUID.test(crudo.id) ? crudo.id.toLowerCase() : null;
    const nombre = nombreLimpio(crudo.nombre);
    if (id === null || nombre === '' || vistos.has(id)) continue;
    vistos.add(id);
    const todo = crudo.todo === true;
    // O se gasta entero o se dice cuánto: un gasto sin cantidad ni «todo» no se puede hacer.
    const { cantidad, unidad } = conUnidad(cantidadLimpia(crudo.cantidad), unidadLimpia(crudo.unidad));
    if (!todo && cantidad === null) continue;
    salida.push({ id, nombre, cantidad: todo ? null : cantidad, unidad: todo ? null : unidad, todo });
  }
  return salida;
}

/** Lo que `opsi-chat` mandó como `propuestas`, ya limpio. Cualquier cosa rara da una lista más corta, no un fallo. */
export function leerPropuestas(valor: unknown): PropuestaChat[] {
  if (!Array.isArray(valor)) return [];
  const salida: PropuestaChat[] = [];
  for (const crudo of valor.slice(0, MAX_PROPUESTAS)) {
    if (!esObjeto(crudo)) continue;
    if (crudo.tipo === 'apuntar' || crudo.tipo === 'guardar') {
      const productos = leerProductos(crudo.productos);
      if (productos.length > 0) salida.push({ tipo: crudo.tipo, productos });
    } else if (crudo.tipo === 'gastar' || crudo.tipo === 'tirar') {
      const elementos = leerElementos(crudo.elementos);
      // Tirar no lleva cantidad: se tira entero. Solo gastar distingue entre parte y todo.
      const validos = crudo.tipo === 'tirar' ? elementos.map((e) => ({ ...e, cantidad: null, unidad: null, todo: true })) : elementos;
      if (validos.length > 0) salida.push({ tipo: crudo.tipo, elementos: validos });
    }
  }
  return salida;
}

/** De la unidad del servidor a la de la app. */
export function unidadDeApp(u: UnidadChat): MeasurementUnit {
  return u === 'unidades' ? 'unit' : u;
}

/** De la familia de una unidad. */
function familiaDe(u: UnidadChat): UnitFamily {
  if (u === 'unidades') return 'count';
  return u === 'g' || u === 'kg' ? 'mass' : 'volume';
}

/** Una cantidad lista para guardar: en unidad base, con su familia y la unidad en que se dijo. */
export function cantidadParaGuardar(
  cantidad: number | null,
  unidad: UnidadChat | null,
): { unitFamily: UnitFamily; displayUnit: MeasurementUnit; quantity: number } {
  // Sin cantidad, una unidad: «he comprado pan» es un pan, y la persona lo cambia si quiere.
  if (cantidad === null || unidad === null) return { unitFamily: 'count', displayUnit: 'unit', quantity: 1 };
  return { unitFamily: familiaDe(unidad), displayUnit: unidadDeApp(unidad), quantity: toBase(cantidad, unidadDeApp(unidad)) };
}

/** «2 l», «4 ud.»: cómo se dice una cantidad en una tarjeta. */
export function textoCantidad(cantidad: number, unidad: UnidadChat): string {
  const u = unidadDeApp(unidad);
  return formatQuantity(toBase(cantidad, u), u);
}

/** Una línea de la tarjeta: el nombre y, si lo hay, cuánto. */
export function textoLinea(l: LineaChat | ElementoChat): string {
  if ('todo' in l && l.todo) return `${l.nombre} · entero`;
  return l.cantidad !== null && l.unidad !== null ? `${l.nombre} · ${textoCantidad(l.cantidad, l.unidad)}` : l.nombre;
}

/** El título de la tarjeta. `nevera` es el nombre de la nevera donde se guardaría. */
export function tituloDe(p: PropuestaChat, nevera: string): string {
  switch (p.tipo) {
    case 'apuntar':
      return 'Apuntar en la lista';
    case 'guardar':
      return `Guardar en ${nevera}`;
    case 'gastar':
      return 'Descontar de la nevera';
    case 'tirar':
      return 'Tirar';
  }
}

/** Las líneas de una propuesta, listas para pintar. */
export function lineasDe(p: PropuestaChat): string[] {
  return 'productos' in p ? p.productos.map(textoLinea) : p.elementos.map(textoLinea);
}
