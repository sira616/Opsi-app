import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AVISO_INCOMPLETO,
  GRADOS_NUTRISCORE,
  LICENCIA_ODBL,
  MAX_IDS_POR_LLAMADA,
  NOMBRES_NOVA,
  ORIGEN_LISTA,
  ORIGEN_NOVA,
  ORIGEN_NUTRISCORE,
  SIN_DATO,
  SIN_DATOS,
  SIN_DATOS_DE_NUTRICION,
  SIN_SELLOS,
  agruparNutricion,
  coincideConBusqueda,
  contarAditivos,
  etiquetaBase,
  etiquetaNova,
  etiquetaNutriScore,
  filasNutricionales,
  formatearEnergia,
  formatearGramos,
  hayDatos,
  hayNutrientes,
  idDeProducto,
  leerNutricion,
  nombreNova,
  normalizarBusqueda,
  resumenNutricion,
  textoAditivos,
  textoNivel,
  textoRacion,
  trocearIds,
} from './nutricion.ts';
import type { Nutricion } from './nutricion.ts';

/** Una fila de `nutrition_of_products` completa, con valores de relleno. */
function fila(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    product_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    nutrition_data_at: '2026-10-19T10:00:00Z',
    nutriscore_grade: 'c',
    nova_group: 4,
    basis: 'g',
    energy_kcal: 245,
    fat: 12.5,
    saturated_fat: 5,
    carbohydrates: 30,
    sugars: 12.25,
    fiber: 2,
    proteins: 6.5,
    salt: 1.2,
    fat_level: 'moderate',
    saturated_fat_level: 'high',
    sugars_level: 'high',
    salt_level: 'low',
    serving_size: '30 g',
    additives_tags: ['en:e330', 'en:e150d'],
    ...cambios,
  };
}

/** Una fila en la que OFF se consultó y no declara nada. */
function filaVacia(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    product_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    nutrition_data_at: '2026-10-19T10:00:00Z',
    nutriscore_grade: null,
    nova_group: null,
    basis: null,
    energy_kcal: null,
    fat: null,
    saturated_fat: null,
    carbohydrates: null,
    sugars: null,
    fiber: null,
    proteins: null,
    salt: null,
    fat_level: null,
    saturated_fat_level: null,
    sugars_level: null,
    salt_level: null,
    serving_size: null,
    additives_tags: null,
    ...cambios,
  };
}

const NUMEROS: readonly [string, keyof Nutricion][] = [
  ['energy_kcal', 'energiaKcal'],
  ['fat', 'grasas'],
  ['saturated_fat', 'saturadas'],
  ['carbohydrates', 'hidratos'],
  ['sugars', 'azucares'],
  ['fiber', 'fibra'],
  ['proteins', 'proteinas'],
  ['salt', 'sal'],
];

// ── leerNutricion: una fila buena ─────────────────────────────────────────

test('una fila completa se lee entera', () => {
  const n = leerNutricion(fila());
  assert.deepEqual(n, {
    nutriscore: 'c',
    nova: 4,
    base: 'g',
    energiaKcal: 245,
    grasas: 12.5,
    saturadas: 5,
    hidratos: 30,
    azucares: 12.25,
    fibra: 2,
    proteinas: 6.5,
    sal: 1.2,
    nivelGrasas: 'moderate',
    nivelSaturadas: 'high',
    nivelAzucares: 'high',
    nivelSal: 'low',
    racion: '30 g',
    aditivos: ['E330', 'E150D'],
  });
});

test('una fila vacía (OFF se consultó y no declara nada) se lee como todo null, y no tiene datos', () => {
  const n = leerNutricion(filaVacia());
  assert.deepEqual(n, SIN_DATOS_DE_NUTRICION);
  assert.equal(hayDatos(n), false);
  assert.equal(hayNutrientes(n), false);
});

test('el resultado está congelado y la constante de «sin datos» no se puede cambiar', () => {
  assert.ok(Object.isFrozen(leerNutricion(fila())));
  assert.ok(Object.isFrozen(SIN_DATOS_DE_NUTRICION));
  assert.throws(() => {
    (SIN_DATOS_DE_NUTRICION as { nutriscore: string | null }).nutriscore = 'a';
  }, TypeError);
});

// ── null no es cero ───────────────────────────────────────────────────────

test('un null suelto sigue siendo null: NUNCA se vuelve 0', () => {
  for (const [columna, campo] of NUMEROS) {
    const n = leerNutricion(fila({ [columna]: null }));
    assert.equal(n[campo], null, columna);
  }
  // Y ausente (una clave que no viene) tampoco.
  const sinClave = fila();
  delete sinClave.fiber;
  assert.equal(leerNutricion(sinClave).fibra, null);
});

