import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  bloqueadaPorNombre,
  claveDeNombre,
  coincidencias,
  leerProductosTicket,
  lineasIniciales,
  MAX_PRODUCTOS,
  paraGuardar,
  parsearCantidad,
  siguienteUnidad,
} from './lineas.ts';

test('se leen los productos con cantidad y unidad, y los que no cuadran no existen', () => {
  const r = leerProductosTicket([
    { nombre: 'leche entera', cantidad: 1, unidad: 'l', comida: true },
    { nombre: 'bolsa plastico', cantidad: 3, unidad: 'unidades', comida: false },
    { nombre: '   ' },
    { cantidad: 2, unidad: 'kg' },
    null,
    5,
    'x',
  ]);
  assert.deepEqual(r, [
    { nombre: 'leche entera', cantidad: 1, unidad: 'l', comida: true },
    { nombre: 'bolsa plastico', cantidad: 3, unidad: 'unidades', comida: false },
  ]);
});

test('lo que no es una lista da una lista vacía, no un fallo', () => {
  for (const malo of [null, undefined, 'a', 3, {}, { productos: [] }]) assert.deepEqual(leerProductosTicket(malo), []);
});

test('una cantidad sin unidad (o rara) se descarta, y el tabaco no cuenta como comida aunque el lector diga que sí', () => {
  const r = leerProductosTicket([
    { nombre: 'a', cantidad: 2 },
    { nombre: 'b', cantidad: -1, unidad: 'kg' },
    { nombre: 'c', cantidad: 1e12, unidad: 'kg' },
    { nombre: 'd', cantidad: '2', unidad: 'kg' },
    { nombre: 'tabaco de liar', comida: true },
  ]);
  assert.deepEqual(
    r.map((p) => [p.nombre, p.cantidad, p.unidad, p.comida]),
    [
      ['a', null, null, true],
      ['b', null, null, true],
      ['c', null, null, true],
      ['d', null, null, true],
      ['tabaco de liar', null, null, false],
    ],
  );
});

test('los nombres salen limpios y acotados, y hay un tope de líneas', () => {
  const rlo = String.fromCharCode(0x202e);
  const [p] = leerProductosTicket([{ nombre: `pan${rlo}\n integral${'x'.repeat(300)}` }]);
  assert.ok(p && !p.nombre.includes(rlo) && !p.nombre.includes('\n') && [...p.nombre].length <= 80);
  const muchos = Array.from({ length: MAX_PRODUCTOS + 30 }, (_, i) => ({ nombre: `p${i}` }));
  assert.equal(leerProductosTicket(muchos).length, MAX_PRODUCTOS);
});

test('la revisión empieza con lo que parece comida marcado y lo demás sin marcar', () => {
  const l = lineasIniciales([
    { nombre: 'leche', cantidad: 1.5, unidad: 'l', comida: true },
    { nombre: 'detergente', cantidad: null, unidad: null, comida: false },
  ]);
  assert.deepEqual(
    l.map((x) => [x.nombre, x.cantidad, x.unidad, x.incluir]),
    [
      ['leche', '1,5', 'l', true],
      ['detergente', '', 'unidades', false],
    ],
  );
  assert.equal(new Set(l.map((x) => x.clave)).size, 2, 'cada fila tiene su clave');
});

test('las cantidades se escriben con coma o con punto, y lo que no es un número no vale', () => {
  assert.equal(parsearCantidad('1,5'), 1.5);
  assert.equal(parsearCantidad(' 2 '), 2);
  assert.equal(parsearCantidad('0.750'), 0.75);
  for (const malo of ['', '  ', 'dos', '-1', '0', '1,2,3', '1e3', '1000001', 'NaN', '1/2']) {
    assert.equal(parsearCantidad(malo), null, malo);
  }
});

test('las unidades se cambian dando la vuelta', () => {
  assert.equal(siguienteUnidad('unidades'), 'g');
  assert.equal(siguienteUnidad('l'), 'unidades');
});

test('se guarda lo marcado, con su cantidad si la tiene y sin ella como una unidad', () => {
  const lineas = lineasIniciales([
    { nombre: 'leche', cantidad: 1.5, unidad: 'l', comida: true },
    { nombre: 'pan', cantidad: null, unidad: null, comida: true },
    { nombre: 'detergente', cantidad: null, unidad: null, comida: false },
  ]);
  // La persona desmarca el pan, marca el detergente y cambia la leche a 2 l.
  lineas[0] = { ...lineas[0]!, cantidad: '2' };
  lineas[1] = { ...lineas[1]!, incluir: false };
  lineas[2] = { ...lineas[2]!, incluir: true };
  assert.deepEqual(paraGuardar(lineas), [
    { nombre: 'leche', cantidad: 2, unidad: 'l' },
    { nombre: 'detergente', cantidad: null, unidad: null },
  ]);
});

test('una cantidad ilegible se guarda sin cantidad, no como un error ni como cero', () => {
  const [l] = lineasIniciales([{ nombre: 'leche', cantidad: 1, unidad: 'l', comida: true }]);
  assert.deepEqual(paraGuardar([{ ...l!, cantidad: 'mucha' }]), [{ nombre: 'leche', cantidad: null, unidad: null }]);
});

test('el tabaco no se guarda aunque se marque o se escriba a mano, y se puede saber para avisarlo', () => {
  const [l] = lineasIniciales([{ nombre: 'leche', cantidad: null, unidad: null, comida: true }]);
  const tabaco = { ...l!, nombre: 'Cigarrillos suaves', incluir: true };
  assert.deepEqual(paraGuardar([tabaco]), []);
  assert.equal(bloqueadaPorNombre(tabaco), true);
  assert.equal(bloqueadaPorNombre(l!), false);
});

test('las filas sin nombre o desmarcadas no entran', () => {
  const [l] = lineasIniciales([{ nombre: 'leche', cantidad: null, unidad: null, comida: true }]);
  assert.deepEqual(paraGuardar([{ ...l!, nombre: '   ' }, { ...l!, incluir: false }]), []);
});

test('el nombre se compara sin mayúsculas, acentos ni plural sencillo', () => {
  assert.equal(claveDeNombre('Plátanos'), claveDeNombre('platano'));
  assert.equal(claveDeNombre('Huevos camperos'), claveDeNombre('huevo campero'));
  assert.notEqual(claveDeNombre('leche'), claveDeNombre('leche de avena'));
  assert.equal(claveDeNombre('  '), '');
});

test('del ticket se tachan las líneas pendientes con el mismo nombre, y solo esas', () => {
  const pendientes = [
    { id: 1, name: 'Leche' },
    { id: 2, name: 'huevos' },
    { id: 3, name: 'Leche de avena' },
    { id: 4, name: 'Arroz' },
    { id: 5, name: 'leche' },
  ];
  const r = coincidencias(['leche', 'huevo', 'pan'], pendientes);
  assert.deepEqual(r.map((p) => p.id), [1, 2, 5]);
  assert.deepEqual(coincidencias([], pendientes), []);
  assert.deepEqual(coincidencias(['   '], pendientes), []);
});
