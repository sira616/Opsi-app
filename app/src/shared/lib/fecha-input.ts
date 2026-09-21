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
 * Rechaza el 31 de febrero en vez de dejar que JavaScript lo convierta solo en
 * el 3 de marzo: guardar una fecha que nadie escribió es peor que no guardar
 * ninguna.
 */
export function aIso(texto: string): string | null {
  const d = texto.replace(/\D/g, '');
  if (d.length !== 8) return null;

  const dia = Number(d.slice(0, 2));
  const mes = Number(d.slice(2, 4));
  const anio = Number(d.slice(4));

  const fecha = new Date(anio, mes - 1, dia);
  if (fecha.getFullYear() !== anio || fecha.getMonth() !== mes - 1 || fecha.getDate() !== dia) {
    return null;
  }
  return `${anio}-${`${mes}`.padStart(2, '0')}-${`${dia}`.padStart(2, '0')}`;
}

/** Atajos para lo que más se teclea. */
export function enDias(dias: number): string {
  const f = new Date();
  f.setDate(f.getDate() + dias);
  return formatearMientrasEscribe(
    `${`${f.getDate()}`.padStart(2, '0')}${`${f.getMonth() + 1}`.padStart(2, '0')}${f.getFullYear()}`,
  );
}
