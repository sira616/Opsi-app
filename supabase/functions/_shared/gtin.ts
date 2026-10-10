/**
 * Códigos de barras GTIN (EAN-8, UPC-A, EAN-13, GTIN-14).
 *
 * Es código PURO, sin dependencias ni nada de Deno ni de React Native, porque
 * lo usan dos sitios y tiene que dar la misma respuesta en los dos:
 *
 *   · la Edge Function `lookup-barcode`, que es quien manda (lo que llega del
 *     cliente no es de fiar);
 *   · la app, que lo repite antes de gastar una consulta en un código que ni
 *     siquiera es un código —una lectura sucia de la cámara—.
 *
 * Hay DOS COPIAS idénticas: esta y `app/src/shared/lib/gtin.ts`. Metro no sigue
 * rutas fuera de `app/` y Deno no entiende los alias de la app, y compartirlo
 * con un enlace simbólico no funciona en Windows. `npm run check:gtin` falla si
 * se separan. Si tocas este fichero, copia el cambio en el otro.
 *
 * Solo sintaxis que Node 24 pueda ejecutar sin compilar (sin `enum`, sin
 * parámetros-propiedad), para poder probarlo con `node --test`.
 */

/** Longitudes de un GTIN válido. Un código de 9, 10 u 11 cifras no existe. */
const LONGITUDES = new Set([8, 12, 13, 14]);

/**
 * El dígito de control GS1: de derecha a izquierda, las cifras del cuerpo
 * pesan 3, 1, 3, 1… y el control es lo que falta para llegar a decena.
 */
export function digitoDeControl(cuerpo: string): number {
  let suma = 0;
  for (let i = 0; i < cuerpo.length; i++) {
    const cifra = cuerpo.charCodeAt(cuerpo.length - 1 - i) - 48;
    suma += cifra * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (suma % 10)) % 10;
}

/**
 * ¿Es un GTIN de verdad? Solo cifras, una longitud que exista y control bueno.
 *
 * Una cadena de ceros cuadra el control (0 es el control de un cuerpo de ceros)
 * y no es ningún producto: es lo que sale de una lectura vacía. Se descarta aparte.
 */
export function esGtinValido(codigo: string): boolean {
  if (!/^[0-9]+$/.test(codigo) || !LONGITUDES.has(codigo.length)) return false;
  if (/^0+$/.test(codigo)) return false;
  const cuerpo = codigo.slice(0, -1);
  return digitoDeControl(cuerpo) === codigo.charCodeAt(codigo.length - 1) - 48;
}

/**
 * La forma única con la que se busca y se guarda un código.
 *
 * Sin esto, el mismo producto puede entrar dos veces con dos escrituras
 * distintas —el UPC-A de 12 cifras y su EAN-13 con un cero delante son el mismo
 * artículo— y la caché global, que es única por código, tendría duplicados.
 *
 *   · 12 cifras (UPC-A)             → se le pone un 0 delante  → 13
 *   · 14 cifras con 0 delante       → se le quita              → 13
 *   · 14 cifras con otro delante    → se queda: es un GTIN-14 de verdad (una
 *                                     caja, no la unidad), otro artículo
 *   · 8 cifras (EAN-8) y 13 cifras  → se quedan como están
 *
 * Devuelve null si no es un GTIN válido. Nunca "arregla" un código: ni rellena
 * ceros por la izquierda ni corrige el control.
 */
export function normalizarGtin(entrada: string): string | null {
  const codigo = entrada.trim();
  if (!esGtinValido(codigo)) return null;
  if (codigo.length === 12) return `0${codigo}`;
  if (codigo.length === 14 && codigo.startsWith('0')) return codigo.slice(1);
  return codigo;
}
