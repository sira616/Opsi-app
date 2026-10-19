import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CLAVES_SALUD,
  VERSION_AVISO_SALUD,
  consentimientoVigente,
  faltaPermisoSalud,
  leerConsentimiento,
  preferenciasEfectivas,
  PREFERENCIAS_SALUD,
  SIN_DATOS_DE_SALUD,
  evaluarSalud,
  leerClaves,
  leerSalud,
  lineasDeAviso,
  necesitaAtribucion,
  nombreDeEtiquetaOff,
  nombresDeEtiquetas,
  textoDeAviso,
  unir,
} from './salud.ts';
import type { ClaveSalud, SaludProducto } from './salud.ts';

/** Una ficha de OFF con los datos completos y nada declarado. */
function ficha(cambios: Partial<SaludProducto> = {}): SaludProducto {
  return {
    deOff: true,
    consta: true,
    alergenos: [],
    trazas: [],
    etiquetas: [],
    ingredientes: 'Harina de trigo, agua, sal.',
    descartado: false,
    ...cambios,
  };
}

/** Lo que devuelve `lookup-barcode` en `product`, listo para `leerSalud`. */
function respuesta(cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: 'openfoodfacts',
    health_data: true,
    allergens_tags: [],
    traces_tags: [],
    labels_tags: [],
    ingredients_text: 'Agua, azúcar.',
    ...cambios,
  };
}

// ── El catálogo ───────────────────────────────────────────────────────────

test('hay 15 preferencias y son exactamente las que acepta el servidor', () => {
  const servidor = [
    'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk', 'nuts',
    'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs', 'lactose',
  ];
  assert.equal(PREFERENCIAS_SALUD.length, 15);
  assert.deepEqual([...CLAVES_SALUD].sort(), [...servidor].sort());
  assert.deepEqual(PREFERENCIAS_SALUD.map((p) => p.clave), [...CLAVES_SALUD]);
});

test('cada preferencia tiene etiqueta, nombre y una etiqueta de OFF con el formato del servidor', () => {
  for (const p of PREFERENCIAS_SALUD) {
    assert.ok(p.etiqueta.length > 0, p.clave);
    assert.ok(p.nombre.length > 0, p.clave);
    assert.match(p.etiquetaOff, /^[a-z]{2}:[a-z0-9-]{1,80}$/, p.clave);
  }
});

test('la etiqueta de OFF es en:<clave> salvo sésamo, sulfitos y lactosa', () => {
  const distintas: Partial<Record<ClaveSalud, string>> = {
    sesame: 'en:sesame-seeds',
    sulphites: 'en:sulphur-dioxide-and-sulphites',
    lactose: 'en:milk',
  };
  for (const p of PREFERENCIAS_SALUD) {
    assert.equal(p.etiquetaOff, distintas[p.clave] ?? `en:${p.clave}`, p.clave);
  }
});

test('las etiquetas de la interfaz son las pedidas', () => {
  const etiqueta = (c: ClaveSalud) => PREFERENCIAS_SALUD.find((p) => p.clave === c)?.etiqueta;
  assert.equal(etiqueta('gluten'), 'Cereales con gluten (celiaquía)');
  assert.equal(etiqueta('lactose'), 'Lactosa');
  assert.equal(etiqueta('nuts'), 'Frutos de cáscara');
});

test('el camino inverso nombra las 14 etiquetas de OFF y nada más', () => {
  assert.equal(nombreDeEtiquetaOff('en:milk'), 'leche');
  assert.equal(nombreDeEtiquetaOff('en:gluten'), 'gluten');
  assert.equal(nombreDeEtiquetaOff('en:sesame-seeds'), 'sésamo');
  assert.equal(nombreDeEtiquetaOff('en:sulphur-dioxide-and-sulphites'), 'sulfitos');
  assert.equal(nombreDeEtiquetaOff('en:nuts'), 'frutos de cáscara');
  assert.equal(nombreDeEtiquetaOff('en:none'), null);
  assert.equal(nombreDeEtiquetaOff('en:sesame'), null);
  assert.equal(nombreDeEtiquetaOff('fr:lait'), null);
  assert.equal(nombreDeEtiquetaOff('__proto__'), null);
  assert.equal(nombreDeEtiquetaOff('constructor'), null);
  // Todas las claves, menos la lactosa (comparte etiqueta con la leche), tienen camino de vuelta.
  for (const p of PREFERENCIAS_SALUD) {
    assert.equal(nombreDeEtiquetaOff(p.etiquetaOff), p.clave === 'lactose' ? 'leche' : p.nombre);
  }
});

