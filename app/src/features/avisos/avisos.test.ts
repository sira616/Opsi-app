import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { PriorityItem } from '@/api/inventory';
import { recomendarCongelar } from '../../shared/lib/congelar.ts';
import { MAX_AVISOS, avisosDe, preguntaDeReceta, tocaAvisar } from './avisos.ts';

/** Los avisos con la función de verdad de «congélalo o úsalo». */
const avisosDe_ = (items: PriorityItem[]) => avisosDe(items, recomendarCongelar);

/** Un elemento de la nevera con lo que miran los avisos; el resto da igual. */
function item(cambios: Partial<PriorityItem> = {}): PriorityItem {
  return {
    id: 'i1',
    name: 'Leche entera',
    state: 'closed',
    location: 'fridge',
    unit_family: 'volume',
    display_unit: 'l',
    initial_quantity: 1000,
    remaining_quantity: 1000,
    priority: 'high',
    effective_limit_date: '2026-10-20',
    effective_date_reason: 'label',
    effective_date_source: 'package',
    date_kind: 'best_before',
    days_left: 1,
    category: 'lacteos',
    opened_at: null,
    frozen_at: null,
    thawed_at: null,
    product_id: null,
    ...cambios,
  };
}

test('algo congelable que vence mañana: congélalo o úsalo, con el dato primero', () => {
  const [a] = avisosDe_([item()]);
  assert.equal(a?.tipo, 'congelar');
  assert.equal(a?.texto, 'Vence mañana. Congélalo o úsalo.');
});

test('algo que no se congela y vence hoy: solo úsalo, sin ofrecer congelar', () => {
  const [a] = avisosDe_([item({ name: 'Yogur natural', days_left: 0 })]);
  assert.equal(a?.tipo, 'usar');
  assert.equal(a?.texto, 'Vence hoy.');
});

test('caducidad: dice «Caduca» (seguridad), no «Vence» (calidad)', () => {
  const [a] = avisosDe_([item({ name: 'Yogur natural', days_left: 0, date_kind: 'expiry' })]);
  assert.equal(a?.texto, 'Caduca hoy.');
});

test('lo vencido NO se avisa: ningún consejo sobre algo pasado de fecha', () => {
  assert.deepEqual(avisosDe_([item({ days_left: -1 })]), []);
  assert.deepEqual(avisosDe_([item({ days_left: -5, name: 'Yogur natural' })]), []);
  assert.deepEqual(avisosDe_([item({ days_left: -1, date_kind: 'expiry' })]), []);
});

test('lo que no vence pronto o no tiene fecha no se avisa', () => {
  assert.deepEqual(avisosDe_([item({ days_left: 5 })]), []);
  assert.deepEqual(avisosDe_([item({ days_left: 3 })]), []);
  assert.deepEqual(avisosDe_([item({ days_left: null })]), []);
});

test('congelar da un día más de margen (pasado mañana); usar, solo hoy y mañana', () => {
  assert.equal(avisosDe_([item({ days_left: 2 })])[0]?.texto, 'Vence pasado mañana. Congélalo o úsalo.');
  assert.deepEqual(avisosDe_([item({ name: 'Yogur natural', days_left: 2 })]), []);
});

test('lo congelado, agotado y tirado no se avisa', () => {
  for (const state of ['frozen', 'finished', 'discarded'] as const) {
    assert.deepEqual(avisosDe_([item({ state, days_left: 0 })]), [], state);
  }
});

test('lo descongelado se avisa para usarlo, pero nunca para congelarlo otra vez', () => {
  const [a] = avisosDe_([
    item({ state: 'partially_consumed', thawed_at: '2026-10-18T10:00:00Z', days_left: 0, name: 'Merluza', category: 'pescado' }),
  ]);
  assert.equal(a?.tipo, 'usar', 'ya se descongeló una vez: no se recomienda congelar');
  assert.equal(a?.texto, 'Vence hoy.');
});

test('lo que está en la despensa no se recomienda congelar, aunque sea de un pasillo congelable', () => {
  const [a] = avisosDe_([item({ location: 'pantry', category: 'carne', name: 'Chorizo', days_left: 1 })]);
  assert.equal(a?.tipo, 'usar');
});

test('van los más urgentes primero y, a igual fecha, por nombre; y con tope', () => {
  const lista = [
    item({ id: 'a', name: 'Pan', category: 'panaderia', days_left: 2 }),
    item({ id: 'b', name: 'Queso', category: 'lacteos', days_left: 1 }),
    item({ id: 'c', name: 'Atún', category: 'pescado', days_left: 0 }),
    item({ id: 'd', name: 'Carne picada', category: 'carne', days_left: 1 }),
    item({ id: 'e', name: 'Merluza', category: 'pescado', days_left: 0 }),
  ];
  const avisos = avisosDe_(lista);
  assert.equal(avisos.length, MAX_AVISOS);
  assert.deepEqual(avisos.map((a) => a.nombre), ['Atún', 'Merluza', 'Carne picada']);
  // El orden de entrada no cambia el resultado.
  assert.deepEqual(avisosDe_([...lista].reverse()).map((a) => a.nombre), ['Atún', 'Merluza', 'Carne picada']);
});

test('sin nada que avisar, no hay aviso', () => {
  assert.deepEqual(avisosDe_([]), []);
});

test('tocaAvisar: encendido, con algo que avisar y sin haberlo enseñado hoy', () => {
  const avisos = avisosDe_([item()]);
  const base = { activos: true, avisos, ultimoDia: null, hoy: '2026-10-19' };
  assert.equal(tocaAvisar(base), true);
  assert.equal(tocaAvisar({ ...base, ultimoDia: '2026-10-18' }), true, 'ayer no cuenta');
  assert.equal(tocaAvisar({ ...base, ultimoDia: '2026-10-19' }), false, 'una vez al día');
  assert.equal(tocaAvisar({ ...base, activos: false }), false, 'apagado en Ajustes');
  assert.equal(tocaAvisar({ ...base, avisos: [] }), false, 'si no hay nada urgente, no hay aviso');
});

test('preguntaDeReceta: la pregunta con el nombre tal cual', () => {
  assert.equal(preguntaDeReceta('Leche entera'), '¿Qué receta puedo hacer con Leche entera?');
});
