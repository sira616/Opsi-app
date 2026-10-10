import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DIAS_CADUCIDAD_CACHE,
  manejar,
  MAX_CUERPO_PETICION,
  type Dependencias,
  type FilaCatalogo,
  type ProductoCatalogo,
} from './lookup.ts';
import type { ProductoOff, ResultadoOff } from './off.ts';

const CODIGO = '5449000000996';
// Un relleno: solo importa que cumpla el formato de un Bearer (10 a 4096 caracteres
// válidos). No es ni se parece a un token de verdad, y así el escáner de secretos de
// la CI no lo confunde con uno.
const TOKEN = 'prueba'.repeat(5);
const AHORA = Date.parse('2026-10-10T12:00:00Z');

const FILA: FilaCatalogo = {
  id: '11111111-1111-1111-1111-111111111111',
  barcode: CODIGO,
  name: 'Refresco de cola',
  brand: 'Marca Falsa',
  unit_family: 'volume',
  net_quantity: 330,
  image_url: 'https://images.openfoodfacts.org/images/x.jpg',
  updated_at: new Date(AHORA - 86_400_000).toISOString(),
};

const PRODUCTO_OFF: ProductoOff = {
  name: 'Refresco de cola',
  brand: 'Marca Falsa',
  unitFamily: 'volume',
  netQuantity: 330,
  imageUrl: null,
  categoriesTags: ['en:sodas'],
};

type Llamadas = Record<
  'verificarUsuario' | 'consumirCuota' | 'buscarEnCatalogo' | 'esFaltaReciente' | 'reservarHuecoOff' | 'consultarOff' | 'guardar' | 'registrarFalta',
  number
>;

/** Dependencias de mentira. Cada una cuenta cuántas veces se la llama. */
function montar(sobre: Partial<Dependencias> = {}) {
  const llamadas: Llamadas = {
    verificarUsuario: 0,
    consumirCuota: 0,
    buscarEnCatalogo: 0,
    esFaltaReciente: 0,
    reservarHuecoOff: 0,
    consultarOff: 0,
    guardar: 0,
    registrarFalta: 0,
  };
  const logs: Record<string, unknown>[] = [];
  const dep: Dependencias = {
    async verificarUsuario() {
      llamadas.verificarUsuario++;
      return { id: 'user-1' };
    },
    async consumirCuota() {
      llamadas.consumirCuota++;
      return { permitido: true, reintentarEn: 0 };
    },
    async buscarEnCatalogo() {
      llamadas.buscarEnCatalogo++;
      return null;
    },
    async esFaltaReciente() {
      llamadas.esFaltaReciente++;
      return false;
    },
    async reservarHuecoOff() {
      llamadas.reservarHuecoOff++;
      return true;
    },
    async consultarOff(): Promise<ResultadoOff> {
      llamadas.consultarOff++;
      return { tipo: 'encontrado', producto: PRODUCTO_OFF };
    },
    async guardar(codigo): Promise<ProductoCatalogo> {
      llamadas.guardar++;
      return { id: 'nuevo', barcode: codigo, name: PRODUCTO_OFF.name, brand: PRODUCTO_OFF.brand, unit_family: 'volume', net_quantity: 330, image_url: null };
    },
    async registrarFalta() {
      llamadas.registrarFalta++;
    },
    log: (e) => logs.push(e),
    userAgentOff: 'Opsi-test/0.0 (pruebas)',
    ahora: () => AHORA,
    ...sobre,
  };
  return { dep, llamadas, logs };
}

function peticion(
  cuerpo: unknown = { barcode: CODIGO },
  { metodo = 'POST', token = TOKEN as string | null, cabeceras = {} as Record<string, string> } = {},
): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...cabeceras };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request('http://local/functions/v1/lookup-barcode', {
    method: metodo,
    headers,
    body: metodo === 'GET' || metodo === 'OPTIONS' ? undefined : typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });
}

async function leer(r: Response) {
  return (await r.json()) as Record<string, any>;
}

/** Que NO se llamó a nada de lo que cuesta algo. */
function sinTocarNada(llamadas: Llamadas, ...salvo: (keyof Llamadas)[]) {
  for (const [nombre, veces] of Object.entries(llamadas)) {
    if (!salvo.includes(nombre as keyof Llamadas)) assert.equal(veces, 0, `${nombre} no debía llamarse`);
  }
}

// ── Antes de nada: método, tamaño, sesión ────────────────────────────────

