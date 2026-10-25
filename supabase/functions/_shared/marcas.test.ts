import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { CacheTtl, type FilaAsociacion, type FilaCatalogo } from './fuentes-marcas.ts';
import { digitoDeControl } from './gtin.ts';
import { manejarMarcas, validarPeticion, type DependenciasMarcas } from './marcas.ts';
import type { CandidatoOff } from './off-busqueda.ts';
import { claveDeLinea } from './texto-ticket.ts';

const NEVERA = '11111111-1111-4111-8111-111111111111';
const TOKEN = 'a'.repeat(40);

function ean13(cuerpo12: string): string {
  return cuerpo12 + String(digitoDeControl(cuerpo12));
}

type Espia = {
  dep: DependenciasMarcas;
  llamadas: { plan: number; asociaciones: number; catalogo: number; reservar: number; off: number };
  registros: Record<string, unknown>[];
};

type Opciones = {
  filas?: FilaAsociacion[];
  filasCatalogo?: FilaCatalogo[];
  hits?: CandidatoOff[];
  planDe?: string;
  /** Sustituye una dependencia entera. */
  dep?: Partial<DependenciasMarcas>;
};

function armar(extra: Opciones = {}): Espia {
  const llamadas = { plan: 0, asociaciones: 0, catalogo: 0, reservar: 0, off: 0 };
  const registros: Record<string, unknown>[] = [];
  let cupo = 100;
  const dep: DependenciasMarcas = {
    async verificarUsuario() {
      return { id: 'u1' };
    },
    async plan() {
      llamadas.plan += 1;
      return extra.planDe ?? 'premium';
    },
    async asociaciones() {
      llamadas.asociaciones += 1;
      return extra.filas ?? [];
    },
    catalogo: () => async () => {
      llamadas.catalogo += 1;
      return extra.filasCatalogo ?? [];
    },
    async reservarBusquedas(_t, n) {
      llamadas.reservar += 1;
      if (cupo <= 0) return { concedidas: 0, esperaS: 30 };
      cupo -= n;
      return { concedidas: n, esperaS: 0 };
    },
    buscarOff: async () => {
      llamadas.off += 1;
      return { tipo: 'resultados', candidatos: extra.hits ?? [] };
    },
    cache: new CacheTtl<CandidatoOff[]>(50),
    log: (e) => registros.push(e),
    ...extra.dep,
  };
  return { dep, llamadas, registros };
}

function peticion(cuerpo: unknown, opciones: { metodo?: string; auth?: string | null; crudo?: string } = {}): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const auth = opciones.auth === undefined ? `Bearer ${TOKEN}` : opciones.auth;
  if (auth !== null) headers.authorization = auth;
  const metodo = opciones.metodo ?? 'POST';
  return new Request('http://localhost/opsi-marcas', {
    method: metodo,
    headers,
    body: metodo === 'GET' ? undefined : (opciones.crudo ?? JSON.stringify(cuerpo)),
  });
}

const LINEAS = [{ id: 'a', texto: 'LECHE ENT 1L', nombre: 'leche entera 1 l' }];
const BUENA = { nevera: NEVERA, tienda: 'MERCADONA, S.A.', lineas: LINEAS };

// ── Las puertas ───────────────────────────────────────────────────────────

test('solo POST', async () => {
  const { dep } = armar();
  assert.equal((await manejarMarcas(peticion(null, { metodo: 'GET' }), dep)).status, 405);
});

test('sin sesión no se hace nada: ni plan, ni base de datos, ni OFF', async () => {
  const { dep, llamadas } = armar();
  assert.equal((await manejarMarcas(peticion(BUENA, { auth: null }), dep)).status, 401);
  assert.equal((await manejarMarcas(peticion(BUENA, { auth: 'Bearer corto' }), dep)).status, 401);
  const sinSesion = { ...dep, verificarUsuario: async () => null };
  assert.equal((await manejarMarcas(peticion(BUENA), sinSesion)).status, 401);
  assert.deepEqual(llamadas, { plan: 0, asociaciones: 0, catalogo: 0, reservar: 0, off: 0 });
});

test('si no se puede comprobar la sesión, 503', async () => {
  const { dep } = armar({
    dep: {
      verificarUsuario: async () => {
        throw new Error('auth caído');
      },
    },
  });
  assert.equal((await manejarMarcas(peticion(BUENA), dep)).status, 503);
});

test('un cuerpo enorme o roto se rechaza antes de tocar nada', async () => {
  const { dep, llamadas } = armar();
  assert.equal((await manejarMarcas(peticion(null, { crudo: 'x'.repeat(20 * 1024) }), dep)).status, 413);
  assert.equal((await manejarMarcas(peticion(null, { crudo: '{no es json' }), dep)).status, 400);
  assert.equal(llamadas.plan, 0);
});

