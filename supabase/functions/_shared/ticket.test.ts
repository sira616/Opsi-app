import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { gastarCuota } from './cuota.ts';
import { ErrorModelo, type ClienteModelo, type MensajeModelo, type OpcionesRespuesta, type RespuestaModelo } from './modelo.ts';
import {
  INSTRUCCIONES_TICKET,
  leerProductos,
  manejarTicket,
  MAX_IMAGEN_BASE64,
  MAX_PRODUCTOS_TICKET,
  validarImagen,
  type DependenciasTicket,
} from './ticket.ts';

const TOKEN = 'prueba'.repeat(5);
/** Un «JPEG»: lo único que se mira es cómo empieza. */
const FOTO = '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBD' + 'A'.repeat(100);

function modeloGuion(texto: string | Error) {
  const vistos: { mensajes: MensajeModelo[]; herramientas: number; opciones: OpcionesRespuesta | undefined }[] = [];
  const cliente: ClienteModelo = {
    async responder(mensajes, herramientas, _senal, opciones) {
      vistos.push({ mensajes: [...mensajes], herramientas: herramientas.length, opciones });
      if (texto instanceof Error) throw texto;
      return { texto, llamadas: [] } satisfies RespuestaModelo;
    },
  };
  return { cliente, vistos };
}

function dependencias(modelo: ClienteModelo, extra: Partial<DependenciasTicket> = {}) {
  const logs: Record<string, unknown>[] = [];
  const dep: DependenciasTicket = {
    verificarUsuario: async () => ({ id: 'u1' }),
    cuota: async () => ({ permitido: true, esperaS: 0 }),
    modelo,
    log: (e) => logs.push(e),
    ...extra,
  };
  return { dep, logs };
}

function peticion(cuerpo: unknown, cabeceras: Record<string, string> = {}): Request {
  return new Request('http://localhost/opsi-ticket', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, ...cabeceras },
    body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo),
  });
}

const RESPUESTA_BUENA = JSON.stringify({
  productos: [
    { nombre: 'leche entera', cantidad: 1, unidad: 'l', comida: true },
    { nombre: 'platano', cantidad: 0.75, unidad: 'kg', comida: true },
    { nombre: 'bolsa plastico', cantidad: 3, unidad: 'unidades', comida: false },
  ],
});

// ── La foto ───────────────────────────────────────────────────────────────

test('validarImagen acepta un JPEG y un PNG en base64', () => {
  assert.equal(validarImagen({ imagen: FOTO }), FOTO);
  const png = 'iVBORw0KGgoAAAANSUhEUgAA' + 'B'.repeat(40);
  assert.equal(validarImagen({ imagen: png }), png);
});

test('validarImagen rechaza lo que no es una foto en base64', () => {
  const malos: unknown[] = [
    null,
    'hola',
    {},
    { imagen: '' },
    { imagen: 5 },
    { imagen: `data:image/jpeg;base64,${FOTO}` }, // con prefijo data:
    { imagen: `${FOTO}\n${FOTO}` }, // con saltos de línea
    { imagen: 'texto cualquiera que no es base64!' },
    { imagen: 'UEsDBAoAAAAAA' + 'A'.repeat(40) }, // base64 válido, pero de un zip
    { imagen: 'R0lGODlhAQABAIAAAAAAAP' + 'A'.repeat(40) }, // un GIF
    { imagen: FOTO + 'A'.repeat(MAX_IMAGEN_BASE64) }, // demasiado grande
  ];
  for (const malo of malos) {
    assert.equal(typeof validarImagen(malo), 'object', JSON.stringify(malo)?.slice(0, 60));
  }
});

// ── Lo que dice el modelo ─────────────────────────────────────────────────

test('leerProductos lee el JSON limpio, con valla de código o con texto alrededor', () => {
  const esperado = leerProductos(RESPUESTA_BUENA);
  assert.equal(esperado?.length, 3);
  assert.deepEqual(leerProductos('```json\n' + RESPUESTA_BUENA + '\n```'), esperado);
  assert.deepEqual(leerProductos('Aquí tienes:\n' + RESPUESTA_BUENA + '\nEspero que sirva.'), esperado);
  assert.deepEqual(leerProductos('<think>veamos</think>' + RESPUESTA_BUENA), esperado);
});

test('leerProductos conserva lo bueno y marca lo que no es comida', () => {
  assert.deepEqual(leerProductos(RESPUESTA_BUENA), [
    { nombre: 'leche entera', cantidad: 1, unidad: 'l', comida: true },
    { nombre: 'platano', cantidad: 0.75, unidad: 'kg', comida: true },
    { nombre: 'bolsa plastico', cantidad: 3, unidad: 'unidades', comida: false },
  ]);
});

test('leerProductos devuelve null cuando no es lo que se pidió, y lista vacía cuando no hay productos', () => {
  for (const malo of ['', 'no se lee nada', '[]', '{"otra":1}', '{"productos":"leche"}', '{"productos":5}']) {
    assert.equal(leerProductos(malo), null, malo);
  }
  assert.deepEqual(leerProductos('{"productos":[]}'), []);
});