test('nombresDeEtiquetas deja fuera lo desconocido y los repetidos', () => {
  assert.deepEqual(nombresDeEtiquetas(['en:milk', 'en:raro', 'en:gluten', 'en:milk']), ['leche', 'gluten']);
  assert.deepEqual(nombresDeEtiquetas([]), []);
});

test('unir escribe la lista a la española', () => {
  assert.equal(unir([]), '');
  assert.equal(unir(['gluten']), 'gluten');
  assert.equal(unir(['gluten', 'leche']), 'gluten y leche');
  assert.equal(unir(['gluten', 'leche', 'huevo']), 'gluten, leche y huevo');
});

test('leerClaves se queda con las válidas, sin repetidos y en el orden de la pantalla', () => {
  assert.deepEqual(leerClaves(['milk', 'gluten', 'milk', 'raro', 3, null]), ['gluten', 'milk']);
  assert.deepEqual(leerClaves(null), []);
  assert.deepEqual(leerClaves('gluten'), []);
  assert.deepEqual(leerClaves({ 0: 'gluten', length: 1 }), []);
  assert.deepEqual(leerClaves([...CLAVES_SALUD].reverse()), [...CLAVES_SALUD]);
});

// ── evaluarSalud: contiene y trazas, preferencia por preferencia ──────────

for (const p of PREFERENCIAS_SALUD) {
  test(`${p.clave}: «contiene» si ${p.etiquetaOff} está en los alérgenos`, () => {
    const r = evaluarSalud([p.clave], ficha({ alergenos: [p.etiquetaOff] }));
    assert.deepEqual(r.avisos, [{ pref: p.clave, nivel: 'contiene' }]);
    assert.equal(r.sinDatos, false);
    assert.equal(lineasDeAviso(r)[0]?.texto, `Contiene ${p.nombre}.`);
  });

  test(`${p.clave}: «trazas» si ${p.etiquetaOff} está en las trazas`, () => {
    const r = evaluarSalud([p.clave], ficha({ trazas: [p.etiquetaOff] }));
    assert.deepEqual(r.avisos, [{ pref: p.clave, nivel: 'trazas' }]);
    assert.equal(lineasDeAviso(r)[0]?.texto, `Trazas de ${p.nombre}.`);
  });

  test(`${p.clave}: ni aviso ni «sin datos» con la ficha completa y sin conflicto`, () => {
    const r = evaluarSalud([p.clave], ficha({ alergenos: ['en:otra-cosa'], trazas: [] }));
    assert.deepEqual(r, { avisos: [], sinDatos: false });
    assert.deepEqual(lineasDeAviso(r), []);
  });
}

test('un alérgeno de otra preferencia no avisa', () => {
  const r = evaluarSalud(['gluten'], ficha({ alergenos: ['en:milk'], trazas: ['en:eggs'] }));
  assert.deepEqual(r, { avisos: [], sinDatos: false });
});

test('«contiene» gana a «trazas» si el alérgeno sale en las dos listas', () => {
  const r = evaluarSalud(['milk'], ficha({ alergenos: ['en:milk'], trazas: ['en:milk'] }));
  assert.deepEqual(r.avisos, [{ pref: 'milk', nivel: 'contiene' }]);
});

test('los avisos salen ordenados: contiene, trazas, etiqueta', () => {
  const r = evaluarSalud(
    ['lactose', 'gluten', 'eggs'],
    ficha({
      alergenos: ['en:milk'],
      trazas: ['en:eggs', 'en:gluten'],
      etiquetas: ['en:no-lactose'],
    }),
  );
  assert.deepEqual(
    r.avisos.map((a) => [a.pref, a.nivel]),
    [
      ['gluten', 'trazas'],
      ['eggs', 'trazas'],
      ['lactose', 'etiqueta'],
    ],
  );
  assert.deepEqual(
    lineasDeAviso(r).map((l) => l.nivel),
    ['trazas', 'etiqueta'],
  );
});

test('varias preferencias en la misma línea y sin repetir «leche»', () => {
  const r = evaluarSalud(
    ['milk', 'lactose', 'gluten', 'eggs'],
    ficha({ alergenos: ['en:milk', 'en:gluten', 'en:eggs'] }),
  );
  assert.deepEqual(
    lineasDeAviso(r).map((l) => l.texto),
    ['Contiene gluten, leche y huevo.'],
  );
});

test('las preferencias repetidas o desconocidas se ignoran', () => {
  const r = evaluarSalud(['milk', 'milk', 'raro', ''], ficha({ alergenos: ['en:milk'] }));
  assert.deepEqual(r.avisos, [{ pref: 'milk', nivel: 'contiene' }]);
  assert.deepEqual(evaluarSalud(['raro'], null), { avisos: [], sinDatos: false });
});

