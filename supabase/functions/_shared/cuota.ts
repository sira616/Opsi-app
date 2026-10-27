/**
 * Gastar un mensaje de la cuota de IA de la persona (`use_chat_quota`), igual para el chat y para
 * el lector de tickets: los dos llaman a un modelo de pago y comparten presupuesto (20 por hora y
 * 100 al día por persona), y los dos son de Opsi Premium ⭐.
 *
 * Aquí solo se traduce lo que contesta la base de datos; la llamada la hace quien lo usa, con el
 * token de la persona (nunca con una clave de servicio).
 *
 *   · 42501 con pista `premium`  → `soloPremium`: no es premium, no se gastó nada.
 *   · otro error                  → se lanza: sin poder comprobar la cuota NO se contesta.
 *   · `(allowed, wait_s)`         → permitido, o cuánto falta para que vuelva a caber.
 */

import type { Cuota } from './chat.ts';

type RespuestaRpc = {
  data: unknown;
  error: { code?: string; hint?: string } | null;
};

export async function gastarCuota(llamada: () => PromiseLike<RespuestaRpc>): Promise<Cuota> {
  const { data, error } = await llamada();
  if (error && error.code === '42501' && error.hint === 'premium') {
    return { permitido: false, esperaS: 0, soloPremium: true };
  }
  if (error) throw error;
  const fila = (Array.isArray(data) ? data[0] : data) as { allowed?: unknown; wait_s?: unknown } | null;
  if (!fila || typeof fila.allowed !== 'boolean') throw new Error('respuesta de cuota no válida');
  return { permitido: fila.allowed, esperaS: Number(fila.wait_s) || 0 };
}
