import assert from 'node:assert/strict';
import { test } from 'node:test';

import { productoDelElementoParaLista, productoParaLista, productoParaNevera } from './destino.ts';

const CASA = 'nevera-casa';
const PISO = 'nevera-piso';

test('un producto del catálogo global se enlaza en cualquier nevera', () => {
  const p = { productoId: 'p1', origen: 'openfoodfacts', neveraId: CASA };
  assert.equal(productoParaNevera(p, CASA), 'p1');
  assert.equal(productoParaNevera(p, PISO), 'p1');
});

test('un producto privado de una nevera solo se enlaza en esa misma nevera', () => {
  const p = { productoId: 'p2', origen: 'user', neveraId: CASA };
  assert.equal(productoParaNevera(p, CASA), 'p2');
  assert.equal(productoParaNevera(p, PISO), null);
});

test('la nevera de un producto es la suya, no la que se esté mirando', () => {
  // Tus productos son de la cuenta: uno añadido en el piso se guarda con su ficha en el piso...
  const delPiso = { productoId: 'p4', origen: 'user', neveraId: PISO };
  assert.equal(productoParaNevera(delPiso, PISO), 'p4');
  // ...y en casa se guarda solo por el nombre, aunque casa sea la nevera activa.
  assert.equal(productoParaNevera(delPiso, CASA), null);
});

test('lo escrito a mano no tiene ficha que enlazar, vaya donde vaya', () => {
  const p = { productoId: null, origen: null, neveraId: CASA };
  assert.equal(productoParaNevera(p, CASA), null);
  assert.equal(productoParaNevera(p, PISO), null);
});

test('un producto sin origen conocido no se enlaza fuera de su nevera', () => {
  const p = { productoId: 'p3', origen: null, neveraId: CASA };
  assert.equal(productoParaNevera(p, CASA), 'p3');
  assert.equal(productoParaNevera(p, PISO), null);
});

test('un producto sin nevera conocida y privado no se enlaza en ninguna', () => {
  const p = { productoId: 'p5', origen: 'user', neveraId: null };
  assert.equal(productoParaNevera(p, CASA), null);
  assert.equal(productoParaNevera(p, PISO), null);
});

test('en una lista compartida vale la regla de su nevera', () => {
  const privado = { productoId: 'p6', origen: 'user', neveraId: CASA };
  assert.equal(productoParaLista(privado, { household_id: CASA }), 'p6');
  assert.equal(productoParaLista(privado, { household_id: PISO }), null);
  const global = { productoId: 'p7', origen: 'openfoodfacts', neveraId: CASA };
  assert.equal(productoParaLista(global, { household_id: PISO }), 'p7');
});

test('el producto de un alimento solo se enlaza donde seguro vale: individual o misma nevera', () => {
  const e = { product_id: 'p9', household_id: CASA };
  assert.equal(productoDelElementoParaLista(e, { household_id: null }), 'p9');
  assert.equal(productoDelElementoParaLista(e, { household_id: CASA }), 'p9');
  // En la lista de otra nevera no se sabe si la ficha es privada: se apunta por el nombre.
  assert.equal(productoDelElementoParaLista(e, { household_id: PISO }), null);
  assert.equal(productoDelElementoParaLista({ product_id: null, household_id: CASA }, { household_id: CASA }), null);
});

test('en una lista individual (sin nevera) vale la ficha que la persona ya ve', () => {
  const privado = { productoId: 'p8', origen: 'user', neveraId: CASA };
  assert.equal(productoParaLista(privado, { household_id: null }), 'p8');
  const aMano = { productoId: null, origen: null, neveraId: CASA };
  assert.equal(productoParaLista(aMano, { household_id: null }), null);
});
