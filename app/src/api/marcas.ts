import { supabase } from '@/shared/lib/supabase';
import {
  leerResolucion,
  type AsociacionParaGuardar,
  type LineaParaResolver,
  type RespuestaMarcas,
  type Vinculo,
} from '@/features/ticket/marcas';

import { buscarPorCodigo } from './catalogo';

/**
 * Las marcas de un ticket: pedir al servidor qué producto es cada línea, recordar lo que la persona
 * confirma y enlazar lo que se guarda con un producto del catálogo SIN duplicarlo.
 *
 * El servidor (`opsi-marcas`) solo propone y no escribe nada. Todo lo que se guarda se guarda desde
 * aquí, con la sesión de la persona, DESPUÉS de que haya revisado el ticket:
 *
 *   · las asociaciones (`confirm_ticket_association`), únicamente de lo que confirmó a propósito;
 *   · el enlace con un producto: el del catálogo si ya está, el global de ese código de barras por
 *     `lookup-barcode` (que lo guarda una sola vez para todo el mundo), o un producto privado de la
 *     nevera por nombre y marca (`ensure_private_product`, que no crea un duplicado por ticket).
 */

/** Por qué no se pudo pedir la marca, en las categorías que la pantalla distingue. */
export type CausaMarcas = 'premium' | 'sesion' | 'otro';

export class ErrorMarcas extends Error {
  readonly causa: CausaMarcas;
  constructor(causa: CausaMarcas) {
    super(`marcas_${causa}`);
    this.causa = causa;
  }
}

function estadoDe(error: unknown): number | null {
  const estado = (error as { context?: { status?: unknown } } | null)?.context?.status;
  return typeof estado === 'number' ? estado : null;
}

/**
 * Pide las marcas de unas líneas. Una petición que falla no es un error del ticket: las filas siguen
 * como estaban y se puede volver a intentar.
 */
export async function resolverMarcas(args: {
  nevera: string;
  tienda: string | null;
  lineas: LineaParaResolver[];
}): Promise<RespuestaMarcas> {
  const { data, error } = await supabase.functions.invoke('opsi-marcas', {
    body: { nevera: args.nevera, tienda: args.tienda, lineas: args.lineas },
  });
  if (error) {
    const estado = estadoDe(error);
    if (estado === 403) throw new ErrorMarcas('premium');
    if (estado === 401) throw new ErrorMarcas('sesion');
    throw new ErrorMarcas('otro');
  }
  return leerResolucion(data);
}

// ── Enlazar con un producto ───────────────────────────────────────────────

/**
 * El id del producto del catálogo con el que enlazar la línea que se guarda, o null si no se pudo (y
 * entonces se guarda sin enlace, como siempre: guardar el ticket no depende de esto).
 *
 * Un producto que ya está en el catálogo se usa tal cual: no se crea nada. Un código de barras va por
 * `lookup-barcode`, la misma puerta que el escáner (guarda la ficha una sola vez para todas las personas,
 * con los mismos filtros). Una marca escrita a mano crea —o reutiliza— un producto privado de la nevera.
 */
export async function enlazarProducto(vinculo: Vinculo, neveraId: string, nombre: string): Promise<string | null> {
  switch (vinculo.tipo) {
    case 'producto':
      return vinculo.productoId;
    case 'codigo': {
      try {
        const r = await buscarPorCodigo(vinculo.ean);
        return r.encontrado ? r.producto.id : null;
      } catch {
        // OFF caído, sin cupo, sin conexión: se guarda igualmente, sin enlace.
        return null;
      }
    }
    case 'marca': {
      try {
        const { data, error } = await supabase.rpc('ensure_private_product', {
          p_household_id: neveraId,
          p_name: nombre,
          p_brand: vinculo.marca,
        });
        if (error) throw error;
        return typeof data === 'string' ? data : null;
      } catch {
        return null;
      }
    }
    case 'ninguno':
      return null;
  }
}

/** ¿El error es «ese producto no es de esta nevera»? Entonces se reintenta sin enlace. */
export function esErrorDeProducto(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === 'P0002';
}

// ── Lo que se recuerda ────────────────────────────────────────────────────

/** Guarda (o corrige) una asociación que la persona confirmó. Es de Premium; lo comprueba el servidor. */
export async function guardarAsociacion(a: AsociacionParaGuardar): Promise<void> {
  const { error } = await supabase.rpc('confirm_ticket_association', {
    p_line_key: a.lineKey,
    p_store_key: a.storeKey,
    p_name: a.name,
    p_brand: a.brand as string,
    p_product_id: a.productId as string,
    p_barcode: a.barcode as string,
    p_unit_family: a.unitFamily as 'mass',
    p_net_quantity: a.netQuantity as number,
    p_source: a.source,
    p_match_score: a.matchScore as number,
  });
  if (error) throw error;
}

/** Una asociación tal como se enseña en Ajustes. */
export type AsociacionGuardada = {
  id: string;
  line_key: string;
  store_key: string;
  name: string;
  brand: string | null;
  source: string;
  confirmations: number;
  updated_at: string;
};

const COLUMNAS = 'id, line_key, store_key, name, brand, source, confirmations, updated_at';

/** Todo lo que Opsi recuerda de esta persona, lo último primero. */
export async function fetchAsociaciones(): Promise<AsociacionGuardada[]> {
  const { data, error } = await supabase
    .from('ticket_associations')
    .select(COLUMNAS)
    .order('updated_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as AsociacionGuardada[];
}

/** Corrige el nombre y la marca a mano. Una marca en blanco es «sin identificar». */
export async function corregirAsociacion(id: string, nombre: string, marca: string): Promise<void> {
  const { error } = await supabase.rpc('update_ticket_association', {
    p_id: id,
    p_name: nombre,
    p_brand: marca,
  });
  if (error) throw error;
}

export async function borrarAsociacion(id: string): Promise<void> {
  const { error } = await supabase.from('ticket_associations').delete().eq('id', id);
  if (error) throw error;
}

/** Borra todo lo recordado. La RLS limita el borrado a lo de quien llama. */
export async function borrarTodasLasAsociaciones(): Promise<void> {
  const { error } = await supabase.from('ticket_associations').delete().gte('created_at', '1970-01-01');
  if (error) throw error;
}
