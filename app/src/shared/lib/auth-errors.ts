/**
 * Traduce los errores de Supabase Auth a algo que se pueda leer.
 *
 * Enseñar "Invalid login credentials" en una app en español es una forma
 * barata de parecer un prototipo. Y hay un caso que importa de verdad: el de
 * la contraseña corta, donde el usuario necesita saber el mínimo exacto —que
 * son 10 caracteres, fijados en supabase/config.toml— y no un "password is
 * too weak" que no dice cuánto.
 */
import { esFalloDeRed, mensajeSinConexion } from './conexion';

export function describeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Ese usuario y esa contraseña no coinciden.';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'Ese usuario ya está cogido. Prueba con otro.';
  }
  // El nombre de usuario viaja dentro de un correo sintético, así que un
  // choque de unicidad en user_settings sale por aquí y no por db-errors.
  if (lower.includes('user_settings_username_key')) {
    return 'Ese usuario ya está cogido. Prueba con otro.';
  }
  if (lower.includes('user_settings_username_ck')) {
    return 'El usuario solo admite letras sin acentos, números y guion bajo.';
  }
  // El alta solo admite usuarios de Opsi y nombres no reservados; cuando el
  // servidor lo rechaza, GoTrue lo devuelve así y sin decir el porqué (a
  // propósito: no hay que contar qué nombres existen ni cuáles están reservados).
  if (lower.includes('database error saving new user')) {
    return 'No se ha podido crear la cuenta con ese usuario. Prueba con otro.';
  }
  if (lower.includes('password') && (lower.includes('short') || lower.includes('least'))) {
    return 'La contraseña necesita al menos 10 caracteres.';
  }
  if (lower.includes('unable to validate email') || lower.includes('invalid email')) {
    return 'Ese correo no parece válido. Repásalo.';
  }
  if (lower.includes('email address') && lower.includes('in use')) {
    return 'Ese correo ya está en otra cuenta. Prueba con otro.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Confirma el correo antes de entrar.';
  }
  if (lower.includes('same password')) {
    return 'Esa contraseña es la que ya tenías. Pon otra distinta.';
  }
  if (lower.includes('for security purposes') || lower.includes('rate limit')) {
    return 'Has probado demasiadas veces seguidas. Espera un minuto.';
  }
  // El mensaje de red lo escribe conexion.ts, que sabe contra qué URL se
  // estaba intentando conectar. Sin ese dato el aviso no sirve de nada.
  if (esFalloDeRed(message)) return mensajeSinConexion();

  return message;
}
