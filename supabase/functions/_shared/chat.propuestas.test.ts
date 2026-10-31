import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { INSTRUCCIONES, manejar, MAX_PROPUESTAS, type DependenciasChat } from './chat.ts';
import { HERRAMIENTAS, type AccesoDatos, type FilaElemento, type Propuesta } from './herramientas.ts';
import type { ClienteModelo, MensajeModelo, RespuestaModelo } from './modelo.ts';
import { MAX_LONGITUD_DATO } from './saneo.ts';
import { FUERA_DE_TEMA, INSTRUCCIONES_TEMA } from './tema.ts';

/**
 * Las herramientas de PROPUESTA del chat: el modelo propone, la persona confirma en la app.
 *
 * Lo que se prueba aquí es lo que NO puede pasar: que el modelo escriba algo, que se cuele una
 * cantidad o un id que no vale, que el nombre de un elemento lo ponga el modelo en vez de la base
 * de datos, o que la respuesta lleve más tarjetas de las que una persona puede confirmar.
 */

const TOKEN = 'prueba'.repeat(5);
const ID_HUEVOS = '11111111-1111-4111-8111-111111111111';
const ID_LECHE = '22222222-2222-4222-8222-222222222222';
const FILAS: FilaElemento[] = [
  { id: ID_HUEVOS, name: 'Huevos', unit_family: 'count' },
  { id: ID_LECHE, name: 'Leche entera', unit_family: 'volume' },
];

function datosFalsos(): AccesoDatos {
  return {
    async elementos(ids) {
      return FILAS.filter((f) => ids.includes(f.id));
    },
    async inventario() {
      return [];
    },
    async listaCompra() {
      return [];
    },
  };
}

/** Un modelo de mentira. La puerta del tema se contesta sola con lo que diga `tema`. */
function modeloGuion(respuestas: RespuestaModelo[], tema = 'SI') {
  const vistos: MensajeModelo[][] = [];
  const cliente: ClienteModelo = {
    async responder(mensajes) {
      if (mensajes[0]?.rol === 'system' && mensajes[0].texto === INSTRUCCIONES_TEMA) {
        return { texto: tema, llamadas: [] };
      }
      vistos.push([...mensajes]);
      const r = respuestas.shift();
      if (!r) throw new Error('sin guion');
      return r;
    },
  };
  return { cliente, vistos };
}

function dependencias(modelo: ClienteModelo): DependenciasChat {
  const datos = datosFalsos();
  return {
    verificarUsuario: async () => ({ id: 'u1' }),
    datosDe: () => datos,
    cuota: async () => ({ permitido: true, esperaS: 0 }),
    modelo,
    log: () => {},
  };
}

function peticion(texto: string): Request {
  return new Request('http://localhost/opsi-chat', {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ mensajes: [{ de: 'persona', texto }] }),
  });
}

function llamar(nombre: string, argumentos: unknown): RespuestaModelo {
  return { texto: '', llamadas: [{ nombre, argumentos }] };
}

function herramienta(nombre: string) {
  const h = HERRAMIENTAS.find((x) => x.descripcion.nombre === nombre);
  assert.ok(h, nombre);
  return h;
}

function contexto() {
  const propuestas: Propuesta[] = [];
  return { propuestas, ctx: { proponer: (p: Propuesta) => void propuestas.push(p) } };
}

test('proponer_guardar deja una propuesta en la respuesta y le dice al modelo que NO se ha hecho nada', async () => {
  const { cliente, vistos } = modeloGuion([
    llamar('proponer_guardar', { productos: [{ nombre: ' Leche entera ', cantidad: 2, unidad: 'l' }, { nombre: 'pan' }] }),
    { texto: '¿Guardo 2 l de leche y un pan?', llamadas: [] },
  ]);
  const res = await manejar(peticion('He comprado leche y pan'), dependencias(cliente));
  assert.equal(res.status, 200);
  const cuerpo = await res.json();
  assert.equal(cuerpo.respuesta, '¿Guardo 2 l de leche y un pan?');
  assert.deepEqual(cuerpo.propuestas, [
    {
      tipo: 'guardar',
      productos: [
        { nombre: 'Leche entera', cantidad: 2, unidad: 'l' },
        { nombre: 'pan', cantidad: null, unidad: null },
      ],
    },
  ]);
  const aviso = (vistos[1]?.at(-1) as { texto: string }).texto;
  assert.match(aviso, /Todavía NO se ha hecho nada/);
  assert.match(aviso, /confirmarla/);
});

