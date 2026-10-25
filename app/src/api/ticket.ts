import { supabase } from '@/shared/lib/supabase';
import { leerProductosTicket, type ProductoTicket } from '@/features/ticket/lineas';

/**
 * El lector de tickets: la foto de un ticket de supermercado va a la Edge Function `opsi-ticket` y
 * vuelve una lista de productos para revisar.
 *
 * La foto SALE del móvil hacia un servicio de IA (a través de nuestra función), por eso la pantalla
 * lo dice antes de hacerla. Aquí no se guarda en ningún sitio: se manda y se olvida. Lo que vuelve se
 * lee con desconfianza (`leerProductosTicket`) y pasa por una pantalla de revisión antes de guardar.
 */

/** Por qué no se pudo leer el ticket, en las categorías que la pantalla explica. */
export type CausaTicket = 'premium' | 'limite' | 'foto' | 'ilegible' | 'otro';

export class ErrorTicket extends Error {
  readonly causa: CausaTicket;
  /** Solo con `limite`: lo que falta para poder volver a pedir. */
  readonly esperaS: number | null;
  constructor(causa: CausaTicket, esperaS: number | null = null) {
    super(`ticket_${causa}`);
    this.causa = causa;
    this.esperaS = esperaS;
  }
}

/** Lo que dice la pantalla de cada causa. */
export function mensajeDeTicket(e: unknown): string {
  const causa = e instanceof ErrorTicket ? e.causa : 'otro';
  switch (causa) {
    case 'premium':
      return 'Leer un ticket es de Opsi Premium ⭐.';
    case 'limite': {
      const minutos = e instanceof ErrorTicket && e.esperaS ? Math.max(1, Math.ceil(e.esperaS / 60)) : null;
      return minutos ? `Has llegado al límite por ahora. Prueba otra vez en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.` : 'Has llegado al límite por ahora. Prueba más tarde.';
    }
    case 'foto':
      return 'Esa foto no vale. Prueba otra vez, con el ticket entero y buena luz.';
    case 'ilegible':
      return 'No he podido leer el ticket. Prueba con más luz y con el ticket entero y liso.';
    case 'otro':
      return 'No he podido leer el ticket ahora. Prueba otra vez.';
  }
}

/** Estado HTTP de un fallo de `functions.invoke`, y su cuerpo si es JSON. */
async function detalleDe(error: unknown): Promise<{ estado: number | null; cuerpo: unknown }> {
  const contexto = (error as { context?: { status?: unknown; json?: () => Promise<unknown> } } | null)?.context;
  const estado = typeof contexto?.status === 'number' ? contexto.status : null;
  const cuerpo = await contexto?.json?.().catch(() => null);
  return { estado, cuerpo };
}

/** Manda la foto (JPEG en base64, sin `data:`) y devuelve los productos que se leen en ella. */
export async function leerTicket(imagenBase64: string): Promise<ProductoTicket[]> {
  const { data, error } = await supabase.functions.invoke('opsi-ticket', { body: { imagen: imagenBase64 } });
  if (error) {
    const { estado, cuerpo } = await detalleDe(error);
    if (estado === 403) throw new ErrorTicket('premium');
    if (estado === 429) {
      const espera = (cuerpo as { espera_s?: unknown } | null)?.espera_s;
      throw new ErrorTicket('limite', typeof espera === 'number' && Number.isFinite(espera) && espera > 0 ? espera : 60);
    }
    if (estado === 400 || estado === 413) throw new ErrorTicket('foto');
    if (estado === 422) throw new ErrorTicket('ilegible');
    throw new ErrorTicket('otro');
  }
  const productos = (data as { productos?: unknown } | null)?.productos;
  if (!Array.isArray(productos)) throw new ErrorTicket('otro');
  return leerProductosTicket(productos);
}
