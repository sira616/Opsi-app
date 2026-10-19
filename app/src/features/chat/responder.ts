import { supabase } from '@/shared/lib/supabase';

import { paraEnviar, type Mensaje } from './mensajes';

/**
 * La costura entre la pantalla del chat y quien contesta: la Edge Function `opsi-chat`.
 *
 * La pantalla le pasa la conversación y espera un texto. La función comprueba la sesión, deja
 * que el modelo mire tu inventario con herramientas que corren con TU sesión (la RLS limita lo
 * que puede ver) y devuelve la respuesta. Las claves del modelo no llegan al móvil.
 *
 * Lo que se escribe aquí SALE del móvil: va a la función y de ahí al proveedor del modelo (hoy
 * Ollama Cloud, en desarrollo). Si el proveedor cambia, hay que cambiar también el aviso de la
 * pantalla y `docs/PRIVACIDAD.md` (el hueco del proveedor de IA).
 *
 * Si algo falla se lanza el error y la pantalla dice que no ha podido contestar: aquí no se
 * inventa una respuesta.
 */
export async function responder(conversacion: readonly Mensaje[]): Promise<string> {
  const { data, error } = await supabase.functions.invoke('opsi-chat', {
    body: { mensajes: paraEnviar(conversacion) },
  });
  if (error) throw error;
  const respuesta = (data as { respuesta?: unknown } | null)?.respuesta;
  if (typeof respuesta !== 'string' || respuesta.trim() === '') {
    throw new Error('opsi-chat no devolvió una respuesta');
  }
  return respuesta;
}
