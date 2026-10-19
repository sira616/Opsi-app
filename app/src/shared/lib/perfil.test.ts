import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ALIMENTOS,
  DIETAS,
  MAX_LONGITUD_OTRO,
  MAX_OTROS,
  NIVELES_ACTIVIDAD,
  PERFIL_VACIO,
  VERSION_AVISO_PERFIL,
  alternarDisgusto,
  alternarGusto,
  conProductoAnadido,
  consentimientoPerfilVigente,
  leerConsentimientoPerfil,
  leerPerfil,
  limpiarProducto,
  perfilEfectivo,
  respuestasDelPerfil,
  resumenDelPerfil,
} from './perfil.ts';
import type { Perfil } from './perfil.ts';

const EN = '2026-10-19T10:00:00.000Z';
const perfil = (cambios: Partial<Perfil> = {}): Perfil => ({ ...PERFIL_VACIO, ...cambios });

// ── Los vocabularios ──────────────────────────────────────────────────────

test('los vocabularios son los del servidor: mismos números y sin repetidos', () => {
  assert.equal(NIVELES_ACTIVIDAD.length, 5);
  assert.equal(DIETAS.length, 5);
  assert.equal(ALIMENTOS.length, 26);
  for (const lista of [NIVELES_ACTIVIDAD, DIETAS, ALIMENTOS]) {
    const claves = lista.map((x) => x.clave);
    assert.equal(new Set(claves).size, claves.length);
    for (const x of lista) assert.ok(x.etiqueta.length > 0);
  }
});

test('no hay opciones religiosas en la dieta (a propósito)', () => {
  const claves: string[] = DIETAS.map((d) => d.clave);
  assert.ok(!claves.includes('halal') && !claves.includes('kosher'));
});

// ── Productos concretos ───────────────────────────────────────────────────

test('limpiarProducto: un nombre normal pasa, recortado y con los espacios apretados', () => {
  assert.deepEqual(limpiarProducto('  Queso   de  cabra '), { ok: true, valor: 'Queso de cabra' });
  assert.deepEqual(limpiarProducto('Piña'), { ok: true, valor: 'Piña' });
  assert.deepEqual(limpiarProducto('ñoquis'), { ok: true, valor: 'ñoquis' });
  assert.deepEqual(limpiarProducto('Coca-Cola'), { ok: true, valor: 'Coca-Cola' });
});

test('limpiarProducto: vacío no es un error, es nada que añadir', () => {
  assert.deepEqual(limpiarProducto(''), { ok: true, valor: '' });
  assert.deepEqual(limpiarProducto('   \n\t '), { ok: true, valor: '' });
});

test('limpiarProducto: de 2 a 40 caracteres', () => {
  assert.equal(limpiarProducto('x').ok, false);
  assert.equal(limpiarProducto('xy').ok, true);
  assert.equal(limpiarProducto('a'.repeat(MAX_LONGITUD_OTRO)).ok, true);
  assert.equal(limpiarProducto('a'.repeat(MAX_LONGITUD_OTRO + 1)).ok, false);
});

test('limpiarProducto: cuenta caracteres de verdad (un emoji es uno), no unidades UTF-16', () => {
  assert.equal(limpiarProducto('🍍🍍').ok, true);
  assert.equal(limpiarProducto('🍍'.repeat(MAX_LONGITUD_OTRO)).ok, true);
  assert.equal(limpiarProducto('🍍'.repeat(MAX_LONGITUD_OTRO + 1)).ok, false);
});

test('limpiarProducto: rechaza el marcado, las llaves, las comillas inversas, \\ | $', () => {
  for (const malo of ['<b>x</b>', 'a{{b}}', 'a[0]', 'a`ls`', 'a\\b', 'a|b', 'a$b']) {
    assert.equal(limpiarProducto(malo).ok, false, malo);
  }
});

test('limpiarProducto: rechaza control, formato (dirección, ancho cero) y «etiquetas» U+E0000', () => {
  const casos = [
    `co${String.fromCodePoint(7)}li`, // control
    `co${String.fromCodePoint(0x202e)}li`, // inversión de dirección
    `co${String.fromCodePoint(0x200b)}li`, // ancho cero
    `co${String.fromCodePoint(0x2066)}li`, // aislamiento
    `co${String.fromCodePoint(0xfeff)}li`, // BOM
    `co${String.fromCodePoint(0xad)}li`, // guion blando
    `co${String.fromCodePoint(0xe0001)}li`, // etiqueta
    `co${String.fromCodePoint(0x85)}li`, // control C1
  ];
  for (const c of casos) assert.equal(limpiarProducto(c).ok, false, JSON.stringify(c));
});