test('un 0 de verdad sigue siendo 0: OFF declara cero', () => {
  for (const [columna, campo] of NUMEROS) {
    const n = leerNutricion(fila({ [columna]: 0 }));
    assert.equal(n[campo], 0, columna);
    assert.equal(Object.is(n[campo], 0), true, `${columna} no es -0`);
  }
});

test('-0 se normaliza a 0', () => {
  assert.equal(Object.is(leerNutricion(fila({ fat: -0 })).grasas, 0), true);
});

test('null y 0 se pintan distinto: «—» y «0 g»', () => {
  assert.equal(formatearGramos(null), '—');
  assert.equal(formatearGramos(0), '0 g');
  assert.equal(formatearEnergia(null), '—');
  assert.equal(formatearEnergia(0), '0 kcal');
  assert.notEqual(formatearGramos(null), formatearGramos(0));
});

test('una ficha con un 0 declarado SÍ tiene datos; una con todo null, no', () => {
  assert.equal(hayDatos(leerNutricion(filaVacia({ sugars: 0 }))), true);
  assert.equal(hayNutrientes(leerNutricion(filaVacia({ sugars: 0 }))), true);
  assert.equal(hayDatos(leerNutricion(filaVacia())), false);
});

// ── Rangos ────────────────────────────────────────────────────────────────

test('la energía llega a 950 y ni un poco más', () => {
  assert.equal(leerNutricion(fila({ energy_kcal: 950 })).energiaKcal, 950);
  assert.equal(leerNutricion(fila({ energy_kcal: 950.01 })).energiaKcal, null);
  assert.equal(leerNutricion(fila({ energy_kcal: 951 })).energiaKcal, null);
  assert.equal(leerNutricion(fila({ energy_kcal: 100000 })).energiaKcal, null);
  assert.equal(leerNutricion(fila({ energy_kcal: -1 })).energiaKcal, null);
});

test('el resto de nutrientes llega a 100 y ni un poco más', () => {
  for (const [columna, campo] of NUMEROS.slice(1)) {
    assert.equal(leerNutricion(fila({ [columna]: 100 }))[campo], 100, columna);
    assert.equal(leerNutricion(fila({ [columna]: 100.01 }))[campo], null, columna);
    assert.equal(leerNutricion(fila({ [columna]: 150 }))[campo], null, columna);
    assert.equal(leerNutricion(fila({ [columna]: -0.01 }))[campo], null, columna);
  }
});

test('un valor fuera de rango no arrastra a los demás ni se queda en el límite', () => {
  const n = leerNutricion(fila({ fat: 150, proteins: 8 }));
  assert.equal(n.grasas, null);
  assert.equal(n.proteinas, 8);
});

test('NaN, Infinity, textos, objetos, listas y booleanos no son un número', () => {
  const malos: unknown[] = [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    '12',
    '12.5',
    '',
    'NaN',
    ' ',
    true,
    false,
    {},
    { valueOf: () => 5 },
    [],
    [5],
    undefined,
    () => 5,
    10n,
  ];
  for (const malo of malos) {
    for (const [columna, campo] of NUMEROS) {
      const n = leerNutricion(fila({ [columna]: malo }));
      assert.equal(n[campo], null, `${columna} con ${String(malo)}`);
    }
  }
});

// ── Nutri-Score ───────────────────────────────────────────────────────────

test('el Nutri-Score solo admite a, b, c, d y e en minúscula', () => {
  for (const g of GRADOS_NUTRISCORE) assert.equal(leerNutricion(fila({ nutriscore_grade: g })).nutriscore, g);
  const malos: unknown[] = ['A', 'E', 'f', 'z', '', ' a', 'a ', 'ab', 'unknown', 'not-applicable', 1, 0, null, undefined, {}, ['a'], true];
  for (const malo of malos) {
    assert.equal(leerNutricion(fila({ nutriscore_grade: malo })).nutriscore, null, String(malo));
  }
});

// ── NOVA ──────────────────────────────────────────────────────────────────

test('NOVA solo admite el entero 1, 2, 3 o 4', () => {
  for (const g of [1, 2, 3, 4]) assert.equal(leerNutricion(fila({ nova_group: g })).nova, g);
  const malos: unknown[] = [0, 5, -1, 2.5, 1.0000001, '3', '', null, undefined, Number.NaN, Infinity, {}, [3], true];
  for (const malo of malos) {
    assert.equal(leerNutricion(fila({ nova_group: malo })).nova, null, String(malo));
  }
});

