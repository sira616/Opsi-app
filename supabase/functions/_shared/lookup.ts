/**
 * El cerebro de `lookup-barcode`: qué se comprueba, en qué orden y qué se contesta.
 *
 * Está separado del `index.ts` (que es lo único que habla con Deno, con Supabase y
 * con la red) para poder probarlo entero: el handler recibe sus dependencias, y en
 * los tests son funciones de mentira que cuentan cuántas veces se las llama. Lo
 * importante de una función de seguridad es lo que NO ocurre —que no se llame a
 * Open Food Facts sin sesión, que un código roto no gaste cuota— y eso solo se
 * comprueba cuando se puede contar.
 *
 * ── Orden (cada paso solo corre si pasó el anterior) ──────────────────────
 *
 *   1. método y tamaño del cuerpo      → baratos y sin tocar nada
 *   2. sesión de una persona           → antes de gastar nada
 *   3. el código es un GTIN válido     → una lectura sucia no gasta cuota
 *      · y su prefijo no es de un libro o un cupón → «no es comida», sin gastar nada
 *   4. cuota por persona               → 429 si se pasa
 *   5. caché global                    → lo normal: sin llamar a nadie
 *      · una ficha cuyo nombre delata tabaco o vapeo se rechaza como «no es comida»
 *      · una ficha sin datos de salud (anterior a ellos) cuenta como caducada
 *      · y una ficha sin su fila de nutrición también
 *   6. caché de faltas                 → no se vuelve a preguntar por lo que OFF no tiene
 *   7. hueco global hacia OFF          → 503 si hay demasiadas llamadas a la vez
 *   8. Open Food Facts                 → y se guarda lo que haya: primero la ficha y justo
 *                                        después su nutrición (si ésta falla se registra
 *                                        y se devuelve la ficha igualmente)
 *      · si OFF contesta «no existe» o «no es comida» y la ficha no tiene fila de nutrición,
 *        se deja la marca vacía (OFF se consultó) para no renovarla en cada escaneo. Con un
 *        error de OFF no: eso se reintenta
 *
 * ── La nutrición NO sale de aquí ──────────────────────────────────────────
 *
 * Es de Opsi Premium y el plan lo decide la base de datos (RLS de `product_nutrition` y
 * `nutrition_of_products`). Esta función no mira el plan de quien pregunta, así que
 * devolverla saltaría ese candado: se guarda, pero la respuesta no la lleva. Lo único que
 * se lee de ella es SI existe (`nutrition_data`), para decidir si la ficha está al día; ese
 * booleano tampoco sale en la respuesta.
 */

import { esCodigoDeNoComida, normalizarGtin } from './gtin.ts';
import { esNoComida } from './nocomida.ts';
import { leerLimitado } from './off.ts';
import type { FamiliaUnidad, NutricionOff, OpcionesOff, ProductoOff, ResultadoOff } from './off.ts';

export const MAX_CUERPO_PETICION = 1024;
/** Una ficha más vieja se vuelve a pedir a OFF; si no contesta, se sirve la vieja. */
export const DIAS_CADUCIDAD_CACHE = 30;

/**
 * Lo que se devuelve a la app. Nunca el `off_payload`: solo estos campos.
 *
 * Los datos de salud llevan SIEMPRE las tres listas (vacías si no hay) y los
 * ingredientes (o null). Lo que distingue «no consta» de «Open Food Facts no declara
 * nada» es `health_data`: si es false, las listas vacías no significan que el producto
 * esté libre de nada. La app no puede mostrar un producto como apto sin él.
 */
export type ProductoCatalogo = {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  unit_family: FamiliaUnidad | null;
  net_quantity: number | null;
  image_url: string | null;
  allergens_tags: string[];
  traces_tags: string[];
  labels_tags: string[];
  ingredients_text: string | null;
  /** ¿Se trajeron estos datos de OFF alguna vez? (`health_data_at` no nulo). */
  health_data: boolean;
};

/**
 * Una fila del catálogo tal como sale de la base de datos, con lo único que hace falta
 * para decidir si está al día y que NO sale en la respuesta (`publico()` lo deja fuera):
 * la fecha y si ya tiene su fila de nutrición (`product_nutrition`). Sin ella la ficha
 * cuenta como caducada, igual que sin datos de salud.
 */
