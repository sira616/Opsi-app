import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  adaptadoresPara,
  ADAPTADORES_SUPERMERCADO,
  CacheTtl,
  crearFuenteCatalogo,
  crearFuenteHistorial,
  crearFuenteOff,
  type FilaAsociacion,
  type FilaCatalogo,
} from './fuentes-marcas.ts';
import { digitoDeControl } from './gtin.ts';
import type { CandidatoOff } from './off-busqueda.ts';
import { prepararConsulta, resolverLineas, type FuenteSupermercado } from './resolver.ts';
import { claveDeLinea } from './texto-ticket.ts';

function ean13(cuerpo12: string): string {
  return cuerpo12 + String(digitoDeControl(cuerpo12));
}

function consulta(texto: string, nombre = texto, tienda = 'mercadona') {
  return prepararConsulta({ id: 'x', texto, nombre, tiendaClave: tienda });
}

function fila(extra: Partial<FilaAsociacion> & { line_key: string }): FilaAsociacion {
  return {
    store_key: 'mercadona',
    product_id: null,
    name: 'Leche entera',
    brand: 'Pascual',
    barcode: null,
    unit_family: 'volume',
    net_quantity: 1000,
    confirmations: 1,
    ...extra,
  };
}

// ── Historial ─────────────────────────────────────────────────────────────

test('el historial solo devuelve lo de EXACTAMENTE el mismo texto', async () => {
  const f = crearFuenteHistorial([
    fila({ line_key: claveDeLinea('LECHE ENTERA 1L') }),
    fila({ line_key: claveDeLinea('LECHE ENTERA SIN LACTOSA 1L'), name: 'Leche sin lactosa', brand: 'Pascual' }),
    fila({ line_key: claveDeLinea('LECHE') , name: 'Leche', brand: 'Otra' }),
  ]);
  const r = await f.buscar(consulta('Leche  ENTERA 1l'));
  assert.equal(r.tipo, 'ok');
  if (r.tipo !== 'ok') return;
  assert.deepEqual(r.candidatos.map((c) => c.nombre), ['Leche entera']);
  assert.deepEqual(r.candidatos[0].asociacion, { tiendaClave: 'mercadona', confirmaciones: 1 });
  assert.deepEqual(r.candidatos[0].origenes, ['usuario']);
  assert.deepEqual(r.candidatos[0].tamano, { familia: 'volume', total: 1000 });
});

test('"LECHE ENTERA 1L" confirmada no se aplica a cualquier línea que contenga LECHE', async () => {
  const historial = crearFuenteHistorial([fila({ line_key: claveDeLinea('LECHE ENTERA 1L') })]);
  const rs = await resolverLineas(
    [
      { id: 'a', texto: 'LECHE ENTERA 1L', nombre: 'leche entera 1 l', tiendaClave: 'mercadona' },
      { id: 'b', texto: 'LECHE DE AVENA', nombre: 'leche de avena', tiendaClave: 'mercadona' },
      { id: 'c', texto: 'LECHE ENTERA 1L SIN LACTOSA', nombre: 'leche entera sin lactosa 1 l', tiendaClave: 'mercadona' },
      { id: 'd', texto: 'LECHE ENTERA 200ML', nombre: 'leche entera 200 ml', tiendaClave: 'mercadona' },
    ],
    [historial],
  );
  assert.equal(rs[0].estado, 'resuelta');
  assert.equal(rs[0].estadoMarca, 'confirmada');
  assert.deepEqual(rs.slice(1).map((r) => r.estado), ['sin_candidatos', 'sin_candidatos', 'sin_candidatos']);
});

test('el importe del final no impide reconocer la línea de otro día', async () => {
  const historial = crearFuenteHistorial([fila({ line_key: claveDeLinea('LECHE ENTERA 1L 0,89') })]);
  const [r] = await resolverLineas(
    [{ id: 'a', texto: 'LECHE ENTERA 1L 0,95', nombre: 'leche entera 1 l', tiendaClave: 'mercadona' }],
    [historial],
  );
  assert.equal(r.estado, 'resuelta');
});

test('una corrección manual (marca escrita, sin producto) se reutiliza en la compra siguiente', async () => {
  const historial = crearFuenteHistorial([
    fila({ line_key: claveDeLinea('PAN PUEBLO'), name: 'Pan de pueblo', brand: 'Horno de Lola', unit_family: null, net_quantity: null, confirmations: 2 }),
  ]);
  const [r] = await resolverLineas([{ id: 'a', texto: 'PAN PUEBLO', nombre: 'pan de pueblo', tiendaClave: 'mercadona' }], [historial]);
  assert.equal(r.estado, 'resuelta');
  assert.equal(r.candidatos[0].marca, 'Horno de Lola');
  assert.equal(r.candidatos[0].productoId, null);
  assert.equal(r.candidatos[0].asociacion?.confirmaciones, 2);
});

