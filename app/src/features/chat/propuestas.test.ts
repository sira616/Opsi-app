import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cantidadParaGuardar,
  leerPropuestas,
  lineasDe,
  MAX_LINEAS,
  MAX_PROPUESTAS,
  textoLinea,
  tituloDe,
} from './propuestas.ts';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

test('una propuesta bien formada se lee tal cual, con cantidad y unidad', () => {
  const r = leerPropuestas([
    { tipo: 'guardar', productos: [{ nombre: 'leche', cantidad: 2, unidad: 'l' }, { nombre: 'pan', cantidad: null, unidad: null }] },
    { tipo: 'gastar', elementos: [{ id: ID, nombre: 'Huevos', cantidad: 4, unidad: 'unidades', todo: false }, { id: ID2, nombre: 'Leche', cantidad: null, unidad: null, todo: true }] },
  ]);
  assert.deepEqual(r, [
    { tipo: 'guardar', productos: [{ nombre: 'leche', cantidad: 2, unidad: 'l' }, { nombre: 'pan', cantidad: null, unidad: null }] },
    { tipo: 'gastar', elementos: [{ id: ID, nombre: 'Huevos', cantidad: 4, unidad: 'unidades', todo: false }, { id: ID2, nombre: 'Leche', cantidad: null, unidad: null, todo: true }] },
  ]);
});

test('lo que no es una lista, un objeto o un tipo conocido no existe', () => {
  for (const malo of [null, undefined, 'apuntar', 5, {}, [null], [5], ['x'], [{}], [{ tipo: 'borrar_todo', productos: [{ nombre: 'x' }] }], [{ tipo: 'apuntar' }], [{ tipo: 'apuntar', productos: 'leche' }]]) {
    assert.deepEqual(leerPropuestas(malo), [], JSON.stringify(malo));
  }
});

test('una propuesta sin nada válido dentro desaparece, y lo válido se queda', () => {
  const r = leerPropuestas([
    { tipo: 'apuntar', productos: [{ nombre: '   ' }, { cantidad: 2 }, 7, { nombre: 'sal' }] },
    { tipo: 'apuntar', productos: [{ nombre: '' }] },
  ]);
  assert.deepEqual(r, [{ tipo: 'apuntar', productos: [{ nombre: 'sal', cantidad: null, unidad: null }] }]);
});

test('una cantidad sin unidad (o con una desconocida) se descarta: sin saber en qué, no se enseña', () => {
  const [p] = leerPropuestas([
    { tipo: 'apuntar', productos: [{ nombre: 'a', cantidad: 2 }, { nombre: 'b', cantidad: 2, unidad: 'cucharadas' }, { nombre: 'c', unidad: 'kg' }] },
  ]);
  assert.deepEqual((p as { productos: unknown[] }).productos, [
    { nombre: 'a', cantidad: null, unidad: null },
    { nombre: 'b', cantidad: null, unidad: null },
    { nombre: 'c', cantidad: null, unidad: null },
  ]);
});

test('las cantidades raras (negativas, cero, enormes, no numéricas) se descartan', () => {
  const [p] = leerPropuestas([
    {
      tipo: 'apuntar',
      productos: [-1, 0, 1e12, '2', NaN, Infinity].map((c) => ({ nombre: 'x', cantidad: c, unidad: 'kg' })),
    },
  ]);
  for (const l of (p as { productos: { cantidad: number | null }[] }).productos) assert.equal(l.cantidad, null);
});

test('los nombres salen limpios: sin caracteres que no se ven ni saltos de línea, y acotados', () => {
  const rlo = String.fromCharCode(0x202e);
  const cero = String.fromCharCode(0x200b);
  const [p] = leerPropuestas([{ tipo: 'apuntar', productos: [{ nombre: `pan${rlo}${cero}\n integral${'x'.repeat(300)}` }] }]);
  const nombre = (p as { productos: { nombre: string }[] }).productos[0]!.nombre;
  assert.ok(!nombre.includes(rlo) && !nombre.includes(cero) && !nombre.includes('\n'));
  assert.ok([...nombre].length <= 80);
  assert.match(nombre, /^pan integral/);
});

