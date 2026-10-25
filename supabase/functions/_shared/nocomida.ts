/**
 * ¿Esto es comida? La respuesta más estricta que se puede dar sin preguntar a nadie.
 *
 * Open Food Facts es una base de comida, pero acepta de todo con código de barras: tabaco,
 * vapeadores, mecheros… (sus propias etiquetas lo dicen: `en:tobacco-products`,
 * `en:non-food-products`). Opsi guarda comida, así que el escáner rechaza lo que OFF o el
 * nombre delatan como otra cosa, igual que ya rechaza un libro por su prefijo (`gtin.ts`).
 *
 * Es una lista CORTA y de cosas inequívocas, a propósito: un falso positivo (negarse a guardar
 * un producto que sí es comida) molesta más que dejar pasar un caso raro, y la gente que quiera
 * apuntar algo lo puede hacer a mano. Lo que NO está aquí: el alcohol (una botella de vino se
 * guarda en una despensa) ni los suplementos.
 *
 * Sin Deno ni red: se prueba con `npm run test:funciones`.
 */

/** Minúsculas y sin acentos, para comparar: «Cigarrillos» y «cigarrillos» son lo mismo. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Trozos de una etiqueta de categoría de OFF (`en:tobacco-products`) que la delatan. Se miran
 * dentro de la parte tras los dos puntos, entre guiones, así que `en:tobacco-products`,
 * `en:rolling-tobacco` y `fr:cigarettes-electroniques` caen; `en:tobasco-sauces` no.
 */
const PALABRAS_DE_ETIQUETA = new Set([
  'tobacco',
  'tobaccos',
  'tabac',
  'tabaco',
  'cigarette',
  'cigarettes',
  'cigarrillo',
  'cigarrillos',
  'cigar',
  'cigars',
  'cigarillo',
  'cigarillos',
  'nicotine',
  'nicotina',
  'snus',
  'vaping',
  'vape',
  'vapes',
  'shisha',
  'hookah',
]);

/** Etiquetas enteras con las que OFF marca lo que no es comida o está en la base equivocada. */
const ETIQUETAS_DE_NO_COMIDA = new Set([
  'en:non-food-products',
  'en:incorrect-product-type',
  'en:e-liquids',
  'en:e-cigarettes',
  'en:electronic-cigarettes',
  'en:lighters',
  'en:rolling-papers',
  'en:cigarette-papers',
]);

/** ¿Alguna de las categorías de OFF dice que esto no es comida? */
export function categoriaEsNoComida(etiquetas: readonly string[]): boolean {
  for (const etiqueta of etiquetas) {
    const e = etiqueta.toLowerCase();
    if (ETIQUETAS_DE_NO_COMIDA.has(e)) return true;
    const resto = e.slice(e.indexOf(':') + 1);
    if (resto.split('-').some((p) => PALABRAS_DE_ETIQUETA.has(p))) return true;
  }
  return false;
}

/**
 * Palabras de un nombre que no tienen otra lectura en una cocina. «Puro», «picadura» o «pipa»
 * se quedan fuera porque también son comida (un zumo puro, una pipa de girasol).
 */
const NOMBRE_NO_COMIDA = new RegExp(
  '\\b(?:' +
    [
      'tabaco',
      'tobacco',
      'cigarrillos?',
      'cigarros?',
      'cigarillos?',
      'cigarettes?',
      'nicotina',
      'nicotine',
      'snus',
      'vapeador(?:es)?',
      'vapers?',
      'vapes?',
      'e-?liquid',
      'shisha',
      'cachimba',
      'papel(?:es)? de liar',
      'tabaco de liar',
    ].join('|') +
    ')\\b',
);

/** ¿Delata el nombre de una ficha que no es comida? */
export function nombreEsNoComida(nombre: string): boolean {
  return NOMBRE_NO_COMIDA.test(normalizar(nombre));
}

/** Una ficha de OFF (o del catálogo) con lo único que hace falta para decidirlo. */
export function esNoComida(ficha: { name: string; categoriesTags?: readonly string[] }): boolean {
  return nombreEsNoComida(ficha.name) || categoriaEsNoComida(ficha.categoriesTags ?? []);
}
