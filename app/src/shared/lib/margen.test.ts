import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MINIMO_ANDROID, MINIMO_IOS, margenSuperior } from './margen.ts';

test('iPhone: manda el área segura si es mayor que el mínimo', () => {
  assert.equal(margenSuperior(59, 'ios', null), 59, 'isla dinámica');
  assert.equal(margenSuperior(50, 'ios', null), 50, 'notch');
});

test('iPhone: si el área segura sale como 0 dentro del modal, vale el mínimo', () => {
  assert.equal(margenSuperior(0, 'ios', null), MINIMO_IOS);
  assert.equal(margenSuperior(20, 'ios', null), MINIMO_IOS, 'un valor de barra de estado sin recorte tampoco basta');
});

test('Android: el mayor entre el área segura, la barra de estado y el suelo', () => {
  assert.equal(margenSuperior(0, 'android', 24), MINIMO_ANDROID, 'barra de 24: manda el suelo, por los recortes altos');
  assert.equal(margenSuperior(0, 'android', 48), 48, 'una barra alta');
  assert.equal(margenSuperior(60, 'android', 24), 60, 'un recorte que el área segura sí mide');
  assert.equal(margenSuperior(0, 'android', null), MINIMO_ANDROID, 'sin dato de la barra, el suelo');
  assert.equal(margenSuperior(0, 'android', undefined), MINIMO_ANDROID);
});

test('en el navegador no hay recorte: solo el área segura, y nada si no hay', () => {
  assert.equal(margenSuperior(0, 'web', null), 0);
  assert.equal(margenSuperior(12, 'web', null), 12);
});

test('valores raros no rompen nada: negativos y NaN cuentan como 0', () => {
  assert.equal(margenSuperior(-5, 'ios', null), MINIMO_IOS);
  assert.equal(margenSuperior(Number.NaN, 'ios', null), MINIMO_IOS);
  assert.equal(margenSuperior(0, 'android', Number.NaN), MINIMO_ANDROID);
  assert.equal(margenSuperior(0, 'android', -10), MINIMO_ANDROID);
});

test('nunca devuelve menos que el área segura que se le da', () => {
  for (const plataforma of ['ios', 'android', 'web'] as const) {
    for (const insets of [0, 10, 24, 47, 59, 80]) {
      assert.ok(margenSuperior(insets, plataforma, 24) >= insets, `${plataforma} con ${insets}`);
    }
  }
});