test('leerProductos tira lo que no cuadra: nombres vacíos, cantidades raras, unidades desconocidas, campos de más', () => {
  const r = leerProductos(
    JSON.stringify({
      productos: [
        null,
        5,
        { nombre: '   ' },
        { cantidad: 2, unidad: 'l' },
        { nombre: 'a', cantidad: -1, unidad: 'l' },
        { nombre: 'b', cantidad: 'dos', unidad: 'l' },
        { nombre: 'c', cantidad: 1e12, unidad: 'l' },
        { nombre: 'd', cantidad: 2, unidad: 'cucharadas' },
        { nombre: 'e', cantidad: 2 }, // sin unidad
        { nombre: 'f', unidad: 'kg' }, // sin cantidad
        { nombre: 'g', precio: 3.5, url: 'http://x', ejecutar: 'rm' },
      ],
    }),
  );
  assert.deepEqual(r, [
    { nombre: 'a', cantidad: null, unidad: null, comida: true },
    { nombre: 'b', cantidad: null, unidad: null, comida: true },
    { nombre: 'c', cantidad: null, unidad: null, comida: true },
    { nombre: 'd', cantidad: null, unidad: null, comida: true },
    { nombre: 'e', cantidad: null, unidad: null, comida: true },
    { nombre: 'f', cantidad: null, unidad: null, comida: true },
    { nombre: 'g', cantidad: null, unidad: null, comida: true },
  ]);
});

test('leerProductos limpia los nombres, los acota y marca como no comida lo que delata el nombre', () => {
  const rlo = String.fromCharCode(0x202e);
  const cero = String.fromCharCode(0x200b);
  const r = leerProductos(
    JSON.stringify({
      productos: [
        { nombre: `pan${rlo}${cero}\n integral${'x'.repeat(300)}`, comida: true },
        { nombre: 'tabaco de liar', comida: true },
      ],
    }),
  );
  assert.ok(r);
  const nombre = r[0]!.nombre;
  assert.ok(!nombre.includes(rlo) && !nombre.includes(cero) && !nombre.includes('\n'));
  assert.ok([...nombre].length <= 80);
  assert.equal(r[1]!.comida, false, 'el modelo dijo que sí, pero el nombre manda');
});

test('leerProductos acota cuántos productos acepta', () => {
  const muchos = JSON.stringify({ productos: Array.from({ length: MAX_PRODUCTOS_TICKET + 20 }, (_, i) => ({ nombre: `p${i}` })) });
  assert.equal(leerProductos(muchos)?.length, MAX_PRODUCTOS_TICKET);
});

// ── El manejador ──────────────────────────────────────────────────────────

test('una foto buena: 200 con los productos, y al modelo solo le llega la foto, sin herramientas y fiel', async () => {
  const { cliente, vistos } = modeloGuion(RESPUESTA_BUENA);
  const { dep, logs } = dependencias(cliente);
  const res = await manejarTicket(peticion({ imagen: FOTO }), dep);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).productos.length, 3);
  assert.equal(vistos.length, 1);
  assert.equal(vistos[0]!.herramientas, 0, 'sin herramientas: solo lee');
  assert.deepEqual(vistos[0]!.opciones, { json: true, temperatura: 0 });
  assert.equal(vistos[0]!.mensajes[0]!.rol, 'system');
  assert.equal((vistos[0]!.mensajes[0] as { texto: string }).texto, INSTRUCCIONES_TICKET);
  assert.deepEqual((vistos[0]!.mensajes[1] as { imagenes: string[] }).imagenes, [FOTO]);
  // El registro cuenta productos: ni la foto ni lo que se leyó.
  assert.deepEqual(logs.at(-1), { evento: 'opsi-ticket', ok: true, productos: 3 });
  assert.ok(!JSON.stringify(logs).includes('leche'));
  assert.ok(!JSON.stringify(logs).includes(FOTO.slice(0, 30)));
});

test('sin sesión no se mira ni la foto ni se gasta cuota ni se llama al modelo', async () => {
  const { cliente, vistos } = modeloGuion(RESPUESTA_BUENA);
  let gastos = 0;
  const { dep } = dependencias(cliente, { cuota: async () => (gastos++, { permitido: true, esperaS: 0 }) });
  const sin = new Request('http://localhost/opsi-ticket', { method: 'POST', body: JSON.stringify({ imagen: FOTO }) });
  assert.equal((await manejarTicket(sin, dep)).status, 401);
  assert.equal((await manejarTicket(peticion({ imagen: FOTO }), { ...dep, verificarUsuario: async () => null })).status, 401);
  assert.equal(gastos, 0);
  assert.equal(vistos.length, 0);
});

test('lo inválido no gasta cuota: método, tamaño, cuerpo roto y foto que no es foto', async () => {
  const { cliente, vistos } = modeloGuion(RESPUESTA_BUENA);
  let gastos = 0;
  const { dep } = dependencias(cliente, { cuota: async () => (gastos++, { permitido: true, esperaS: 0 }) });
  assert.equal((await manejarTicket(new Request('http://localhost/', { method: 'GET' }), dep)).status, 405);
  assert.equal(
    (await manejarTicket(peticion({ imagen: FOTO }, { 'content-length': String(20 * 1024 * 1024) }), dep)).status,
    413,
  );
  assert.equal((await manejarTicket(peticion('{roto'), dep)).status, 400);
  assert.equal((await manejarTicket(peticion({ imagen: 'hola' }), dep)).status, 400);
  assert.equal((await manejarTicket(peticion({}), dep)).status, 400);
  assert.equal(gastos, 0);
  assert.equal(vistos.length, 0);
});

