import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_LONGITUD_MENSAJE,
  MAX_MENSAJES_ENVIADOS,
  SUGERENCIAS,
  avisoDeLimite,
  borradorDeRuta,
  paraEnviar,
  puedeEnviar,
} from './mensajes.ts';

test('paraEnviar: sin ids, recortado y con los últimos mensajes', () => {
  const muchos = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    de: i % 2 === 0 ? ('persona' as const) : ('opsi' as const),
    texto: ` m${i} `,
  }));
  const r = paraEnviar(muchos);
  assert.equal(r.length, MAX_MENSAJES_ENVIADOS);
  assert.deepEqual(r[r.length - 1], { de: 'opsi', texto: 'm29' });
  assert.deepEqual(Object.keys(r[0]).sort(), ['de', 'texto']);
  assert.equal(paraEnviar([{ id: '1', de: 'persona', texto: 'x'.repeat(900) }])[0].texto.length, MAX_LONGITUD_MENSAJE);
});

test('borradorDeRuta: un texto normal pasa tal cual', () => {
  assert.equal(borradorDeRuta('¿Qué receta hago con el yogur?'), '¿Qué receta hago con el yogur?');
});

test('borradorDeRuta: lo que no es texto, o no viene, es un borrador vacío', () => {
  assert.equal(borradorDeRuta(undefined), '');
  assert.equal(borradorDeRuta(null), '');
  assert.equal(borradorDeRuta(42), '');
  assert.equal(borradorDeRuta({ mensaje: 'hola' }), '');
  assert.equal(borradorDeRuta(''), '');
});

test('borradorDeRuta: un parámetro repetido (?mensaje=a&mensaje=b) usa el primero', () => {
  assert.equal(borradorDeRuta(['uno', 'dos']), 'uno');
  assert.equal(borradorDeRuta([]), '');
});

test('borradorDeRuta: espacios y saltos de línea cuentan como un espacio, y se aprietan', () => {
  assert.equal(borradorDeRuta('  hola\n\n  qué\ttal  '), 'hola qué tal');
});

test('borradorDeRuta: quita los caracteres de control', () => {
  assert.equal(borradorDeRuta('a\u0000b\u0007c\u001bd\u007fe\u0085f'), 'abcdef');
});

test('borradorDeRuta: quita los caracteres de formato que cambian cómo se lee (dirección, ancho cero)', () => {
  const dirección = String.fromCodePoint(0x202e); // inversión de dirección
  const anchoCero = String.fromCodePoint(0x200b);
  const aislamiento = String.fromCodePoint(0x2066);
  const bom = String.fromCodePoint(0xfeff);
  assert.equal(borradorDeRuta(`ho${anchoCero}la ${dirección}mundo${aislamiento}${bom}`), 'hola mundo');
});

test('borradorDeRuta: respeta los acentos, la ñ y los emojis', () => {
  assert.equal(borradorDeRuta('¿Qué ceno, con piña? 🍍'), '¿Qué ceno, con piña? 🍍');
});

test('borradorDeRuta: corta a la longitud máxima', () => {
  const largo = 'a'.repeat(MAX_LONGITUD_MENSAJE + 100);
  assert.equal(borradorDeRuta(largo).length, MAX_LONGITUD_MENSAJE);
});

test('borradorDeRuta: no interpreta nada: el marcado y las rutas son texto', () => {
  assert.equal(borradorDeRuta('<script>alert(1)</script>'), '<script>alert(1)</script>');
  assert.equal(borradorDeRuta('opsi://alta?nombre=x'), 'opsi://alta?nombre=x');
});

test('puedeEnviar: hace falta algo escrito, y no pasarse', () => {
  assert.equal(puedeEnviar(''), false);
  assert.equal(puedeEnviar('   \n '), false);
  assert.equal(puedeEnviar('hola'), true);
  assert.equal(puedeEnviar('a'.repeat(MAX_LONGITUD_MENSAJE)), true);
  assert.equal(puedeEnviar('a'.repeat(MAX_LONGITUD_MENSAJE + 1)), false);
});

test('las sugerencias son frases cortas y se pueden mandar', () => {
  assert.ok(SUGERENCIAS.length >= 3);
  for (const s of SUGERENCIAS) {
    assert.ok(puedeEnviar(s), s);
    assert.ok(s.split(' ').length <= 8, `corta: ${s}`);
  }
});

test('avisoDeLimite: dice cuánto falta, redondeando hacia arriba, y qué hacer', () => {
  assert.equal(avisoDeLimite(30), 'Has llegado al límite de mensajes. Prueba otra vez en menos de un minuto.');
  assert.equal(avisoDeLimite(60), 'Has llegado al límite de mensajes. Prueba otra vez en un minuto.');
  assert.equal(avisoDeLimite(61), 'Has llegado al límite de mensajes. Prueba otra vez en 2 minutos.');
  assert.equal(avisoDeLimite(125), 'Has llegado al límite de mensajes. Prueba otra vez en 3 minutos.');
  assert.equal(avisoDeLimite(3599), 'Has llegado al límite de mensajes. Prueba otra vez en una hora.');
  assert.equal(avisoDeLimite(7300), 'Has llegado al límite de mensajes. Prueba otra vez en 3 horas.');
});

test('avisoDeLimite: sin dato de cuánto falta, un minuto (nunca NaN ni 0)', () => {
  for (const raro of [0, -5, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
    assert.match(avisoDeLimite(raro), /en un minuto\.$/, String(raro));
  }
});
