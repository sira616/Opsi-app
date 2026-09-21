/**
 * Traduce los errores de Supabase Auth a algo que se pueda leer.
 *
 * Enseñar "Invalid login credentials" en una app en español es una forma
 * barata de parecer un prototipo. Y hay un caso que importa de verdad: el de
 * la contraseña corta, donde el usuario necesita saber el mínimo exacto —que
 * son 10 caracteres, fijados en supabase/config.toml— y no un "password is
 * too weak" que no dice cuánto.
 */
export function describeAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('invalid login credentials')) {
    return 'Ese correo y esa contraseña no coinciden.';
  }
  if (lower.includes('user already registered')) {
    return 'Ya hay una cuenta con ese correo. Prueba a entrar.';
  }
  if (lower.includes('password') && (lower.includes('short') || lower.includes('least'))) {
    return 'La contraseña necesita al menos 10 caracteres.';
  }
  if (lower.includes('unable to validate email') || lower.includes('invalid email')) {
    return 'Ese correo no parece válido.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Tienes que confirmar el correo antes de entrar.';
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return 'No se ha podido conectar. ¿Está levantado Supabase?';
  }
  return message;
}