test('gastar y tirar necesitan un id de verdad; sin él (o repetido) el elemento no cuenta', () => {
  const r = leerPropuestas([
    {
      tipo: 'gastar',
      elementos: [
        { id: 'no', nombre: 'a', todo: true },
        { nombre: 'b', todo: true },
        { id: ID, nombre: 'Huevos', todo: true },
        { id: ID.toUpperCase(), nombre: 'Huevos otra vez', todo: true },
      ],
    },
  ]);
  assert.deepEqual(r, [{ tipo: 'gastar', elementos: [{ id: ID, nombre: 'Huevos', cantidad: null, unidad: null, todo: true }] }]);
});

test('gastar sin cantidad ni «todo» no se puede hacer; tirar siempre es entero', () => {
  assert.deepEqual(leerPropuestas([{ tipo: 'gastar', elementos: [{ id: ID, nombre: 'Huevos' }] }]), []);
  assert.deepEqual(leerPropuestas([{ tipo: 'gastar', elementos: [{ id: ID, nombre: 'Huevos', cantidad: 2 }] }]), []);
  const [t] = leerPropuestas([{ tipo: 'tirar', elementos: [{ id: ID, nombre: 'Leche', cantidad: 3, unidad: 'l', todo: false }] }]);
  assert.deepEqual(t, { tipo: 'tirar', elementos: [{ id: ID, nombre: 'Leche', cantidad: null, unidad: null, todo: true }] });
});

test('hay un tope de tarjetas y de líneas por tarjeta', () => {
  const muchas = Array.from({ length: MAX_PROPUESTAS + 4 }, () => ({ tipo: 'apuntar', productos: [{ nombre: 'sal' }] }));
  assert.equal(leerPropuestas(muchas).length, MAX_PROPUESTAS);
  const largas = [{ tipo: 'apuntar', productos: Array.from({ length: MAX_LINEAS + 5 }, (_, i) => ({ nombre: `p${i}` })) }];
  assert.equal((leerPropuestas(largas)[0] as { productos: unknown[] }).productos.length, MAX_LINEAS);
});

test('los campos que sobran se tiran: lo que sale solo tiene la forma esperada', () => {
  const [p] = leerPropuestas([{ tipo: 'apuntar', ejecutar: 'rm -rf', productos: [{ nombre: 'sal', precio: 3, url: 'http://x' }] }]);
  assert.deepEqual(p, { tipo: 'apuntar', productos: [{ nombre: 'sal', cantidad: null, unidad: null }] });
});

test('las cantidades pasan a unidad base: 2 l son 2000 ml, 1,5 kg son 1500 g, y sin cantidad es una unidad', () => {
  assert.deepEqual(cantidadParaGuardar(2, 'l'), { unitFamily: 'volume', displayUnit: 'l', quantity: 2000 });
  assert.deepEqual(cantidadParaGuardar(1.5, 'kg'), { unitFamily: 'mass', displayUnit: 'kg', quantity: 1500 });
  assert.deepEqual(cantidadParaGuardar(250, 'g'), { unitFamily: 'mass', displayUnit: 'g', quantity: 250 });
  assert.deepEqual(cantidadParaGuardar(12, 'unidades'), { unitFamily: 'count', displayUnit: 'unit', quantity: 12 });
  assert.deepEqual(cantidadParaGuardar(null, null), { unitFamily: 'count', displayUnit: 'unit', quantity: 1 });
});

test('lo que dice cada tarjeta: título, y una línea por producto con su cantidad', () => {
  assert.equal(tituloDe({ tipo: 'apuntar', productos: [] }, 'Piso'), 'Apuntar en la lista');
  assert.equal(tituloDe({ tipo: 'guardar', productos: [] }, 'Piso'), 'Guardar en Piso');
  assert.equal(tituloDe({ tipo: 'gastar', elementos: [] }, 'Piso'), 'Descontar de la nevera');
  assert.equal(tituloDe({ tipo: 'tirar', elementos: [] }, 'Piso'), 'Tirar');

  assert.equal(textoLinea({ nombre: 'leche', cantidad: 2, unidad: 'l' }), 'leche · 2 l');
  assert.equal(textoLinea({ nombre: 'pan', cantidad: null, unidad: null }), 'pan');
  assert.equal(textoLinea({ id: ID, nombre: 'Leche', cantidad: null, unidad: null, todo: true }), 'Leche · entero');
  assert.deepEqual(
    lineasDe({ tipo: 'gastar', elementos: [{ id: ID, nombre: 'Huevos', cantidad: 4, unidad: 'unidades', todo: false }] }),
    ['Huevos · 4 ud.'],
  );
});
