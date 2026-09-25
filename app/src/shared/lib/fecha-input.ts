/**
 * El campo de fecha se escribe solo con números.
 *
 * El problema que resuelve: en iOS, un campo con teclado numérico no tiene la
 * barra «/», así que era imposible escribir 31/12/2026. Y cambiar a un teclado
 * completo obliga a buscar los números entre las letras, que es peor.
 *
 * La solución es que el usuario NO escriba las barras: teclea 31122026 y las
 * barras aparecen solas. Menos pulsaciones y ningún teclado raro.
 *
 * Aquí vive también la otra forma de poner una fecha: en DÍAS. Cuando la
 * decide la persona y no el envase, «me dura una semana» es lo que sabe, y
 * el calendario lo pone Opsi.
 */

import { toIsoDate } from './dates';

/** Va formateando mientras se escribe: 3112 → «31/12». */
export function formatearMientrasEscribe(texto: string): string {
  const digitos = texto.replace(/\D/g, '').slice(0, 8);
  if (digitos.length <= 2) return digitos;
  if (digitos.length <= 4) return `${digitos.slice(0, 2)}/${digitos.slice(2)}`;
  return `${digitos.slice(0, 2)}/${digitos.slice(2, 4)}/${digitos.slice(4)}`;
}

/**
 * A la fecha ISO que espera la base de datos, o null si no es una fecha real.
 *
 * Acepta el año de DOS cifras además del de cuatro: «31/12/26» es como se lee
 * la fecha en la mitad de los envases, y obligar a escribir el siglo era pedir
 * dos pulsaciones para no aportar nada. Se interpreta siempre como 20xx, que
 * en una app de comida es lo único que tiene sentido.
 *
 * Rechaza el 31 de febrero en vez de dejar que JavaScript lo convierta solo en
 * el 3 de marzo: guardar una fecha que nadie escribió es peor que no guardar
 * ninguna.
 */
export function aIso(texto: string): string | null {
  const d = texto.replace(/\D/g, '');
  if (d.length !== 6 && d.length !== 8) return null;

  const dia = Number(d.slice(0, 2));
  const mes = Number(d.slice(2, 4));
  const resto = d.slice(4);
  const anio = resto.length === 2 ? 2000 + Number(resto) : Number(resto);

  const fecha = new Date(anio, mes - 1, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
    return null;
  }
  return `${anio}-${`${mes}`.padStart(2, '0')}-${`${dia}`.padStart(2, '0')}`;
}

/**
 * Qué le pasa a lo que hay escrito, en una frase, o null si está bien.
 *
 * Antes solo había un mensaje para todo: «Esa fecha no existe. Escribe los
 * ocho dígitos: 31122026». Decía dos cosas distintas a la vez y la segunda
 * parecía un código que había que copiar tal cual. Ahora cada caso dice lo
 * suyo, y ninguno enseña una ristra de dígitos como si fuera un ejemplo.
 */
export function problemaFecha(texto: string): string | null {
  const d = texto.replace(/\D/g, '');

  if (d.length === 0) return 'Copia la fecha del envase, o quita la marca de «Ponerle fecha».';
  if (d.length < 6) return 'Falta el resto: día, mes y año.';
  if (d.length === 7) return 'Al año le falta una cifra.';
  if (aIso(texto) === null) return 'Ese día no existe. Repasa el día y el mes.';
  return null;
}

/**
 * La fecha de dentro de N días, ya en ISO. Es lo que se guarda.
 *
 * Cuando la fecha la decide la persona —«me dura una semana»—, lo que teclea
 * son días, no un día del calendario. La cuenta se hace aquí y no en la
 * pantalla para que el atajo de «1 semana», el campo de días y lo que acaba
 * en la base de datos salgan los tres del mismo sitio.
 */
export function isoEnDias(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return toIsoDate(f);
}

/** Lo mismo, pero escrito como lo escribiría el usuario: «31/12/2026». */
export function enDias(dias: number): string {
  const iso = isoEnDias(dias);
  return formatearMientrasEscribe(`${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`);
}

/** Cinco años. Más que eso no es una conserva: es un error de tecleo. */
export const DIAS_MAX = 1825;

/**
 * Qué le pasa a los días escritos, o null si están bien.
 *
 * Es el gemelo de `problemaFecha` para el modo «la calculo yo», y existe por
 * lo mismo: cada mensaje tiene que decir qué hacer. Ninguno de estos puede
 * hablar de escribir una fecha, porque en ese modo no hay ninguna que
 * escribir.
 */
export function problemaDias(texto: string): string | null {
  const limpio = texto.trim();

  if (limpio.length === 0) return 'Dime cuántos días, o toca uno de los atajos.';

  const dias = Number(limpio);
  if (!Number.isInteger(dias)) return 'Días enteros, sin comas ni decimales.';
  if (dias < 1) return 'Un día como mínimo.';
  if (dias > DIAS_MAX) return 'Eso son demasiados días. Si de verdad dura años, pon la fecha.';
  return null;
}

/**
 * Una fecha en palabras: «el martes, 6 de octubre de 2026».
 *
 * Se enseña debajo del campo de días para que se vea qué se va a guardar
 * antes de guardarlo. Un número de días es cómodo de teclear y muy fácil de
 * equivocar por un cero de más.
 */
export function fechaLegible(texto: string): string | null {
  const iso = aIso(texto);
  if (iso === null) return null;

  const anio = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const dia = Number(iso.slice(8, 10));

  return new Date(anio, mes - 1, dia).toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
