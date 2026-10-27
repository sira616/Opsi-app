/**
 * Open Food Facts por TEXTO: de las palabras de una línea de ticket a productos que podrían ser.
 *
 * Es el mismo cliente de OFF que `off.ts` —el mismo User-Agent, el mismo tiempo máximo, el mismo tope
 * de cuerpo, los mismos filtros de texto, imagen y categorías— con una segunda llamada: la búsqueda de
 * texto, que `off.ts` (un código de barras, una ficha) no hace. Va al buscador de OFF
 * (`search.openfoodfacts.org`, «Search-a-licious»), porque la búsqueda antigua (`cgi/search.pl`) está
 * deprecada y contestaba 503 cuando se probó.
 *
 * ── Qué se puede esperar de esto ─────────────────────────────────────────
 *
 * Es una búsqueda por relevancia sobre una base que edita cualquiera: devuelve candidatos, no
 * respuestas. Trae productos que no se parecen, fichas sin marca, fichas con el nombre en otro idioma y
 * códigos que no son de comida. Cada resultado pasa por los filtros de `off.ts` y por un GTIN válido
 * (`normalizarGtin`), y lo que decide si un candidato vale lo decide `resolver.ts`, no este módulo.
 *
 * OFF no publica un límite para este buscador; su documentación fija 10 peticiones por minuto por IP
 * para las búsquedas de su API principal, y aquí se respeta ese orden de magnitud (ver
 * `consume_off_search` en la migración y `marcas.ts`).
 *
 * Sin dependencias de Deno: se prueba con `node --test`.
 */

import { esCodigoDeNoComida, normalizarGtin } from './gtin.ts';
import { esNoComida } from './nocomida.ts';
import {
  categoriasValidas,
  imagenValida,
  leerLimitado,
  limpiarTexto,
  MAX_CUERPO_OFF,
  MAX_MARCA,
  MAX_NOMBRE,
  parsearCantidad,
  TIEMPO_MAXIMO_MS,
  type Cantidad,
  type OpcionesOff,
} from './off.ts';

/**
 * El servidor al que se llama. Va en el código: del cliente solo llegan palabras ya reducidas a
 * letras y cifras, o un GTIN, y viajan como parámetros. Ni host, ni esquema, ni ruta se aceptan de fuera.
 */
const ORIGEN_BUSQUEDA = 'https://search.openfoodfacts.org/search';

/** Los productos de Opsi son de tickets españoles: se busca entre los que OFF dice vendidos en España. */
const FILTRO_PAIS = 'countries_tags:"en:spain"';

const CAMPOS = ['code', 'product_name', 'brands', 'quantity', 'categories_tags', 'stores', 'image_front_small_url'].join(',');

export const MAX_RESULTADOS = 12;
export const MAX_TEXTO_BUSQUEDA = 100;
const MAX_TIENDAS = 8;
const MAX_TIENDA = 40;
/** Cuántos resultados se miran como mucho aunque OFF devuelva más: un tope contra una respuesta enorme. */
const MAX_HITS_LEIDOS = 40;

/** Un resultado de la búsqueda, ya filtrado. */
export type CandidatoOff = {
  /** Un GTIN válido y normalizado. */
  code: string;
  name: string;
  brand: string | null;
  cantidad: Cantidad | null;
  categoriesTags: string[];
  /** Tiendas donde OFF dice que se vende (texto libre de la comunidad; solo ordena). */
  stores: string[];
  imageUrl: string | null;
};

export type ResultadoBusquedaOff =
  | { tipo: 'resultados'; candidatos: CandidatoOff[] }
  | { tipo: 'error'; motivo: string };

export type ConsultaOff = { palabras: readonly string[] } | { codigo: string };

/**
 * El texto que se manda a buscar: solo letras y cifras en minúsculas, separadas por espacios y acotado.
 * Nada de comillas, dos puntos, paréntesis ni operadores: lo que viaja es texto, no sintaxis de consulta
 * (y en minúsculas «and» y «or» no son operadores). Null si no queda nada que valga la pena buscar.
 */
