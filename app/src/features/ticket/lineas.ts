/**
 * Las líneas de un ticket leído, antes de guardar nada: lo que llega de la función, lo que se enseña
 * para revisar y lo que acaba guardándose. Pura, para poder probarla.
 *
 * `opsi-ticket` devuelve lo que un modelo leyó de una FOTO, así que es entrada no confiable aunque la
 * mande nuestro servidor: se lee solo lo que se espera, con los textos limpios y las cantidades
 * acotadas. Y nada se guarda sin pasar por la pantalla de revisión, donde la persona cambia lo que
 * haga falta y marca lo que sí entra: el modelo propone, la persona confirma.
 */

import { borradorDeRuta } from '../chat/mensajes.ts';
import type { LineaChat, UnidadChat } from '../chat/propuestas.ts';
import type { MarcaDeLinea } from './marcas.ts';
import { nombreEsNoComida } from '../../shared/lib/no-comida.ts';

export type ProductoTicket = {
  nombre: string;
  cantidad: number | null;
  unidad: UnidadChat | null;
  /** El modelo (o el nombre) dice que se come o se bebe. */
  comida: boolean;
  /** La línea tal como está impresa, sin cantidad ni importe. Existe solo si el lector la dio. */
  texto?: string;
  /** El importe de la línea en euros. Existe solo si el lector lo dio. */
  precio?: number;
};

/** Lo que el lector sacó de la foto: las líneas y, si se lee, la tienda de la cabecera. */
export type TicketLeido = { productos: ProductoTicket[]; tienda: string | null };

export const MAX_PRODUCTOS = 60;
const MAX_NOMBRE = 80;
const MAX_TEXTO = 120;
const MAX_TIENDA = 60;
const MAX_PRECIO = 10_000;
const MAX_CANTIDAD = 1_000_000;
const UNIDADES: readonly UnidadChat[] = ['unidades', 'g', 'kg', 'ml', 'l'];

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Lo que `opsi-ticket` mandó como `productos`, ya limpio. Cualquier cosa rara da una lista más corta, no un fallo. */
export function leerProductosTicket(valor: unknown): ProductoTicket[] {
  if (!Array.isArray(valor)) return [];
  const salida: ProductoTicket[] = [];
  for (const crudo of valor.slice(0, MAX_PRODUCTOS)) {
    if (!esObjeto(crudo) || typeof crudo.nombre !== 'string') continue;
    const nombre = [...borradorDeRuta(crudo.nombre)].slice(0, MAX_NOMBRE).join('');
    if (nombre === '') continue;
    const cantidad =
      typeof crudo.cantidad === 'number' && Number.isFinite(crudo.cantidad) && crudo.cantidad > 0 && crudo.cantidad <= MAX_CANTIDAD
        ? crudo.cantidad
        : null;
    const unidad = UNIDADES.includes(crudo.unidad as UnidadChat) ? (crudo.unidad as UnidadChat) : null;
    const linea: ProductoTicket = {
      nombre,
      cantidad: cantidad !== null && unidad !== null ? cantidad : null,
      unidad: cantidad !== null && unidad !== null ? unidad : null,
      comida: crudo.comida !== false && !nombreEsNoComida(nombre),
    };
    // La evidencia de origen solo si llega: un ticket leído por una versión anterior no la lleva, y no se inventa.
    const texto = typeof crudo.texto === 'string' ? [...borradorDeRuta(crudo.texto).trim()].slice(0, MAX_TEXTO).join('').trim() : '';
    if (texto !== '') linea.texto = texto;
    if (typeof crudo.precio === 'number' && Number.isFinite(crudo.precio) && crudo.precio > 0 && crudo.precio <= MAX_PRECIO) {
      linea.precio = Math.round(crudo.precio * 100) / 100;
    }
    salida.push(linea);
  }
  return salida;
}

/** La tienda de la cabecera tal como la leyó el lector, o null. */
export function leerTiendaTicket(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpia = [...borradorDeRuta(valor).trim()].slice(0, MAX_TIENDA).join('').trim();
  return limpia === '' ? null : limpia;
}