test('conProductoAnadido: sin repetir (sin distinguir mayúsculas), con tope y sin añadir lo inválido', () => {
  assert.deepEqual(conProductoAnadido([], 'Coliflor'), ['Coliflor']);
  assert.deepEqual(conProductoAnadido(['Coliflor'], 'coliflor'), ['Coliflor'], 'ya estaba: no cambia');
  assert.equal(conProductoAnadido([], '<b>'), null, 'inválido');
  assert.equal(conProductoAnadido([], '   '), null, 'vacío');
  const llena = Array.from({ length: MAX_OTROS }, (_, i) => `producto ${i}`);
  assert.equal(conProductoAnadido(llena, 'uno más'), null, 'con el tope no cabe otro');
  assert.deepEqual(conProductoAnadido(llena, 'PRODUCTO 3'), llena, 'pero uno que ya está no es un error');
});

// ── Gustos y disgustos ────────────────────────────────────────────────────

test('alternarGusto: marca, desmarca, y sacarlo de «no me gusta» si estaba allí', () => {
  const p = perfil({ disgustos: ['onion'] });
  assert.deepEqual(alternarGusto(p, 'rice'), { gustos: ['rice'], disgustos: ['onion'] });
  assert.deepEqual(alternarGusto(perfil({ gustos: ['rice'] }), 'rice'), { gustos: [], disgustos: [] });
  assert.deepEqual(alternarGusto(p, 'onion'), { gustos: ['onion'], disgustos: [] }, 'no puede gustar y no gustar');
});

test('alternarDisgusto: lo mismo al revés', () => {
  const p = perfil({ gustos: ['fish'] });
  assert.deepEqual(alternarDisgusto(p, 'onion'), { gustos: ['fish'], disgustos: ['onion'] });
  assert.deepEqual(alternarDisgusto(p, 'fish'), { gustos: [], disgustos: ['fish'] });
  assert.deepEqual(alternarDisgusto(perfil({ disgustos: ['onion'] }), 'onion'), { gustos: [], disgustos: [] });
});

test('las listas salen en el orden del vocabulario, no en el de los toques', () => {
  const a = alternarGusto(alternarGusto(perfil(), 'rice') && perfil({ gustos: ['rice'] }), 'vegetables');
  assert.deepEqual(a.gustos, ['vegetables', 'rice']);
});

// ── Leer lo que llega ─────────────────────────────────────────────────────

test('leerPerfil: sin fila o con basura, el perfil vacío', () => {
  assert.deepEqual(leerPerfil(null), PERFIL_VACIO);
  assert.deepEqual(leerPerfil(undefined), PERFIL_VACIO);
  assert.deepEqual(leerPerfil('hola'), PERFIL_VACIO);
  assert.deepEqual(leerPerfil(42), PERFIL_VACIO);
  assert.deepEqual(leerPerfil({}), PERFIL_VACIO);
});

test('leerPerfil: una fila buena se lee tal cual', () => {
  const p = leerPerfil({
    activity_level: 'moderate',
    diet: 'vegetarian',
    likes: ['rice', 'pasta'],
    dislikes: ['cilantro'],
    dislikes_custom: ['Coliflor', 'Nutella'],
  });
  assert.deepEqual(p, {
    actividad: 'moderate',
    dieta: 'vegetarian',
    gustos: ['pasta', 'rice'],
    disgustos: ['cilantro'],
    otros: ['Coliflor', 'Nutella'],
  });
});

test('leerPerfil: lo que no está en las listas cerradas se tira', () => {
  const p = leerPerfil({
    activity_level: 'extreme',
    diet: 'halal',
    likes: ['rice', 'pizza', 7, null, {}],
    dislikes: 'onion',
    dislikes_custom: 'coliflor',
  });
  assert.deepEqual(p, { ...PERFIL_VACIO, gustos: ['rice'] });
});