export type FilaCatalogo = ProductoCatalogo & { updated_at: string; nutrition_data: boolean };

export type Cuota = { permitido: boolean; reintentarEn: number };

/** «OFF se consultó y no declara nada»: la marca que se deja en una ficha que OFF ya no devuelve. */
const NUTRICION_SIN_DATOS: NutricionOff = {
  nutriscoreGrade: null,
  novaGroup: null,
  basis: null,
  energyKcal: null,
  fat: null,
  saturatedFat: null,
  carbohydrates: null,
  sugars: null,
  fiber: null,
  proteins: null,
  salt: null,
  fatLevel: null,
  saturatedFatLevel: null,
  sugarsLevel: null,
  saltLevel: null,
  servingSize: null,
  additivesTags: null,
};

export type Dependencias = {
  /** La persona detrás del JWT, o null. Debe comprobar que NO es la clave anónima. */
  verificarUsuario(token: string): Promise<{ id: string } | null>;
  consumirCuota(userId: string): Promise<Cuota>;
  buscarEnCatalogo(codigo: string): Promise<FilaCatalogo | null>;
  esFaltaReciente(codigo: string): Promise<boolean>;
  reservarHuecoOff(): Promise<boolean>;
  consultarOff(codigo: string, opciones: Pick<OpcionesOff, 'userAgent'>): Promise<ResultadoOff>;
  guardar(codigo: string, producto: ProductoOff): Promise<ProductoCatalogo>;
  /**
   * La nutrición de la ficha que acaba de guardar `guardar`, en su propia tabla y por su
   * propia función de la base de datos. Se llama SIEMPRE tras una consulta fresca a OFF,
   * aunque no traiga ningún dato (todo null): la fila es la marca de «se consultó». Si
   * lanza, `manejar` lo registra (`nutricion_error`) y sigue: la nutrición no tumba el escaneo.
   */
  guardarNutricion(productoId: string, nutricion: NutricionOff): Promise<void>;
  registrarFalta(codigo: string): Promise<void>;
  /** Solo se registran identificadores y resultados: nunca JWT ni cuerpos. */
  log(evento: Record<string, unknown>): void;
  userAgentOff: string | null;
  ahora(): number;
};

// ── Respuestas ────────────────────────────────────────────────────────────

const CABECERAS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  // La app nativa no necesita CORS; la versión web sí (su navegador pregunta
  // antes con un OPTIONS). Se autentica con la cabecera Authorization y no con
  // cookies, así que abrirlo a cualquier origen no da nada a nadie.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

const MENSAJES = {
  sin_sesion: 'Tu sesión ha caducado. Vuelve a entrar.',
  peticion_invalida: 'No he entendido la petición.',
  peticion_demasiado_grande: 'La petición es demasiado grande.',
  metodo_no_permitido: 'Método no permitido.',
  codigo_invalido: 'Ese código no es válido. Revisa los números: el último es de control.',
  demasiadas_consultas: 'Has consultado muchos productos seguidos. Espera un momento y vuelve a probar.',
  servicio_no_disponible: 'No he podido consultar el catálogo ahora mismo. Puedes añadirlo a mano.',
  interno: 'Algo ha fallado de nuestra parte. Puedes añadirlo a mano.',
} as const;

type CodigoError = keyof typeof MENSAJES;

function json(estado: number, cuerpo: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CABECERAS, ...extra } });
}

function fallo(estado: number, code: CodigoError, extra: Record<string, string> = {}): Response {
  return json(estado, { code, message: MENSAJES[code] }, extra);
}

function publico(fila: ProductoCatalogo | FilaCatalogo): { found: true; product: ProductoCatalogo & { source: 'openfoodfacts' } } {
  // Se copia campo a campo: lo que no se nombra aquí no sale, aunque la fila
  // tenga más (`updated_at`, `nutrition_data`, o lo que se añada mañana a la tabla).
  // NUNCA nutrición: es de Opsi Premium y esta función no mira el plan de quien pregunta.
  return {
    found: true,
    product: {
      id: fila.id,
      barcode: fila.barcode,
      name: fila.name,
      brand: fila.brand,
      unit_family: fila.unit_family,
      net_quantity: fila.net_quantity,
      image_url: fila.image_url,
      allergens_tags: fila.allergens_tags,
      traces_tags: fila.traces_tags,
      labels_tags: fila.labels_tags,
      ingredients_text: fila.ingredients_text,
      health_data: fila.health_data,
      source: 'openfoodfacts',
    },
  };
}

