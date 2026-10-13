/**
 * Un recado de la pantalla que guarda a la que estaba debajo.
 *
 * El escáner se queda abierto mientras se rellena el formulario completo, para poder
 * seguir con el siguiente producto al volver. Cuando el formulario guarda, quien
 * está debajo quiere decir «Leche entera, guardada», y una ruta no tiene forma de
 * devolver un resultado. Esto es esa forma, y es deliberadamente mínima: un nombre
 * y una hora, en memoria, que se leen UNA vez.
 */

let ultimo: { nombre: string; en: number } | null = null;

export function recordarGuardado(nombre: string): void {
  ultimo = { nombre, en: Date.now() };
}

/** Lo último que se guardó hace poco, y se olvida: se enseña una sola vez. */
export function tomarGuardado(maxMs = 10_000): string | null {
  const recado = ultimo;
  ultimo = null;
  return recado && Date.now() - recado.en <= maxMs ? recado.nombre : null;
}