test('la fuente de un candidato es el historial solo si es una prueba, no una pista de otra tienda', async () => {
  const fila = (tienda: string): FilaAsociacion => ({
    line_key: claveDeLinea('LECHE ENT 1L'), store_key: tienda, product_id: null, name: 'Leche entera', brand: 'Pascual',
    barcode: FILA_OFF_EAN, unit_family: 'volume', net_quantity: 1000, confirmations: 1,
  });
  const lineas = [{ id: 'a', texto: 'LECHE ENT 1L', nombre: 'leche entera 1 l' }];
  const fuenteDe = async (tienda: string) => {
    const { dep } = armar({ filas: [fila(tienda)], hits: [FILA_OFF] });
    const r = await manejarMarcas(peticion({ nevera: NEVERA, tienda: 'MERCADONA', lineas }), dep);
    return ((await r.json()) as { lineas: { candidatos: { fuente: string }[] }[] }).lineas[0]!.candidatos[0]!.fuente;
  };
  assert.equal(await fuenteDe('mercadona'), 'historial');
  assert.notEqual(await fuenteDe('lidl'), 'historial');
});

test('lo básico: 403 sin gastar ni consultar nada', async () => {
  const { dep, llamadas } = armar({ planDe: 'basic' });
  const r = await manejarMarcas(peticion(BUENA), dep);
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: 'solo_premium' });
  assert.deepEqual(llamadas, { plan: 1, asociaciones: 0, catalogo: 0, reservar: 0, off: 0 });
});

test('si no se puede comprobar el plan, 503 y no se sigue', async () => {
  const { dep, llamadas } = armar({
    dep: {
      async plan() {
        throw new Error('db caída');
      },
    },
  });
  assert.equal((await manejarMarcas(peticion(BUENA), dep)).status, 503);
  assert.equal(llamadas.asociaciones, 0);
});

// ── La petición ───────────────────────────────────────────────────────────

test('la petición válida se limpia; la que no, se explica', () => {
  const ok = validarPeticion({
    nevera: NEVERA,
    tienda: ' Mercadona​ ',
    lineas: [{ id: 'l1', texto: ' LECHE‮ ENT ', nombre: 'leche entera' }, { id: 'l2', texto: '', nombre: 'pan' }],
  });
  assert.ok(!('motivo' in ok));
  if ('motivo' in ok) return;
  assert.equal(ok.tienda, 'Mercadona');
  assert.deepEqual(ok.lineas.map((l) => l.texto), ['LECHE ENT', 'pan']);

  const malas: [unknown, string][] = [
    [null, 'el cuerpo no es un objeto'],
    [{ lineas: LINEAS }, 'falta la nevera'],
    [{ nevera: 'no', lineas: LINEAS }, 'falta la nevera'],
    [{ nevera: NEVERA }, 'faltan las líneas'],
    [{ nevera: NEVERA, lineas: [] }, 'faltan las líneas'],
    [{ nevera: NEVERA, lineas: Array.from({ length: 17 }, (_, i) => ({ id: `l${i}`, texto: 'x', nombre: 'x' })) }, 'demasiadas líneas'],
    [{ nevera: NEVERA, lineas: ['x'] }, 'una línea no es un objeto'],
    [{ nevera: NEVERA, lineas: [{ id: 'con espacio', nombre: 'x' }] }, 'id de línea no válido'],
    [{ nevera: NEVERA, lineas: [{ id: 'a', nombre: 'x' }, { id: 'a', nombre: 'y' }] }, 'id de línea repetido'],
    [{ nevera: NEVERA, lineas: [{ id: 'a', nombre: '' }] }, 'una línea sin nombre'],
    [{ nevera: NEVERA, lineas: [{ id: 'a', nombre: 3 }] }, 'una línea sin nombre'],
  ];
  for (const [cuerpo, motivo] of malas) assert.deepEqual(validarPeticion(cuerpo), { motivo }, motivo);
});

test('una petición mala es 400 y no gasta nada', async () => {
  const { dep, llamadas } = armar();
  assert.equal((await manejarMarcas(peticion({ nevera: NEVERA, lineas: [] }), dep)).status, 400);
  assert.equal(llamadas.plan, 0);
});

// ── La respuesta ──────────────────────────────────────────────────────────

const FILA_OFF_EAN = ean13('841012801009');
const FILA_OFF: CandidatoOff = {
  code: FILA_OFF_EAN,
  name: 'Leche entera',
  brand: 'Pascual',
  cantidad: { unitFamily: 'volume', netQuantity: 1000 },
  categoriesTags: ['en:milks'],
  stores: ['Mercadona'],
  imageUrl: null,
};

