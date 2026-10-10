/**
 * Open Food Facts: la consulta y, sobre todo, la desconfianza.
 *
 * OFF es una base de datos que EDITA CUALQUIERA. Todo lo que devuelve es entrada
 * no confiable: un nombre con saltos de línea, una marca con caracteres que
 * invierten el sentido del texto, una URL de imagen que apunta a otro dominio, o
 * una frase pensada para que un modelo la obedezca el día que el chat la lea. Y lo
 * que aquí se guarda lo ve todo el mundo, porque la caché del catálogo es global.
 *
 * Por eso este módulo tiene dos mitades que no se mezclan:
 *
 *   · `normalizarRespuestaOff` —pura— se queda con un SUBCONJUNTO de campos y cada
 *     uno pasa por su filtro (texto limpio y con tope, imagen solo de un dominio,
 *     categorías con un formato exacto). Lo demás se tira. Es lo que se prueba
 *     con fixtures.
 *   · `consultarOff` hace la llamada, con el host fijo en el código, sin seguir
 *     redirecciones, con tiempo máximo y con tope de tamaño.
 *
 * Sin dependencias de Deno: se prueba con `node --test`.
 */

export type FamiliaUnidad = 'mass' | 'volume' | 'count';

/** Lo ÚNICO que sale de aquí hacia la base de datos. Todo ya filtrado. */
export type ProductoOff = {
  name: string;
  brand: string | null;
  unitFamily: FamiliaUnidad | null;
  /** En unidad base: gramos, mililitros o piezas. */
  netQuantity: number | null;
  imageUrl: string | null;
  categoriesTags: string[];
};

export type ResultadoOff =
  | { tipo: 'encontrado'; producto: ProductoOff }
  | { tipo: 'no_existe' }
  | { tipo: 'error'; motivo: string };

// ── Límites ───────────────────────────────────────────────────────────────

export const MAX_NOMBRE = 120;
export const MAX_MARCA = 80;
const MAX_IMAGEN = 300;
const MAX_CATEGORIAS = 40;
/** Más que esto de cantidad es un error de la ficha, no un producto. */
const MAX_CANTIDAD = 1_000_000;

// ── Texto ─────────────────────────────────────────────────────────────────

/**
 * Deja un texto de OFF listo para guardar y enseñar, o null si no queda nada.
 *
 *   1. Todo espacio (saltos de línea y tabuladores incluidos) pasa a UN espacio:
 *      un nombre de una línea no puede colar un párrafo en un prompt.
 *   2. Se borran los caracteres de control, los de formato —que incluyen los
 *      bidireccionales (U+202A–202E, U+2066–2069) con los que se reordena el texto
 *      al pintarlo, y los de ancho cero— y los de uso privado.
 *   3. Se quitan `<` y `>`: nada de lo que se guarda necesita marcado.
 *   4. Tope de longitud en caracteres, sin partir un par sustituto.
 */
export function limpiarTexto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null;
  // Se corta ANTES de procesar: no tiene sentido normalizar un megabyte.
  const bruto = valor.length > max * 8 ? valor.slice(0, max * 8) : valor;
  const limpio = bruto
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '')
    .replace(/[<>]/g, '')
    .trim();
  if (limpio === '') return null;
  const cortado = Array.from(limpio).slice(0, max).join('').trim();
  return cortado === '' ? null : cortado;
}

// ── Cantidad ──────────────────────────────────────────────────────────────

/** Cada unidad reconocida: su familia y cuánto vale en la unidad base. */
const UNIDADES: Record<string, { familia: FamiliaUnidad; factor: number }> = {
  kg: { familia: 'mass', factor: 1000 },
  g: { familia: 'mass', factor: 1 },
  gr: { familia: 'mass', factor: 1 },
  grs: { familia: 'mass', factor: 1 },
  mg: { familia: 'mass', factor: 0.001 },
  l: { familia: 'volume', factor: 1000 },
  lt: { familia: 'volume', factor: 1000 },
  litro: { familia: 'volume', factor: 1000 },
  litros: { familia: 'volume', factor: 1000 },
  dl: { familia: 'volume', factor: 100 },
  cl: { familia: 'volume', factor: 10 },
  ml: { familia: 'volume', factor: 1 },
  u: { familia: 'count', factor: 1 },
  ud: { familia: 'count', factor: 1 },
  uds: { familia: 'count', factor: 1 },
  un: { familia: 'count', factor: 1 },
  unidad: { familia: 'count', factor: 1 },
  unidades: { familia: 'count', factor: 1 },
  pieza: { familia: 'count', factor: 1 },
  piezas: { familia: 'count', factor: 1 },
};

