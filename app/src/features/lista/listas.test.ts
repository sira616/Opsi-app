import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Lista } from '@/api/lista';

import { cabeAlguna, cabeOtra, cupoDe, describirLista, listaPorDefecto, listasDeLaNevera } from './listas.ts';

const YO = 'yo';
const CASA = 'casa';
const PISO = 'piso';

let n = 0;
function lista(kind: 'personal' | 'shared', nombre: string, extra: Partial<Lista> = {}): Lista {
  n += 1;
  return {
    id: `l${n}`,
    name: nombre,
    kind,
    household_id: kind === 'personal' ? null : CASA,
    created_at: `2026-10-${String(10 + n).padStart(2, '0')}T10:00:00Z`,
    created_by: YO,
    ...extra,
  };
}

test('al mirar una nevera salen las individuales y solo las compartidas de ESA nevera', () => {
  const mia = lista('personal', 'La compra');
  const casa = lista('shared', 'De casa', { household_id: CASA });
  const piso = lista('shared', 'Del piso', { household_id: PISO });
  const otraMia = lista('personal', 'Cumple');

  assert.deepEqual(
    listasDeLaNevera([piso, casa, otraMia, mia], CASA).map((l) => l.name),
    ['La compra', 'Cumple', 'De casa'],
  );
  assert.deepEqual(
    listasDeLaNevera([piso, casa, otraMia, mia], PISO).map((l) => l.name),
    ['La compra', 'Cumple', 'Del piso'],
  );
});

test('las individuales van primero, la más antigua delante, aunque lleguen desordenadas', () => {
  const vieja = lista('personal', 'Vieja', { created_at: '2026-01-01T00:00:00Z' });
  const nueva = lista('personal', 'Nueva', { created_at: '2026-09-01T00:00:00Z' });
  assert.deepEqual(
    listasDeLaNevera([nueva, vieja], CASA).map((l) => l.name),
    ['Vieja', 'Nueva'],
  );
});

test('sin nevera elegida se apunta en la individual; con una nevera compartida con lista, en esa', () => {
  const mia = lista('personal', 'La compra');
  const casa = lista('shared', 'De casa', { household_id: CASA });
  assert.equal(listaPorDefecto([casa, mia], null)?.name, 'La compra');
  assert.equal(listaPorDefecto([casa, mia], CASA)?.name, 'De casa');
  // Una nevera sin lista compartida cae en la individual.
  assert.equal(listaPorDefecto([casa, mia], PISO)?.name, 'La compra');
  assert.equal(listaPorDefecto([], CASA), undefined);
});

test('el cupo cuenta las individuales y solo las compartidas que creó la persona', () => {
  const todas = [
    lista('personal', 'La compra'),
    lista('shared', 'Mía', { created_by: YO }),
    lista('shared', 'De otra persona', { created_by: 'otra' }),
  ];
  assert.deepEqual(cupoDe(todas, YO), { individuales: 1, compartidas: 1 });
  // Sin saber quién es, ninguna compartida cuenta: el servidor decide.
  assert.deepEqual(cupoDe(todas, null), { individuales: 1, compartidas: 0 });
});

test('plan básico: una compartida y una individual, con el mensaje del servidor', () => {
  assert.deepEqual(cabeOtra('basic', 'shared', { compartidas: 0, individuales: 1 }), { cabe: true });
  assert.deepEqual(cabeOtra('basic', 'personal', { compartidas: 1, individuales: 0 }), { cabe: true });

  const compartida = cabeOtra('basic', 'shared', { compartidas: 1, individuales: 1 });
  assert.equal(compartida.cabe, false);
  assert.match((compartida as { motivo: string }).motivo, /1 lista compartida/);
  assert.equal((compartida as { conPremium: boolean }).conPremium, true);

  const individual = cabeOtra('basic', 'personal', { compartidas: 0, individuales: 1 });
  assert.equal(individual.cabe, false);
  assert.match((individual as { motivo: string }).motivo, /1 lista individual/);
});

test('plan básico: llenar un tipo no cierra el otro', () => {
  const cupo = { compartidas: 1, individuales: 0 };
  assert.equal(cabeOtra('basic', 'shared', cupo).cabe, false);
  assert.equal(cabeOtra('basic', 'personal', cupo).cabe, true);
  assert.equal(cabeAlguna('basic', cupo), true);
  assert.equal(cabeAlguna('basic', { compartidas: 1, individuales: 1 }), false);
});

test('premium: cinco en total, de cualquier tipo, y sin ofrecer Premium cuando ya se tiene', () => {
  assert.deepEqual(cabeOtra('premium', 'shared', { compartidas: 4, individuales: 0 }), { cabe: true });
  assert.deepEqual(cabeOtra('premium', 'personal', { compartidas: 0, individuales: 4 }), { cabe: true });

  for (const tipo of ['shared', 'personal'] as const) {
    const lleno = cabeOtra('premium', tipo, { compartidas: 2, individuales: 3 });
    assert.equal(lleno.cabe, false, tipo);
    assert.match((lleno as { motivo: string }).motivo, /máximo de 5 listas/);
    assert.equal((lleno as { conPremium: boolean }).conPremium, false);
  }
  assert.equal(cabeAlguna('premium', { compartidas: 2, individuales: 3 }), false);
});

test('se dice de qué tipo es cada lista', () => {
  const neveras = [
    { id: CASA, name: 'Casa' },
    { id: PISO, name: 'Piso' },
  ];
  assert.equal(describirLista({ kind: 'personal', household_id: null }, neveras), 'Individual');
  assert.equal(describirLista({ kind: 'shared', household_id: PISO }, neveras), 'Compartida · Piso');
  // Una nevera de la que ya no se es miembro no se nombra: no se inventa.
  assert.equal(describirLista({ kind: 'shared', household_id: 'otra' }, neveras), 'Compartida');
});
