/**
 * El catálogo de productos, para el escáner.
 *
 * Un código de barras se resuelve en este orden, de lo más cercano a lo más caro:
 *
 *   1. **Un producto de la propia nevera** con ese código (`buscarProductoPrivado`).
 *      Es lo que se creó a mano la vez anterior, cuando Open Food Facts no lo
 *      conocía. Es una lectura normal, acotada por RLS, y no gasta cuota.
 *   2. **El catálogo global**, a través de la Edge Function `lookup-barcode`
 *      (`buscarPorCodigo`). Ella decide si lo sirve de su caché o pregunta a
 *      Open Food Facts; el móvil NUNCA llama a un tercero (docs/threat-model.md §4).
 *
 * Si ninguno lo conoce, el alta sigue a mano con el código ya puesto, y al
 * guardar se crea el producto privado (`crearProductoPrivado`) para que la
 * próxima vez se reconozca en el paso 1.
 *
 * ── Qué entra de fuera y qué se vuelve a comprobar ────────────────────────
 *
 * La respuesta de la función se trata como entrada no confiable aunque la
 * escriba nuestro servidor: sale de un catálogo que edita cualquiera. Por eso
 * `leerRespuesta` solo se queda con los campos que espera y con el tipo que
 * espera, y no reenvía nada más.
 */

import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { esFalloDeRed, mensajeSinConexion } from '@/shared/lib/conexion';
import { errorSinTraducir } from '@/shared/lib/error-generico';
import { normalizarGtin } from '@/shared/lib/gtin';
import { supabase } from '@/shared/lib/supabase';
import type { UnitFamily } from '@/shared/lib/units';

/** Lo que `lookup-barcode` devuelve de un producto. Nunca el payload de OFF. */
export type ProductoEscaneado = {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  unit_family: UnitFamily | null;
  net_quantity: number | null;
  image_url: string | null;
};

export type ResultadoBusqueda =
  | { encontrado: true; producto: ProductoEscaneado }
  | { encontrado: false; codigo: string };

/**
 * Un error de la búsqueda con un mensaje ya escrito para leerse.
 *
 * `codigo` es el que pone la función (`demasiadas_consultas`, `sin_sesion`…) o uno
 * propio de la app (`sin_conexion`). Sirve para decidir qué botones enseñar, no
 * para reescribir el mensaje: ese ya viene en español y dice qué hacer.
 */