export type Cantidad = { unitFamily: FamiliaUnidad; netQuantity: number };

function aCantidad(familia: FamiliaUnidad, valor: number): Cantidad | null {
  if (!Number.isFinite(valor) || valor <= 0 || valor > MAX_CANTIDAD) return null;
  return { unitFamily: familia, netQuantity: Math.round(valor * 1000) / 1000 };
}

/**
 * El campo `quantity` de OFF es texto libre y llega de todo: «1 L», «330 ml»,
 * «500g», «1,5 l», «6 x 33 cl», «400 g e» (la «e» es la marca de estimado).
 * Se reconoce el principio con una expresión de tamaño acotado y se ignora el
 * resto. Lo que no se entiende devuelve null: más vale dejar la cantidad para
 * que la ponga la persona que inventar una.
 */
export function parsearCantidad(texto: unknown): Cantidad | null {
  if (typeof texto !== 'string' || texto.length > 80) return null;
  const m =
    /^\s*(?:(\d{1,3})\s*[x×*]\s*)?(\d{1,6}(?:[.,]\d{1,3})?)(?![.,]?\d)\s*([a-zA-Z]+)?/.exec(
      texto,
    );
  if (!m) return null;
  const multiplicador = m[1] ? Number(m[1]) : 1;
  const numero = Number(m[2].replace(',', '.'));
  const unidad = m[3] ? UNIDADES[m[3].toLowerCase()] : undefined;

  // Una unidad que no se conoce («e», «oz», «lb») invalida la cantidad entera:
  // no se adivina si «12 oz» eran onzas de peso o de volumen.
  if (m[3] && !unidad) return null;
  // Un número solo («12») son piezas.
  const familia = unidad?.familia ?? 'count';
  const factor = unidad?.factor ?? 1;
  return aCantidad(familia, numero * multiplicador * factor);
}

/**
 * OFF trae además `product_quantity` (el total ya sumado) y su unidad, que es
 * siempre g o ml. Cuando están, valen más que el texto libre.
 */
function cantidadNumerica(numero: unknown, unidad: unknown): Cantidad | null {
  const valor = typeof numero === 'number' ? numero : Number(numero);
  if (typeof unidad !== 'string') return null;
  const u = unidad.toLowerCase();
  if (u === 'g') return aCantidad('mass', valor);
  if (u === 'ml') return aCantidad('volume', valor);
  return null;
}

// ── Imagen ────────────────────────────────────────────────────────────────

/** El único dominio del que se acepta una imagen. Cualquier otro se descarta. */
const DOMINIO_IMAGENES = 'images.openfoodfacts.org';

/**
 * Una URL de imagen es una orden a la app para que descargue algo. Si OFF dejara
 * poner cualquiera, el catálogo global serviría de pixel de seguimiento a quien
 * edite una ficha: cada móvil que abriera el producto avisaría a su servidor.
 */
export function imagenValida(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.length > MAX_IMAGEN) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== DOMINIO_IMAGENES) return null;
  if (url.port !== '' || url.username !== '' || url.password !== '') return null;
  return url.href.length <= MAX_IMAGEN ? url.href : null;
}

// ── Categorías ────────────────────────────────────────────────────────────

/**
 * Las categorías sirven para buscar cuánto aguanta abierto, y ahí solo cuentan
 * las etiquetas con la forma de OFF: idioma, dos puntos y un identificador en
 * minúsculas. OFF trae basura mezclada («en:Petit-déjeuners», «pt:bebidas
 * cafeína»); lo que no encaja exacto se tira.
 */
export function categoriasValidas(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const vistas = new Set<string>();
  for (const etiqueta of valor) {
    if (typeof etiqueta === 'string' && /^[a-z]{2}:[a-z0-9-]{1,80}$/.test(etiqueta)) {
      vistas.add(etiqueta);
      if (vistas.size >= MAX_CATEGORIAS) break;
    }
  }
  return [...vistas];
}

// ── Normalizar la respuesta ───────────────────────────────────────────────

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * De la respuesta de OFF a lo único que se guarda. Devuelve null si no hay un
 * producto con nombre: una ficha sin nombre no sirve de nada y no se cachea.
 */
