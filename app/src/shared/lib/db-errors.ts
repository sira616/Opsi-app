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

export function describeDbError(error: unknown): string {
  const e = (error ?? {}) as SupabaseLikeError;
  const message = e.message ?? String(error);
  const lower = message.toLowerCase();
  const code = e.code ?? '';

  // ── El esquema no está al día ──────────────────────────────────────────
  // PGRST202: función no encontrada. 42P01: la tabla o vista no existe.
  // 42883: no existe la función. Los tres significan lo mismo en la práctica.
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
  if (code === '23514' || lower.includes('violates check constraint')) {
    if (lower.includes('unit')) return 'Esa unidad no encaja con lo que estás midiendo.';
    if (lower.includes('date')) return 'Una fecha necesita saber de qué tipo es y de dónde sale.';
    if (lower.includes('quantity')) return 'La cantidad no cuadra.';
    return 'Ese dato no es válido. Revisa lo que has puesto.';
  }
  // Los mensajes que lanzan nuestras funciones RPC ya vienen escritos en
  // español y dicen más que cualquier traducción genérica. P0002 estaba
  // reemplazado por «ese elemento ya no existe», y eso tapó durante un rato un
  // «No tienes ningún hogar» que era la verdadera pista.
  if (code === '22023' || code === 'P0001') return message;
  if (code === 'P0002') {
    return message || 'Ese elemento ya no existe, o no es de tu hogar.';
  }

  // ── Permisos y sesión ──────────────────────────────────────────────────
  if (code === '42501' || lower.includes('row-level security')) {
    return 'No tienes permiso para eso. Puede que tu sesión haya caducado: vuelve a entrar.';
  }
  if (lower.includes('jwt') && (lower.includes('expired') || lower.includes('invalid'))) {
    return 'Tu sesión ha caducado. Vuelve a entrar.';
  }

  // ── Red ────────────────────────────────────────────────────────────────
  if (esFalloDeRed(message)) return mensajeSinConexion();

  return message;
}