test('una asociación sin marca ("sin identificar") no inventa ninguna', async () => {
  const historial = crearFuenteHistorial([fila({ line_key: claveDeLinea('PAN PUEBLO'), name: 'Pan de pueblo', brand: null })]);
  const [r] = await resolverLineas([{ id: 'a', texto: 'PAN PUEBLO', nombre: 'pan de pueblo', tiendaClave: 'mercadona' }], [historial]);
  assert.equal(r.candidatos[0].marca, null);
  assert.equal(r.estadoMarca, 'desconocida');
});

test('el historial limpia lo que lee: un nombre con caracteres ocultos y un código malo', async () => {
  const f = crearFuenteHistorial([fila({ line_key: 'x', name: 'Pan' + String.fromCharCode(0x202e) + '  raro', barcode: '1234567890123' })]);
  const r = await f.buscar(consulta('x'));
  assert.equal(r.tipo, 'ok');
  if (r.tipo !== 'ok') return;
  assert.equal(r.candidatos[0].nombre, 'Pan raro');
  assert.equal(r.candidatos[0].ean, null, 'un código con el control malo no es un EAN');
});

// ── Catálogo local ────────────────────────────────────────────────────────

const FILA_CATALOGO = (extra: Partial<FilaCatalogo> = {}): FilaCatalogo => ({
  id: '11111111-1111-4111-8111-111111111111',
  household_id: null,
  barcode: ean13('841012801009'),
  name: 'Leche entera',
  brand: 'Pascual',
  unit_family: 'volume',
  net_quantity: '1000',
  image_url: 'https://images.openfoodfacts.org/x.jpg',
  categories_tags: ['en:milks'],
  ...extra,
});

test('el catálogo global cuenta como origen OFF y uno privado como de la persona', async () => {
  const f = crearFuenteCatalogo(async () => [FILA_CATALOGO(), FILA_CATALOGO({ id: '22222222-2222-4222-8222-222222222222', household_id: '33333333-3333-4333-8333-333333333333', barcode: null })]);
  const r = await f.buscar(consulta('leche entera 1l'));
  assert.equal(r.tipo, 'ok');
  if (r.tipo !== 'ok') return;
  assert.deepEqual(r.candidatos.map((c) => c.origenes), [['off'], ['usuario']]);
  assert.equal(r.candidatos[0].productoId, '11111111-1111-4111-8111-111111111111');
  assert.deepEqual(r.candidatos[0].tamano, { familia: 'volume', total: 1000 });
});

test('si el catálogo falla, es un error de la fuente y no tumba nada', async () => {
  const f = crearFuenteCatalogo(async () => {
    throw new Error('db caída');
  });
  assert.deepEqual(await f.buscar(consulta('leche entera')), { tipo: 'error', motivo: 'catalogo_no_disponible' });
});

test('el catálogo no se pregunta sin nada que buscar', async () => {
  let llamadas = 0;
  const f = crearFuenteCatalogo(async () => (llamadas++, []));
  const r = await f.buscar(consulta('1l'));
  assert.deepEqual(r, { tipo: 'ok', candidatos: [] });
  assert.equal(llamadas, 0);
});

test('una imagen que no es de OFF no llega a la pantalla', async () => {
  const f = crearFuenteCatalogo(async () => [FILA_CATALOGO({ image_url: 'https://evil.example/pixel.png' })]);
  const r = await f.buscar(consulta('leche entera 1l'));
  assert.equal(r.tipo === 'ok' && r.candidatos[0].imagen, null);
});

// ── Open Food Facts ───────────────────────────────────────────────────────

const HIT = (extra: Partial<CandidatoOff> = {}): CandidatoOff => ({
  code: ean13('841012801009'),
  name: 'Leche entera',
  brand: 'Pascual',
  cantidad: { unitFamily: 'volume', netQuantity: 1000 },
  categoriesTags: ['en:milks'],
  stores: ['Mercadona', 'Tienda rara del barrio'],
  imageUrl: null,
  ...extra,
});

function depOff(respuestas: Parameters<typeof crearFuenteOff>[0]['buscar'], cupo = 100) {
  const estado = { reservas: 0, busquedas: [] as unknown[] };
  const reloj = { ahora: 0 };
  const dep = {
    cache: new CacheTtl<CandidatoOff[]>(50, () => reloj.ahora),
    async reservar(n: number) {
      estado.reservas += 1;
      return estado.reservas <= cupo ? { concedidas: n, esperaS: 0 } : { concedidas: 0, esperaS: 42 };
    },
    async buscar(c: Parameters<typeof respuestas>[0]) {
      estado.busquedas.push(c);
      return respuestas(c);
    },
  };
  return { dep, estado, reloj };
}

test('OFF devuelve candidatos con el EAN y las tiendas reducidas a su clave', async () => {
  const { dep } = depOff(async () => ({ tipo: 'resultados', candidatos: [HIT()] }));
  const r = await crearFuenteOff(dep).buscar(consulta('leche entera 1l'));
  assert.equal(r.tipo, 'ok');
  if (r.tipo !== 'ok') return;
  assert.equal(r.candidatos[0].ean, ean13('841012801009'));
  assert.equal(r.candidatos[0].productoId, null);
  assert.deepEqual(r.candidatos[0].origenes, ['off']);
  assert.ok(r.candidatos[0].tiendas.includes('mercadona'));
});

