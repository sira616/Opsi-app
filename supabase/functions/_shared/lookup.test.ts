import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  aFilaCatalogo,
  aProducto,
  DIAS_CADUCIDAD_CACHE,
  manejar,
  MAX_CUERPO_PETICION,
  tieneNutricion,
  type Dependencias,
  type FilaCatalogo,
  type ProductoCatalogo,
} from './lookup.ts';
import type { NutricionOff, ProductoOff, ResultadoOff } from './off.ts';

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
  allergens_tags: ['en:milk'],
  traces_tags: ['en:soybeans'],
  labels_tags: ['en:no-lactose'],
  ingredients_text: 'Agua, azúcar y leche.',
  health_data: true,
  updated_at: new Date(AHORA - 86_400_000).toISOString(),
  nutrition_data: true,
};

/** Una ficha de ANTES de los datos de salud: la base de datos la sirve con todo NULL. */
const FILA_SIN_SALUD: FilaCatalogo = {
  ...FILA,
  allergens_tags: [],
  traces_tags: [],
  labels_tags: [],
  ingredients_text: null,
  health_data: false,
};

/** Una ficha con salud pero SIN su fila de nutrición (de antes de la función, o a medias). */
const FILA_SIN_NUTRICION: FilaCatalogo = { ...FILA, nutrition_data: false };

const NUTRICION: NutricionOff = {
  nutriscoreGrade: 'e',
  novaGroup: 4,
  basis: 'ml',
  energyKcal: 42,
  fat: 0,
  saturatedFat: 0,
  carbohydrates: 10.6,
  sugars: 10.6,
  fiber: null,
  proteins: 0,
  salt: 0.01,
  fatLevel: 'low',
  saturatedFatLevel: 'low',
  sugarsLevel: 'high',
  saltLevel: 'low',
  servingSize: '330 ml',
  additivesTags: ['en:e150d', 'en:e338'],
};

/** Open Food Facts conoce el producto pero no declara ninguna nutrición. */
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

const PRODUCTO_OFF: ProductoOff = {
  name: 'Refresco de cola',
  brand: 'Marca Falsa',
  unitFamily: 'volume',
  netQuantity: 330,
  imageUrl: null,
  categoriesTags: ['en:sodas'],
  allergensTags: ['en:milk'],
  tracesTags: [],
  labelsTags: ['en:no-lactose'],
  ingredientsText: 'Agua, azúcar y leche.',
  nutrition: NUTRICION,
};

