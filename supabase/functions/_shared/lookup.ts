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
 *   4. cuota por persona               → 429 si se pasa
 *   5. caché global                    → lo normal: sin llamar a nadie
 *   6. caché de faltas                 → no se vuelve a preguntar por lo que OFF no tiene
 *   7. hueco global hacia OFF          → 503 si hay demasiadas llamadas a la vez
 *   8. Open Food Facts                 → y se guarda lo que haya
 */

import { normalizarGtin } from './gtin.ts';
import { leerLimitado } from './off.ts';
import type { FamiliaUnidad, OpcionesOff, ProductoOff, ResultadoOff } from './off.ts';

export const MAX_CUERPO_PETICION = 1024;
/** Una ficha más vieja se vuelve a pedir a OFF; si no contesta, se sirve la vieja. */
export const DIAS_CADUCIDAD_CACHE = 30;

/** Lo que se devuelve a la app. Nunca el `off_payload`: solo estos campos. */
export type ProductoCatalogo = {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  unit_family: FamiliaUnidad | null;
  net_quantity: number | null;
  image_url: string | null;
};

/** Una fila del catálogo tal como sale de la base de datos. */
export type FilaCatalogo = ProductoCatalogo & { updated_at: string };

export type Cuota = { permitido: boolean; reintentarEn: number };

export type Dependencias = {
  /** La persona detrás del JWT, o null. Debe comprobar que NO es la clave anónima. */
  verificarUsuario(token: string): Promise<{ id: string } | null>;
  consumirCuota(userId: string): Promise<Cuota>;
  buscarEnCatalogo(codigo: string): Promise<FilaCatalogo | null>;
  esFaltaReciente(codigo: string): Promise<boolean>;
  reservarHuecoOff(): Promise<boolean>;
  consultarOff(codigo: string, opciones: Pick<OpcionesOff, 'userAgent'>): Promise<ResultadoOff>;
  guardar(codigo: string, producto: ProductoOff): Promise<ProductoCatalogo>;
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
  // tenga más (`updated_at`, o lo que se añada mañana a la tabla).
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
      source: 'openfoodfacts',
    },
  };
}

function bearer(req: Request): string | null {
  const cabecera = req.headers.get('authorization') ?? '';
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{10,4096})$/.exec(cabecera);
  return m ? m[1] : null;
}

function esCaducada(fila: FilaCatalogo, ahora: number): boolean {
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
      return fin('off', json(200, publico(guardado)));
    }
    if (off.tipo === 'no_existe') {
      // Si el producto estaba y OFF ya no lo tiene, se sirve el que hay.
      if (enCatalogo) return fin('cache_vieja', json(200, publico(enCatalogo)), { motivo: 'off_sin_ficha' });
      await dep.registrarFalta(codigo);
      return fin('falta', json(200, { found: false, barcode: codigo }));
    }
    // Error de OFF: el detalle va al log, no a la app.
    if (enCatalogo) return fin('cache_vieja', json(200, publico(enCatalogo)), { motivo: off.motivo });
    return fin('off_error', fallo(503, 'servicio_no_disponible', { 'Retry-After': '30' }), { motivo: off.motivo });
  } catch (error) {
    // Nunca se devuelve el mensaje: puede traer nombres de tablas o de funciones.
    const nombre = error instanceof Error ? error.name : typeof error;
    const detalle = error instanceof Error ? error.message.slice(0, 200) : '';
    return fin('excepcion', fallo(500, 'interno'), { error: nombre, detalle });
  }
}
