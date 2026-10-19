import type { Mensaje } from './mensajes';

/**
 * La costura entre la pantalla del chat y quien contesta.
 *
 * Hoy no contesta nadie: la IA todavía no está conectada (fase 5), y esta función solo dice
 * la verdad, sin inventar una respuesta ni fingir que piensa. Cuando haya modelo, es lo
 * único que cambia: la pantalla le pasa la conversación y espera un texto, y la llamada
 * irá a una Edge Function (las claves no llegan al móvil; ver README, «La asistente») con la
 * sesión de la persona, para que la RLS limite lo que la asistente puede ver.
 *
 * Mientras tanto NADA de lo que se escribe sale del móvil: no hay red aquí. Si esto cambia,
 * hay que cambiar también el aviso de la pantalla («Lo que escribas aquí no sale de tu
 * móvil») y el aviso de privacidad (`docs/PRIVACIDAD.md`, el hueco del proveedor de IA).
 */
export async function responder(_conversacion: readonly Mensaje[]): Promise<string> {
  return 'Todavía no puedo contestar.';
}