type Llamadas = Record<
  | 'verificarUsuario'
  | 'consumirCuota'
  | 'buscarEnCatalogo'
  | 'esFaltaReciente'
  | 'reservarHuecoOff'
  | 'consultarOff'
  | 'guardar'
  | 'guardarNutricion'
  | 'registrarFalta',
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
    guardarNutricion: 0,
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
      return {
        id: 'nuevo',
        barcode: codigo,
        name: PRODUCTO_OFF.name,
        brand: PRODUCTO_OFF.brand,
        unit_family: 'volume',
        net_quantity: 330,
        image_url: null,
        allergens_tags: PRODUCTO_OFF.allergensTags,
        traces_tags: PRODUCTO_OFF.tracesTags,
        labels_tags: PRODUCTO_OFF.labelsTags,
        ingredients_text: PRODUCTO_OFF.ingredientsText,
        health_data: true,
      };
    },
    async guardarNutricion() {
      llamadas.guardarNutricion++;
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

// ── Lo que no es comida ──────────────────────────────────────────────────

test('un libro (prefijo ISBN) es «no es comida» sin gastar cuota ni tocar el catálogo', async () => {
  const { dep, llamadas, logs } = montar();
  const r = await manejar(peticion({ barcode: '9780306406157' }), dep);
  assert.equal(r.status, 200);
  assert.deepEqual(await leer(r), { found: false, barcode: '9780306406157', not_food: true });
  // Solo se comprobó quién pregunta: ni cuota, ni caché, ni OFF.
  sinTocarNada(llamadas, 'verificarUsuario');
  assert.equal(logs.at(-1)?.resultado, 'no_comida_prefijo');
});

test('un libro SIN sesión sigue siendo 401: el filtro no abre nada', async () => {
  const { dep, llamadas } = montar();
  const r = await manejar(peticion({ barcode: '9780306406157' }, { token: null }), dep);
  assert.equal(r.status, 401);
  sinTocarNada(llamadas);
});

test('si OFF dice que es de otro tipo: «no es comida», y ni se guarda ni se anota como falta', async () => {
  const { dep, llamadas, logs } = montar({
    async consultarOff(): Promise<ResultadoOff> {
      return { tipo: 'no_es_comida' };
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  assert.deepEqual(await leer(r), { found: false, barcode: CODIGO, not_food: true });
  assert.equal(llamadas.guardar, 0);
  // Una falta se contestaría luego como «no lo conozco»: dejaría añadirlo.
  assert.equal(llamadas.registrarFalta, 0);
  assert.equal(logs.at(-1)?.resultado, 'no_comida');
});

test('el veredicto de OFF manda sobre una ficha vieja del catálogo', async () => {
  const vieja: FilaCatalogo = { ...FILA, updated_at: new Date(AHORA - 40 * 86_400_000).toISOString() };
  const { dep } = montar({
    async buscarEnCatalogo() {
      return vieja;
    },
    async consultarOff(): Promise<ResultadoOff> {
      return { tipo: 'no_es_comida' };
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal((await leer(r)).not_food, true);
});

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

test('la respuesta lleva solo los campos públicos: ni updated_at ni el payload ni NADA de nutrición', async () => {
  const { dep } = montar({
    async buscarEnCatalogo() {
      // Una fila con más de lo debido: el payload, el hogar y la nutrición, en todas las formas
      // en que podría llegar (columnas sueltas, un objeto pegado, el propio booleano).
      return {
        ...FILA,
        off_payload: { secreto: 1 },
        household_id: 'x',
        nutriscore_grade: 'a',
        energy_kcal: 42,
        sugars: 10.6,
        additives_tags: ['en:e330'],
        nutrition: NUTRICION,
        product_nutrition: { nutrition_data_at: '2026-10-24T10:00:00Z', energy_kcal: 42 },
      } as unknown as FilaCatalogo;
    },
  });
  const cuerpo = await leer(await manejar(peticion(), dep));
  // Es de Opsi Premium y esta función no mira el plan: ni el booleano que decide la caducidad sale.
  assert.doesNotMatch(JSON.stringify(cuerpo), /nutri|energy|kcal|nova|additiv|sugar|serving|secreto/i);
  assert.deepEqual(Object.keys(cuerpo.product).sort(), [
    'allergens_tags',
    'barcode',
    'brand',
    'health_data',
    'id',
    'image_url',
    'ingredients_text',
    'labels_tags',
    'name',
    'net_quantity',
    'source',
    'traces_tags',
    'unit_family',
  ]);
});

test('la respuesta lleva los datos de salud tal como están en la ficha, y health_data en true', async () => {
  const { dep } = montar({
    async buscarEnCatalogo() {
      return FILA;
    },
  });
  const { product } = await leer(await manejar(peticion(), dep));
  assert.deepEqual(product.allergens_tags, ['en:milk']);
  assert.deepEqual(product.traces_tags, ['en:soybeans']);
  assert.deepEqual(product.labels_tags, ['en:no-lactose']);
  assert.equal(product.ingredients_text, 'Agua, azúcar y leche.');
  assert.equal(product.health_data, true);
});

test('una ficha consultada que no declara nada: listas vacías PERO health_data true (no es lo mismo que «no consta»)', async () => {
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return { ...FILA, allergens_tags: [], traces_tags: [], labels_tags: [], ingredients_text: null, health_data: true };
    },
  });
  const { product } = await leer(await manejar(peticion(), dep));
  assert.deepEqual([product.allergens_tags, product.traces_tags, product.labels_tags], [[], [], []]);
  assert.equal(product.health_data, true);
  assert.equal(llamadas.consultarOff, 0, 'está al día: no se vuelve a preguntar');
});

// ── Una ficha de antes de los datos de salud ─────────────────────────────

test('ficha sin datos de salud: cuenta como caducada y se renueva desde OFF aunque sea de ayer', async () => {
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return FILA_SIN_SALUD;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  assert.equal(llamadas.reservarHuecoOff, 1);
  assert.equal(llamadas.consultarOff, 1);
  assert.equal(llamadas.guardar, 1);
  const { product } = await leer(r);
  assert.equal(product.health_data, true, 'lo que se devuelve es la ficha renovada');
  assert.deepEqual(product.allergens_tags, ['en:milk']);
});

test('ficha sin datos de salud: la cuota por persona se sigue cobrando antes de mirar nada', async () => {
  const { dep, llamadas } = montar({
    async consumirCuota() {
      return { permitido: false, reintentarEn: 10 };
    },
    async buscarEnCatalogo() {
      return FILA_SIN_SALUD;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 429);
  assert.equal(llamadas.buscarEnCatalogo, 0);
  assert.equal(llamadas.consultarOff, 0);
});

test('ficha sin datos de salud y OFF sin contestar: se sirve la vieja con health_data en false, nunca un error', async () => {
  for (const off of [
    { tipo: 'error', motivo: 'tiempo_agotado' },
    { tipo: 'no_existe' },
  ] as ResultadoOff[]) {
    const { dep, llamadas } = montar({
      async buscarEnCatalogo() {
        return FILA_SIN_SALUD;
      },
      async consultarOff() {
        return off;
      },
    });
    const r = await manejar(peticion(), dep);
    assert.equal(r.status, 200, off.tipo);
    const { product } = await leer(r);
    assert.equal(product.name, 'Refresco de cola');
    assert.equal(product.health_data, false, 'sin datos de OFF no puede parecer que los hay');
    assert.deepEqual([product.allergens_tags, product.traces_tags, product.labels_tags], [[], [], []]);
    assert.equal(product.ingredients_text, null);
    assert.equal(llamadas.guardar, 0);
    assert.equal(llamadas.registrarFalta, 0, 'una ficha que existía no pasa a ser una falta');
  }
});

test('ficha sin datos de salud y sin hueco o sin User-Agent: se sirve la vieja y no se llama a OFF', async () => {
  for (const sobre of [
    { async reservarHuecoOff() { return false; } },
    { userAgentOff: null },
  ] as Partial<Dependencias>[]) {
    const { dep, llamadas } = montar({
      async buscarEnCatalogo() {
        return FILA_SIN_SALUD;
      },
      ...sobre,
    });
    const r = await manejar(peticion(), dep);
    assert.equal(r.status, 200);
    assert.equal((await leer(r)).product.health_data, false);
    assert.equal(llamadas.consultarOff, 0);
  }
});

test('ficha sin datos de salud y OFF dice que no es comida: manda OFF', async () => {
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return FILA_SIN_SALUD;
    },
    async consultarOff(): Promise<ResultadoOff> {
      return { tipo: 'no_es_comida' };
    },
  });
  const cuerpo = await leer(await manejar(peticion(), dep));
  assert.equal(cuerpo.not_food, true);
  assert.equal(llamadas.guardar, 0);
});

test('ficha con datos de salud pero caducada: se renueva como siempre', async () => {
  const vieja = { ...FILA, updated_at: new Date(AHORA - (DIAS_CADUCIDAD_CACHE + 1) * 86_400_000).toISOString() };
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return vieja;
    },
  });
  await manejar(peticion(), dep);
  assert.equal(llamadas.consultarOff, 1);
  assert.equal(llamadas.guardar, 1);
});

