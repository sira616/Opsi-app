/**
 * Cuánto hay que bajar lo de arriba de una pantalla para que no quede bajo el notch, la
 * isla o la barra de estado. Es la parte pura (sin pantalla), para poder probarla.
 *
 * Se confía en el área segura (`insetsArriba`), pero con un MÍNIMO propio por plataforma y
 * quedándose con el mayor de los dos. Dentro de un modal a pantalla completa el área segura
 * puede salir como 0, o con un valor distinto del que mide el contenedor: los botones de
 * arriba quedaban tapados por el recorte y no se podían tocar. El mínimo es lo que mide una
 * barra de estado: la real en Android (con un suelo para los recortes grandes) y ~47 en un
 * iPhone con recorte. Pasarse un poco es barato; quedarse corto deja un botón inalcanzable.
 *
 * No se suma al área segura: se elige el mayor. Sumarlos la contaría dos veces cuando el
 * contenedor ya la aplica, y restarla de un mínimo deja la barra pegada al borde cuando
 * el contenedor la mide como 0 y quien llama la da por buena.
 */
export type Plataforma = 'ios' | 'android' | 'web' | 'windows' | 'macos';

/** Alto mínimo de una barra de estado en un iPhone con recorte. */
export const MINIMO_IOS = 47;
/** Suelo en Android: hay recortes más altos que la barra de estado por defecto (24). */
export const MINIMO_ANDROID = 32;

export function margenSuperior(
  insetsArriba: number,
  plataforma: Plataforma,
  alturaBarraEstado: number | null | undefined,
): number {
  const seguro = Number.isFinite(insetsArriba) && insetsArriba > 0 ? insetsArriba : 0;
  let minimo = 0;
  if (plataforma === 'ios') minimo = MINIMO_IOS;
  else if (plataforma === 'android') {
    const barra = Number.isFinite(alturaBarraEstado) && (alturaBarraEstado ?? 0) > 0 ? (alturaBarraEstado as number) : 0;
    minimo = Math.max(barra, MINIMO_ANDROID);
  }
  return Math.max(seguro, minimo);
}