test('los nombres de los cuatro grupos NOVA son los de su clasificación, sin un adjetivo más', () => {
  assert.equal(nombreNova(1), 'Sin procesar o mínimamente procesado');
  assert.equal(nombreNova(2), 'Ingrediente culinario procesado');
  assert.equal(nombreNova(3), 'Procesado');
  assert.equal(nombreNova(4), 'Ultraprocesado');
  assert.deepEqual(Object.keys(NOMBRES_NOVA), ['1', '2', '3', '4']);
  assert.ok(Object.isFrozen(NOMBRES_NOVA));
});

test('nada de lo que se dice de NOVA ni de Nutri-Score opina', () => {
  const todo = [
    ...Object.values(NOMBRES_NOVA),
    ...[1, 2, 3, 4].map((g) => etiquetaNova(g as 1 | 2 | 3 | 4)),
    ...GRADOS_NUTRISCORE.map((g) => etiquetaNutriScore(g)),
    ORIGEN_NOVA,
    ORIGEN_NUTRISCORE,
    ORIGEN_LISTA,
    AVISO_INCOMPLETO,
    LICENCIA_ODBL,
  ].join(' ');
  assert.doesNotMatch(todo, /sano|saludable|bueno|malo|cuidado|recomend|evita|abusa|peligro|sin aditivos/i);
});

// ── Base ──────────────────────────────────────────────────────────────────

test('la base solo es g o ml; cualquier otra cosa es null y la etiqueta no la inventa', () => {
  assert.equal(leerNutricion(fila({ basis: 'g' })).base, 'g');
  assert.equal(leerNutricion(fila({ basis: 'ml' })).base, 'ml');
  for (const malo of ['G', 'kg', 'l', '', 'g ', 1, null, undefined, {}]) {
    assert.equal(leerNutricion(fila({ basis: malo })).base, null, String(malo));
  }
  assert.equal(etiquetaBase('g'), 'Por 100 g');
  assert.equal(etiquetaBase('ml'), 'Por 100 ml');
  assert.equal(etiquetaBase(null), 'Por 100 g o 100 ml');
});

// ── Niveles ───────────────────────────────────────────────────────────────

test('los niveles son de lista cerrada', () => {
  const columnas: [string, keyof Nutricion][] = [
    ['fat_level', 'nivelGrasas'],
    ['saturated_fat_level', 'nivelSaturadas'],
    ['sugars_level', 'nivelAzucares'],
    ['salt_level', 'nivelSal'],
  ];
  for (const [columna, campo] of columnas) {
    for (const nivel of ['low', 'moderate', 'high']) {
      assert.equal(leerNutricion(fila({ [columna]: nivel }))[campo], nivel);
    }
    for (const malo of ['Low', 'HIGH', 'medium', 'bajo', 'alto', '', ' low', 'low ', 'very-high', 1, null, undefined, {}, ['low']]) {
      assert.equal(leerNutricion(fila({ [columna]: malo }))[campo], null, `${columna} ${String(malo)}`);
    }
  }
});

test('los niveles se dicen en español y sin color: bajo, moderado, alto', () => {
  assert.equal(textoNivel('low'), 'bajo');
  assert.equal(textoNivel('moderate'), 'moderado');
  assert.equal(textoNivel('high'), 'alto');
});

// ── Ración ────────────────────────────────────────────────────────────────

test('la ración es un texto de 1 a 60 caracteres', () => {
  assert.equal(leerNutricion(fila({ serving_size: '30 g' })).racion, '30 g');
  assert.equal(leerNutricion(fila({ serving_size: 'x'.repeat(60) })).racion, 'x'.repeat(60));
  assert.equal(leerNutricion(fila({ serving_size: 'x'.repeat(61) })).racion, null);
  assert.equal(leerNutricion(fila({ serving_size: 'x'.repeat(100000) })).racion, null);
  assert.equal(leerNutricion(fila({ serving_size: '' })).racion, null);
  assert.equal(leerNutricion(fila({ serving_size: '   ' })).racion, null);
});

test('la ración se recorta por los extremos, pero solo los espacios', () => {
  assert.equal(leerNutricion(fila({ serving_size: '  2 galletas (25 g) ' })).racion, '2 galletas (25 g)');
});

test('una ración con marcado, control o formato se tira entera', () => {
  const malas = [
    '<b>30 g</b>',
    '30 g >',
    '<script>alert(1)</script>',
    '30\ng',
    '30\tg',
    '\n30 g',
    '30 g\n',
    '30\u0000g',
    '30\u007Fg',
    '30\u0085g',
    '30\u00adg',
    '30\u200bg',
    '30\u200fg',
    '\u202e30 g',
    '30\u2028g',
    '30\u2060g',
    '30\u206fg',
    '\ufeff30 g',
  ];
  for (const mala of malas) assert.equal(leerNutricion(fila({ serving_size: mala })).racion, null, JSON.stringify(mala));
});