// ── La lactosa y las etiquetas ────────────────────────────────────────────

test('lactosa: lleva leche y la ficha trae «sin lactosa» → nivel «etiqueta», nunca «apto»', () => {
  const r = evaluarSalud(['lactose'], ficha({ alergenos: ['en:milk'], etiquetas: ['en:no-lactose'] }));
  assert.deepEqual(r.avisos, [{ pref: 'lactose', nivel: 'etiqueta', via: 'contiene' }]);
  assert.equal(r.sinDatos, false);
  const texto = lineasDeAviso(r).map((l) => l.texto).join(' ');
  assert.equal(texto, 'Lleva leche. Open Food Facts dice sin lactosa.');
  assert.doesNotMatch(texto, /apto|seguro|sin alérgenos|no contiene/i);
});

test('lactosa: con trazas de leche y «sin lactosa» también es «etiqueta», y lo dice', () => {
  const r = evaluarSalud(['lactose'], ficha({ trazas: ['en:milk'], etiquetas: ['en:no-lactose'] }));
  assert.deepEqual(r.avisos, [{ pref: 'lactose', nivel: 'etiqueta', via: 'trazas' }]);
  assert.equal(lineasDeAviso(r)[0]?.texto, 'Trazas de leche. Open Food Facts dice sin lactosa.');
});

test('lactosa: sin la etiqueta, la leche es «contiene» o «trazas» de siempre', () => {
  assert.deepEqual(evaluarSalud(['lactose'], ficha({ alergenos: ['en:milk'] })).avisos, [
    { pref: 'lactose', nivel: 'contiene' },
  ]);
  assert.deepEqual(evaluarSalud(['lactose'], ficha({ trazas: ['en:milk'] })).avisos, [
    { pref: 'lactose', nivel: 'trazas' },
  ]);
});

test('lactosa: «sin lactosa» sin leche en la ficha no es un aviso, pero tampoco una garantía', () => {
  const completa = evaluarSalud(['lactose'], ficha({ etiquetas: ['en:no-lactose'] }));
  assert.deepEqual(completa, { avisos: [], sinDatos: false });
  // Sin ingredientes, la etiqueta no sirve para descartar: sigue sin haber datos.
  const sinIngredientes = evaluarSalud(
    ['lactose'],
    ficha({ etiquetas: ['en:no-lactose'], ingredientes: null }),
  );
  assert.deepEqual(sinIngredientes, { avisos: [], sinDatos: true });
});

test('«sin lactosa» no toca a quien evita la leche: para ella sigue siendo «contiene»', () => {
  const r = evaluarSalud(['milk'], ficha({ alergenos: ['en:milk'], etiquetas: ['en:no-lactose'] }));
  assert.deepEqual(r.avisos, [{ pref: 'milk', nivel: 'contiene' }]);
});

test('leche y lactosa a la vez: «contiene» para la leche y «etiqueta» para la lactosa, las dos a la vista', () => {
  const r = evaluarSalud(
    ['milk', 'lactose'],
    ficha({ alergenos: ['en:milk'], etiquetas: ['en:no-lactose'] }),
  );
  assert.deepEqual(r.avisos, [
    { pref: 'milk', nivel: 'contiene' },
    { pref: 'lactose', nivel: 'etiqueta', via: 'contiene' },
  ]);
  assert.deepEqual(lineasDeAviso(r).map((l) => l.nivel), ['contiene', 'etiqueta']);
});

test('una etiqueta sin gluten o para celíacos NUNCA anula un «contiene» ni unas trazas de gluten', () => {
  for (const etiqueta of ['en:no-gluten', 'en:suitable-for-celiacs'] as const) {
    const contiene = evaluarSalud(['gluten'], ficha({ alergenos: ['en:gluten'], etiquetas: [etiqueta] }));
    assert.deepEqual(contiene.avisos, [{ pref: 'gluten', nivel: 'contiene' }], etiqueta);

    const trazas = evaluarSalud(['gluten'], ficha({ trazas: ['en:gluten'], etiquetas: [etiqueta] }));
    assert.deepEqual(trazas.avisos, [{ pref: 'gluten', nivel: 'trazas' }], etiqueta);

    const todas = evaluarSalud(
      ['gluten'],
      ficha({ alergenos: ['en:gluten'], etiquetas: ['en:no-gluten', 'en:suitable-for-celiacs', 'en:no-lactose'] }),
    );
    assert.deepEqual(todas.avisos, [{ pref: 'gluten', nivel: 'contiene' }]);
  }
});