test('OPTIONS contesta el preflight sin tocar nada', async () => {
  const { dep, llamadas } = montar();
  const r = await manejar(peticion(undefined, { metodo: 'OPTIONS', token: null }), dep);
  assert.equal(r.status, 204);
  assert.match(r.headers.get('access-control-allow-headers') ?? '', /authorization/);
  sinTocarNada(llamadas);
});

test('solo POST: GET, PUT y DELETE dan 405 y no tocan nada', async () => {
  for (const metodo of ['GET', 'PUT', 'DELETE']) {
    const { dep, llamadas } = montar();
    const r = await manejar(peticion(undefined, { metodo }), dep);
    assert.equal(r.status, 405, metodo);
    assert.equal(r.headers.get('allow'), 'POST, OPTIONS');
    sinTocarNada(llamadas);
  }
});

test('sin cabecera Authorization: 401 y NO se llama a nadie', async () => {
  const { dep, llamadas } = montar();
  const r = await manejar(peticion({ barcode: CODIGO }, { token: null }), dep);
  assert.equal(r.status, 401);
  assert.equal((await leer(r)).code, 'sin_sesion');
  sinTocarNada(llamadas);
});

test('una cabecera Authorization que no es un Bearer válido: 401 sin tocar nada', async () => {
  for (const cabecera of ['Basic abc', 'Bearer', 'Bearer corto', `Bearer ${'a'.repeat(5000)}`, 'Bearer a b c d e f g h i j k']) {
    const { dep, llamadas } = montar();
    const r = await manejar(peticion({ barcode: CODIGO }, { token: null, cabeceras: { authorization: cabecera } }), dep);
    assert.equal(r.status, 401, cabecera.slice(0, 20));
    sinTocarNada(llamadas);
  }
});

