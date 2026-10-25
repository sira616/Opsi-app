import assert from 'node:assert/strict';
import { test } from 'node:test';

import { categoriaEsNoComida, esNoComida, nombreEsNoComida } from './nocomida.ts';

test('las categorías de OFF que dicen tabaco o vapeo se rechazan', () => {
  const casos = [
    ['en:tobacco-products', 'en:cigarettes'],
    ['en:tobaccos'],
    ['en:rolling-tobacco'],
    ['fr:cigarettes-electroniques'],
    ['en:e-liquids'],
    ['en:nicotine-pouches'],
    ['en:snus'],
    ['es:tabaco-de-liar'],
    ['en:lighters'],
  ];
  for (const etiquetas of casos) assert.equal(categoriaEsNoComida(etiquetas), true, etiquetas.join(','));
});

test('las marcas de OFF de «esto no es comida» se rechazan aunque no digan tabaco', () => {
  assert.equal(categoriaEsNoComida(['en:non-food-products']), true);
  assert.equal(categoriaEsNoComida(['en:incorrect-product-type', 'en:open-products-facts']), true);
});

test('la comida no se rechaza por sus categorías, ni siquiera las que se parecen', () => {
  const comida = [
    ['en:dairies', 'en:yogurts'],
    ['en:condiments', 'en:sauces', 'en:tabasco-sauces'], // tabasco no es tabaco
    ['en:beverages', 'en:alcoholic-beverages', 'en:wines'], // el alcohol se guarda en una despensa
    [],
  ];
  for (const etiquetas of comida) assert.equal(categoriaEsNoComida(etiquetas), false, etiquetas.join(','));
});

test('los nombres que delatan tabaco o vapeo se rechazan, con o sin acentos y en cualquier caja', () => {
  const nombres = [
    'Tabaco de liar',
    'TABACO RUBIO',
    'Cigarrillos Marlboro Gold',
    'Cigarros habanos',
    'Camel cigarettes',
    'Líquido e-liquid fresa',
    'Vapeador desechable',
    'Papel de liar slim',
    'Bolsitas de nicotina',
    'Shisha manzana',
  ];
  for (const n of nombres) assert.equal(nombreEsNoComida(n), true, n);
});

test('los nombres de comida con palabras parecidas no se rechazan', () => {
  const nombres = [
    'Salsa Tabasco',
    'Zumo de naranja puro',
    'Pipas de girasol',
    'Papel de cocina', // no es comida, pero tampoco es esto: lo decide el resto de la ficha
    'Leche entera',
    'Barquillos de chocolate',
    'Atún claro en aceite',
  ];
  for (const n of nombres) assert.equal(nombreEsNoComida(n), false, n);
});

test('esNoComida mira nombre y categorías, y las categorías son opcionales', () => {
  assert.equal(esNoComida({ name: 'Leche entera' }), false);
  assert.equal(esNoComida({ name: 'Leche entera', categoriesTags: ['en:dairies'] }), false);
  assert.equal(esNoComida({ name: 'Producto 1234', categoriesTags: ['en:tobacco-products'] }), true);
  assert.equal(esNoComida({ name: 'Tabaco rubio', categoriesTags: [] }), true);
  assert.equal(esNoComida({ name: 'Tabaco rubio' }), true);
});
