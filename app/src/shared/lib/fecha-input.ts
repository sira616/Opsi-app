/**
 * El campo de fecha se escribe solo con números.
 *
 * El problema que resuelve: en iOS, un campo con teclado numérico no tiene la
 * barra «/», así que era imposible escribir 31/12/2026. Y cambiar a un teclado
 * completo obliga a buscar los números entre las letras, que es peor.
 *
 * La solución es que el usuario NO escriba las barras: teclea 31122026 y las
 * barras aparecen solas. Menos pulsaciones y ningún teclado raro.
 */

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

  if (d.length === 0) return 'Escribe la fecha, o quita la marca de «Ponerle fecha».';
  if (d.length < 6) return 'Falta el resto: día, mes y año.';
  if (d.length === 7) return 'Al año le falta una cifra.';
  if (aIso(texto) === null) return 'Ese día no existe. Revisa el día y el mes.';
  return null;
}

/** Atajos para lo que más se teclea. */
export function enDias(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return formatearMientrasEscribe(
    `${`${f.getDate()}`.padStart(2, '0')}${`${f.getMonth() + 1}`.padStart(2, '0')}${f.getFullYear()}`,
  );
}