test('un JWT que no es de una persona (la clave anónima) es 401: no se gasta cuota ni OFF', async () => {
  const { dep, llamadas } = montar({
    async verificarUsuario() {
      return null;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 401);
  assert.equal(llamadas.consumirCuota, 0);
  assert.equal(llamadas.consultarOff, 0);
  sinTocarNada(llamadas);
});

test('un cuerpo declarado más grande que el máximo: 413 antes de mirar la sesión', async () => {
  const { dep, llamadas } = montar();
  const r = await manejar(
    peticion('x', { cabeceras: { 'content-length': String(MAX_CUERPO_PETICION + 1) } }),
    dep,
  );
  assert.equal(r.status, 413);
  sinTocarNada(llamadas);
});

test('un cuerpo grande sin content-length se corta: 413 y sin cuota', async () => {
  const { dep, llamadas } = montar();
  const flujo = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(`{"barcode":"${CODIGO}","relleno":"${'x'.repeat(MAX_CUERPO_PETICION)}"}`));
      c.close();
    },
  });
  const req = new Request('http://local/x', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}` },
    body: flujo,
    // @ts-expect-error requerido por Node para cuerpos en flujo
    duplex: 'half',
  });
  const r = await manejar(req, dep);
  assert.equal(r.status, 413);
  assert.equal(llamadas.consumirCuota, 0);
  assert.equal(llamadas.consultarOff, 0);
});

// ── El cuerpo y el código ────────────────────────────────────────────────

test('cuerpo roto o que no es un objeto: 400 sin cuota', async () => {
  for (const cuerpo of ['{no json', '[]', '"texto"', '7', 'null']) {
    const { dep, llamadas } = montar();
    const r = await manejar(peticion(cuerpo), dep);
    assert.equal(r.status, 400, cuerpo);
    assert.equal((await leer(r)).code, 'peticion_invalida');
    assert.equal(llamadas.consumirCuota, 0);
    assert.equal(llamadas.consultarOff, 0);
  }
});

test('un código que no es un GTIN válido: 400 sin cuota y sin OFF', async () => {
  for (const barcode of [
    '',
    '123',
    '5449000000995', // control malo
    '544900000099a',
    '../../etc/passwd',
    'https://evil.example/x',
    '0000000000000',
    5449000000996, // número, no texto
    null,
    ['5449000000996'],
    { toString: () => CODIGO },
  ]) {
    const { dep, llamadas } = montar();
    const r = await manejar(peticion({ barcode }), dep);
    assert.equal(r.status, 400, JSON.stringify(barcode));
    assert.equal((await leer(r)).code, 'codigo_invalido');
    assert.equal(llamadas.consumirCuota, 0, 'una lectura sucia no debe gastar cuota');
    assert.equal(llamadas.consultarOff, 0);
  }
});

test('el cuerpo no puede traer host, URL ni ruta: solo se lee `barcode`', async () => {
  let visto: unknown = null;
  const { dep } = montar({
    async consultarOff(codigo, opciones) {
      visto = { codigo, opciones };
      return { tipo: 'no_existe' };
    },
  });
  await manejar(peticion({ barcode: CODIGO, url: 'https://evil.example', host: 'evil.example', path: '/x', userAgent: 'x' }), dep);
  assert.deepEqual(visto, { codigo: CODIGO, opciones: { userAgent: 'Opsi-test/0.0 (pruebas)' } });
});

test('un UPC-A y su EAN-13 con un cero delante buscan el MISMO código', async () => {
  const buscados: string[] = [];
  for (const barcode of ['036000291452', '0036000291452', '00036000291452']) {
    const { dep } = montar({
      async buscarEnCatalogo(codigo) {
        buscados.push(codigo);
        return { ...FILA, barcode: codigo };
      },
    });
    const r = await manejar(peticion({ barcode }), dep);
    assert.equal(r.status, 200);
  }
  assert.deepEqual(buscados, ['0036000291452', '0036000291452', '0036000291452']);
});

// ── Cuota ────────────────────────────────────────────────────────────────

test('cuota agotada: 429 con Retry-After y sin tocar el catálogo ni OFF', async () => {
  const { dep, llamadas } = montar({
    async consumirCuota() {
      return { permitido: false, reintentarEn: 42 };
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '42');
  assert.equal((await leer(r)).code, 'demasiadas_consultas');
  assert.equal(llamadas.buscarEnCatalogo, 0);
  assert.equal(llamadas.consultarOff, 0);
});

test('el Retry-After nunca es menor que 1', async () => {
  const { dep } = montar({
    async consumirCuota() {
      return { permitido: false, reintentarEn: 0 };
    },
  });
  assert.equal((await manejar(peticion(), dep)).headers.get('retry-after'), '1');
});

// ── Caché ────────────────────────────────────────────────────────────────

test('está en el catálogo: se sirve de la caché y NO se llama a OFF', async () => {
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return FILA;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  const cuerpo = await leer(r);
  assert.equal(cuerpo.found, true);
  assert.equal(cuerpo.product.name, 'Refresco de cola');
  assert.equal(cuerpo.product.source, 'openfoodfacts');
  assert.equal(llamadas.consultarOff, 0);
  assert.equal(llamadas.reservarHuecoOff, 0);
  assert.equal(llamadas.esFaltaReciente, 0);
});

test('la respuesta lleva solo los campos públicos: ni updated_at ni el payload', async () => {
  const { dep } = montar({
    async buscarEnCatalogo() {
      return { ...FILA, off_payload: { secreto: 1 }, household_id: 'x' } as unknown as FilaCatalogo;
    },
  });
  const cuerpo = await leer(await manejar(peticion(), dep));
  assert.deepEqual(Object.keys(cuerpo.product).sort(), [
    'barcode',
    'brand',
    'id',
    'image_url',
    'name',
    'net_quantity',
    'source',
    'unit_family',
  ]);
});

test('ficha caducada: se renueva desde OFF y se guarda', async () => {
  const vieja = { ...FILA, updated_at: new Date(AHORA - (DIAS_CADUCIDAD_CACHE + 1) * 86_400_000).toISOString() };
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return vieja;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  assert.equal(llamadas.consultarOff, 1);
  assert.equal(llamadas.guardar, 1);
});

test('ficha caducada y OFF caído: se sirve la vieja, no un error', async () => {
  const vieja = { ...FILA, updated_at: new Date(AHORA - 90 * 86_400_000).toISOString() };
  for (const off of [{ tipo: 'error', motivo: 'http_503' }, { tipo: 'no_existe' }] as ResultadoOff[]) {
    const { dep, llamadas } = montar({
      async buscarEnCatalogo() {
        return vieja;
      },
      async consultarOff() {
        return off;
      },
    });
    const r = await manejar(peticion(), dep);
    assert.equal(r.status, 200);
    assert.equal((await leer(r)).product.name, 'Refresco de cola');
    assert.equal(llamadas.registrarFalta, 0, 'una ficha que existía no pasa a ser una falta');
  }
});

test('ficha caducada y sin hueco hacia OFF: se sirve la vieja', async () => {
  const vieja = { ...FILA, updated_at: 'no es una fecha' };
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return vieja;
    },
    async reservarHuecoOff() {
      return false;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  assert.equal(llamadas.consultarOff, 0);
});

test('falta reciente: se contesta sin llamar a OFF', async () => {
  const { dep, llamadas } = montar({
    async esFaltaReciente() {
      return true;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  assert.deepEqual(await leer(r), { found: false, barcode: CODIGO });
  assert.equal(llamadas.reservarHuecoOff, 0);
  assert.equal(llamadas.consultarOff, 0);
});

// ── Open Food Facts ──────────────────────────────────────────────────────

test('no está en la caché: se pregunta a OFF, se guarda y se devuelve', async () => {
  const { dep, llamadas } = montar();
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  const cuerpo = await leer(r);
  assert.equal(cuerpo.found, true);
  assert.equal(cuerpo.product.id, 'nuevo');
  assert.equal(llamadas.reservarHuecoOff, 1);
  assert.equal(llamadas.consultarOff, 1);
  assert.equal(llamadas.guardar, 1);
  assert.equal(llamadas.registrarFalta, 0);
});

test('OFF no lo conoce: 200 con found:false y se anota la falta', async () => {
  const { dep, llamadas } = montar({
    async consultarOff() {
      return { tipo: 'no_existe' };
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  assert.deepEqual(await leer(r), { found: false, barcode: CODIGO });
  assert.equal(llamadas.registrarFalta, 1);
  assert.equal(llamadas.guardar, 0);
});

test('OFF falla: 503 con un código propio, sin detalle, y NO se anota como falta', async () => {
  const { dep, llamadas, logs } = montar({
    async consultarOff() {
      return { tipo: 'error', motivo: 'http_429' };
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 503);
  const cuerpo = await leer(r);
  assert.equal(cuerpo.code, 'servicio_no_disponible');
  assert.doesNotMatch(JSON.stringify(cuerpo), /429|openfoodfacts/i);
  assert.equal(r.headers.get('retry-after'), '30');
  assert.equal(llamadas.registrarFalta, 0, 'un fallo pasajero no puede convertirse en una falta');
  assert.equal(logs.at(-1)?.motivo, 'http_429', 'el detalle va al log');
});

test('sin hueco hacia OFF: 503 y no se llama', async () => {
  const { dep, llamadas } = montar({
    async reservarHuecoOff() {
      return false;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 503);
  assert.equal(llamadas.consultarOff, 0);
});

test('sin User-Agent configurado no se llama a OFF', async () => {
  const { dep, llamadas } = montar({ userAgentOff: null });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 503);
  assert.equal(llamadas.reservarHuecoOff, 0, 'ni siquiera se gasta un hueco');
  assert.equal(llamadas.consultarOff, 0);
});

// ── Errores internos y registro ──────────────────────────────────────────

test('una excepción interna es 500 genérico: el mensaje NO sale', async () => {
  const { dep, logs } = montar({
    async buscarEnCatalogo() {
      throw new Error('relation "public.products" does not exist en 10.0.0.5');
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 500);
  const texto = JSON.stringify(await leer(r));
  assert.doesNotMatch(texto, /products|10\.0\.0\.5|relation/);
  assert.match(String(logs.at(-1)?.detalle), /products/);
});

test('si falla la cuota se deniega: nunca se sigue adelante sin contar', async () => {
  const { dep, llamadas } = montar({
    async consumirCuota() {
      throw new Error('rpc caída');
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 500);
  assert.equal(llamadas.consultarOff, 0);
});

test('el log lleva request_id y user_id y NUNCA el token ni el cuerpo', async () => {
  const { dep, logs } = montar();
  await manejar(peticion(), dep);
  const evento = logs.at(-1) as Record<string, unknown>;
  assert.equal(evento.user_id, 'user-1');
  assert.match(String(evento.request_id), /^[0-9a-f-]{36}$/);
  const texto = JSON.stringify(logs);
  assert.doesNotMatch(texto, new RegExp(TOKEN.slice(0, 20)));
  assert.doesNotMatch(texto, new RegExp(CODIGO), 'el código de barras tampoco: dice qué compra la persona');
});

test('todas las respuestas llevan no-store y nosniff', async () => {
  const { dep } = montar();
  for (const r of [await manejar(peticion(), dep), await manejar(peticion(undefined, { token: null }), dep)]) {
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  }
});