test('sin propuestas la respuesta no lleva el campo', async () => {
  const { cliente } = modeloGuion([{ texto: 'Una tortilla.', llamadas: [] }]);
  const cuerpo = await (await manejar(peticion('¿Qué ceno?'), dependencias(cliente))).json();
  assert.deepEqual(cuerpo, { respuesta: 'Una tortilla.' });
});

test('una pregunta de fuera de tema no deja propuestas aunque el modelo las quisiera', async () => {
  const { cliente } = modeloGuion([llamar('proponer_apuntar', { productos: [{ nombre: 'x' }] })], 'NO');
  const cuerpo = await (await manejar(peticion('¿Quién fue Napoleón?'), dependencias(cliente))).json();
  assert.deepEqual(cuerpo, { respuesta: FUERA_DE_TEMA });
});

test('proponer_apuntar valida lo que escribe el modelo: unidad con cantidad, números, listas', async () => {
  const h = herramienta('proponer_apuntar');
  const { propuestas, ctx } = contexto();
  const mal: unknown[] = [
    {},
    { productos: [] },
    { productos: 'leche' },
    { productos: [{}] },
    { productos: [{ nombre: '   ' }] },
    { productos: [{ nombre: 'leche', cantidad: 2 }] }, // cantidad sin unidad
    { productos: [{ nombre: 'leche', cantidad: -1, unidad: 'l' }] },
    { productos: [{ nombre: 'leche', cantidad: 'dos', unidad: 'l' }] },
    { productos: [{ nombre: 'leche', cantidad: 2, unidad: 'cucharadas' }] },
    { productos: [{ nombre: 'leche', cantidad: 1e12, unidad: 'l' }] },
    { productos: Array.from({ length: 13 }, (_, i) => ({ nombre: `p${i}` })) },
  ];
  for (const argumentos of mal) {
    await assert.rejects(() => h.ejecutar(argumentos, datosFalsos(), ctx), undefined, JSON.stringify(argumentos).slice(0, 60));
  }
  assert.deepEqual(propuestas, [], 'nada de eso llegó a ser propuesta');
});

test('los nombres que escribe el modelo salen limpios y acotados', async () => {
  const h = herramienta('proponer_apuntar');
  const { propuestas, ctx } = contexto();
  const rlo = String.fromCharCode(0x202e);
  const cero = String.fromCharCode(0x200b);
  await h.ejecutar({ productos: [{ nombre: `pan${rlo}${cero} integral${'x'.repeat(200)}` }] }, datosFalsos(), ctx);
  const nombre = (propuestas[0] as { productos: { nombre: string }[] }).productos[0]!.nombre;
  assert.ok(!nombre.includes(rlo) && !nombre.includes(cero));
  assert.ok([...nombre].length <= MAX_LONGITUD_DATO);
});

test('proponer_guardar no acepta lo que no es comida', async () => {
  const h = herramienta('proponer_guardar');
  const { propuestas, ctx } = contexto();
  await assert.rejects(() => h.ejecutar({ productos: [{ nombre: 'tabaco de liar' }] }, datosFalsos(), ctx), /no es comida/);
  assert.deepEqual(propuestas, []);
});

test('proponer_gastar: los elementos salen de la base de datos, no de lo que diga el modelo', async () => {
  const { cliente } = modeloGuion([
    llamar('proponer_gastar', {
      elementos: [
        // El modelo intenta ponerle otro nombre al elemento: el nombre manda la base de datos.
        { id: ID_HUEVOS, nombre: 'Caviar', cantidad: 4, unidad: 'unidades' },
        { id: ID_LECHE, todo: true },
      ],
    }),
    { texto: '¿Descuento 4 huevos y la leche?', llamadas: [] },
  ]);
  const cuerpo = await (
    await manejar(peticion('He hecho una tortilla con 4 huevos y he acabado la leche'), dependencias(cliente))
  ).json();
  assert.deepEqual(cuerpo.propuestas, [
    {
      tipo: 'gastar',
      elementos: [
        { id: ID_HUEVOS, nombre: 'Huevos', cantidad: 4, unidad: 'unidades', todo: false },
        { id: ID_LECHE, nombre: 'Leche entera', cantidad: null, unidad: null, todo: true },
      ],
    },
  ]);
});