export function textoDeBusqueda(palabras: readonly string[]): string | null {
  const limpias: string[] = [];
  let largo = 0;
  for (const p of palabras) {
    const w = p.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (w === '' || /^[0-9]+$/.test(w)) continue;
    if (largo + w.length + 1 > MAX_TEXTO_BUSQUEDA) break;
    limpias.push(w);
    largo += w.length + 1;
  }
  return limpias.join('').length >= 3 ? limpias.join(' ') : null;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/** OFF manda `brands` como lista, y a veces como texto con comas: la primera es la marca del producto. */
function primeraMarca(valor: unknown): string | null {
  if (Array.isArray(valor)) return limpiarTexto(valor[0], MAX_MARCA);
  if (typeof valor === 'string') return limpiarTexto(valor.split(',')[0], MAX_MARCA);
  return null;
}

function tiendasValidas(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const salida: string[] = [];
  for (const t of valor) {
    const limpia = limpiarTexto(t, MAX_TIENDA);
    if (limpia !== null && !salida.includes(limpia)) salida.push(limpia);
    if (salida.length >= MAX_TIENDAS) break;
  }
  return salida;
}

/**
 * De la respuesta del buscador a los candidatos. Cada campo pasa por el mismo filtro que una ficha
 * (`off.ts`); un resultado sin GTIN válido, sin nombre, de un prefijo que no es de comida o que OFF
 * o su nombre delatan como no comida (tabaco…) se tira, y los repetidos se quedan una vez.
 */
export function normalizarBusquedaOff(json: unknown): CandidatoOff[] {
  if (!esObjeto(json) || !Array.isArray(json.hits)) return [];
  const salida: CandidatoOff[] = [];
  const vistos = new Set<string>();
  for (const hit of json.hits.slice(0, MAX_HITS_LEIDOS)) {
    if (!esObjeto(hit)) continue;
    const crudo = typeof hit.code === 'string' || typeof hit.code === 'number' ? String(hit.code) : '';
    const code = normalizarGtin(crudo);
    if (code === null || esCodigoDeNoComida(code) || vistos.has(code)) continue;
    const name = limpiarTexto(hit.product_name, MAX_NOMBRE);
    if (name === null) continue;
    const categoriesTags = categoriasValidas(hit.categories_tags);
    if (esNoComida({ name, categoriesTags })) continue;
    vistos.add(code);
    salida.push({
      code,
      name,
      brand: primeraMarca(hit.brands),
      cantidad: parsearCantidad(hit.quantity),
      categoriesTags,
      stores: tiendasValidas(hit.stores),
      imageUrl: imagenValida(hit.image_front_small_url),
    });
    if (salida.length >= MAX_RESULTADOS) break;
  }
  return salida;
}

/**
 * Busca en OFF. Nunca lanza: todo fallo es un resultado (`http_429` es «sin cupo», lo demás, un error que
 * la importación tolera). El texto debe llegar ya reducido por `textoDeBusqueda`; el código, validado
 * por `normalizarGtin`. Aquí se vuelve a comprobar, porque esta es la función que lo pone en una URL.
 */
export async function buscarEnOff(consulta: ConsultaOff, opciones: OpcionesOff): Promise<ResultadoBusquedaOff> {
  let q: string;
  if ('codigo' in consulta) {
    if (!/^[0-9]{8,14}$/.test(consulta.codigo)) return { tipo: 'error', motivo: 'codigo_no_numerico' };
    q = `code:${consulta.codigo}`;
  } else {
    const texto = textoDeBusqueda(consulta.palabras);
    if (texto === null) return { tipo: 'error', motivo: 'sin_texto' };
    q = `${texto} ${FILTRO_PAIS}`;
  }

  const url = new URL(ORIGEN_BUSQUEDA);
  url.searchParams.set('q', q);
  url.searchParams.set('page_size', String(MAX_RESULTADOS));
  url.searchParams.set('fields', CAMPOS);
  const llamar = opciones.fetchImpl ?? fetch;

  let respuesta: Response;
  try {
    respuesta = await llamar(url.href, {
      method: 'GET',
      // Una redirección sacaría la petición del host fijado arriba.
      redirect: 'error',
      headers: { 'User-Agent': opciones.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS),
    });
  } catch (error) {
    const nombre = error instanceof Error ? error.name : 'desconocido';
    return { tipo: 'error', motivo: nombre === 'TimeoutError' ? 'tiempo_agotado' : 'red' };
  }

  if (!respuesta.ok) {
    await respuesta.body?.cancel();
    return { tipo: 'error', motivo: `http_${respuesta.status}` };
  }

  let json: unknown;
  try {
    const texto = await leerLimitado(respuesta, MAX_CUERPO_OFF);
    if (texto === null) return { tipo: 'error', motivo: 'respuesta_demasiado_grande' };
    json = JSON.parse(texto);
  } catch {
    return { tipo: 'error', motivo: 'respuesta_ilegible' };
  }
  // Una respuesta sin la lista de resultados no es un «no hay nada»: es otra cosa, y se dice.
  if (!esObjeto(json) || !Array.isArray(json.hits)) return { tipo: 'error', motivo: 'respuesta_ilegible' };

  return { tipo: 'resultados', candidatos: normalizarBusquedaOff(json) };
}
