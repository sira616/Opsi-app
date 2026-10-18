import assert from 'node:assert/strict';
import { test } from 'node:test';

import { productoParaNevera } from './destino.ts';

const CASA = 'nevera-casa';
const PISO = 'nevera-piso';

test('un producto del catálogo global se enlaza en cualquier nevera', () => {
  const p = { productoId: 'p1', origen: 'openfoodfacts' };
  assert.equal(productoParaNevera(p, CASA, CASA), 'p1');
  assert.equal(productoParaNevera(p, PISO, CASA), 'p1');
});

test('un producto privado de una nevera solo se enlaza en esa misma nevera', () => {
  const p = { productoId: 'p2', origen: 'user' };
  assert.equal(productoParaNevera(p, CASA, CASA), 'p2');
  assert.equal(productoParaNevera(p, PISO, CASA), null);
});

test('lo escrito a mano no tiene ficha que enlazar, vaya donde vaya', () => {
  const p = { productoId: null, origen: null };
  assert.equal(productoParaNevera(p, CASA, CASA), null);
  assert.equal(productoParaNevera(p, PISO, CASA), null);
});

test('un producto sin origen conocido no se enlaza fuera de su nevera', () => {
  const p = { productoId: 'p3', origen: null };
  assert.equal(productoParaNevera(p, CASA, CASA), 'p3');
  assert.equal(productoParaNevera(p, PISO, CASA), null);
});