test('las etiquetas de gluten no descartan nada cuando faltan datos', () => {
  const r = evaluarSalud(
    ['gluten'],
    ficha({ ingredientes: null, etiquetas: ['en:no-gluten', 'en:suitable-for-celiacs'] }),
  );
  assert.deepEqual(r, { avisos: [], sinDatos: true });
});

test('una etiqueta de otra cosa no cambia ningún nivel', () => {
  const r = evaluarSalud(['eggs'], ficha({ alergenos: ['en:eggs'], etiquetas: ['en:no-gluten', 'en:no-lactose'] }));
  assert.deepEqual(r.avisos, [{ pref: 'eggs', nivel: 'contiene' }]);
});

// ── «Sin datos» ───────────────────────────────────────────────────────────

test('sin preferencias no se evalúa nada: ni avisos ni «sin datos»', () => {
  assert.deepEqual(evaluarSalud([], null), { avisos: [], sinDatos: false });
  assert.deepEqual(evaluarSalud([], ficha({ alergenos: ['en:milk'] })), { avisos: [], sinDatos: false });
  assert.deepEqual(evaluarSalud([], SIN_DATOS_DE_SALUD), { avisos: [], sinDatos: false });
  assert.deepEqual(lineasDeAviso(evaluarSalud([], null)), []);
});

test('sinDatos: ficha null (producto a mano, sin producto, privado)', () => {
  const r = evaluarSalud(['gluten'], null);
  assert.deepEqual(r, { avisos: [], sinDatos: true });
  assert.deepEqual(evaluarSalud(['gluten'], undefined), { avisos: [], sinDatos: true });
  assert.deepEqual(lineasDeAviso(r), [{ nivel: 'sin_datos', texto: 'Sin datos de alérgenos.' }]);
});

test('sinDatos: la ficha no es de Open Food Facts', () => {
  const r = evaluarSalud(['gluten'], ficha({ deOff: false }));
  assert.deepEqual(r, { avisos: [], sinDatos: true });
});

test('sinDatos: OFF no se ha consultado para esta ficha (anterior a los datos de salud)', () => {
  // Las listas vacías de una ficha antigua no significan «sin alérgenos».
  const r = evaluarSalud(['gluten', 'milk'], ficha({ consta: false }));
  assert.deepEqual(r, { avisos: [], sinDatos: true });
});

test('sinDatos: la ficha no trae ingredientes, aunque las listas estén vacías', () => {
  const r = evaluarSalud(['gluten'], ficha({ ingredientes: null }));
  assert.deepEqual(r, { avisos: [], sinDatos: true });
});

test('sinDatos: algo de la ficha no cuadró y se tiró', () => {
  const r = evaluarSalud(['gluten'], ficha({ descartado: true }));
  assert.deepEqual(r, { avisos: [], sinDatos: true });
});

test('los avisos salen aunque la ficha no tenga datos completos, junto a «sin datos» de lo demás', () => {
  const r = evaluarSalud(['milk', 'gluten'], ficha({ alergenos: ['en:milk'], ingredientes: null }));
  assert.deepEqual(r.avisos, [{ pref: 'milk', nivel: 'contiene' }]);
  assert.equal(r.sinDatos, true);
  assert.deepEqual(lineasDeAviso(r), [
    { nivel: 'contiene', texto: 'Contiene leche.' },
    { nivel: 'sin_datos', texto: 'Sin datos de otros alérgenos.' },
  ]);

  const descartada = evaluarSalud(['milk'], ficha({ trazas: ['en:milk'], descartado: true }));
  assert.deepEqual(descartada.avisos, [{ pref: 'milk', nivel: 'trazas' }]);
  // Todo lo que se evita ya tiene aviso: no queda nada que descartar.
  assert.equal(descartada.sinDatos, false);
});

test('una ficha que no es de OFF no avisa de nada aunque traiga listas', () => {
  const r = evaluarSalud(['milk'], ficha({ deOff: false, alergenos: ['en:milk'] }));
  assert.deepEqual(r, { avisos: [], sinDatos: true });
});

test('con datos completos y sin conflicto no se pinta nada: la ausencia de marca no se anuncia', () => {
  const r = evaluarSalud(['gluten', 'milk', 'lactose'], ficha());
  assert.deepEqual(r, { avisos: [], sinDatos: false });
  assert.deepEqual(lineasDeAviso(r), []);
  assert.equal(textoDeAviso(r), '');
});

