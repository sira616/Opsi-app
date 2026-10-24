/**
 * Limpieza de texto que viaja HACIA o DESDE el modelo en `opsi-chat`.
 *
 * El modelo recibe nombres de productos que ha escrito cualquiera: quien comparte la nevera
 * o la lista, o Open Food Facts (un wiki que edita cualquiera). Un nombre es un dato, pero un
 * modelo no distingue siempre un dato de una orden, y hay formas de esconderle una orden a
 * una persona que lo revisa: caracteres que no se ven («etiquetas» U+E0000 que codifican texto
 * invisible, espacios de ancho cero), que cambian el orden en que se lee (marcas de dirección) o
 * que ni siquiera son texto (control). Aquí se quitan, y el nombre se acota.
 *
 * Es la MISMA clase de caracteres que ya se quita al escribir los datos de salud y de nutrición
 * (`upsert_global_product`, `check_user_profile`); está repetida porque la función de servidor
 * no puede importar código de la app, y se prueba contra los mismos casos.
 *
 * Esto es una defensa en profundidad, NO la defensa: lo que protege de verdad es que las
 * herramientas son de solo lectura y corren con la sesión de la persona (RLS), y que las
 * instrucciones al modelo dicen que un dato no es una orden. Antes de dar al modelo una
 * herramienta que ESCRIBA hay que repasar esto entero (ver docs/threat-model.md, §10).
 */

/** Lo más largo que llega al modelo de un nombre. Un nombre de producto cabe de sobra. */
export const MAX_LONGITUD_DATO = 80;

/** Caracteres que no se ven o cambian cómo se lee un texto. Se compara por código de carácter. */
export function esCaracterOculto(codigo: number): boolean {
  return (
    // Control: se quedan el tabulador, el salto de línea y el retorno (los trata quien llama).
    (codigo < 0x20 && codigo !== 0x09 && codigo !== 0x0a && codigo !== 0x0d) ||
    (codigo >= 0x7f && codigo <= 0x9f) ||
    codigo === 0xad || // guion blando
    (codigo >= 0x200b && codigo <= 0x200f) || // ancho cero y marcas de dirección
    (codigo >= 0x202a && codigo <= 0x202e) || // incrustaciones de dirección
    (codigo >= 0x2060 && codigo <= 0x2069) || // uniones de palabras, aislamientos de dirección
    (codigo >= 0xd800 && codigo <= 0xdfff) || // mitades de par suplente sueltas
    (codigo >= 0xe000 && codigo <= 0xf8ff) || // uso privado
    (codigo >= 0xfff9 && codigo <= 0xfffb) || // anotaciones intercaladas
    codigo === 0xfeff || // marca de orden de bytes
    (codigo >= 0xe0000 && codigo <= 0xe007f) // «etiquetas»: texto invisible
  );
}

/** Quita los caracteres ocultos y deja el resto tal cual (saltos de línea incluidos). */
export function quitarCaracteresOcultos(texto: string): string {
  let salida = '';
  for (const caracter of texto) {
    if (!esCaracterOculto(caracter.codePointAt(0) ?? 0)) salida += caracter;
  }
  return salida;
}

/**
 * Un nombre listo para dárselo al modelo: sin caracteres ocultos, todo el espacio en blanco
 * como un único espacio, recortado y acotado a `max` caracteres (contando caracteres de
 * verdad, no unidades UTF-16). Lo que no es texto es una cadena vacía.
 */
export function sanearDato(valor: unknown, max: number = MAX_LONGITUD_DATO): string {
  if (typeof valor !== 'string') return '';
  const sinOcultos = quitarCaracteresOcultos(valor);
  const compacto = sinOcultos.replace(/\s+/g, ' ').trim();
  const caracteres = [...compacto];
  if (caracteres.length <= max) return compacto;
  return `${caracteres.slice(0, max - 1).join('').trimEnd()}…`;
}