export class ErrorBusqueda extends Error {
  readonly codigo: string;
  constructor(codigo: string, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorBusqueda';
    this.codigo = codigo;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAMILIAS = new Set(['mass', 'volume', 'count']);

function texto(valor: unknown, max: number): string | null {
  return typeof valor === 'string' && valor.length > 0 && valor.length <= max ? valor : null;
}

/** Se queda con lo esperado y con su tipo; si algo no cuadra, no hay producto. */
function leerProducto(valor: unknown): ProductoEscaneado | null {
  if (typeof valor !== 'object' || valor === null) return null;
  const p = valor as Record<string, unknown>;
  const id = typeof p.id === 'string' && UUID.test(p.id) ? p.id : null;
  const barcode = typeof p.barcode === 'string' ? normalizarGtin(p.barcode) : null;
  const name = texto(p.name, 200);
  if (!id || !barcode || !name) return null;

  return {
    id,
    barcode,
    name,
    brand: texto(p.brand, 120),
    unit_family:
      typeof p.unit_family === 'string' && FAMILIAS.has(p.unit_family)
        ? (p.unit_family as UnitFamily)
        : null,
    net_quantity:
      typeof p.net_quantity === 'number' && Number.isFinite(p.net_quantity) && p.net_quantity > 0
        ? p.net_quantity
        : null,
    image_url: texto(p.image_url, 300),
  };
}

function leerRespuesta(cuerpo: unknown, codigo: string): ResultadoBusqueda {
  const c = (cuerpo ?? {}) as Record<string, unknown>;
  if (c.found === false) return { encontrado: false, codigo };
  if (c.found === true) {
    const producto = leerProducto(c.product);
    if (producto) return { encontrado: true, producto };
  }
  // Una respuesta que no es ninguna de las dos formas conocidas no se interpreta.
  throw new ErrorBusqueda('respuesta_rara', errorSinTraducir('catálogo', cuerpo));
}

/** El mensaje que escribió la función, si lo hay. */
async function mensajeDeLaFuncion(error: FunctionsHttpError): Promise<ErrorBusqueda> {
  try {
    const cuerpo = (await error.context.json()) as { code?: unknown; message?: unknown };
    if (typeof cuerpo.code === 'string' && typeof cuerpo.message === 'string' && cuerpo.message) {
      return new ErrorBusqueda(cuerpo.code, cuerpo.message);
    }
  } catch {
    // Una respuesta que no es JSON viene del gateway, no de nuestra función.
  }
  return new ErrorBusqueda('servicio', errorSinTraducir('catálogo', error));
}

/**
 * Pregunta por un código a la Edge Function. El código debe llegar ya validado,
 * pero se vuelve a normalizar: es la frontera con el servidor.
 */
export async function buscarPorCodigo(codigo: string): Promise<ResultadoBusqueda> {
  const normalizado = normalizarGtin(codigo);
  if (normalizado === null) {
    throw new ErrorBusqueda(
      'codigo_invalido',
      'Ese código no es válido. Revisa los números: el último es de control.',
    );
  }

  const { data, error } = await supabase.functions.invoke('lookup-barcode', {
    body: { barcode: normalizado },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) throw await mensajeDeLaFuncion(error);
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      throw new ErrorBusqueda('sin_conexion', mensajeSinConexion());
    }
    if (esFalloDeRed(error.message)) throw new ErrorBusqueda('sin_conexion', mensajeSinConexion());
    throw new ErrorBusqueda('servicio', errorSinTraducir('catálogo', error));
  }

  return leerRespuesta(data, normalizado);
}

/** El producto que ya se creó en ESTA nevera con ese código, si existe. */
export async function buscarProductoPrivado(
  householdId: string,
  codigo: string,
): Promise<ProductoEscaneado | null> {
  const normalizado = normalizarGtin(codigo);
  if (normalizado === null) return null;

  const { data, error } = await supabase
    .from('products')
    .select('id, barcode, name, brand, unit_family, net_quantity, image_url')
    .eq('household_id', householdId)
    .eq('barcode', normalizado)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw error;
  return leerProducto(((data ?? []) as unknown[])[0]);
}

export type NuevoProductoPrivado = {
  householdId: string;
  barcode: string;
  name: string;
};

/**
 * Crea el producto privado de una nevera. Devuelve su id.
 *
 * Es un insert directo y no una función: la RLS ya exige ser miembro de esa
 * nevera y las restricciones de la tabla validan el resto (código de 8 a 14
 * cifras, origen `user`, imagen solo de OFF). Solo se guardan el código y el
 * nombre que la persona acaba de teclear; la cantidad y la unidad NO, porque lo
 * que se pone al dar de alta es cuánto se compra (tres botes), no cuánto trae
 * cada envase.
 */
export async function crearProductoPrivado(producto: NuevoProductoPrivado): Promise<string> {
  const normalizado = normalizarGtin(producto.barcode);
  if (normalizado === null) {
    throw new ErrorBusqueda('codigo_invalido', 'Ese código no es válido.');
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      household_id: producto.householdId,
      barcode: normalizado,
      name: producto.name.trim(),
      data_source: 'user',
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

/** Un código de barras o un id de producto que llega por la ruta: solo si cuadra. */
export function codigoDeRuta(valor: unknown): string | null {
  return typeof valor === 'string' ? normalizarGtin(valor) : null;
}

export function idDeRuta(valor: unknown): string | null {
  return typeof valor === 'string' && UUID.test(valor) ? valor : null;
}