test('camino feliz: la tienda se reconoce, la línea se resuelve con la fuente anotada y lo interno no sale', async () => {
  const { dep, llamadas } = armar({ hits: [FILA_OFF] });
  const r = await manejarMarcas(peticion(BUENA), dep);
  assert.equal(r.status, 200);
  const cuerpo = (await r.json()) as { tienda: { clave: string }; lineas: Record<string, unknown>[] };
  assert.equal(cuerpo.tienda.clave, 'mercadona');
  const [l] = cuerpo.lineas;
  assert.equal(l.id, 'a');
  assert.equal(l.clave, 'leche ent 1l');
  assert.equal(l.tiendaClave, 'mercadona');
  // «leche entera» + tamaño + categoría sin marca escrita llega a 70: se propone y se pide confirmarla.
  const candidatos = l.candidatos as Record<string, unknown>[];
  assert.equal(candidatos[0].marca, 'Pascual');
  assert.equal(candidatos[0].fuente, 'off');
  assert.equal(candidatos[0].ean, FILA_OFF.code);
  assert.ok(!('origenes' in candidatos[0]) && !('categorias' in candidatos[0]) && !('tiendas' in candidatos[0]));
  assert.ok(llamadas.off >= 1);
  assert.equal(llamadas.asociaciones, 1);
});

test('el historial se pide UNA vez para toda la tanda, con las claves sin repetir', async () => {
  let pedidas: string[] = [];
  const { dep } = armar({
    dep: {
      async asociaciones(_t, claves) {
        pedidas = claves;
        return [];
      },
    },
  });
  const lineas = [
    { id: 'a', texto: 'LECHE ENT 1L', nombre: 'leche entera' },
    { id: 'b', texto: 'leche  ent 1l', nombre: 'leche entera' },
    { id: 'c', texto: 'PAN', nombre: 'pan' },
  ];
  await manejarMarcas(peticion({ nevera: NEVERA, tienda: null, lineas }), dep);
  assert.deepEqual(pedidas.sort(), [claveDeLinea('PAN'), claveDeLinea('LECHE ENT 1L')].sort());
});

test('una asociación confirmada resuelve sin llamar a OFF ni gastar cupo', async () => {
  const fila: FilaAsociacion = {
    line_key: claveDeLinea('LECHE ENT 1L'),
    store_key: 'mercadona',
    product_id: null,
    name: 'Leche entera',
    brand: 'Pascual',
    barcode: null,
    unit_family: 'volume',
    net_quantity: 1000,
    confirmations: 3,
  };
  const { dep, llamadas } = armar({ filas: [fila] });
  const r = await manejarMarcas(peticion(BUENA), dep);
  const cuerpo = (await r.json()) as { lineas: Record<string, unknown>[] };
  assert.equal(cuerpo.lineas[0].estado, 'resuelta');
  assert.equal(cuerpo.lineas[0].estadoMarca, 'confirmada');
  assert.equal(llamadas.off, 0);
  assert.equal(llamadas.reservar, 0);
});

test('los subtotales y descuentos salen clasificados, no como productos', async () => {
  const { dep, llamadas } = armar();
  const lineas = [
    { id: 'a', texto: 'SUBTOTAL 23,45', nombre: 'subtotal' },
    { id: 'b', texto: 'DTO 2ª UNIDAD -0,45', nombre: 'descuento' },
  ];
  const r = await manejarMarcas(peticion({ nevera: NEVERA, tienda: null, lineas }), dep);
  const cuerpo = (await r.json()) as { lineas: Record<string, unknown>[] };
  assert.deepEqual(cuerpo.lineas.map((l) => l.estado), ['no_producto', 'no_producto']);
  assert.equal(llamadas.off, 0);
});

// ── Tolerancia a fallos ───────────────────────────────────────────────────

test('si el historial falla, la importación sigue con lo demás y se dice', async () => {
  const { dep } = armar({
    hits: [FILA_OFF],
    dep: {
      async asociaciones() {
        throw new Error('db');
      },
    },
  });
  const r = await manejarMarcas(peticion(BUENA), dep);
  assert.equal(r.status, 200);
  const cuerpo = (await r.json()) as { lineas: { fuentes: { id: string; estado: string; motivo?: string }[] }[] };
  assert.deepEqual(cuerpo.lineas[0].fuentes[0], { id: 'historial', estado: 'error', motivo: 'historial_no_disponible' });
});

test('si el catálogo falla, igual', async () => {
  const { dep } = armar({
    hits: [FILA_OFF],
    dep: {
      catalogo: () => async () => {
        throw new Error('db');
      },
    },
  });
  const r = await manejarMarcas(peticion(BUENA), dep);
  assert.equal(r.status, 200);
  const cuerpo = (await r.json()) as { lineas: { fuentes: { id: string; estado: string }[] }[] };
  assert.equal(cuerpo.lineas[0].fuentes.find((f) => f.id === 'catalogo')?.estado, 'error');
});