/** Una fila de la pantalla de revisión: todo lo que se puede cambiar, como texto o casilla. */
export type LineaRevision = {
  /** Solo sirve de clave de lista y de identificar la fila al editarla. */
  clave: string;
  nombre: string;
  /** Texto, como lo escribe la persona («1,5»). Vacío = sin cantidad. */
  cantidad: string;
  unidad: UnidadChat;
  incluir: boolean;
  /** Lo que dijo el lector: sirve para avisar de que «no parece comida». */
  comida: boolean;
  /** Ya se guardó en esta pantalla: no se vuelve a guardar si hay que reintentar lo demás. */
  guardada?: boolean;
} & MarcaDeLinea;

/** «1,5» o «1.5» → 1,5; lo que no es un número mayor que cero y razonable, null. */
export function parsearCantidad(texto: string): number | null {
  const limpio = texto.trim().replace(',', '.');
  if (limpio === '' || !/^\d+(\.\d+)?$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n > 0 && n <= MAX_CANTIDAD ? Math.round(n * 1000) / 1000 : null;
}

function textoDeCantidad(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/** Las filas con las que se abre la revisión: entra lo que parece comida, y lo demás queda sin marcar. */
export function lineasIniciales(productos: readonly ProductoTicket[]): LineaRevision[] {
  return productos.map((p, i) => ({
    clave: `l${i}`,
    nombre: p.nombre,
    cantidad: p.cantidad !== null ? textoDeCantidad(p.cantidad) : '',
    unidad: p.unidad ?? 'unidades',
    incluir: p.comida,
    comida: p.comida,
    ...(p.texto !== undefined ? { texto: p.texto } : {}),
    ...(p.precio !== undefined ? { precio: p.precio } : {}),
    nombreOriginal: p.nombre,
    // Lo que no parece comida no se busca: no tiene marca que buscar.
    busqueda: p.comida ? 'pendiente' : 'no_aplica',
  }));
}

/** La unidad que sigue al tocarla: unidades → g → kg → ml → l → unidades. */
export function siguienteUnidad(u: UnidadChat): UnidadChat {
  const i = UNIDADES.indexOf(u);
  return UNIDADES[(i + 1) % UNIDADES.length] ?? 'unidades';
}

/**
 * Lo que se guarda: las filas marcadas con nombre. Lo que el nombre delata como no comida (tabaco…)
 * no entra aunque se marque: Opsi solo guarda comida y bebida. Sin cantidad se guarda una unidad.
 */
export function paraGuardar(lineas: readonly LineaRevision[]): LineaChat[] {
  return pendientesDeGuardar(lineas).map((p) => p.linea);
}

/**
 * Lo mismo, con la clave de la fila de la que sale cada cosa: sirve para ir marcando como guardadas
 * las filas una a una, y que un fallo a medias no obligue a repetir las que ya entraron.
 */
export function pendientesDeGuardar(
  lineas: readonly LineaRevision[],
): { clave: string; linea: LineaChat; fila: LineaRevision }[] {
  const salida: { clave: string; linea: LineaChat; fila: LineaRevision }[] = [];
  for (const l of lineas) {
    const nombre = [...l.nombre.trim()].slice(0, MAX_NOMBRE).join('');
    if (!l.incluir || l.guardada === true || nombre === '' || nombreEsNoComida(nombre)) continue;
    const cantidad = parsearCantidad(l.cantidad);
    salida.push({ clave: l.clave, linea: { nombre, cantidad, unidad: cantidad !== null ? l.unidad : null }, fila: l });
  }
  return salida;
}

/** Si una fila marcada no se va a guardar por lo que dice su nombre (para decírselo, no callarlo). */
export function bloqueadaPorNombre(l: Pick<LineaRevision, 'nombre'>): boolean {
  return nombreEsNoComida(l.nombre);
}

/** El nombre sin mayúsculas, acentos ni plurales sencillos, para comparar «Leche» con «leche» o «huevo» con «huevos». */
export function claveDeNombre(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9ñ]+/)
    .filter(Boolean)
    .map((p) => (p.length > 3 && p.endsWith('s') ? p.slice(0, -1) : p))
    .join(' ');
}

/**
 * Las líneas pendientes de las listas que corresponden a algo del ticket, por nombre igual (sin
 * importar mayúsculas, acentos ni plural). Solo igual: «leche» no tacha «leche de avena». Cada línea
 * pendiente sale una vez.
 */
export function coincidencias<T extends { name: string }>(
  guardados: readonly string[],
  pendientes: readonly T[],
): T[] {
  const claves = new Set(guardados.map(claveDeNombre).filter((k) => k !== ''));
  return pendientes.filter((p) => claves.has(claveDeNombre(p.name)));
}