test('una ración con caracteres que no se ven y esconden texto (etiquetas, uso privado…) se tira entera', () => {
  const malas = [
    '30؜g', // marca de letra árabe
    '30᠎g', // separador mongol de vocales
    '30￹g', // anotación interlineal
    '30￻g',
    '30g', // uso privado
    '30g',
    '30\u{E0041}g', // bloque de etiquetas: «ASCII smuggling»
    '30\u{E007F}g',
    '30\u{F0000}g', // uso privado suplementario
    '30\u{10FFFF}g',
  ];
  for (const mala of malas) assert.equal(leerNutricion(fila({ serving_size: mala })).racion, null, JSON.stringify(mala));
  // Una pareja sustituta de un carácter normal (un emoji) no se confunde con ellos.
  assert.equal(leerNutricion(fila({ serving_size: '1 pizza \u{1F355}' })).racion, '1 pizza \u{1F355}');
});

test('un texto con comillas, tildes o paréntesis es una ración válida', () => {
  assert.equal(leerNutricion(fila({ serving_size: '1 cucharada (15 ml) «sopera»' })).racion, '1 cucharada (15 ml) «sopera»');
});

test('lo que no es un texto no es una ración', () => {
  for (const malo of [30, 0, null, undefined, {}, ['30 g'], true, { toString: () => '30 g' }]) {
    assert.equal(leerNutricion(fila({ serving_size: malo })).racion, null, String(malo));
  }
});

test('la ración se dice con su etiqueta, o no se dice', () => {
  assert.equal(textoRacion('30 g'), 'Ración: 30 g');
  assert.equal(textoRacion(null), null);
});

// ── Aditivos ──────────────────────────────────────────────────────────────

test('los aditivos se pintan en mayúscula y sin el prefijo', () => {
  const n = leerNutricion(fila({ additives_tags: ['en:e330', 'en:e322', 'en:e150d', 'en:e331iii', 'en:e1520'] }));
  assert.deepEqual(n.aditivos, ['E330', 'E322', 'E150D', 'E331III', 'E1520']);
});

test('una lista vacía es [] y null es null: no son lo mismo', () => {
  assert.deepEqual(leerNutricion(fila({ additives_tags: [] })).aditivos, []);
  assert.equal(leerNutricion(fila({ additives_tags: null })).aditivos, null);
  assert.equal(leerNutricion(fila({ additives_tags: undefined })).aditivos, null);
  assert.notDeepEqual(leerNutricion(fila({ additives_tags: [] })).aditivos, leerNutricion(fila({ additives_tags: null })).aditivos);
});

test('los aditivos repetidos se quitan', () => {
  assert.deepEqual(leerNutricion(fila({ additives_tags: ['en:e330', 'en:e330', 'en:e322'] })).aditivos, ['E330', 'E322']);
});

test('un solo aditivo con mal formato tira la lista ENTERA: no se enseña una lista incompleta como si fuera la de OFF', () => {
  const malos = [
    'e330',
    'EN:E330',
    'en:E330',
    'en:e33',
    'en:e33000',
    'en:e330ABCD',
    'en:e330abcde',
    'en:e330 ',
    ' en:e330',
    'fr:e330',
    'en:e330<b>',
    'en:e330\n',
    'en:x330',
    'en:e',
    '',
    '__proto__',
    'en:e330; drop table',
    'en:e' + '3'.repeat(5000),
  ];
  for (const malo of malos) {
    assert.equal(leerNutricion(fila({ additives_tags: ['en:e330', malo] })).aditivos, null, JSON.stringify(malo).slice(0, 40));
  }
  for (const malo of [330, null, undefined, {}, ['en:e330'], true]) {
    assert.equal(leerNutricion(fila({ additives_tags: ['en:e322', malo] })).aditivos, null, String(malo));
  }
});

test('hasta 60 aditivos; 61 ya no', () => {
  const lista = (n: number) => Array.from({ length: n }, (_, i) => `en:e${String(100 + i)}`);
  assert.equal(leerNutricion(fila({ additives_tags: lista(60) })).aditivos?.length, 60);
  assert.equal(leerNutricion(fila({ additives_tags: lista(61) })).aditivos, null);
  assert.equal(leerNutricion(fila({ additives_tags: lista(100000) })).aditivos, null);
});

test('lo que no es una lista no son aditivos', () => {
  for (const malo of ['en:e330', 'E330', 330, true, {}, { 0: 'en:e330', length: 1 }, new Set(['en:e330'])]) {
    assert.equal(leerNutricion(fila({ additives_tags: malo })).aditivos, null, String(malo));
  }
});

test('una lista con huecos no cuenta: un hueco no es un aditivo', () => {
  assert.equal(leerNutricion(fila({ additives_tags: ['en:e330', , 'en:e322'] })).aditivos, null);
});

