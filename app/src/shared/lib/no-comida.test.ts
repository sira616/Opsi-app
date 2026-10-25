import assert from 'node:assert/strict';
import { test } from 'node:test';

import { nombreEsNoComida as enLaFuncion } from '../../../../supabase/functions/_shared/nocomida.ts';
import { nombreEsNoComida } from './no-comida.ts';

const SI = [
  'Tabaco de liar',
  'CIGARRILLOS Marlboro',
  'Cigarros habanos',
  'Camel cigarettes',
  'Vapeador desechable',
  'Líquido e-liquid fresa',
  'Papel de liar slim',
  'Bolsitas de nicotina',
  'Shisha manzana',
  'Snus',
];
const NO = [
  'Salsa Tabasco',
  'Zumo de naranja puro',
  'Pipas de girasol',
  'Leche entera',
  'Atún claro en aceite',
  'Barquillos de chocolate',
  'Vino tinto',
  '',
];

test('el móvil rechaza los nombres de tabaco y vapeo', () => {
  for (const n of SI) assert.equal(nombreEsNoComida(n), true, n);
});

test('y deja pasar la comida con palabras parecidas', () => {
  for (const n of NO) assert.equal(nombreEsNoComida(n), false, n);
});

test('dice lo mismo que la función del servidor, para los mismos nombres', () => {
  for (const n of [...SI, ...NO]) assert.equal(nombreEsNoComida(n), enLaFuncion(n), n);
});