test('proponer_gastar rechaza ids que no existen, cantidades que no cuadran y unidades de otra familia', async () => {
  const h = herramienta('proponer_gastar');
  const { propuestas, ctx } = contexto();
  const mal: [unknown, RegExp][] = [
    [{ elementos: [{ id: 'no-es-un-id', todo: true }] }, /id/],
    [{ elementos: [{ id: '99999999-9999-4999-8999-999999999999', todo: true }] }, /no existe/],
    [{ elementos: [{ id: ID_HUEVOS }] }, /cuánto/],
    [{ elementos: [{ id: ID_HUEVOS, cantidad: 2 }] }, /unidad/],
    [{ elementos: [{ id: ID_HUEVOS, cantidad: 200, unidad: 'g' }] }, /se mide en unidades/],
    [{ elementos: [{ id: ID_LECHE, cantidad: 1, unidad: 'kg' }] }, /se mide en ml/],
    [{ elementos: [{ id: ID_HUEVOS, todo: true }, { id: ID_HUEVOS, todo: true }] }, /repetido/],
  ];
  for (const [argumentos, patron] of mal) {
    await assert.rejects(() => h.ejecutar(argumentos, datosFalsos(), ctx), patron, JSON.stringify(argumentos).slice(0, 70));
  }
  assert.deepEqual(propuestas, []);
});

test('proponer_tirar solo necesita los ids', async () => {
  const { cliente } = modeloGuion([
    llamar('proponer_tirar', { elementos: [{ id: ID_LECHE }] }),
    { texto: '¿Tiro la leche?', llamadas: [] },
  ]);
  const cuerpo = await (await manejar(peticion('La leche está mala'), dependencias(cliente))).json();
  assert.deepEqual(cuerpo.propuestas, [
    { tipo: 'tirar', elementos: [{ id: ID_LECHE, nombre: 'Leche entera', cantidad: null, unidad: null, todo: true }] },
  ]);
});

test('hay un tope de propuestas por respuesta, y pasado el tope el modelo recibe el error', async () => {
  const una = { nombre: 'proponer_apuntar', argumentos: { productos: [{ nombre: 'sal' }] } };
  const juntas: RespuestaModelo = { texto: '', llamadas: Array.from({ length: MAX_PROPUESTAS + 2 }, () => una) };
  const { cliente, vistos } = modeloGuion([juntas, { texto: 'Hecho.', llamadas: [] }]);
  const cuerpo = await (await manejar(peticion('Apunta sal'), dependencias(cliente))).json();
  assert.equal(cuerpo.propuestas.length, MAX_PROPUESTAS);
  const resultados = (vistos[1] ?? []).filter((m) => m.rol === 'tool').map((m) => (m as { texto: string }).texto);
  assert.equal(resultados.length, MAX_PROPUESTAS + 2);
  assert.match(resultados.at(-1) ?? '', /demasiadas propuestas/);
});

test('las instrucciones dicen que se pregunta antes y que nunca se da nada por hecho', () => {
  assert.match(INSTRUCCIONES, /proponer_\*/);
  assert.match(INSTRUCCIONES, /pregunta en una frase si es correcto/);
  assert.match(INSTRUCCIONES, /Nunca digas que lo has hecho/);
  assert.match(INSTRUCCIONES, /no está hecho/);
});

test('las herramientas son dos de lectura y cuatro de PROPUESTA, y la función no tiene forma de escribir', () => {
  assert.deepEqual(HERRAMIENTAS.map((h) => h.descripcion.nombre).sort(), [
    'proponer_apuntar',
    'proponer_gastar',
    'proponer_guardar',
    'proponer_tirar',
    'ver_inventario',
    'ver_lista_compra',
  ]);
  // Guarda de código: ni una escritura en la base de datos desde opsi-chat. Lo único que llama a una
  // función de la base de datos es la cuota, con el token de la persona. Si alguien necesita escribir
  // desde aquí, este test obliga a cambiar la regla a la vista (docs/threat-model.md §10).
  const fuente = readFileSync(new URL('../opsi-chat/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(fuente, /\.(insert|update|delete|upsert)\(/);
  assert.deepEqual([...fuente.matchAll(/\.rpc\('([a-z_]+)'/g)].map((m) => m[1]), ['use_chat_quota']);
  // Y el acceso a datos que se les da a las herramientas solo tiene lecturas.
  assert.deepEqual(Object.keys(datosFalsos()).sort(), ['elementos', 'inventario', 'listaCompra']);
});