test('sin identidad ante OFF no se le llama, no se gasta cupo y se dice', async () => {
  const { dep, llamadas } = armar({ dep: { buscarOff: null } });
  const r = await manejarMarcas(peticion(BUENA), dep);
  assert.equal(r.status, 200);
  const cuerpo = (await r.json()) as { lineas: { estado: string; fuentes: { id: string; estado: string; motivo?: string }[] }[] };
  assert.equal(cuerpo.lineas[0].estado, 'sin_candidatos');
  assert.deepEqual(cuerpo.lineas[0].fuentes.find((f) => f.id === 'off'), { id: 'off', estado: 'error', motivo: 'sin_configurar' });
  assert.equal(llamadas.reservar, 0);
});

test('OFF caído: 200 con la línea sin candidatos y el error anotado', async () => {
  const { dep } = armar({ dep: { buscarOff: async () => ({ tipo: 'error', motivo: 'tiempo_agotado' }) } });
  const r = await manejarMarcas(peticion(BUENA), dep);
  assert.equal(r.status, 200);
  const cuerpo = (await r.json()) as { lineas: { estado: string; reintentable: boolean; fuentes: { id: string; estado: string; motivo?: string }[] }[] };
  assert.equal(cuerpo.lineas[0].estado, 'sin_candidatos');
  assert.deepEqual(cuerpo.lineas[0].fuentes.find((f) => f.id === 'off'), { id: 'off', estado: 'error', motivo: 'tiempo_agotado' });
});

test('sin cupo: las líneas quedan marcadas para reintentar, sin error', async () => {
  const { dep } = armar({
    dep: {
      async reservarBusquedas() {
        return { concedidas: 0, esperaS: 45 };
      },
    },
  });
  const lineas = [
    { id: 'a', texto: 'ARROZ REDONDO', nombre: 'arroz redondo' },
    { id: 'b', texto: 'LENTEJAS PARDINAS', nombre: 'lentejas pardinas' },
  ];
  const r = await manejarMarcas(peticion({ nevera: NEVERA, tienda: null, lineas }), dep);
  assert.equal(r.status, 200);
  const cuerpo = (await r.json()) as { lineas: { reintentable: boolean }[] };
  assert.deepEqual(cuerpo.lineas.map((l) => l.reintentable), [true, true]);
});

// ── Privacidad ────────────────────────────────────────────────────────────

test('el registro cuenta líneas y fuentes, pero no lo que compra la persona', async () => {
  const { dep, registros } = armar({ hits: [FILA_OFF] });
  await manejarMarcas(peticion({ nevera: NEVERA, tienda: 'Mercadona', lineas: [{ id: 'a', texto: 'CONDONES DUREX 12 UDS', nombre: 'preservativos durex' }] }), dep);
  const volcado = JSON.stringify(registros);
  assert.ok(registros.length > 0);
  assert.ok(!/durex|condones|preservativos|mercadona/i.test(volcado), volcado);
  assert.equal(registros.at(-1)?.ok, true);
});

test('a Open Food Facts solo llegan las palabras del producto: ni la tienda, ni la nevera, ni el precio', async () => {
  const vistas: unknown[] = [];
  const { dep } = armar({
    dep: {
      buscarOff: async (c) => {
        vistas.push(c);
        return { tipo: 'resultados', candidatos: [] };
      },
    },
  });
  await manejarMarcas(peticion({ nevera: NEVERA, tienda: 'MERCADONA', lineas: [{ id: 'a', texto: 'YOGUR NAT 4X125G 1,99', nombre: 'yogur natural 4x125 g' }] }), dep);
  const texto = JSON.stringify(vistas);
  assert.ok(vistas.length >= 1);
  assert.ok(!/mercadona|1,99|1\.99|11111111/i.test(texto), texto);
});

test('la función no escribe nada: ni clave de servicio, ni tablas, y solo llama a cuatro funciones de la base de datos', () => {
  const logica = readFileSync(new URL('./marcas.ts', import.meta.url), 'utf8') + readFileSync(new URL('./fuentes-marcas.ts', import.meta.url), 'utf8');
  assert.ok(!/\.from\(|\.insert\(|\.upsert\(/.test(logica), 'la lógica no toca tablas');
  assert.ok(!/service_role|SERVICE_ROLE/i.test(logica));

  const index = readFileSync(new URL('../opsi-marcas/index.ts', import.meta.url), 'utf8');
  // Se quitan los comentarios: ahí se explica, justo, que NO se usa la clave de servicio.
  const codigo = index.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/SERVICE_ROLE|service_role/i.test(codigo), 'la función no usa la clave de servicio');
  assert.ok(!/\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(/.test(codigo), 'ni toca tablas');
  const llamadas = [...codigo.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(llamadas, ['consume_off_search', 'my_plan', 'search_catalog', 'ticket_associations_for']);
});