test('ningún texto promete que algo sea seguro, apto o libre de nada', () => {
  const casos = [
    evaluarSalud(['gluten'], null),
    evaluarSalud(['gluten'], ficha({ consta: false })),
    evaluarSalud(['lactose'], ficha({ alergenos: ['en:milk'], etiquetas: ['en:no-lactose'] })),
    evaluarSalud(['gluten'], ficha({ alergenos: ['en:gluten'], etiquetas: ['en:no-gluten'] })),
    evaluarSalud(['gluten', 'milk'], ficha({ alergenos: ['en:milk'], ingredientes: null })),
  ];
  for (const caso of casos) {
    const texto = textoDeAviso(caso, true);
    assert.doesNotMatch(texto, /apto|segur|sin al[ée]rgenos|no contiene|sin gluten|libre de|todo bien/i, texto);
    assert.doesNotMatch(texto, /puede que|quiz[aá]|suele|\(|\)/i, texto);
  }
});

test('textoDeAviso atribuye a Open Food Facts solo cuando hay avisos', () => {
  const con = evaluarSalud(['milk'], ficha({ alergenos: ['en:milk'] }));
  assert.equal(textoDeAviso(con, true), 'Contiene leche. Según Open Food Facts.');
  assert.equal(textoDeAviso(con), 'Contiene leche.');
  const sin = evaluarSalud(['milk'], null);
  assert.equal(textoDeAviso(sin, true), 'Sin datos de alérgenos.');
  // La frase de la lactosa ya nombra a Open Food Facts: no se repite debajo.
  const lactosa = evaluarSalud(['lactose'], ficha({ alergenos: ['en:milk'], etiquetas: ['en:no-lactose'] }));
  assert.equal(necesitaAtribucion(lactosa), false);
  assert.equal(textoDeAviso(lactosa, true), 'Lleva leche. Open Food Facts dice sin lactosa.');
  const ambas = evaluarSalud(
    ['lactose', 'gluten'],
    ficha({ alergenos: ['en:milk', 'en:gluten'], etiquetas: ['en:no-lactose'] }),
  );
  assert.equal(necesitaAtribucion(ambas), true);
});

// ── leerSalud: entrada no confiable ───────────────────────────────────────

test('leerSalud: la respuesta de lookup-barcode con datos completos', () => {
  const s = leerSalud(
    respuesta({
      allergens_tags: ['en:milk', 'en:gluten'],
      traces_tags: ['en:nuts'],
      labels_tags: ['en:no-lactose'],
      ingredients_text: 'Leche, harina de trigo.',
    }),
  );
  assert.deepEqual(s, {
    deOff: true,
    consta: true,
    alergenos: ['en:milk', 'en:gluten'],
    trazas: ['en:nuts'],
    etiquetas: ['en:no-lactose'],
    ingredientes: 'Leche, harina de trigo.',
    descartado: false,
  });
});

test('leerSalud: una fila de products con health_data_at', () => {
  const s = leerSalud({
    data_source: 'openfoodfacts',
    health_data_at: '2026-10-18T10:00:00+00:00',
    allergens_tags: ['en:eggs'],
    traces_tags: [],
    labels_tags: [],
    ingredients_text: null,
  });
  assert.equal(s.deOff, true);
  assert.equal(s.consta, true);
  assert.deepEqual(s.alergenos, ['en:eggs']);
  assert.equal(s.ingredientes, null);
  assert.equal(s.descartado, false);
});

test('leerSalud: una ficha antigua (todo NULL) no consta, y sus listas no valen', () => {
  const s = leerSalud({
    data_source: 'openfoodfacts',
    health_data_at: null,
    allergens_tags: null,
    traces_tags: null,
    labels_tags: null,
    ingredients_text: null,
  });
  assert.equal(s.deOff, true);
  assert.equal(s.consta, false);
  assert.deepEqual(evaluarSalud(['gluten'], s), { avisos: [], sinDatos: true });
  // Aunque trajera listas, sin fecha de consulta no se leen.
  const conListas = leerSalud(respuesta({ health_data: false, allergens_tags: ['en:milk'] }));
  assert.equal(conListas.consta, false);
  assert.deepEqual(conListas.alergenos, []);
});

test('leerSalud: lo que no es de Open Food Facts es «sin datos», diga lo que diga', () => {
  for (const fuente of ['user', 'OpenFoodFacts', 'openfoodfacts ', '', null, undefined, 1, {}, ['openfoodfacts']]) {
    const s = leerSalud(respuesta({ source: fuente, allergens_tags: ['en:milk'] }));
    assert.equal(s.deOff, false, String(fuente));
    assert.equal(s.consta, false, String(fuente));
    assert.deepEqual(s.alergenos, [], String(fuente));
  }
  const privado = leerSalud({
    data_source: 'user',
    health_data_at: '2026-10-18T10:00:00+00:00',
    allergens_tags: [],
    traces_tags: [],
    labels_tags: [],
    ingredients_text: 'Nada.',
  });
  assert.deepEqual(evaluarSalud(['gluten'], privado), { avisos: [], sinDatos: true });
});