export function normalizarRespuestaOff(json: unknown): ProductoOff | null {
  if (!esObjeto(json) || json.status !== 1 || !esObjeto(json.product)) return null;
  const p = json.product;

  const name =
    limpiarTexto(p.product_name_es, MAX_NOMBRE) ??
    limpiarTexto(p.product_name, MAX_NOMBRE) ??
    limpiarTexto(p.generic_name, MAX_NOMBRE);
  if (name === null) return null;

  // «Nutella, Ferrero»: la primera es la marca del producto.
  const marcas = typeof p.brands === 'string' ? p.brands.split(',') : [];
  const brand = limpiarTexto(marcas[0], MAX_MARCA);

  const cantidad = cantidadNumerica(p.product_quantity, p.product_quantity_unit) ?? parsearCantidad(p.quantity);

  return {
    name,
    brand,
    unitFamily: cantidad?.unitFamily ?? null,
    netQuantity: cantidad?.netQuantity ?? null,
    imageUrl: imagenValida(p.image_front_url) ?? imagenValida(p.image_front_small_url),
    categoriesTags: categoriasValidas(p.categories_tags),
  };
}

// ── La llamada ────────────────────────────────────────────────────────────

/**
 * El servidor al que se llama. Va en el código y no se construye con nada que
 * venga del cliente: del cliente solo llega un código de barras de cifras, y va
 * en la ruta. Ni host, ni esquema, ni ruta ni parámetros se aceptan de fuera.
 */
const ORIGEN_OFF = 'https://world.openfoodfacts.org';

/** Los campos que se piden. Pedir menos es descargar menos y guardar menos. */
const CAMPOS_OFF = [
  'code',
  'product_name',
  'product_name_es',
  'generic_name',
  'brands',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'categories_tags',
  'image_front_url',
  'image_front_small_url',
].join(',');

export const TIEMPO_MAXIMO_MS = 4000;
export const MAX_CUERPO_OFF = 256 * 1024;

export type OpcionesOff = {
  userAgent: string;
  /** Inyectable para las pruebas. En producción es el `fetch` global. */
  fetchImpl?: typeof fetch;
  tiempoMaximoMs?: number;
};

/**
 * Lee el cuerpo sin pasar de `max` bytes. Una respuesta enorme se corta en cuanto
 * se pasa, en lugar de cargarla entera en memoria para mirar después su tamaño.
 *
 * Sirve para una `Response` (lo que contesta OFF) y para una `Request` (lo que
 * manda el cliente): las dos tienen cabeceras y un cuerpo en flujo.
 */
export async function leerLimitado(
  respuesta: { headers: Headers; body: ReadableStream<Uint8Array> | null },
  max: number,
): Promise<string | null> {
  const declarado = Number(respuesta.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > max) return null;
  if (!respuesta.body) return null;

  const lector = respuesta.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel();
      return null;
    }
    trozos.push(value);
  }
  const todo = new Uint8Array(total);
  let posicion = 0;
  for (const trozo of trozos) {
    todo.set(trozo, posicion);
    posicion += trozo.byteLength;
  }
  return new TextDecoder().decode(todo);
}

/**
 * Pregunta a Open Food Facts por UN código, que debe llegar ya validado y
 * normalizado (`normalizarGtin`). Nunca lanza: todo fallo es un resultado.
 */
export async function consultarOff(codigo: string, opciones: OpcionesOff): Promise<ResultadoOff> {
  // Cinturón y tirantes: quien llama ya validó, pero esta es la función que pone
  // el código en una URL, y aquí no debe poder entrar nada que no sean cifras.
  if (!/^[0-9]{8,14}$/.test(codigo)) return { tipo: 'error', motivo: 'codigo_no_numerico' };

  const url = `${ORIGEN_OFF}/api/v2/product/${codigo}.json?fields=${CAMPOS_OFF}`;
  const llamar = opciones.fetchImpl ?? fetch;

  let respuesta: Response;
  try {
    respuesta = await llamar(url, {
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

  // OFF contesta 404 con `status: 0` cuando no conoce el código.
  if (respuesta.status === 404) {
    await respuesta.body?.cancel();
    return { tipo: 'no_existe' };
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

  // Un 200 con `status: 0` también significa «no existe» (pasa con códigos que
  // OFF considera inválidos). Y un producto sin nombre es lo mismo para nosotros.
  const producto = normalizarRespuestaOff(json);
  return producto ? { tipo: 'encontrado', producto } : { tipo: 'no_existe' };
}
