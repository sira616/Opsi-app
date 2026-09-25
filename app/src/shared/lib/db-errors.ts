/**
 * Traduce los errores de Supabase y PostgREST a algo accionable.
 *
 * El caso que motivó este fichero: si la base de datos local va por detrás del
 * código —porque se hizo `git pull` pero no `npm run db:reset`—, las funciones
 * y vistas nuevas no existen, y PostgREST responde con un mensaje en inglés
 * sobre la caché del esquema. En la app eso se veía como «no puedo añadir
 * comida», que no se parece en nada a su causa.
 *
 * Cada rama de aquí dice QUÉ HACER, no solo qué pasó.
 *
 * ── La regla que manda sobre todas las demás ───────────────────────────────
 *
 * Hay dos clases de error y no se tratan igual:
 *
 *   · **Lo escribió una función nuestra para que se lea.** Está en español,
 *     nombra el caso concreto y muchas veces trae el dato que lo explica
 *     —«Quieres usar 500 pero solo quedan 300»—. Eso PASA TAL CUAL. Cambiarlo
 *     es cambiar información por decoración.
 *   · **Lo escupió el motor.** Está en inglés y habla de tablas, constraints y
 *     políticas. Eso sí se traduce, porque tal cual no le sirve a nadie.
 *
 * La regla se ha roto cuatro veces y las cuatro costaron caro:
 *
 *   1. **P0002.** Se sustituía por «Ese elemento ya no existe», y eso tapó
 *      durante días un «No tienes ningún hogar» que era la pista de verdad.
 *   2. **Usar cantidad.** Un `onError` propio en el detalle cambiaba la
 *      respuesta del servidor por «No se pudo usar esa cantidad» y borraba el
 *      número exacto, que era justo lo que había que leer.
 *   3. **Sin conexión.** El aviso de red no decía contra qué URL había fallado,
 *      así que todas las causas se parecían. Lo arregla `conexion.ts`.
 *   4. **42501.** Las funciones de la nevera compartida lo lanzan con un
 *      mensaje escrito en español —«Solo quien creó la nevera compartida puede
 *      hacer esto…»— y esta función lo pisaba con un genérico, porque el motor
 *      usa ESE MISMO código para denegar por RLS. De ahí la regla de abajo: el
 *      código no decide, decide quién escribió el mensaje.
 *
 * Antes de añadir una rama nueva: ¿el mensaje lo escribió una función nuestra?
 * Si es que sí, no hay rama que añadir. Si suena raro, se cambia en SQL.
 */

import { esFalloDeRed, mensajeSinConexion } from './conexion';

type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

const FALTA_MIGRAR =
  'Tu base de datos va por detrás del código.\n\n' +
  'Ejecuta en el ordenador:  npm run db:reset';

/**
 * Los códigos con los que NUESTRAS funciones le hablan al usuario.
 *
 * Los tres salen de un `raise exception ... using errcode` escrito a mano, así
 * que su mensaje ya viene en español y dice más que cualquier traducción de
 * aquí. No hay ningún caso en que el motor los genere por su cuenta.
 */
const CODIGOS_NUESTROS = new Set(['22023', 'P0001', 'P0002']);

/**
 * Cómo deniega un permiso el motor, que son cuatro formas y no cambian.
 *
 * Hace falta la lista porque 42501 es un código COMPARTIDO: lo lanzan tanto
 * `require_owner_household()` y compañía, con su frase en español, como
 * PostgreSQL al chocar con una política de RLS. Lo que los distingue es el
 * texto, y el del motor siempre es una de estas.
 */
const PERMISO_DEL_MOTOR = [
  'permission denied',
  'row-level security',
  'must be owner of',
  'insufficient privilege',
];

function loEscribioElMotor(lower: string): boolean {
  return PERMISO_DEL_MOTOR.some((frase) => lower.includes(frase));
}

