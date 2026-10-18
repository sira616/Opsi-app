import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  acotar,
  diasEntre,
  distancia,
  esFechaIso,
  etiquetaFecha,
  fechaHablada,
  hoyIso,
  limites,
  mesDesplazado,
  semanasDelMes,
  sumarDias,
} from './calendario.ts';

test('sumar y restar días cruza meses, años y bisiestos', () => {
  assert.equal(sumarDias('2026-10-24', 1), '2026-10-25');
  assert.equal(sumarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(sumarDias('2026-12-31', 1), '2027-01-01');
  assert.equal(sumarDias('2027-01-01', -1), '2026-12-31');
  assert.equal(sumarDias('2028-02-28', 1), '2028-02-29');
  assert.equal(sumarDias('2027-02-28', 1), '2027-03-01');
  assert.equal(sumarDias('2026-10-24', 0), '2026-10-24');
});

test('el cambio de hora no mueve un día: se cuenta en calendario', () => {
  // 29 de marzo de 2026 es el día en que en España se adelanta la hora.
  assert.equal(sumarDias('2026-03-28', 1), '2026-03-29');
  assert.equal(sumarDias('2026-03-29', 1), '2026-03-30');
  assert.equal(diasEntre('2026-03-28', '2026-03-30'), 2);
  assert.equal(diasEntre('2026-10-24', '2026-10-24'), 0);
  assert.equal(diasEntre('2026-10-24', '2026-10-17'), -7);
});

test('hoy sale del calendario local, con ceros a la izquierda', () => {
  assert.equal(hoyIso(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.equal(hoyIso(new Date(2026, 11, 31, 0, 1)), '2026-12-31');
});

test('los límites son de hace un año a dentro de cinco, y acotar los respeta', () => {
  const { min, max } = limites('2026-10-18');
  assert.equal(min, '2025-10-17');
  assert.equal(max, '2031-10-17');
  assert.equal(acotar('2020-01-01', '2026-10-18'), min);
  assert.equal(acotar('2099-01-01', '2026-10-18'), max);
  assert.equal(acotar('2026-12-25', '2026-10-18'), '2026-12-25');
});

test('solo se aceptan fechas ISO que existan', () => {
  assert.equal(esFechaIso('2026-10-24'), true);
  assert.equal(esFechaIso('2028-02-29'), true);
  for (const mala of ['2026-02-31', '2027-02-29', '2026-13-01', '24/10/2026', '2026-1-1', '', null, 20261024]) {
    assert.equal(esFechaIso(mala), false, String(mala));
  }
});

test('cambiar de mes pasa de diciembre a enero y al revés', () => {
  assert.deepEqual(mesDesplazado(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(mesDesplazado(2026, 1, -1), { y: 2025, m: 12 });
  assert.deepEqual(mesDesplazado(2026, 10, 0), { y: 2026, m: 10 });
  assert.deepEqual(mesDesplazado(2026, 10, 15), { y: 2028, m: 1 });
});

test('un mes se pinta en seis semanas que empiezan en lunes', () => {
  // Octubre de 2026 empieza en jueves: tres huecos (lunes, martes, miércoles).
  const semanas = semanasDelMes(2026, 10);
  assert.equal(semanas.length, 6);
  assert.ok(semanas.every((s) => s.length === 7));
  assert.deepEqual(semanas[0].slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(semanas[0][6], '2026-10-04'); // domingo
  assert.equal(semanas[4][5], '2026-10-31'); // sábado
  const dias = semanas.flat().filter(Boolean);
  assert.equal(dias.length, 31);
  assert.equal(new Set(dias).size, 31);
});

test('un mes que empieza en lunes no deja hueco, y febrero bisiesto tiene 29', () => {
  // Junio de 2026 empieza en lunes.
  assert.equal(semanasDelMes(2026, 6)[0][0], '2026-06-01');
  assert.equal(semanasDelMes(2028, 2).flat().filter(Boolean).length, 29);
  assert.equal(semanasDelMes(2027, 2).flat().filter(Boolean).length, 28);
  // Un mes que empieza en domingo deja seis huecos.
  const febrero2026 = semanasDelMes(2026, 2);
  assert.equal(febrero2026[0].filter((c) => c === null).length, 6);
  assert.equal(febrero2026[0][6], '2026-02-01');
});

test('las etiquetas son siempre las mismas, en español', () => {
  assert.equal(etiquetaFecha('2026-10-24'), 'sáb 24 oct 2026');
  assert.equal(etiquetaFecha('2026-10-18'), 'dom 18 oct 2026');
  assert.equal(fechaHablada('2026-10-24'), '24 de octubre de 2026');
  assert.equal(fechaHablada('2027-01-01'), '1 de enero de 2027');
});

test('la distancia se dice como se diría', () => {
  const hoy = '2026-10-18';
  assert.equal(distancia('2026-10-18', hoy), 'Hoy');
  assert.equal(distancia('2026-10-19', hoy), 'Mañana');
  assert.equal(distancia('2026-10-17', hoy), 'Ayer');
  assert.equal(distancia('2026-10-25', hoy), 'Dentro de 7 días');
  assert.equal(distancia('2026-10-08', hoy), 'Hace 10 días');
});