test('la caché evita la segunda llamada y el segundo gasto de cupo', async () => {
  const { dep, estado } = depOff(async () => ({ tipo: 'resultados', candidatos: [HIT()] }));
  const f = crearFuenteOff(dep);
  await f.buscar(consulta('leche entera 1l'));
  await f.buscar(consulta('Leche ENTERA 1 L'));
  assert.equal(estado.busquedas.length, 1);
  assert.equal(estado.reservas, 1);
});

test('la caché caduca: pasadas 6 horas se vuelve a preguntar; un "no hay nada" caduca a la hora', async () => {
  const { dep, estado, reloj } = depOff(async (c) => ({
    tipo: 'resultados',
    candidatos: 'palabras' in c && c.palabras.includes('pastel') ? [] : [HIT()],
  }));
  const f = crearFuenteOff(dep);
  await f.buscar(consulta('leche entera'));
  await f.buscar(consulta('pastel raro'));
  reloj.ahora = 61 * 60 * 1000;
  await f.buscar(consulta('leche entera'));
  await f.buscar(consulta('pastel raro'));
  assert.equal(estado.busquedas.length, 3, 'la leche sigue en caché; el pastel vacío, no');
  reloj.ahora = 6 * 60 * 60 * 1000 + 1;
  await f.buscar(consulta('leche entera'));
  assert.equal(estado.busquedas.length, 4);
});

test('un error de OFF no se guarda en la caché', async () => {
  let fallar = true;
  const { dep, estado } = depOff(async () => (fallar ? { tipo: 'error', motivo: 'red' } : { tipo: 'resultados', candidatos: [HIT()] }));
  const f = crearFuenteOff(dep);
  assert.deepEqual(await f.buscar(consulta('leche entera')), { tipo: 'error', motivo: 'red' });
  fallar = false;
  const r = await f.buscar(consulta('leche entera'));
  assert.equal(r.tipo, 'ok');
  assert.equal(estado.busquedas.length, 2);
});

test('sin cupo no se llama a OFF y se dice cuánto esperar', async () => {
  const { dep, estado } = depOff(async () => ({ tipo: 'resultados', candidatos: [] }), 0);
  assert.deepEqual(await crearFuenteOff(dep).buscar(consulta('leche entera')), { tipo: 'limite', esperaS: 42 });
  assert.equal(estado.busquedas.length, 0);
});

test('un 429 de OFF se trata como quedarse sin cupo', async () => {
  const { dep } = depOff(async () => ({ tipo: 'error', motivo: 'http_429' }));
  assert.equal((await crearFuenteOff(dep).buscar(consulta('leche entera'))).tipo, 'limite');
});

test('si la línea imprime un EAN se busca primero por él, y si no aparece, por las palabras', async () => {
  const ean = ean13('841012801009');
  const { dep, estado } = depOff(async (c) => ({
    tipo: 'resultados',
    candidatos: 'codigo' in c ? [] : [HIT({ code: ean13('841012801016') })],
  }));
  const r = await crearFuenteOff(dep).buscar(consulta(`LECHE ENT ${ean}`, 'leche entera'));
  assert.equal(r.tipo, 'ok');
  assert.deepEqual(estado.busquedas.map((c) => ('codigo' in (c as object) ? 'codigo' : 'palabras')), ['codigo', 'palabras']);
  assert.equal(estado.reservas, 2);
});

test('sin palabras que buscar OFF no se pregunta', async () => {
  const { dep, estado } = depOff(async () => ({ tipo: 'resultados', candidatos: [] }));
  const r = await crearFuenteOff(dep).buscar(consulta('2 x 1l'));
  assert.deepEqual(r, { tipo: 'ok', candidatos: [] });
  assert.equal(estado.reservas, 0);
});

// ── La caché ──────────────────────────────────────────────────────────────

test('la caché tiene tope: se van las más antiguas', () => {
  const c = new CacheTtl<number>(3);
  for (let i = 0; i < 5; i += 1) c.guardar(`k${i}`, i, 1000);
  assert.equal(c.tamano, 3);
  assert.equal(c.leer('k0'), undefined);
  assert.equal(c.leer('k4'), 4);
});

// ── Supermercados ─────────────────────────────────────────────────────────

test('hoy no hay ningún catálogo de supermercado conectado, y no se finge que sí', () => {
  assert.equal(ADAPTADORES_SUPERMERCADO.length, 0);
  assert.deepEqual(adaptadoresPara('mercadona'), []);
});

test('un adaptador solo se pregunta para las tiendas que cubre', () => {
  const a: FuenteSupermercado = { id: 'supermercado:a', coste: 'externa', tiendas: ['mercadona'], clave: () => '', buscar: async () => ({ tipo: 'ok', candidatos: [] }) };
  assert.deepEqual(adaptadoresPara('mercadona', [a]), [a]);
  assert.deepEqual(adaptadoresPara('lidl', [a]), []);
  assert.deepEqual(adaptadoresPara('', [a]), []);
});