test('la lista leída no se puede cambiar', () => {
  const aditivos = leerNutricion(fila({ additives_tags: ['en:e330'] })).aditivos;
  assert.ok(Object.isFrozen(aditivos));
});

test('el texto de los aditivos dice lo que OFF declara, y nunca «sin aditivos»', () => {
  assert.equal(textoAditivos(['E330', 'E322', 'E150D']), 'Open Food Facts declara 3 aditivos: E330, E322, E150D.');
  assert.equal(textoAditivos(['E330']), 'Open Food Facts declara 1 aditivo: E330.');
  assert.equal(textoAditivos([]), 'Open Food Facts no declara aditivos.');
  assert.equal(textoAditivos(null), null);
  assert.doesNotMatch(textoAditivos([]) ?? '', /sin aditivos/i);
});

test('el recuento de aditivos: null si OFF no da la lista, 0 si la da vacía', () => {
  assert.equal(contarAditivos(null), null);
  assert.equal(contarAditivos([]), 0);
  assert.equal(contarAditivos(['E330', 'E322']), 2);
});

test('una lista de aditivos vacía sola no cuenta como un dato nutricional', () => {
  assert.equal(hayDatos(leerNutricion(filaVacia({ additives_tags: [] }))), false);
  assert.equal(hayDatos(leerNutricion(filaVacia({ additives_tags: ['en:e330'] }))), true);
});

// ── Entrada que no es una fila ────────────────────────────────────────────

test('lo que no es una fila da «sin datos» y no lanza', () => {
  for (const malo of [null, undefined, 0, 1, '', 'fila', true, [], [fila()], () => fila(), Symbol('x')]) {
    const n = leerNutricion(malo);
    assert.equal(n, SIN_DATOS_DE_NUTRICION);
    assert.equal(hayDatos(n), false);
  }
});

test('un objeto vacío o con claves desconocidas no tiene datos', () => {
  assert.equal(hayDatos(leerNutricion({})), false);
  assert.equal(hayDatos(leerNutricion({ otra: 1, calories: 200, energy: 100 })), false);
});

test('las claves heredadas no son datos: un prototipo contaminado no rellena una fila', () => {
  const heredada = Object.create({ nutriscore_grade: 'a', nova_group: 1, energy_kcal: 100, additives_tags: ['en:e330'] });
  const n = leerNutricion(heredada);
  assert.equal(n.nutriscore, null);
  assert.equal(n.nova, null);
  assert.equal(n.energiaKcal, null);
  assert.equal(n.aditivos, null);
  assert.equal(hayDatos(n), false);
});

test('un __proto__ dentro de la fila no se cuela ni como dato ni como prototipo', () => {
  const sucia = JSON.parse(
    '{"__proto__":{"nutriscore_grade":"a","energy_kcal":1},"constructor":{"x":1},"nutriscore_grade":"b"}',
  ) as unknown;
  const n = leerNutricion(sucia);
  assert.equal(n.nutriscore, 'b');
  assert.equal(n.energiaKcal, null);
  assert.equal(Object.getPrototypeOf(n), Object.prototype);
  assert.equal(({} as Record<string, unknown>).nutriscore_grade, undefined);
});

test('las claves de la fila que sobran no pasan al resultado', () => {
  const n = leerNutricion(fila({ off_payload: { x: 1 }, scripts: '<script>', product_id: 'otro' }));
  assert.deepEqual(Object.keys(n).sort(), Object.keys(SIN_DATOS_DE_NUTRICION).sort());
});

test('un texto enorme o con HTML en cualquier campo no rompe nada ni llega a la salida', () => {
  const enorme = '<img src=x onerror=alert(1)>'.repeat(100000);
  const n = leerNutricion(
    filaVacia({
      nutriscore_grade: enorme,
      nova_group: enorme,
      basis: enorme,
      fat_level: enorme,
      serving_size: enorme,
      additives_tags: [enorme],
      energy_kcal: enorme,
    }),
  );
  assert.deepEqual(n, SIN_DATOS_DE_NUTRICION);
});

// ── La tabla ──────────────────────────────────────────────────────────────

test('las cifras llevan coma y no llevan decimales que no aportan', () => {
  assert.equal(formatearGramos(12.5), '12,5 g');
  assert.equal(formatearGramos(12), '12 g');
  assert.equal(formatearGramos(12.0), '12 g');
  assert.equal(formatearGramos(12.5), '12,5 g');
  assert.equal(formatearGramos(0.07), '0,07 g');
  assert.equal(formatearGramos(0.5), '0,5 g');
  assert.equal(formatearGramos(100), '100 g');
  assert.equal(formatearGramos(1.2), '1,2 g');
  assert.equal(formatearGramos(0.001), '0 g');
  assert.equal(formatearEnergia(245), '245 kcal');
  assert.equal(formatearEnergia(245.5), '245,5 kcal');
  assert.equal(formatearEnergia(245.04), '245 kcal');
  assert.equal(formatearEnergia(950), '950 kcal');
  assert.doesNotMatch(formatearGramos(12.5), /\./);
});

