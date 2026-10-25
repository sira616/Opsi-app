/**
 * ¿Delata este nombre que no es comida? Opsi guarda comida y bebida: el tabaco, el vapeo y lo
 * parecido se rechaza al escanearlo (la Edge Function `lookup-barcode`, con su lista de
 * categorías de Open Food Facts) y también al escribirlo a mano o al reconocerlo un código que
 * Open Food Facts no conoce.
 *
 * Es la misma lista de palabras que `supabase/functions/_shared/nocomida.ts` (el móvil no puede
 * importar de ahí), y un test comprueba que las dos dicen lo mismo. Cortita a propósito: «puro»
 * o «pipa» también son comida, y un falso positivo molesta más que dejar pasar un caso raro.
 */

/** Minúsculas y sin acentos, para comparar: «Cigarrillos» y «cigarrillos» son lo mismo. */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

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

export function nombreEsNoComida(nombre: string): boolean {
  return NOMBRE_NO_COMIDA.test(normalizar(nombre));
}

/** Lo que se le dice a quien intenta guardar algo así. */
export const AVISO_NO_COMIDA = 'Opsi solo guarda comida y bebida.';
