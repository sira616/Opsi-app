import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DIAS_PARA_CONGELAR, esCongelable, recomendarCongelar } from './congelar.ts';
import type { CandidatoCongelar } from './congelar.ts';

/** Una pechuga abierta en la nevera que vence mañana: el caso que SÍ se recomienda. */
function pechuga(cambios: Partial<CandidatoCongelar> = {}): CandidatoCongelar {
  return {
    name: 'Pechuga de pollo',
    category: 'carne',
    state: 'closed',
    location: 'fridge',
    days_left: 1,
    thawed_at: null,
    ...cambios,
  };
}

test('carne, pescado y panadería son congelables', () => {
  assert.equal(esCongelable('carne', 'Pechuga de pollo'), true);
  assert.equal(esCongelable('pescado', 'Merluza'), true);
  assert.equal(esCongelable('panaderia', 'Barra de pan'), true);
});

test('lácteos y huevos solo entran por el nombre: queso, mantequilla y leche', () => {
  assert.equal(esCongelable('lacteos', 'Queso rallado'), true);
  assert.equal(esCongelable('lacteos', 'Mantequilla'), true);
  assert.equal(esCongelable('lacteos', 'Leche entera'), true);
  assert.equal(esCongelable('lacteos', 'Huevos'), false);
  assert.equal(esCongelable('lacteos', 'Yogur natural'), false);
  assert.equal(esCongelable('lacteos', 'Nata para montar'), false);
  assert.equal(esCongelable('lacteos', 'Natillas'), false);
});

test('lo que se enfría pero no se congela se queda fuera', () => {
  for (const categoria of ['frutas_verduras', 'despensa', 'bebidas', 'dulces', 'otros', 'congelados'] as const) {
    assert.equal(esCongelable(categoria, 'Lo que sea'), false, categoria);
  }
});

test('el nombre manda sobre la categoría: una lata abierta o la mayonesa no se congelan', () => {
  assert.equal(esCongelable('pescado', 'Atún, lata abierta'), false);
  assert.equal(esCongelable('pescado', 'Conserva de sardinas'), false);
  assert.equal(esCongelable('carne', 'Mayonesa de la tarde'), false);
  assert.equal(esCongelable('carne', 'Ensalada de pollo'), false);
});

test('se recomienda con la fecha entre hoy y pasado mañana', () => {
  assert.equal(DIAS_PARA_CONGELAR, 2);
  for (const dias of [0, 1, 2]) {
    assert.equal(recomendarCongelar(pechuga({ days_left: dias })), true, `${dias} días`);
  }
});

test('con más margen no hace falta, y con la fecha pasada o desconocida tampoco', () => {
  assert.equal(recomendarCongelar(pechuga({ days_left: 3 })), false);
  assert.equal(recomendarCongelar(pechuga({ days_left: 10 })), false);
  // Congelar no arregla lo vencido.
  assert.equal(recomendarCongelar(pechuga({ days_left: -1 })), false);
  assert.equal(recomendarCongelar(pechuga({ days_left: null })), false);
});

test('abierto o empezado también cuenta; congelado, tirado o agotado no', () => {
  assert.equal(recomendarCongelar(pechuga({ state: 'open' })), true);
  assert.equal(recomendarCongelar(pechuga({ state: 'partially_consumed' })), true);
  assert.equal(recomendarCongelar(pechuga({ state: 'frozen' })), false);
  assert.equal(recomendarCongelar(pechuga({ state: 'finished' })), false);
  assert.equal(recomendarCongelar(pechuga({ state: 'discarded' })), false);
});

test('nunca se recomienda congelar algo que ya se descongeló', () => {
  assert.equal(recomendarCongelar(pechuga({ state: 'thawed', thawed_at: '2026-10-17T10:00:00Z' })), false);
  // El caso traicionero: al usar una parte el estado deja de ser «descongelado»,
  // pero la fecha de descongelación se queda, y con ella el «no recongelar».
  assert.equal(
    recomendarCongelar(pechuga({ state: 'partially_consumed', thawed_at: '2026-10-17T10:00:00Z' })),
    false,
  );
  assert.equal(
    recomendarCongelar(pechuga({ state: 'open', thawed_at: '2026-10-17T10:00:00Z' })),
    false,
  );
});

test('solo lo que está en la nevera', () => {
  assert.equal(recomendarCongelar(pechuga({ location: 'pantry' })), false);
  assert.equal(recomendarCongelar(pechuga({ location: 'freezer' })), false);
  assert.equal(recomendarCongelar(pechuga({ location: 'other' })), false);
});

test('algo no congelable no se recomienda aunque venza hoy', () => {
  assert.equal(recomendarCongelar(pechuga({ name: 'Huevos', category: 'lacteos', days_left: 0 })), false);
  assert.equal(recomendarCongelar(pechuga({ name: 'Lechuga', category: 'frutas_verduras', days_left: 0 })), false);
});