test('lo que no es una cantidad se pinta «—» y nunca NaN, Infinity ni un número raro', () => {
  for (const malo of [null, Number.NaN, Infinity, -Infinity, -1, -0.001, 951, 1e21, 1e-7 * -1]) {
    assert.equal(formatearGramos(malo), SIN_DATO, String(malo));
    assert.equal(formatearEnergia(malo), SIN_DATO, String(malo));
  }
  assert.doesNotMatch(formatearGramos(Number.NaN), /NaN|Infinity|undefined|null/);
});

test('la tabla tiene las ocho filas en el orden de una etiqueta', () => {
  const filas = filasNutricionales(leerNutricion(fila()));
  assert.deepEqual(
    filas.map((f) => [f.clave, f.etiqueta, f.subfila, f.valor]),
    [
      ['energia', 'Energía', false, '245 kcal'],
      ['grasas', 'Grasas', false, '12,5 g'],
      ['saturadas', 'de las cuales saturadas', true, '5 g'],
      ['hidratos', 'Hidratos de carbono', false, '30 g'],
      ['azucares', 'de los cuales azúcares', true, '12,25 g'],
      ['fibra', 'Fibra', false, '2 g'],
      ['proteinas', 'Proteínas', false, '6,5 g'],
      ['sal', 'Sal', false, '1,2 g'],
    ],
  );
});

test('los niveles de OFF solo salen en grasas, saturadas, azúcares y sal, como texto', () => {
  const filas = filasNutricionales(leerNutricion(fila()));
  const nivel = (clave: string) => filas.find((f) => f.clave === clave)?.nivel;
  assert.equal(nivel('grasas'), 'Nivel moderado');
  assert.equal(nivel('saturadas'), 'Nivel alto');
  assert.equal(nivel('azucares'), 'Nivel alto');
  assert.equal(nivel('sal'), 'Nivel bajo');
  assert.equal(nivel('energia'), null);
  assert.equal(nivel('hidratos'), null);
  assert.equal(nivel('fibra'), null);
  assert.equal(nivel('proteinas'), null);
});

test('un dato que no consta es «—» en la tabla y «no consta» para el lector, nunca 0', () => {
  const filas = filasNutricionales(leerNutricion(fila({ fiber: null, salt: 0 })));
  const fibra = filas.find((f) => f.clave === 'fibra');
  const sal = filas.find((f) => f.clave === 'sal');
  assert.equal(fibra?.valor, '—');
  assert.equal(fibra?.lectura, 'Fibra: no consta');
  assert.equal(sal?.valor, '0 g');
  assert.match(sal?.lectura ?? '', /^Sal: 0 g/);
});

test('la lectura de una fila con nivel lo atribuye a Open Food Facts', () => {
  const filas = filasNutricionales(leerNutricion(fila()));
  assert.equal(filas.find((f) => f.clave === 'grasas')?.lectura, 'Grasas: 12,5 g. Nivel moderado, según Open Food Facts');
  assert.equal(filas.find((f) => f.clave === 'energia')?.lectura, 'Energía: 245 kcal');
});

test('hayNutrientes mira solo los valores de la tabla', () => {
  assert.equal(hayNutrientes(leerNutricion(filaVacia({ nutriscore_grade: 'a', nova_group: 1 }))), false);
  assert.equal(hayNutrientes(leerNutricion(filaVacia({ salt: 0.3 }))), true);
});

// ── Cuándo hay datos ──────────────────────────────────────────────────────

test('hayDatos: cualquier dato declarado basta', () => {
  assert.equal(hayDatos(leerNutricion(filaVacia({ nutriscore_grade: 'b' }))), true);
  assert.equal(hayDatos(leerNutricion(filaVacia({ nova_group: 3 }))), true);
  assert.equal(hayDatos(leerNutricion(filaVacia({ fat_level: 'low' }))), true);
  assert.equal(hayDatos(leerNutricion(filaVacia({ serving_size: '1 unidad' }))), true);
  assert.equal(hayDatos(leerNutricion(filaVacia({ energy_kcal: 12 }))), true);
});

test('hayDatos: una base sin ningún valor no es un dato', () => {
  assert.equal(hayDatos(leerNutricion(filaVacia({ basis: 'g' }))), false);
});

