import assert from 'node:assert/strict';
import { test } from 'node:test';

import { digitoDeControl, esGtinValido, normalizarGtin } from './gtin.ts';

// Códigos con control correcto de los cuatro tamaños. Los de 12, 13 y 8 cifras
// son ejemplos de la propia GS1; el de 14 es un EAN-13 con un 1 de indicador y
// su control recalculado.
const EAN13 = '5449000000996';
const UPC_A = '036000291452';
const EAN8 = '96385074';
const GTIN14_CAJA = '15449000000993';

test('el dígito de control sale del cuerpo, no del código entero', () => {
  assert.equal(digitoDeControl('544900000099'), 6);
  assert.equal(digitoDeControl('03600029145'), 2);
  assert.equal(digitoDeControl('9638507'), 4);
});

test('acepta los cuatro tamaños de GTIN con el control bueno', () => {
  for (const codigo of [EAN13, UPC_A, EAN8, GTIN14_CAJA]) {
    assert.equal(esGtinValido(codigo), true, codigo);
  }
});

test('rechaza un control malo, aunque sea por una cifra', () => {
  assert.equal(esGtinValido('5449000000995'), false);
  assert.equal(esGtinValido('96385075'), false);
});

test('rechaza lo que no es un GTIN: longitud, letras, espacios, vacío', () => {
  for (const malo of [
    '',
    '1234567', // 7 cifras
    '123456789', // 9
    '1234567890', // 10
    '12345678901', // 11
    '123456789012345', // 15
    '544900000099a',
    '5449 000000996',
    '５４４９０００００００９９６', // cifras de ancho completo: parecen cifras y no lo son
    '-5449000000996',
  ]) {
    assert.equal(esGtinValido(malo), false, JSON.stringify(malo));
  }
});

test('una cadena de ceros no es un producto aunque cuadre el control', () => {
  // El control de un cuerpo de ceros es 0, así que matemáticamente cuadra. Es lo
  // que devuelve una cámara que no ha leído nada.
  assert.equal(digitoDeControl('000000000000'), 0);
  for (const ceros of ['00000000', '000000000000', '0000000000000', '00000000000000']) {
    assert.equal(esGtinValido(ceros), false, ceros);
    assert.equal(normalizarGtin(ceros), null, ceros);
  }
});

test('normaliza al mismo código el UPC-A y su EAN-13 con un cero delante', () => {
  assert.equal(normalizarGtin(UPC_A), `0${UPC_A}`);
  assert.equal(normalizarGtin(`0${UPC_A}`), `0${UPC_A}`);
  // Un GTIN-14 con 0 delante es el mismo artículo que su EAN-13.
  assert.equal(normalizarGtin(`00${UPC_A}`), `0${UPC_A}`);
});

test('un GTIN-14 con indicador distinto de cero es otro artículo: no se toca', () => {
  assert.equal(normalizarGtin(GTIN14_CAJA), GTIN14_CAJA);
  assert.notEqual(normalizarGtin(GTIN14_CAJA), EAN13);
});

test('el EAN-13 y el EAN-8 se quedan como están', () => {
  assert.equal(normalizarGtin(EAN13), EAN13);
  assert.equal(normalizarGtin(EAN8), EAN8);
});

test('quita los espacios de los bordes y nada más', () => {
  assert.equal(normalizarGtin(` ${EAN13}\n`), EAN13);
  assert.equal(normalizarGtin('5449 000000996'), null);
});

test('no arregla un código: ni rellena por la izquierda ni corrige el control', () => {
  assert.equal(normalizarGtin('12345678901'), null);
  assert.equal(normalizarGtin('5449000000995'), null);
});
