import assert from 'node:assert/strict';
import { test } from 'node:test';

import { digitoDeControl } from './gtin.ts';
import { buscarEnOff, normalizarBusquedaOff, textoDeBusqueda } from './off-busqueda.ts';
import { userAgentValido } from './off.ts';

const UA = 'Opsi/0.1 (prueba@opsi.test)';

function ean13(cuerpo12: string): string {
  return cuerpo12 + String(digitoDeControl(cuerpo12));
}

/** Lo que devolvió de verdad Search-a-licious al probar «leche entera pascual», recortado. */
const RESPUESTA_REAL = {
  hits: [
    {
      code: '8410128010096',
      brands: ['Pascual'],
      stores: ['Mercadona', 'BM'],
      lang: 'es',
      quantity: '1 l',
      categories_tags: ['en:dairies', 'en:milks', 'en:whole-milks'],
      countries_tags: ['en:spain'],
      product_name: 'Leche entera',
      image_front_small_url: 'https://images.openfoodfacts.org/images/products/841/012/801/0096/front_es.65.200.jpg',
    },
    { code: '7790373104544', brands: ['Cotapa'], product_name: 'Leche entera', categories_tags: ['en:milks'] },
  ],
  page: 1,
  page_size: 12,
  debug: { query: { cualquier: 'cosa' } },
};

function respuesta(cuerpo: unknown, estado = 200): Response {
  return new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status: estado });
}

// ── Qué se manda a buscar ─────────────────────────────────────────────────

test('el texto de búsqueda se reduce a letras y cifras en minúsculas', () => {
  assert.equal(textoDeBusqueda(['leche', 'entera']), 'leche entera');
  assert.equal(textoDeBusqueda(['Coca-Cola', 'ZERO']), 'cocacola zero');
  assert.equal(textoDeBusqueda(['leche"', 'AND', 'code:123', 'OR', '(x)']), 'leche and code123 or x');
});

test('sin palabras de verdad no hay búsqueda, y las cifras solas no cuentan', () => {
  assert.equal(textoDeBusqueda([]), null);
  assert.equal(textoDeBusqueda(['2', '0.5', '%']), null);
  assert.equal(textoDeBusqueda(['de']), null);
});

test('el texto de búsqueda tiene tope', () => {
  const texto = textoDeBusqueda(Array.from({ length: 50 }, () => 'palabralarga'));
  assert.ok(texto !== null && texto.length <= 100);
});

// ── Qué se acepta de la respuesta ─────────────────────────────────────────

test('una respuesta real se lee: marca de la lista, cantidad, categorías, tiendas e imagen de OFF', () => {
  const [a, b] = normalizarBusquedaOff(RESPUESTA_REAL);
  assert.equal(a.code, '8410128010096');
  assert.equal(a.name, 'Leche entera');
  assert.equal(a.brand, 'Pascual');
  assert.deepEqual(a.cantidad, { unitFamily: 'volume', netQuantity: 1000 });
  assert.deepEqual(a.stores, ['Mercadona', 'BM']);
  assert.ok(a.categoriesTags.includes('en:whole-milks'));
  assert.ok(a.imageUrl?.startsWith('https://images.openfoodfacts.org/'));
  assert.equal(b.brand, 'Cotapa');
  assert.equal(b.cantidad, null);
  assert.equal(b.imageUrl, null);
});

test('un resultado sin código válido, sin nombre o con un código que no es de comida se descarta', () => {
  const buenoCod = ean13('841012801009');
  const malo = '8410128010090' === buenoCod ? '8410128010091' : '8410128010090';
  const r = normalizarBusquedaOff({
    hits: [
      { code: malo, product_name: 'Código con el control malo' },
      { code: '9770123456789', product_name: 'Revista' }, // 977: ISSN
      { code: ean13('978012345678'), product_name: 'Libro' }, // 978: ISBN
      { code: buenoCod },
      { code: buenoCod, product_name: 'Con nombre' },
      { code: buenoCod, product_name: 'Repetido' },
      { code: 12, product_name: 'Código corto' },
      'basura',
      null,
    ],
  });
  assert.deepEqual(r.map((c) => c.name), ['Con nombre']);
});

test('el tabaco que OFF acepta con código de barras no es un candidato', () => {
  const r = normalizarBusquedaOff({
    hits: [
      { code: ean13('841000000001'), product_name: 'Tabaco de liar', categories_tags: ['en:tobaccos'] },
      { code: ean13('841000000002'), product_name: 'Cigarrillos rubios' },
      { code: ean13('841000000003'), product_name: 'Salsa tabasco' },
    ],
  });
  assert.deepEqual(r.map((c) => c.name), ['Salsa tabasco']);
});

test('lo que llega de OFF se limpia: marcas con caracteres ocultos, tiendas largas, imágenes de otro dominio', () => {
  const [c] = normalizarBusquedaOff({
    hits: [
      {
        code: ean13('841000000004'),
        product_name: 'Leche‮ entera\n<b>',
        brands: 'Pascual, Otra',
        stores: ['x'.repeat(200), 'Mercadona', 'Mercadona', 3, null],
        image_front_small_url: 'https://evil.example/pixel.png',
        quantity: 'una cantidad rara',
      },
    ],
  });
  assert.equal(c.name, 'Leche entera b');
  assert.equal(c.brand, 'Pascual');
  assert.equal(c.stores.length, 2);
  assert.equal(c.stores[1], 'Mercadona');
  assert.equal(c.imageUrl, null);
  assert.equal(c.cantidad, null);
});