test('hayDatos: si todo lo demás cayó por inválido, la fila queda sin datos', () => {
  assert.equal(hayDatos(leerNutricion(fila({
    nutriscore_grade: 'z', nova_group: 9, energy_kcal: 5000, fat: -1, saturated_fat: 'x', carbohydrates: NaN,
    sugars: Infinity, fiber: 101, proteins: '3', salt: {}, fat_level: 'x', saturated_fat_level: 'x',
    sugars_level: 'x', salt_level: 'x', serving_size: '<b>', additives_tags: ['mal'],
  }))), false);
});

// ── Lo que se lee en voz alta ─────────────────────────────────────────────

test('la etiqueta del Nutri-Score es una sola frase con la letra y su origen', () => {
  assert.equal(etiquetaNutriScore('c'), 'Nutri-Score C, calculado por Open Food Facts');
  for (const g of GRADOS_NUTRISCORE) {
    assert.equal(etiquetaNutriScore(g), `Nutri-Score ${g.toUpperCase()}, calculado por Open Food Facts`);
  }
});

test('la etiqueta de NOVA lleva el grupo, su nombre y su origen', () => {
  assert.equal(etiquetaNova(4), 'Grupo NOVA 4: Ultraprocesado, según Open Food Facts');
  assert.equal(etiquetaNova(1), 'Grupo NOVA 1: Sin procesar o mínimamente procesado, según Open Food Facts');
});

test('el resumen de una fila de la lista', () => {
  assert.equal(
    resumenNutricion(leerNutricion(fila())),
    'Nutri-Score C, calculado por Open Food Facts. Grupo NOVA 4: Ultraprocesado, según Open Food Facts.',
  );
  assert.equal(resumenNutricion(leerNutricion(fila({ nova_group: null }))), 'Nutri-Score C, calculado por Open Food Facts.');
  assert.equal(
    resumenNutricion(leerNutricion(fila({ nutriscore_grade: null }))),
    'Grupo NOVA 4: Ultraprocesado, según Open Food Facts.',
  );
  assert.equal(resumenNutricion(leerNutricion(fila({ nutriscore_grade: null, nova_group: null }))), `${SIN_SELLOS}.`);
});

test('sin nutrición el resumen dice «Sin datos nutricionales», sin letra inventada', () => {
  assert.equal(resumenNutricion(undefined), 'Sin datos nutricionales.');
  assert.equal(resumenNutricion(null), 'Sin datos nutricionales.');
  assert.equal(resumenNutricion(leerNutricion(filaVacia())), 'Sin datos nutricionales.');
  assert.doesNotMatch(resumenNutricion(null), /Nutri-Score [A-E]|NOVA \d|\b0\b/);
  assert.equal(SIN_DATOS, 'Sin datos nutricionales');
});

test('la línea de «puede estar incompleto» es la pedida', () => {
  assert.equal(AVISO_INCOMPLETO, 'Open Food Facts puede estar incompleto o desactualizado. Mira siempre la etiqueta.');
  assert.match(LICENCIA_ODBL, /ODbL/);
});

// ── Los ids ───────────────────────────────────────────────────────────────

const ID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const ID_B = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);
}

test('idDeProducto solo deja pasar un uuid, en minúsculas', () => {
  assert.equal(idDeProducto(ID_A), ID_A);
  assert.equal(idDeProducto(ID_A.toUpperCase()), ID_A);
  for (const malo of ['', 'abc', '__proto__', 'constructor', ID_A + ' ', ' ' + ID_A, ID_A.slice(1), ID_A + 'x', null, undefined, 1, {}, [ID_A]]) {
    assert.equal(idDeProducto(malo), null, String(malo));
  }
});

test('trocearIds: sin ids no hay ninguna llamada', () => {
  assert.deepEqual(trocearIds([]), []);
  assert.deepEqual(trocearIds([null, 'x', 3]), []);
});

test('trocearIds quita repetidos y lo que no es uuid', () => {
  assert.deepEqual(trocearIds([ID_A, ID_B, ID_A, ID_A.toUpperCase(), 'no', null]), [[ID_A, ID_B]]);
});

test('trocearIds: 200 ids caben en una llamada y 201 son dos', () => {
  assert.equal(MAX_IDS_POR_LLAMADA, 200);
  assert.equal(trocearIds(ids(200)).length, 1);
  assert.equal(trocearIds(ids(200))[0]?.length, 200);
  const dos = trocearIds(ids(201));
  assert.deepEqual(dos.map((t) => t.length), [200, 1]);
  const tres = trocearIds(ids(450));
  assert.deepEqual(tres.map((t) => t.length), [200, 200, 50]);
  // Ningún id se pierde ni se duplica entre trozos.
  assert.equal(new Set(tres.flat()).size, 450);
});

