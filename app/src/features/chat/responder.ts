import { supabase } from '@/shared/lib/supabase';

import { paraEnviar, type Mensaje } from './mensajes';
import { leerPropuestas, type PropuestaChat } from './propuestas';

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
 * inventa una respuesta. Si la persona ha llegado al límite de mensajes (la cuota del servidor, 429)
 * se lanza `ErrorLimiteChat` con lo que falta, y la pantalla se lo dice. Si no tiene Opsi Premium
 * (403, el chat es de pago), `ErrorSoloPremium`.
 */
/** La persona ha gastado su cuota de mensajes: `esperaS` es lo que falta para poder volver a preguntar. */
export class ErrorLimiteChat extends Error {
  constructor(readonly esperaS: number) {
    super('limite_de_mensajes');
  }
}

/** El chat es de Opsi Premium ⭐ y esta persona no lo tiene: el servidor contestó 403. */
export class ErrorSoloPremium extends Error {
  constructor() {
    super('solo_premium');
  }
}

/** Si el fallo de la función es un 429, cuánto falta; si no, null. El cuerpo es entrada de fuera. */
async function esperaDelLimite(error: unknown): Promise<number | null> {
  const contexto = (error as { context?: unknown } | null)?.context as
    | { status?: unknown; json?: () => Promise<unknown> }
    | undefined;
  if (!contexto || contexto.status !== 429) return null;
  const cuerpo = (await contexto.json?.().catch(() => null)) as { espera_s?: unknown } | null;
  const espera = cuerpo?.espera_s;
  return typeof espera === 'number' && Number.isFinite(espera) && espera > 0 ? espera : 60;
}

/** Lo que contesta el chat: el texto y, si las hay, las propuestas que la persona confirma o rechaza. */
export type RespuestaChat = { texto: string; propuestas: PropuestaChat[] };

export async function responder(conversacion: readonly Mensaje[]): Promise<RespuestaChat> {
  const { data, error } = await supabase.functions.invoke('opsi-chat', {
    body: { mensajes: paraEnviar(conversacion) },
  });
  if (error) {
    if ((error as { context?: { status?: unknown } } | null)?.context?.status === 403) {
      throw new ErrorSoloPremium();
    }
    const espera = await esperaDelLimite(error);
    if (espera !== null) throw new ErrorLimiteChat(espera);
    throw error;
  }
  const cuerpo = data as { respuesta?: unknown; propuestas?: unknown } | null;
  const respuesta = cuerpo?.respuesta;
  if (typeof respuesta !== 'string' || respuesta.trim() === '') {
    throw new Error('opsi-chat no devolvió una respuesta');
  }
  // Las propuestas vienen de un modelo: se leen con desconfianza y lo que no cuadra no existe.
  return { texto: respuesta, propuestas: leerPropuestas(cuerpo?.propuestas) };
}