test('guardar recibe los datos de salud ya filtrados que devolvió OFF', async () => {
  let recibido: ProductoOff | null = null;
  const { dep } = montar({
    async guardar(codigo, producto) {
      recibido = producto;
      return { ...FILA, barcode: codigo };
    },
  });
  await manejar(peticion(), dep);
  assert.deepEqual(recibido, PRODUCTO_OFF);
});

// ── Nutrición (Opsi Premium) ─────────────────────────────────────────────

test('una ficha sin su fila de nutrición cuenta como caducada y se renueva desde OFF aunque sea de ayer', async () => {
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return FILA_SIN_NUTRICION;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  assert.equal(llamadas.reservarHuecoOff, 1);
  assert.equal(llamadas.consultarOff, 1);
  assert.equal(llamadas.guardar, 1);
  assert.equal(llamadas.guardarNutricion, 1);
  assert.equal(llamadas.registrarFalta, 0);
});

test('una ficha con salud y con nutrición, al día, NO se renueva', async () => {
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return FILA;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  assert.equal(llamadas.consultarOff, 0);
  assert.equal(llamadas.guardar, 0);
  assert.equal(llamadas.guardarNutricion, 0);
});

test('ficha sin nutrición: la cuota por persona se sigue cobrando antes de mirar nada', async () => {
  const { dep, llamadas } = montar({
    async consumirCuota() {
      return { permitido: false, reintentarEn: 10 };
    },
    async buscarEnCatalogo() {
      return FILA_SIN_NUTRICION;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 429);
  assert.equal(llamadas.buscarEnCatalogo, 0);
  assert.equal(llamadas.consultarOff, 0);
});

test('ficha sin nutrición y OFF sin contestar: se sirve la vieja, nunca un error, y no se guarda nada', async () => {
  for (const off of [
    { tipo: 'error', motivo: 'tiempo_agotado' },
    { tipo: 'no_existe' },
  ] as ResultadoOff[]) {
    const { dep, llamadas } = montar({
      async buscarEnCatalogo() {
        return FILA_SIN_NUTRICION;
      },
      async consultarOff() {
        return off;
      },
    });
    const r = await manejar(peticion(), dep);
    assert.equal(r.status, 200, off.tipo);
    assert.equal((await leer(r)).product.name, 'Refresco de cola');
    assert.equal(llamadas.guardar, 0);
    assert.equal(llamadas.guardarNutricion, 0);
    assert.equal(llamadas.registrarFalta, 0, 'una ficha que existía no pasa a ser una falta');
  }
});

test('ficha sin nutrición y sin hueco o sin User-Agent: se sirve la vieja y no se llama a OFF', async () => {
  for (const sobre of [
    { async reservarHuecoOff() { return false; } },
    { userAgentOff: null },
  ] as Partial<Dependencias>[]) {
    const { dep, llamadas } = montar({
      async buscarEnCatalogo() {
        return FILA_SIN_NUTRICION;
      },
      ...sobre,
    });
    const r = await manejar(peticion(), dep);
    assert.equal(r.status, 200);
    assert.equal(llamadas.consultarOff, 0);
    assert.equal(llamadas.guardarNutricion, 0);
  }
});

test('ficha sin nutrición y OFF dice que no es comida: manda OFF y no se guarda nutrición', async () => {
  const { dep, llamadas } = montar({
    async buscarEnCatalogo() {
      return FILA_SIN_NUTRICION;
    },
    async consultarOff(): Promise<ResultadoOff> {
      return { tipo: 'no_es_comida' };
    },
  });
  const cuerpo = await leer(await manejar(peticion(), dep));
  assert.equal(cuerpo.not_food, true);
  assert.equal(llamadas.guardar, 0);
  assert.equal(llamadas.guardarNutricion, 0);
});

test('la nutrición se guarda DESPUÉS de la ficha, con el id que ésta devolvió y la nutrición filtrada de OFF', async () => {
  const orden: string[] = [];
  let recibida: { id: string; nutricion: NutricionOff } | null = null;
  const { dep } = montar({
    async guardar(codigo): Promise<ProductoCatalogo> {
      orden.push('ficha');
      return { ...FILA, id: 'id-de-la-ficha', barcode: codigo };
    },
    async guardarNutricion(id, nutricion) {
      orden.push('nutricion');
      recibida = { id, nutricion };
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  assert.deepEqual(orden, ['ficha', 'nutricion']);
  assert.deepEqual(recibida, { id: 'id-de-la-ficha', nutricion: NUTRICION });
});

test('OFF encuentra el producto pero no declara nutrición: se guarda igualmente la fila, con todo a null', async () => {
  let recibida: NutricionOff | null = null;
  const { dep, llamadas } = montar({
    async consultarOff(): Promise<ResultadoOff> {
      return { tipo: 'encontrado', producto: { ...PRODUCTO_OFF, nutrition: NUTRICION_SIN_DATOS } };
    },
    async guardarNutricion(_id, nutricion) {
      llamadas.guardarNutricion++;
      recibida = nutricion;
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 200);
  // Es la marca de «se consultó»: sin ella la ficha se renovaría en cada escaneo.
  assert.equal(llamadas.guardarNutricion, 1);
  assert.deepEqual(recibida, NUTRICION_SIN_DATOS);
});

test('si falla guardar la nutrición NO se tumba el escaneo: 200 con la ficha ya guardada, y el fallo va al log', async () => {
  const { dep, llamadas, logs } = montar({
    async guardarNutricion() {
      llamadas.guardarNutricion++;
      throw new TypeError(`function public.upsert_product_nutrition does not exist en 10.0.0.5 ${'x'.repeat(400)}`);
    },
  });
  const r = await manejar(peticion(), dep);
  // La nutrición es un extra de Premium; el escáner es la función central.
  assert.equal(r.status, 200);
  const cuerpo = await leer(r);
  assert.equal(cuerpo.found, true);
  assert.equal(cuerpo.product.id, 'nuevo', 'es la ficha que acaba de guardar guardar()');
  assert.equal(cuerpo.product.name, 'Refresco de cola');
  assert.equal(llamadas.guardar, 1, 'la ficha se guardó antes');
  assert.equal(llamadas.guardarNutricion, 1, 'se intentó una vez, sin reintentos');
  assert.equal(llamadas.registrarFalta, 0, 'un fallo de la nutrición no convierte la ficha en una falta');

  // Un evento claro con el resultado `nutricion_error`: solo el nombre del error y el mensaje cortado.
  const evento = logs.find((l) => l.resultado === 'nutricion_error');
  assert.ok(evento, 'se esperaba un evento con resultado nutricion_error');
  assert.equal(evento.evento, 'lookup-barcode');
  assert.equal(evento.user_id, 'user-1');
  assert.match(String(evento.request_id), /^[0-9a-f-]{36}$/);
  assert.equal(evento.error, 'TypeError');
  assert.match(String(evento.detalle), /upsert_product_nutrition/);
  assert.equal(String(evento.detalle).length, 200, 'el mensaje se corta a 200 caracteres');
  assert.deepEqual(Object.keys(evento).sort(), ['detalle', 'error', 'evento', 'request_id', 'resultado', 'user_id']);

  // Ni la fila, ni los datos de OFF, ni el código de barras (dice qué compra la persona) en ningún log.
  const todo = JSON.stringify(logs);
  assert.doesNotMatch(todo, new RegExp(CODIGO));
  assert.doesNotMatch(todo, /330 ml|en:e150d|Refresco de cola|nutritionExtra/);
  // Y el log normal de la petición sigue ahí: terminó bien.
  assert.equal(logs.at(-1)?.resultado, 'off');
  assert.equal(logs.at(-1)?.estado, 200);
});

test('si la nutrición falla con algo que no es un Error, también se registra y sigue: 200', async () => {
  for (const raro of ['texto suelto', { message: 'objeto de la base de datos', details: 'fila: (42,…)' }, null, 7]) {
    const { dep, logs } = montar({
      async guardarNutricion() {
        throw raro;
      },
    });
    const r = await manejar(peticion(), dep);
    assert.equal(r.status, 200, JSON.stringify(raro));
    const evento = logs.find((l) => l.resultado === 'nutricion_error');
    assert.ok(evento, JSON.stringify(raro));
    assert.equal(evento.detalle, '', 'de algo que no es un Error no se copia nada');
    assert.doesNotMatch(JSON.stringify(logs), /fila: \(42/);
  }
});

test('si la nutrición falla, la ficha sigue «sin fila»: el escaneo siguiente la renueva (cuenta como caducada)', async () => {
  // Primer escaneo: la nutrición falla, pero la ficha se guarda y se devuelve.
  const { dep: primero } = montar({
    async guardarNutricion() {
      throw new Error('red caída');
    },
  });
  assert.equal((await manejar(peticion(), primero)).status, 200);
  // Segundo escaneo: el catálogo trae la ficha SIN fila de nutrición, y se vuelve a intentar.
  const { dep: segundo, llamadas } = montar({
    async buscarEnCatalogo() {
      return FILA_SIN_NUTRICION;
    },
  });
  const r = await manejar(peticion(), segundo);
  assert.equal(r.status, 200);
  assert.equal(llamadas.consultarOff, 1);
  assert.equal(llamadas.guardar, 1);
  assert.equal(llamadas.guardarNutricion, 1);
});


test('si falla guardar la ficha no se intenta guardar la nutrición (no habría a quién colgarla)', async () => {
  const { dep, llamadas } = montar({
    async guardar() {
      throw new Error('rpc caída');
    },
  });
  const r = await manejar(peticion(), dep);
  assert.equal(r.status, 500);
  assert.equal(llamadas.guardarNutricion, 0);
});

test('recién traída de OFF, la respuesta tampoco lleva nutrición aunque guardar devuelva de más', async () => {
  const { dep } = montar({
    async guardar(codigo) {
      // Un index.ts descuidado podría devolver la fila entera con la nutrición pegada.
      return { ...FILA, barcode: codigo, nutrition: NUTRICION, nutrition_data: true, energy_kcal: 42 } as unknown as ProductoCatalogo;
    },
  });
  const cuerpo = await leer(await manejar(peticion(), dep));
  assert.equal(cuerpo.found, true);
  assert.doesNotMatch(JSON.stringify(cuerpo), /nutri|energy|kcal|nova|additiv|sugar|serving/i);
});

test('tieneNutricion: solo cuenta una fila con su fecha, como objeto o como lista de uno', () => {
  assert.equal(tieneNutricion({ nutrition_data_at: '2026-10-24T10:00:00+00:00' }), true);
  assert.equal(tieneNutricion([{ nutrition_data_at: '2026-10-24T10:00:00+00:00' }]), true);
  for (const no of [null, undefined, [], {}, [{}], { nutrition_data_at: null }, { nutrition_data_at: '' }, { nutrition_data_at: 1 }, 'x', 7, true, [null], [[]]]) {
    assert.equal(tieneNutricion(no), false, JSON.stringify(no));
  }
});

test('aFilaCatalogo: el producto público más la fecha y si trae nutrición; aProducto no deja pasar el booleano', () => {
  const base = {
    id: 'x', barcode: CODIGO, name: 'Algo', brand: null, unit_family: null, net_quantity: null, image_url: null,
    allergens_tags: [], traces_tags: [], labels_tags: [], ingredients_text: null,
    health_data_at: '2026-10-21T10:00:00+00:00', updated_at: '2026-10-24T10:00:00+00:00',
  };
  const con = aFilaCatalogo({ ...base, product_nutrition: { nutrition_data_at: '2026-10-24T10:00:00+00:00' } });
  assert.equal(con.nutrition_data, true);
  assert.equal(con.updated_at, '2026-10-24T10:00:00+00:00');
  assert.equal(con.health_data, true);
  for (const sin of [null, [], undefined]) {
    assert.equal(aFilaCatalogo({ ...base, product_nutrition: sin }).nutrition_data, false, JSON.stringify(sin));
  }
  // Lo público no lleva el booleano ni la nutrición, aunque la fila los traiga.
  assert.equal('nutrition_data' in aProducto({ ...base, product_nutrition: { nutrition_data_at: 'x' } }), false);
});

test('ninguna pieza del escáner lee los VALORES de la nutrición: solo la fecha, y nunca la devuelve', () => {
  // `service_role` solo puede leer `product_id` y `nutrition_data_at` de esa tabla, y la
  // función no tiene por qué llamar a `nutrition_of_products` (que es de la app y premium).
  const carpetas = [new URL('.', import.meta.url), new URL('../lookup-barcode/', import.meta.url)];
  const fuentes = carpetas.flatMap((carpeta) =>
    readdirSync(carpeta)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => ({ f, texto: readFileSync(new URL(f, carpeta), 'utf8') })),
  );
  for (const { f, texto } of fuentes) {
    assert.doesNotMatch(texto, /from\(\s*['"]product_nutrition['"]\s*\)/, `${f}: no se lee la tabla directamente`);
    assert.doesNotMatch(texto, /rpc\(\s*['"]nutrition_of_products['"]/, `${f}: la lectura es de la app`);
    for (const uso of texto.matchAll(/product_nutrition\(([^)]*)\)/g)) {
      assert.equal(uso[1], 'nutrition_data_at', `${f}: del embed solo se pide la fecha`);
    }
  }
  const index = fuentes.find((s) => s.f === 'index.ts')?.texto ?? '';
  assert.match(index, /product_nutrition\(nutrition_data_at\)/);
});

// ── De la fila de la base de datos a lo que se devuelve ──────────────────

test('aProducto: una fila anterior a los datos de salud (todo NULL) sale con listas vacías y health_data false', () => {
  const p = aProducto({
    id: 'x', barcode: CODIGO, name: 'Algo', brand: null, unit_family: null, net_quantity: null, image_url: null,
    allergens_tags: null, traces_tags: null, labels_tags: null, ingredients_text: null, health_data_at: null,
  });
  assert.deepEqual(
    [p.allergens_tags, p.traces_tags, p.labels_tags, p.ingredients_text, p.health_data],
    [[], [], [], null, false],
  );
});

test('aProducto: una fila consultada pone health_data en true, también con las listas vacías', () => {
  const p = aProducto({
    id: 'x', barcode: CODIGO, name: 'Algo', brand: 'M', unit_family: 'mass', net_quantity: '250',
    image_url: null, allergens_tags: [], traces_tags: ['en:nuts'], labels_tags: ['en:no-gluten'],
    ingredients_text: 'Agua.', health_data_at: '2026-10-21T10:00:00+00:00',
  });
  assert.equal(p.health_data, true);
  assert.deepEqual(p.allergens_tags, []);
  assert.deepEqual(p.traces_tags, ['en:nuts']);
  assert.equal(p.net_quantity, 250, 'numeric llega como texto y sale como número');
  assert.equal(p.ingredients_text, 'Agua.');
});

test('aProducto: lo que no sea una lista de textos no se cuela', () => {
  const p = aProducto({
    id: 'x', barcode: CODIGO, name: 'Algo', allergens_tags: 'en:milk', traces_tags: [1, null, 'en:nuts', {}],
    labels_tags: { 0: 'en:no-gluten' }, ingredients_text: 42, health_data_at: 'x',
  });
  assert.deepEqual([p.allergens_tags, p.traces_tags, p.labels_tags, p.ingredients_text], [[], ['en:nuts'], [], null]);
});

// ── Las preferencias de salud no se tocan desde aquí ─────────────────────

test('ninguna pieza del escáner nombra las preferencias de salud de las personas', () => {
  // El cruce «lo que evito × lo que lleva el producto» es del móvil. Si una Edge
  // Function o una función auxiliar leyera la tabla, los datos de salud de cada
  // persona quedarían al alcance de la clave `service_role`.
  const carpetas = [new URL('.', import.meta.url), new URL('../lookup-barcode/', import.meta.url)];
  const fuentes = carpetas.flatMap((carpeta) =>
    readdirSync(carpeta)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .map((f) => ({ f, texto: readFileSync(new URL(f, carpeta), 'utf8') })),
  );
  assert.ok(fuentes.length >= 4, 'se esperaban lookup, off, gtin e index');
  for (const { f, texto } of fuentes) {
    assert.doesNotMatch(texto, /user_health_preferences|health_preferences/i, f);
  }
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