/** Las listas de etiquetas que salen de la base de datos: lo que no sea una lista de textos, vacío. */
function listaDeTextos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((e): e is string => typeof e === 'string') : [];
}

/**
 * De una fila de `products` (o del resultado de `upsert_global_product`) a lo que se
 * devuelve. Vive aquí y no en `index.ts` porque tiene lógica: una ficha de antes de
 * los datos de salud trae NULL en todas las columnas nuevas, y eso tiene que salir
 * como listas vacías con `health_data: false`, no como un error ni como null.
 */
export function aProducto(fila: Record<string, unknown>): ProductoCatalogo {
  return {
    id: String(fila.id),
    barcode: String(fila.barcode),
    name: String(fila.name),
    brand: (fila.brand as string | null) ?? null,
    unit_family: (fila.unit_family as ProductoCatalogo['unit_family']) ?? null,
    net_quantity: fila.net_quantity === null || fila.net_quantity === undefined ? null : Number(fila.net_quantity),
    image_url: (fila.image_url as string | null) ?? null,
    allergens_tags: listaDeTextos(fila.allergens_tags),
    traces_tags: listaDeTextos(fila.traces_tags),
    labels_tags: listaDeTextos(fila.labels_tags),
    ingredients_text: typeof fila.ingredients_text === 'string' ? fila.ingredients_text : null,
    health_data: fila.health_data_at !== null && fila.health_data_at !== undefined,
  };
}

/**
 * ¿Trae la fila su nutrición? Viene del `select` con `product_nutrition(nutrition_data_at)`:
 * PostgREST la devuelve como objeto (la clave foránea es la propia clave primaria, una
 * relación uno a uno), como lista de uno o, si no hay fila, como null. Cualquier otra cosa
 * es «no».
 */
export function tieneNutricion(valor: unknown): boolean {
  const fila = Array.isArray(valor) ? valor[0] : valor;
  if (typeof fila !== 'object' || fila === null || Array.isArray(fila)) return false;
  const marca = (fila as Record<string, unknown>).nutrition_data_at;
  return typeof marca === 'string' && marca !== '';
}

/**
 * De una fila de `products` (con su `product_nutrition(nutrition_data_at)` pegado) a lo
 * que `buscarEnCatalogo` devuelve: el producto público más lo que decide la caducidad.
 */
export function aFilaCatalogo(fila: Record<string, unknown>): FilaCatalogo {
  return {
    ...aProducto(fila),
    updated_at: String(fila.updated_at),
    nutrition_data: tieneNutricion(fila.product_nutrition),
  };
}

/**
 * Lo único que se registra de una excepción: su nombre y su mensaje cortado a 200
 * caracteres. Nunca el objeto entero (un error de la base de datos puede traer la fila).
 */
function describirError(error: unknown): { error: string; detalle: string } {
  return {
    error: error instanceof Error ? error.name : typeof error,
    detalle: error instanceof Error ? error.message.slice(0, 200) : '',
  };
}

function bearer(req: Request): string | null {
  const cabecera = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{10,4096})$/.exec(cabecera);
  return m ? m[1] : null;
}

function esCaducada(fila: FilaCatalogo, ahora: number): boolean {
  // Una ficha de antes de los datos de salud no tiene alérgenos ni ingredientes: se
  // renueva aunque sea de ayer. Si OFF no contesta se sirve igualmente la vieja (con
  // `health_data: false`), así que esto solo cuesta una llamada cuando hay hueco.
  if (!fila.health_data) return true;
  // Igual con la nutrición: sin su fila no consta, y se renueva una sola vez (al guardarla
  // se crea la fila, aunque OFF no declare nada y quede toda a NULL).
  if (!fila.nutrition_data) return true;
  const t = Date.parse(fila.updated_at);
  return !Number.isFinite(t) || ahora - t > DIAS_CADUCIDAD_CACHE * 86_400_000;
}

// ── El handler ────────────────────────────────────────────────────────────