test('leerSalud: health_data solo vale si es exactamente true', () => {
  for (const valor of [false, 'true', 1, null, [], {}, 'sí']) {
    const s = leerSalud(respuesta({ health_data: valor }));
    assert.equal(s.consta, false, JSON.stringify(valor));
  }
  // Sin health_data ni health_data_at no consta.
  assert.equal(leerSalud({ source: 'openfoodfacts', allergens_tags: [] }).consta, false);
  // Una fecha que no lo es tampoco.
  assert.equal(
    leerSalud({ data_source: 'openfoodfacts', health_data_at: 'ayer', allergens_tags: [] }).consta,
    false,
  );
});

test('leerSalud: en:none no es un alérgeno', () => {
  const s = leerSalud(respuesta({ allergens_tags: ['en:none'], traces_tags: ['en:none', 'en:milk'] }));
  assert.deepEqual(s.alergenos, []);
  assert.deepEqual(s.trazas, ['en:milk']);
  assert.equal(s.descartado, false);
  assert.deepEqual(evaluarSalud(['milk'], s).avisos, [{ pref: 'milk', nivel: 'trazas' }]);
});

test('leerSalud: quita repetidos', () => {
  const s = leerSalud(respuesta({ allergens_tags: ['en:milk', 'en:milk', 'en:gluten'] }));
  assert.deepEqual(s.alergenos, ['en:milk', 'en:gluten']);
});

test('leerSalud: una lista que no es lista marca la ficha como descartada y nunca como «sin alérgenos»', () => {
  const hostiles: unknown[] = [null, undefined, 'en:milk', 42, {}, { 0: 'en:milk', length: 1 }, true];
  for (const valor of hostiles) {
    const s = leerSalud(respuesta({ allergens_tags: valor }));
    assert.equal(s.descartado, true, String(valor));
    assert.deepEqual(s.alergenos, [], String(valor));
    assert.deepEqual(evaluarSalud(['milk'], s), { avisos: [], sinDatos: true }, String(valor));

    const t = leerSalud(respuesta({ traces_tags: valor }));
    assert.equal(t.descartado, true, String(valor));
    assert.deepEqual(evaluarSalud(['milk'], t), { avisos: [], sinDatos: true }, String(valor));
  }
});

test('leerSalud: un elemento malo se tira, los buenos se quedan y la ficha queda descartada', () => {
  const malos: unknown[] = [
    null, undefined, 3, {}, [], ['en:milk'], 'milk', 'EN:MILK', 'en:Milk', 'en:', 'e:milk', 'eng:milk',
    'en:milk ', ' en:milk', 'en:mi lk', "en:x'; drop table products;--", 'en:<script>', 'en:milk\n',
    'en:' + 'a'.repeat(81), 'x'.repeat(10_000), 'en:é',
  ];
  for (const malo of malos) {
    const s = leerSalud(respuesta({ allergens_tags: ['en:gluten', malo] }));
    assert.deepEqual(s.alergenos, ['en:gluten'], String(malo));
    assert.equal(s.descartado, true, String(malo));
    // El bueno sigue avisando; lo demás ya no se puede descartar.
    assert.deepEqual(evaluarSalud(['gluten'], s).avisos, [{ pref: 'gluten', nivel: 'contiene' }]);
    assert.deepEqual(evaluarSalud(['milk'], s), { avisos: [], sinDatos: true });
  }
});

test('leerSalud: justo en el límite del formato es válido', () => {
  const largo = 'en:' + 'a'.repeat(80);
  const s = leerSalud(respuesta({ allergens_tags: [largo, 'fr:lait', 'en:a-1'] }));
  assert.deepEqual(s.alergenos, [largo, 'fr:lait', 'en:a-1']);
  assert.equal(s.descartado, false);
});

test('leerSalud: más de 40 etiquetas es una ficha que el servidor no habría guardado', () => {
  const muchas = Array.from({ length: 500 }, (_, i) => `en:a${i}`);
  const s = leerSalud(respuesta({ allergens_tags: muchas }));
  assert.equal(s.descartado, true);
  assert.equal(s.alergenos.length, 40);
  // Una lista con tantos huecos como largo no se recorre ni se cuelga.
  const huecos = new Array(1_000_000);
  const h = leerSalud(respuesta({ traces_tags: huecos }));
  assert.equal(h.descartado, true);
  assert.deepEqual(h.trazas, []);
});

