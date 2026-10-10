/**
 * Lo que ve la persona cuando algo falla y no sabemos traducirlo.
 *
 * Hasta ahora, un error que no reconocían `describeDbError` ni `describeAuthError`
 * salía tal cual lo escribió el motor: en inglés, y a veces con el nombre de una
 * restricción o de una tabla. Eso no ayuda a quien lo lee (no puede hacer nada
 * con «violates check constraint») y enseña la forma interna de la base de datos.
 *
 * Ahora el detalle va a donde lo puede usar quien programa, y la persona recibe
 * una frase que dice qué hacer:
 *
 *   · En DESARROLLO (`__DEV__`), el error real sale por la consola del bundler.
 *   · En PRODUCCIÓN no sale por ningún lado. Todavía no hay dónde mandarlo: cuando
 *     se monte la monitorización (ver docs/internal/PENDIENTES.md), este es el
 *     único punto por el que pasa todo lo que no se supo traducir, así que ahí es
 *     donde se engancha, y sin que el texto crudo llegue nunca a la pantalla.
 *
 * Los mensajes que SÍ están escritos para leerse —los que lanzan nuestras
 * funciones con `raise exception`— no llegan aquí: se reconocen por su código y
 * se enseñan tal cual (ver `CODIGOS_NUESTROS` en db-errors.ts).
 */

export const ERROR_GENERICO =
  'Algo ha fallado de nuestra parte. Prueba otra vez en un momento; si sigue igual, ' +
  'cierra la app y ábrela de nuevo.';

export function errorSinTraducir(
  origen: 'base de datos' | 'sesión' | 'catálogo',
  error: unknown,
): string {
  if (__DEV__) {
    // Es la única llamada a la consola de toda la app, y solo existe en desarrollo:
    // en un build de producción `__DEV__` es falso y el bloque se descarta.
    console.warn(`[opsi] error de ${origen} sin traducir (la persona ve el mensaje genérico):`, error);
  }
  return ERROR_GENERICO;
}