export async function manejar(req: Request, dep: Dependencias): Promise<Response> {
  const requestId = crypto.randomUUID();
  const inicio = dep.ahora();
  let userId: string | null = null;

  const fin = (resultado: string, respuesta: Response, extra: Record<string, unknown> = {}): Response => {
    dep.log({
      evento: 'lookup-barcode',
      request_id: requestId,
      user_id: userId,
      resultado,
      estado: respuesta.status,
      ms: dep.ahora() - inicio,
      ...extra,
    });
    return respuesta;
  };

  /**
   * Guarda la nutrición de una ficha. Es un extra de Opsi Premium y el escáner es la
   * función central: si falla (red, base de datos), NO tumba el escaneo. Se registra y
   * se sigue, y la ficha se devuelve igualmente. Solo el nombre del error y su mensaje
   * cortado, como en `excepcion`: nunca la fila, ni los datos de OFF, ni el código de barras.
   */
  const guardarNutricionSinRomper = async (productoId: string, nutricion: NutricionOff): Promise<void> => {
    try {
      await dep.guardarNutricion(productoId, nutricion);
    } catch (errorNutricion) {
      dep.log({
        evento: 'lookup-barcode',
        request_id: requestId,
        user_id: userId,
        resultado: 'nutricion_error',
        ...describirError(errorNutricion),
      });
    }
  };

  /**
   * OFF se ha consultado y ya no devuelve el producto (`no_existe`) o dice que no es comida,
   * y la ficha del catálogo no tiene su fila de nutrición: se deja la marca de «consultado y
   * sin datos» (todo null). Sin ella la ficha seguiría contando como caducada y cada escaneo
   * gastaría un hueco de OFF para nada. Solo con una ficha SIN fila: si ya la tiene, no se
   * toca. NO se llama con un error de OFF (5xx, red, tiempo): eso no es una respuesta y sí
   * debe reintentarse; ni cuando no se llegó a consultar (sin hueco o sin User-Agent).
   */
  const marcarNutricionConsultada = async (ficha: FilaCatalogo): Promise<void> => {
    if (ficha.nutrition_data) return;
    await guardarNutricionSinRomper(ficha.id, NUTRICION_SIN_DATOS);
  };

  try {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CABECERAS });
    if (req.method !== 'POST') return fin('metodo', fallo(405, 'metodo_no_permitido', { Allow: 'POST, OPTIONS' }));

    // 1. Tamaño: antes de leer nada, y sin fiarse solo de la cabecera.
    const declarado = Number(req.headers.get('content-length'));
    if (Number.isFinite(declarado) && declarado > MAX_CUERPO_PETICION) {
      return fin('cuerpo_grande', fallo(413, 'peticion_demasiado_grande'));
    }

    // 2. Sesión. La clave anónima es un JWT válido y el gateway la deja pasar,
    //    así que "tiene un JWT" no basta: tiene que ser una persona.
    const token = bearer(req);
    if (token === null) return fin('sin_token', fallo(401, 'sin_sesion'));
    const usuario = await dep.verificarUsuario(token);
    if (usuario === null) return fin('sesion_invalida', fallo(401, 'sin_sesion'));
    userId = usuario.id;

    // 3. El cuerpo y el código.
    if (req.body === null) return fin('sin_cuerpo', fallo(400, 'peticion_invalida'));
    const texto = await leerLimitado(req, MAX_CUERPO_PETICION);
    if (texto === null) return fin('cuerpo_grande', fallo(413, 'peticion_demasiado_grande'));

    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      return fin('json_roto', fallo(400, 'peticion_invalida'));
    }
    if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
      return fin('cuerpo_no_objeto', fallo(400, 'peticion_invalida'));
    }
    // Del cliente solo se lee `barcode`. Cualquier otra clave se ignora: no hay
    // URL, host, ruta ni opción que se pueda mandar desde fuera.
    const bruto = (cuerpo as Record<string, unknown>).barcode;
    if (typeof bruto !== 'string') return fin('codigo_ausente', fallo(400, 'codigo_invalido'));
    const codigo = normalizarGtin(bruto);
    if (codigo === null) return fin('codigo_invalido', fallo(400, 'codigo_invalido'));

    // Un libro o un cupón no se come. Se sabe por el prefijo, sin cuota, sin caché y
    // sin preguntar a nadie: no hay nada que consultar.
    if (esCodigoDeNoComida(codigo)) {
      return fin('no_comida_prefijo', json(200, { found: false, barcode: codigo, not_food: true }));
    }

    // 4. Cuota por persona. Cuenta aunque luego se resuelva desde la caché: lo
    //    que se limita es el ritmo de consultas, no las llamadas a OFF.
    const cuota = await dep.consumirCuota(usuario.id);
    if (!cuota.permitido) {
      return fin(
        'cuota',
        fallo(429, 'demasiadas_consultas', { 'Retry-After': String(Math.max(1, cuota.reintentarEn)) }),
      );
    }

    // 5. Caché global.
    const enCatalogo = await dep.buscarEnCatalogo(codigo);
    // Una ficha que ya estaba guardada de antes de que se rechazara el tabaco: no se sirve.
    if (enCatalogo && esNoComida({ name: enCatalogo.name })) {
      return fin('no_comida_cache', json(200, { found: false, barcode: codigo, not_food: true }));
    }
    if (enCatalogo && !esCaducada(enCatalogo, inicio)) {
      return fin('cache', json(200, publico(enCatalogo)));
    }

    // 6. Caché de faltas: lo que OFF dijo que no tiene no se vuelve a preguntar en
    //    unas horas. Solo si NO hay ficha: una ficha caducada se renueva igualmente.
    if (!enCatalogo && (await dep.esFaltaReciente(codigo))) {
      return fin('falta_cacheada', json(200, { found: false, barcode: codigo }));
    }

    // 7 y 8. Open Food Facts, si hay hueco y hay con qué identificarse.
    const sinIdentificar = dep.userAgentOff === null;
    const hayHueco = !sinIdentificar && (await dep.reservarHuecoOff());
    if (!hayHueco) {
      // Una ficha caducada vale más que ninguna.
      if (enCatalogo) return fin('cache_vieja', json(200, publico(enCatalogo)), { motivo: sinIdentificar ? 'sin_ua' : 'sin_hueco' });
      return fin(
        sinIdentificar ? 'sin_ua' : 'sin_hueco',
        fallo(503, 'servicio_no_disponible', { 'Retry-After': '30' }),
      );
    }

    const off = await dep.consultarOff(codigo, { userAgent: dep.userAgentOff as string });

    if (off.tipo === 'encontrado') {
      const guardado = await dep.guardar(codigo, off.producto);
      // La nutrición, justo después de la ficha y con su id. Si falla NO tumba el escaneo
      // (ver `guardarNutricionSinRomper`): sin fila de nutrición la ficha cuenta como
      // caducada, así que la próxima vez que se escanee se reintenta.
      await guardarNutricionSinRomper(guardado.id, off.producto.nutrition);
      return fin('off', json(200, publico(guardado)));
    }
    if (off.tipo === 'no_es_comida') {
      // Ni se guarda ni se anota como falta: una falta se contestaría la próxima vez
      // como «no lo conozco» y dejaría añadirlo. El veredicto de OFF manda también
      // sobre una ficha vieja del catálogo (alguien la pudo reclasificar).
      // Si esa ficha no tenía su fila de nutrición, OFF SÍ se acaba de consultar: se deja
      // la marca vacía para no gastar un hueco de OFF en cada escaneo. La respuesta no cambia.
      if (enCatalogo) await marcarNutricionConsultada(enCatalogo);
      return fin('no_comida', json(200, { found: false, barcode: codigo, not_food: true }));
    }
    if (off.tipo === 'no_existe') {
      // Si el producto estaba y OFF ya no lo tiene, se sirve el que hay (y, si no tenía su
      // fila de nutrición, se deja la marca de «consultado y sin datos»: ver arriba).
      if (enCatalogo) {
        await marcarNutricionConsultada(enCatalogo);
        return fin('cache_vieja', json(200, publico(enCatalogo)), { motivo: 'off_sin_ficha' });
      }
      await dep.registrarFalta(codigo);
      return fin('falta', json(200, { found: false, barcode: codigo }));
    }
    // Error de OFF: el detalle va al log, no a la app.
    if (enCatalogo) return fin('cache_vieja', json(200, publico(enCatalogo)), { motivo: off.motivo });
    return fin('off_error', fallo(503, 'servicio_no_disponible', { 'Retry-After': '30' }), { motivo: off.motivo });
  } catch (error) {
    // Nunca se devuelve el mensaje: puede traer nombres de tablas o de funciones.
    return fin('excepcion', fallo(500, 'interno'), describirError(error));
  }
}