export function describeDbError(error: unknown): string {
  const e = (error ?? {}) as SupabaseLikeError;
  const message = e.message ?? String(error);
  const lower = message.toLowerCase();
  const code = e.code ?? '';

  // ── Lo que ya viene escrito para leerse ────────────────────────────────
  // Va lo PRIMERO y decide por código, no por lo que diga el texto: cualquier
  // olfateo de cadenas por delante puede tragarse uno de estos sin querer.
  if (CODIGOS_NUESTROS.has(code) && message) return message;

  // ── Permisos ───────────────────────────────────────────────────────────
  // El código compartido. Si el mensaje no es de los del motor, lo escribió
  // una función nuestra y se enseña tal cual: dice de quién depende y a quién
  // pedírselo, cosa que ningún texto genérico puede saber.
  if (code === '42501' || lower.includes('row-level security')) {
    if (message && !loEscribioElMotor(lower)) return message;
    return 'No tienes permiso para eso. Si la sesión ha caducado, vuelve a entrar y prueba otra vez.';
  }

  // ── El esquema no está al día ──────────────────────────────────────────
  // PGRST202: función no encontrada. 42P01: la tabla o vista no existe.
  // 42883: no existe la función. Los tres significan lo mismo en la práctica,
  // y los tres los escribe el motor en inglés.
  if (
    code === 'PGRST202' ||
    code === '42P01' ||
    code === '42883' ||
    lower.includes('could not find the function') ||
    lower.includes('schema cache') ||
    lower.includes('does not exist')
  ) {
    return FALTA_MIGRAR;
  }

  // ── Restricciones del dominio ──────────────────────────────────────────
  // Aquí el genérico es lo correcto: un 23514 llega crudo del motor, nombra la
  // constraint y la tabla, y eso no se le enseña a nadie.
  if (code === '23514' || lower.includes('violates check constraint')) {
    if (lower.includes('unit')) return 'Esa unidad no encaja con lo que estás midiendo. Elige otra.';
    if (lower.includes('date')) return 'A esa fecha le falta el tipo o el origen. Vuelve a elegirlos.';
    if (lower.includes('quantity')) return 'La cantidad no cuadra. Revísala.';
    return 'Ese dato no es válido. Revisa lo que has puesto.';
  }

  // Solo se llega aquí con un P0002 sin mensaje, que no debería pasar.
  if (code === 'P0002') return 'Ese elemento ya no existe, o no es de tu hogar.';

  // ── Sesión ─────────────────────────────────────────────────────────────
  // Lo escribe GoTrue, en inglés.
  if (lower.includes('jwt') && (lower.includes('expired') || lower.includes('invalid'))) {
    return 'Tu sesión ha caducado. Vuelve a entrar.';
  }

  // ── Red ────────────────────────────────────────────────────────────────
  // No es una traducción: `conexion.ts` AÑADE la URL contra la que se falló,
  // que es el dato que distingue una causa de otra.
  if (esFalloDeRed(message)) return mensajeSinConexion();

  return message;
}

/**
 * Las pistas estables (`hint`) con las que el servidor marca los `P0001` que la
 * app tiene que distinguir para hacer algo DISTINTO, y no para escribir otro
 * texto. Salen de 20260924110000 y son un contrato: cambiar una es romper a
 * quien la lee.
 *
 *   · `limite_neveras`  ya tienes todas las neveras que tu plan permite
 *                       (crear una compartida o aceptar una invitación).
 *   · `nevera_llena`    no queda plaza en esa nevera (invitar o aceptar).
 *   · `nevera_personal` se intentó compartir, invitar, echar o abandonar la
 *                       privada.
 *   · `debe_traspasar`  quien lleva una compartida con más gente quiere salir
 *                       sin traspasarla antes.
 */
export const PISTAS = {
  limiteNeveras: 'limite_neveras',
  neveraLlena: 'nevera_llena',
  neveraPersonal: 'nevera_personal',
  debeTraspasar: 'debe_traspasar',
} as const;

/**
 * La pista del error, si el servidor puso una.
 *
 * Sirve para decidir QUÉ ENSEÑAR ADEMÁS —un aviso de tope, una nota de qué
 * hacer—, nunca para reescribir el mensaje: ese sigue saliendo de
 * `describeDbError`, tal cual lo escribió el servidor. Ver la regla de arriba.
 */
export function pistaDeError(error: unknown): string | null {
  const hint = (error as SupabaseLikeError | null | undefined)?.hint;
  return typeof hint === 'string' && hint.length > 0 ? hint : null;
}