test('leerPerfil: un producto concreto que no pasa la limpieza se descarta, y los repetidos se juntan', () => {
  const p = leerPerfil({ dislikes_custom: ['Coliflor', 'coliflor ', '<b>x</b>', 'x', 5, null, '  ', 'Hígado'] });
  assert.deepEqual(p.otros, ['Coliflor', 'Hígado']);
});

test('leerPerfil: no pasa de MAX_OTROS productos', () => {
  const muchos = Array.from({ length: 30 }, (_, i) => `producto ${i}`);
  assert.equal(leerPerfil({ dislikes_custom: muchos }).otros.length, MAX_OTROS);
});

test('leerPerfil: si algo viniera en las dos listas, gana «no me gusta»', () => {
  const p = leerPerfil({ likes: ['fish', 'rice'], dislikes: ['fish'] });
  assert.deepEqual(p.gustos, ['rice']);
  assert.deepEqual(p.disgustos, ['fish']);
});

test('leerPerfil: no se deja engañar por un prototipo heredado ni por listas enormes', () => {
  const con = Object.create({ activity_level: 'active', diet: 'vegan' });
  assert.equal(leerPerfil(con).actividad, 'active', 'un objeto con prototipo es un objeto: se lee como los demás');
  const enorme = Array.from({ length: 5000 }, () => 'rice');
  assert.deepEqual(leerPerfil({ likes: enorme }).gustos, ['rice']);
});

// ── El permiso ────────────────────────────────────────────────────────────

test('leerConsentimientoPerfil: solo una versión entera positiva y una fecha de verdad cuentan', () => {
  assert.deepEqual(leerConsentimientoPerfil(1, EN), { version: 1, en: EN });
  for (const [v, e] of [[null, null], [null, EN], [1, null], [0, EN], [-1, EN], [1.5, EN], ['1', EN], [1, 'ayer'], [1, 20261019]]) {
    assert.equal(leerConsentimientoPerfil(v, e), null, JSON.stringify([v, e]));
  }
});

test('consentimientoPerfilVigente: hace falta haber aceptado la versión actual o una posterior', () => {
  const v1 = { version: 1, en: EN };
  assert.equal(consentimientoPerfilVigente(null), false);
  assert.equal(consentimientoPerfilVigente(v1, 1), true);
  assert.equal(consentimientoPerfilVigente(v1, 2), false);
  assert.equal(consentimientoPerfilVigente({ version: 2, en: EN }, 1), true);
  assert.equal(consentimientoPerfilVigente(v1), v1.version >= VERSION_AVISO_PERFIL);
});

test('perfilEfectivo: sin permiso vigente no se usa NADA del perfil guardado', () => {
  const guardado = { perfil: perfil({ dieta: 'vegan', gustos: ['rice'] }), consentimiento: { version: 1, en: EN } };
  assert.deepEqual(perfilEfectivo(guardado, 1), guardado.perfil);
  assert.deepEqual(perfilEfectivo({ ...guardado, consentimiento: null }, 1), PERFIL_VACIO);
  assert.deepEqual(perfilEfectivo(guardado, 2), PERFIL_VACIO, 'el aviso cambió: hay que aceptarlo de nuevo');
});

// ── Resumen ───────────────────────────────────────────────────────────────

test('respuestasDelPerfil: cada campo relleno y cada alimento cuenta uno', () => {
  assert.equal(respuestasDelPerfil(PERFIL_VACIO), 0);
  assert.equal(respuestasDelPerfil(perfil({ actividad: 'light', dieta: 'vegan', gustos: ['rice', 'pasta'], disgustos: ['onion'], otros: ['x1', 'y2'] })), 7);
});

test('resumenDelPerfil: sin permiso invita, con permiso y vacío lo dice, y con respuestas las cuenta', () => {
  const v1 = { version: 1, en: EN };
  assert.equal(resumenDelPerfil({ perfil: PERFIL_VACIO, consentimiento: null }), 'Opcional: ejercicio, dieta y gustos');
  assert.equal(resumenDelPerfil({ perfil: PERFIL_VACIO, consentimiento: v1 }), 'Sin rellenar');
  assert.equal(resumenDelPerfil({ perfil: perfil({ dieta: 'vegan' }), consentimiento: v1 }), '1 respuesta');
  assert.equal(resumenDelPerfil({ perfil: perfil({ dieta: 'vegan', gustos: ['rice'] }), consentimiento: v1 }), '2 respuestas');
});