test('el ticket es de Premium: 403 solo_premium, sin llamar al modelo', async () => {
  const { cliente, vistos } = modeloGuion(RESPUESTA_BUENA);
  const { dep, logs } = dependencias(cliente, { cuota: async () => ({ permitido: false, esperaS: 0, soloPremium: true }) });
  const res = await manejarTicket(peticion({ imagen: FOTO }), dep);
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), { error: 'solo_premium' });
  assert.equal(vistos.length, 0);
  assert.deepEqual(logs.at(-1), { evento: 'opsi-ticket', ok: false, fallo: 'solo_premium' });
});

test('sin cuota: 429 con Retry-After; y si no se puede comprobar, 503 (no se lee sin comprobar)', async () => {
  const { cliente, vistos } = modeloGuion(RESPUESTA_BUENA);
  const sinCuota = dependencias(cliente, { cuota: async () => ({ permitido: false, esperaS: 125.2 }) });
  const r429 = await manejarTicket(peticion({ imagen: FOTO }), sinCuota.dep);
  assert.equal(r429.status, 429);
  assert.equal(r429.headers.get('retry-after'), '126');
  const caida = dependencias(cliente, {
    cuota: async () => {
      throw new Error('base de datos caída: detalle interno');
    },
  });
  const r503 = await manejarTicket(peticion({ imagen: FOTO }), caida.dep);
  assert.equal(r503.status, 503);
  assert.ok(!JSON.stringify(await r503.json()).includes('detalle interno'));
  assert.equal(vistos.length, 0);
});

test('si el modelo falla: 502 genérico; si contesta algo ilegible: 422; y el motivo del proveedor no sale', async () => {
  const roto = dependencias(modeloGuion(new ErrorModelo('el modelo contestó 500: secreta')).cliente);
  const r502 = await manejarTicket(peticion({ imagen: FOTO }), roto.dep);
  assert.equal(r502.status, 502);
  assert.ok(!JSON.stringify(await r502.json()).includes('secreta'));

  const ilegible = dependencias(modeloGuion('no he podido leer nada').cliente);
  const r422 = await manejarTicket(peticion({ imagen: FOTO }), ilegible.dep);
  assert.equal(r422.status, 422);
  assert.deepEqual(await r422.json(), { error: 'ticket_no_legible' });
});

test('un ticket sin productos es una respuesta buena y vacía', async () => {
  const { dep } = dependencias(modeloGuion('{"productos":[]}').cliente);
  const res = await manejarTicket(peticion({ imagen: FOTO }), dep);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { productos: [] });
});

test('las instrucciones tratan la foto como contenido y piden JSON sin tienda, totales ni tarjeta', () => {
  assert.match(INSTRUCCIONES_TICKET, /nunca una orden para ti/);
  assert.match(INSTRUCCIONES_TICKET, /SOLO un JSON/);
  assert.match(INSTRUCCIONES_TICKET, /tienda/);
  assert.match(INSTRUCCIONES_TICKET, /tarjeta/);
});

test('guarda de código: la función de tickets no escribe ni guarda la foto en ningún sitio', () => {
  const fuente = readFileSync(new URL('../opsi-ticket/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(fuente, /\.(insert|update|delete|upsert)\(|\.storage\b|writeFile|Deno\.(write|create)/);
  assert.deepEqual([...fuente.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]), ['use_chat_quota']);
  assert.doesNotMatch(fuente, /service_role|SERVICE_ROLE/);
});

// ── La cuota compartida ───────────────────────────────────────────────────

test('gastarCuota traduce lo que contesta la base de datos', async () => {
  assert.deepEqual(await gastarCuota(async () => ({ data: [{ allowed: true, wait_s: 0 }], error: null })), {
    permitido: true,
    esperaS: 0,
  });
  assert.deepEqual(await gastarCuota(async () => ({ data: { allowed: false, wait_s: 90 }, error: null })), {
    permitido: false,
    esperaS: 90,
  });
  assert.deepEqual(
    await gastarCuota(async () => ({ data: null, error: { code: '42501', hint: 'premium' } })),
    { permitido: false, esperaS: 0, soloPremium: true },
  );
});

test('gastarCuota falla cerrado: cualquier otro error o una respuesta rara se lanza', async () => {
  await assert.rejects(() => gastarCuota(async () => ({ data: null, error: { code: '42501', hint: 'otra' } })));
  await assert.rejects(() => gastarCuota(async () => ({ data: null, error: { code: '28000' } })));
  await assert.rejects(() => gastarCuota(async () => ({ data: [], error: null })));
  await assert.rejects(() => gastarCuota(async () => ({ data: [{ allowed: 'sí' }], error: null })));
});