test('leerSalud: las etiquetas solo son las tres de la lista cerrada', () => {
  const s = leerSalud(
    respuesta({ labels_tags: ['en:no-gluten', 'en:vegan', 'en:organic', 7, null, 'en:no-gluten', 'en:suitable-for-celiacs'] }),
  );
  assert.deepEqual(s.etiquetas, ['en:no-gluten', 'en:suitable-for-celiacs']);
  // Que las etiquetas vengan rotas no descarta la ficha: solo quita un matiz.
  assert.deepEqual(leerSalud(respuesta({ labels_tags: 'en:no-gluten' })).etiquetas, []);
  assert.equal(leerSalud(respuesta({ labels_tags: null })).descartado, false);
});

test('leerSalud: los ingredientes son texto con tope y sin caracteres de control', () => {
  assert.equal(leerSalud(respuesta({ ingredients_text: '  Agua y sal.  ' })).ingredientes, 'Agua y sal.');
  assert.equal(leerSalud(respuesta({ ingredients_text: '   ' })).ingredientes, null);
  assert.equal(leerSalud(respuesta({ ingredients_text: '' })).ingredientes, null);
  assert.equal(leerSalud(respuesta({ ingredients_text: null })).ingredientes, null);
  assert.equal(leerSalud(respuesta({ ingredients_text: null })).descartado, false);

  const justo = 'a'.repeat(2000);
  assert.equal(leerSalud(respuesta({ ingredients_text: justo })).ingredientes, justo);

  const demasiado = leerSalud(respuesta({ ingredients_text: 'a'.repeat(2001) }));
  assert.equal(demasiado.ingredientes, null);
  assert.equal(demasiado.descartado, true);
  assert.deepEqual(evaluarSalud(['gluten'], demasiado), { avisos: [], sinDatos: true });
});

test('leerSalud: ingredientes que no son texto, o con marcado o caracteres invisibles, se tiran', () => {
  const con = (...codigos: number[]) => `Agua${String.fromCharCode(...codigos)}sal`;
  const malos: unknown[] = [
    42, true, {}, [], ['Agua'], () => 'x',
    '<b>Agua</b>', 'Agua <script>alert(1)</script>', 'Agua > sal',
    con(0x00), con(0x0a), con(0x09), con(0x7f), con(0x85), con(0xad),
    con(0x200b), con(0x200e), con(0x2028), con(0x2029), con(0x202e), con(0x2060), con(0x2066), con(0x206f),
    con(0xfeff), `${String.fromCharCode(0xfeff)}Agua`, `Agua${String.fromCharCode(0x0a)}`,
  ];
  for (const malo of malos) {
    const s = leerSalud(respuesta({ ingredients_text: malo }));
    assert.equal(s.ingredientes, null, String(malo));
    assert.equal(s.descartado, true, String(malo));
    assert.equal(evaluarSalud(['gluten'], s).sinDatos, true, String(malo));
  }
  // Lo normal en español sí pasa: tildes, comas, porcentajes, paréntesis.
  const normal = 'Harina de trigo (62 %), azúcar, leche en polvo, sal; aromas. Puede contener «trazas».';
  assert.equal(leerSalud(respuesta({ ingredients_text: normal })).ingredientes, normal);
  // Los caracteres justo fuera de los rangos prohibidos también.
  assert.equal(leerSalud(respuesta({ ingredients_text: con(0x20) })).ingredientes, 'Agua sal');
  assert.equal(leerSalud(respuesta({ ingredients_text: con(0xa0) })).ingredientes, con(0xa0));
  assert.equal(leerSalud(respuesta({ ingredients_text: con(0x2010) })).ingredientes, con(0x2010));
});

test('leerSalud: nunca lanza con entradas que no son objetos', () => {
  for (const valor of [null, undefined, 0, 1, '', 'texto', true, [], [1, 2], () => 1, Symbol.iterator, 10n]) {
    assert.doesNotThrow(() => leerSalud(valor));
    assert.deepEqual(leerSalud(valor), SIN_DATOS_DE_SALUD);
  }
});

test('leerSalud: un objeto con propiedades heredadas o raras no se cuela', () => {
  assert.equal(leerSalud(Object.create({ source: 'openfoodfacts', health_data: true })).consta, true);
  assert.doesNotThrow(() => leerSalud(JSON.parse('{"__proto__": {"source": "openfoodfacts"}, "constructor": 1}')));
  assert.equal(leerSalud(JSON.parse('{"__proto__": {"source": "openfoodfacts"}}')).deOff, false);
});