test('una respuesta que no es lo esperado da una lista vacía, no un fallo', () => {
  for (const v of [null, 'x', 3, [], {}, { hits: 'no' }, { hits: null }]) assert.deepEqual(normalizarBusquedaOff(v), []);
});

test('tope de resultados', () => {
  const hits = Array.from({ length: 30 }, (_, i) => ({ code: ean13(String(841000100000 + i)), product_name: `Producto ${i}` }));
  assert.equal(normalizarBusquedaOff({ hits }).length, 12);
});

// ── La llamada ────────────────────────────────────────────────────────────

test('la búsqueda va al host fijo, sin redirecciones, con la identidad de Opsi y el filtro de España', async () => {
  let visto: { url: URL; init: RequestInit } | null = null;
  const r = await buscarEnOff({ palabras: ['leche', 'entera'] }, {
    userAgent: UA,
    fetchImpl: async (url, init) => {
      visto = { url: new URL(String(url)), init: init ?? {} };
      return respuesta(RESPUESTA_REAL);
    },
  });
  assert.equal(r.tipo, 'resultados');
  assert.ok(visto);
  const { url, init } = visto as { url: URL; init: RequestInit };
  assert.equal(url.origin, 'https://search.openfoodfacts.org');
  assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('q'), 'leche entera countries_tags:"en:spain"');
  assert.equal(url.searchParams.get('page_size'), '12');
  assert.ok(url.searchParams.get('fields')?.includes('brands'));
  assert.equal(init.redirect, 'error');
  assert.equal((init.headers as Record<string, string>)['User-Agent'], UA);
});

test('por código de barras se busca el código exacto, y solo si son cifras', async () => {
  let q = '';
  await buscarEnOff({ codigo: '8410128010096' }, {
    userAgent: UA,
    fetchImpl: async (url) => {
      q = new URL(String(url)).searchParams.get('q') ?? '';
      return respuesta({ hits: [] });
    },
  });
  assert.equal(q, 'code:8410128010096');
  const malo = await buscarEnOff({ codigo: '8410128010096 OR code:1' }, { userAgent: UA, fetchImpl: async () => respuesta({ hits: [] }) });
  assert.deepEqual(malo, { tipo: 'error', motivo: 'codigo_no_numerico' });
});

test('sin texto que buscar no se llama a nadie', async () => {
  let llamadas = 0;
  const r = await buscarEnOff({ palabras: ['2'] }, { userAgent: UA, fetchImpl: async () => (llamadas++, respuesta({ hits: [] })) });
  assert.deepEqual(r, { tipo: 'error', motivo: 'sin_texto' });
  assert.equal(llamadas, 0);
});

test('429 es «sin cupo», un 500 es un error, y ninguno lanza', async () => {
  const f = (estado: number) => async () => respuesta('no', estado);
  assert.deepEqual(await buscarEnOff({ palabras: ['leche'] }, { userAgent: UA, fetchImpl: f(429) }), { tipo: 'error', motivo: 'http_429' });
  assert.deepEqual(await buscarEnOff({ palabras: ['leche'] }, { userAgent: UA, fetchImpl: f(503) }), { tipo: 'error', motivo: 'http_503' });
});

test('el tiempo agotado y la red caída se distinguen y no lanzan', async () => {
  const agotado = async () => {
    throw Object.assign(new Error('t'), { name: 'TimeoutError' });
  };
  const caida = async () => {
    throw new TypeError('fetch failed');
  };
  assert.deepEqual(await buscarEnOff({ palabras: ['leche'] }, { userAgent: UA, fetchImpl: agotado }), { tipo: 'error', motivo: 'tiempo_agotado' });
  assert.deepEqual(await buscarEnOff({ palabras: ['leche'] }, { userAgent: UA, fetchImpl: caida }), { tipo: 'error', motivo: 'red' });
});

test('una respuesta que no es JSON, sin lista de resultados o enorme es un error', async () => {
  const con = (cuerpo: string) => async () => respuesta(cuerpo);
  assert.deepEqual(await buscarEnOff({ palabras: ['leche'] }, { userAgent: UA, fetchImpl: con('<html>') }), { tipo: 'error', motivo: 'respuesta_ilegible' });
  assert.deepEqual(await buscarEnOff({ palabras: ['leche'] }, { userAgent: UA, fetchImpl: con('{"otra":1}') }), { tipo: 'error', motivo: 'respuesta_ilegible' });
  const enorme = async () => respuesta(JSON.stringify({ hits: [], relleno: 'x'.repeat(300 * 1024) }));
  assert.deepEqual(await buscarEnOff({ palabras: ['leche'] }, { userAgent: UA, fetchImpl: enorme }), { tipo: 'error', motivo: 'respuesta_demasiado_grande' });
});

test('una búsqueda sin resultados es un «no hay» y no un error', async () => {
  const r = await buscarEnOff({ palabras: ['pastelito'] }, { userAgent: UA, fetchImpl: async () => respuesta({ hits: [] }) });
  assert.deepEqual(r, { tipo: 'resultados', candidatos: [] });
});

// ── La identidad ──────────────────────────────────────────────────────────

test('el User-Agent de ejemplo o vacío no sirve', () => {
  assert.equal(userAgentValido('Opsi/0.1 (hola@opsi.test)'), 'Opsi/0.1 (hola@opsi.test)');
  assert.equal(userAgentValido('Opsi/0.1 (tu-correo@ejemplo.com)'), null);
  assert.equal(userAgentValido(''), null);
  assert.equal(userAgentValido(undefined), null);
  assert.equal(userAgentValido('corto'), null);
  assert.equal(userAgentValido('Opsi\n/0.1 (hola@opsi.test)'), null);
});