test('agruparNutricion: una entrada por producto, y un producto sin fila NO está (no consta)', () => {
  const grupo = agruparNutricion([fila({ product_id: ID_A }), filaVacia({ product_id: ID_B })]);
  assert.equal(grupo[ID_A]?.nutriscore, 'c');
  assert.ok(grupo[ID_B]);
  assert.equal(hayDatos(grupo[ID_B] as Nutricion), false);
  assert.equal('3f2504e0-0000-4000-8000-000000000000' in grupo, false);
  assert.equal(grupo['00000000-0000-4000-8000-000000000000'], undefined);
});

test('agruparNutricion: el resultado no tiene prototipo y __proto__ no es una clave con significado', () => {
  const grupo = agruparNutricion([
    fila({ product_id: '__proto__' }),
    fila({ product_id: 'constructor' }),
    fila({ product_id: 'toString' }),
    fila({ product_id: ID_A }),
  ]);
  assert.equal(Object.getPrototypeOf(grupo), null);
  assert.deepEqual(Object.keys(grupo), [ID_A]);
  assert.equal(grupo['__proto__'], undefined);
  assert.equal(grupo['constructor'], undefined);
  assert.equal(({} as Record<string, unknown>).nutriscore, undefined);
});

test('agruparNutricion: lo que no es una fila con uuid se salta sin lanzar', () => {
  const grupo = agruparNutricion([null, undefined, 3, 'x', [], {}, { product_id: 5 }, { product_id: 'no' }, fila({ product_id: ID_A })]);
  assert.deepEqual(Object.keys(grupo), [ID_A]);
});

test('agruparNutricion: el id se guarda en minúsculas, que es como se busca', () => {
  const grupo = agruparNutricion([fila({ product_id: ID_A.toUpperCase() })]);
  assert.ok(grupo[ID_A]);
});

test('agruparNutricion: si el mismo producto sale dos veces gana la última, sin mezclar campos', () => {
  const grupo = agruparNutricion([fila({ product_id: ID_A, nutriscore_grade: 'a' }), filaVacia({ product_id: ID_A })]);
  assert.equal(grupo[ID_A]?.nutriscore, null);
  assert.equal(grupo[ID_A]?.nova, null);
});

// ── El buscador ───────────────────────────────────────────────────────────

test('normalizarBusqueda: sin tildes, sin mayúsculas y con los espacios en uno', () => {
  assert.equal(normalizarBusqueda('Café'), 'cafe');
  assert.equal(normalizarBusqueda('CAFÉ'), 'cafe');
  assert.equal(normalizarBusqueda('  Galletas   María '), 'galletas maria');
  assert.equal(normalizarBusqueda('Piña'), 'pina');
  assert.equal(normalizarBusqueda('Pingüino'), 'pinguino');
  assert.equal(normalizarBusqueda('Ç'), 'c');
  assert.equal(normalizarBusqueda('Lácteos\ty\nhuevos'), 'lacteos y huevos');
});

test('normalizarBusqueda: la misma palabra escrita con la tilde compuesta o descompuesta es igual', () => {
  assert.equal(normalizarBusqueda('caf\u00e9'), normalizarBusqueda('cafe\u0301'));
});

test('normalizarBusqueda: lo que no es un texto es la búsqueda vacía', () => {
  for (const malo of [null, undefined, 3, {}, [], true]) assert.equal(normalizarBusqueda(malo), '');
});

test('normalizarBusqueda: un texto enorme se normaliza sin romperse', () => {
  const enorme = 'Árbol '.repeat(200000);
  assert.equal(normalizarBusqueda(enorme).startsWith('arbol arbol'), true);
});

test('coincideConBusqueda: sin tildes ni mayúsculas, por nombre o por marca', () => {
  const busca = normalizarBusqueda('GALLETA maría');
  assert.equal(coincideConBusqueda(busca, 'Galletas María Dorada', 'Marca'), false);
  assert.equal(coincideConBusqueda(normalizarBusqueda('galleta maria'), 'Galleta María', null), true);
  assert.equal(coincideConBusqueda(normalizarBusqueda('hacendado'), 'Leche', 'HACENDADO'), true);
  assert.equal(coincideConBusqueda(normalizarBusqueda('Hacendadó'), 'Leche', 'Hacendado'), true);
  assert.equal(coincideConBusqueda(normalizarBusqueda('queso'), 'Leche', null), false);
});

test('coincideConBusqueda: una búsqueda vacía lo deja pasar todo, incluso sin campos', () => {
  assert.equal(coincideConBusqueda('', 'Leche'), true);
  assert.equal(coincideConBusqueda('', null, undefined), true);
  assert.equal(coincideConBusqueda('', ), true);
  assert.equal(coincideConBusqueda(normalizarBusqueda('   ')), true);
});

test('coincideConBusqueda: un campo vacío o nulo no coincide con nada', () => {
  assert.equal(coincideConBusqueda('a', null, undefined, ''), false);
});
