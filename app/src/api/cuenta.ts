/**
 * La cuenta: el correo y la contraseña.
 *
 * Esto no es una tabla. Vive en `auth.users`, que el cliente no puede leer ni
 * escribir directamente, así que todo pasa por GoTrue (`supabase.auth`) salvo
 * la lectura del correo, que va por una función `SECURITY DEFINER`.
 *
 * Recordatorio de por qué existe esta pantalla: al registrarse solo se pide
 * usuario y contraseña, y el correo que se guarda es sintético (ver
 * `shared/lib/usuario.ts`). Sin un correo de verdad no hay forma de recuperar
 * la contraseña si se olvida, así que se ofrece añadirlo después.
 */

import { supabase } from '@/shared/lib/supabase';

/**
 * El correo real del usuario, o null si todavía usa el sintético.
 *
 * Lo resuelve `public.mi_correo()`, filtrada por `auth.uid()`. Se prefiere a
 * mirar `session.user.email` porque ese valor se queda congelado en el token
 * hasta que se refresca: tras confirmar un correo nuevo, la sesión aún
 * enseñaría el viejo.
 */
export async function fetchMiCorreo(): Promise<string | null> {
  const { data, error } = await supabase.rpc('mi_correo');
  if (error) throw error;
  return (data as string | null) ?? null;
}

/**
 * Añade o cambia el correo. No surte efecto hasta que se confirma.
 *
 * GoTrue manda un enlace al correo nuevo y solo entonces REEMPLAZA el que
 * hubiera —el sintético, la primera vez—. Hasta ese momento se puede seguir
 * entrando con el usuario de siempre, así que un correo mal escrito no deja a
 * nadie fuera.
 */
export async function cambiarCorreo(correo: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ email: correo.trim().toLowerCase() });
  if (error) throw error;
}

/**
 * Cambia la contraseña de quien ya está dentro.
 *
 * No pide la actual: GoTrue no la comprueba y fingir que lo hace sería peor
 * que no pedirla. La protección real es que hace falta una sesión válida.
 */
export async function cambiarContrasena(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/**
 * Reenvía el enlace de confirmación del correo pendiente.
 *
 * Los correos de confirmación se pierden —spam, se cierra la pestaña— y sin
 * esto la única salida sería volver a escribir el mismo correo.
 */
export async function reenviarConfirmacion(correo: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'email_change',
    email: correo.trim().toLowerCase(),
  });
  if (error) throw error;
}