test('la constante SIN_DATOS_DE_SALUD no se puede cambiar', () => {
  assert.throws(() => {
    (SIN_DATOS_DE_SALUD.alergenos as string[]).push('en:milk');
  });
  assert.equal(Object.isFrozen(SIN_DATOS_DE_SALUD), true);
});

test('de punta a punta: la respuesta de una ficha vieja no avisa de nada, y dice que no hay datos', () => {
  const vieja = leerSalud(
    respuesta({
      health_data: false,
      allergens_tags: [],
      traces_tags: [],
      labels_tags: [],
      ingredients_text: null,
    }),
  );
  const r = evaluarSalud(['gluten', 'milk', 'peanuts'], vieja);
  assert.deepEqual(r, { avisos: [], sinDatos: true });
  assert.equal(textoDeAviso(r), 'Sin datos de alérgenos.');
});

test('de punta a punta: pan sin gluten por etiqueta, pero con trazas de gluten', () => {
  const pan = leerSalud(
    respuesta({
      allergens_tags: ['en:soybeans'],
      traces_tags: ['en:gluten'],
      labels_tags: ['en:no-gluten'],
      ingredients_text: 'Harina de maíz, soja.',
    }),
  );
  const r = evaluarSalud(['gluten', 'soybeans'], pan);
  assert.deepEqual(
    lineasDeAviso(r).map((l) => l.texto),
    ['Contiene soja.', 'Trazas de gluten.'],
  );
});

// ── El permiso para guardar y usar lo que evita la persona ────────────────

const EN = '2026-10-19T10:00:00.000Z';

test('leerConsentimiento: solo una versión entera positiva y una fecha de verdad cuentan', () => {
  assert.deepEqual(leerConsentimiento(1, EN), { version: 1, en: EN });
  assert.deepEqual(leerConsentimiento(3, EN), { version: 3, en: EN });
  assert.equal(leerConsentimiento(null, null), null, 'sin fila, sin permiso');
  assert.equal(leerConsentimiento(null, EN), null, 'una fecha sin versión no es un permiso');
  assert.equal(leerConsentimiento(1, null), null, 'una versión sin fecha tampoco');
  assert.equal(leerConsentimiento(0, EN), null, 'la versión empieza en 1');
  assert.equal(leerConsentimiento(-1, EN), null);
  assert.equal(leerConsentimiento(1.5, EN), null, 'ni una versión con decimales');
  assert.equal(leerConsentimiento('1', EN), null, 'ni una versión que llega como texto');
  assert.equal(leerConsentimiento(1, 'ayer'), null, 'ni una fecha que no lo es');
  assert.equal(leerConsentimiento(1, 20261019), null, 'ni una fecha que no es texto');
});

test('consentimientoVigente: hace falta haber aceptado la versión actual del aviso o una posterior', () => {
  const v1 = { version: 1, en: EN };
  assert.equal(consentimientoVigente(null), false);
  assert.equal(consentimientoVigente(v1, 1), true);
  assert.equal(consentimientoVigente(v1, 2), false, 'el aviso cambió: hay que aceptarlo de nuevo');
  assert.equal(consentimientoVigente({ version: 2, en: EN }, 1), true, 'una versión posterior sigue valiendo');
  assert.equal(consentimientoVigente(v1), v1.version >= VERSION_AVISO_SALUD, 'por omisión, la versión de la app');
});

test('preferenciasEfectivas: sin permiso vigente no se cruza NADA, aunque haya lista guardada', () => {
  const guardadas: ClaveSalud[] = ['gluten', 'milk'];
  const v1 = { version: 1, en: EN };
  assert.deepEqual(preferenciasEfectivas(guardadas, v1, 1), ['gluten', 'milk']);
  assert.deepEqual(preferenciasEfectivas(guardadas, null, 1), [], 'la de antes de pedir el permiso no se usa');
  assert.deepEqual(preferenciasEfectivas(guardadas, v1, 2), [], 'ni con un permiso de una versión vieja');
  assert.deepEqual(preferenciasEfectivas([], v1, 1), []);
});

test('faltaPermisoSalud: solo cuando hay algo guardado que no se está usando', () => {
  const v1 = { version: 1, en: EN };
  assert.equal(faltaPermisoSalud(['milk'], null, 1), true, 'la lista de antes del permiso');
  assert.equal(faltaPermisoSalud(['milk'], v1, 2), true, 'y la de una versión vieja del aviso');
  assert.equal(faltaPermisoSalud(['milk'], v1, 1), false, 'con permiso vigente no falta nada');
  assert.equal(faltaPermisoSalud([], null, 1), false, 'quien nunca marcó nada no tiene nada que avisar');
  assert.equal(faltaPermisoSalud([], v1, 2), false);
});
