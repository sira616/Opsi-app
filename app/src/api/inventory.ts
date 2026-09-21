/**
 * Todo lo que la app pide al inventario, en un sitio.
 *
 * Funciones planas, sin hooks: los hooks de TanStack Query viven en las
 * pantallas. Así esta capa se puede probar sin montar React, y una pantalla
 * que cambia de forma no obliga a tocar las consultas.
 *
 * Ninguna filtra por hogar. No es un olvido: la RLS ya limita cada consulta a
 * lo tuyo, y repetir la regla aquí sería ponerla en un segundo sitio donde
 * puede quedar desactualizada.
 *
 * SOBRE LOS `as unknown as`: el cliente de Supabase deduce los tipos del
 * esquema, y ese fichero (`src/shared/lib/database.types.ts`) todavía no
 * existe porque generarlo necesita Docker. Hasta entonces, `data` llega sin
 * tipar y hay que afirmarlo a mano. Los tipos de abajo están escritos para
 * coincidir con el esquema, pero NADIE LO COMPRUEBA: si una columna cambia de
 * nombre, esto compila y revienta en ejecución.
 *
 *     npm run types    ← y luego quitar los casts de este fichero
 */

import { supabase } from '@/shared/lib/supabase';
import type { MeasurementUnit, UnitFamily } from '@/shared/lib/units';

export type ItemState =
  | 'closed'
  | 'open'
  | 'partially_consumed'
  | 'frozen'
  | 'thawed'
  | 'finished'
  | 'discarded';

export type StorageLocation = 'pantry' | 'fridge' | 'freezer' | 'other';
export type DateKind = 'expiry' | 'best_before';
export type DateSource = 'package' | 'user' | 'manufacturer' | 'reference' | 'estimate';
export type PriorityGroup = 'high' | 'medium' | 'low' | 'undated' | 'frozen' | 'closed_out';

/** Una fila de inventory_with_priority, con lo que la lista necesita. */
export type PriorityItem = {
  id: string;
  name: string;
  state: ItemState;
  location: StorageLocation;
  unit_family: UnitFamily;
  display_unit: MeasurementUnit;
  initial_quantity: number;
  remaining_quantity: number;
  priority: PriorityGroup;
  effective_limit_date: string | null;
  effective_date_reason: 'label' | 'after_opening' | 'after_thawing' | null;
  effective_date_source: DateSource | null;
  /** Caducidad o consumo preferente. La lista los pinta distinto: uno es
   *  seguridad y el otro calidad, y confundirlos es el error que este
   *  proyecto no se permite. */
  date_kind: DateKind | null;
  days_left: number | null;
  /** Cuándo empezó la congelación en curso. La lista cuenta desde aquí. */
  frozen_at: string | null;
};

/** Lo del detalle: todo lo de la lista más las fechas candidatas. */
export type ItemDetail = PriorityItem & {
  opened_at: string | null;
  frozen_days: number;
  thawed_at: string | null;
  limit_date: string | null;
  date_kind: DateKind | null;
  date_source: DateSource | null;
  /** Las tres candidatas, para poder EXPLICAR de dónde sale la fecha límite. */
  date_from_label: string | null;
  date_from_opening: string | null;
  date_from_thaw: string | null;
};

export type InventoryEvent = {
  id: number;
  type: string;
  quantity_used: number | null;
  created_at: string;
  payload: Record<string, unknown>;
};

const PRIORITY_FIELDS =
  'id, name, state, location, unit_family, display_unit, initial_quantity, ' +
  'remaining_quantity, priority, effective_limit_date, effective_date_reason, ' +
  'effective_date_source, date_kind, days_left, frozen_at';

/**
 * Lo que alimenta «Consumir primero».
 *
 * El orden lo pone la base de datos por la fecha límite efectiva; lo agrupa la
 * pantalla. Se deja fuera lo agotado y lo tirado: siguen existiendo para el
 * historial, pero no son cosas que consumir.
 */
export async function fetchPriorityList(): Promise<PriorityItem[]> {
  const { data, error } = await supabase
    .from('inventory_with_priority')
    .select(PRIORITY_FIELDS)
    .neq('priority', 'closed_out')
    .order('effective_limit_date', { ascending: true, nullsFirst: false })
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as PriorityItem[];
}

/**
 * Un elemento con todo lo que hace falta para explicar su fecha.
 *
 * `select('*')` a propósito: el detalle enseña el cálculo entero, y listar
 * dieciocho columnas a mano solo sirve para que se quede una fuera.
 */
export async function fetchItem(id: string): Promise<ItemDetail | null> {
  const { data, error } = await supabase
    .from('inventory_with_priority')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as ItemDetail | null;
}

/** El historial. Inmutable: solo se lee. */
export async function fetchItemEvents(id: string): Promise<InventoryEvent[]> {
  const { data, error } = await supabase
    .from('inventory_events')
    .select('id, type, quantity_used, created_at, payload')
    .eq('item_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []) as unknown as InventoryEvent[];
}

export type NewItem = {
  name: string;
  unitFamily: UnitFamily;
  displayUnit: MeasurementUnit;
  /** En unidad base: gramos, mililitros o piezas. */
  quantity: number;
  location: StorageLocation;
  limitDate: string | null;
  dateKind: DateKind | null;
  dateSource: DateSource | null;
};

/**
 * Da de alta un elemento.
 *
 * Va por RPC y no por un insert directo para que el elemento y su evento
 * `created` se escriban en la misma transacción. El hogar lo resuelve el
 * servidor: el cliente no lo sabe ni lo necesita.
 */
export async function createItem(item: NewItem): Promise<void> {
  // Sin `.single()`: la función devuelve una fila suelta, no un conjunto, y
  // pedirle a PostgREST que la trate como objeto único es una forma de fallar
  // a cambio de un dato que aquí no se usa.
  const { error } = await supabase
    .rpc('create_item', {
      p_name: item.name,
      p_unit_family: item.unitFamily,
      p_display_unit: item.displayUnit,
      p_quantity: item.quantity,
      p_location: item.location,
      p_limit_date: item.limitDate,
      p_date_kind: item.dateKind,
      p_date_source: item.dateSource,
    });

  if (error) throw error;
}

/** Las seis acciones, cada una con su evento, en una transacción del servidor. */
export const actions = {
  open: (id: string) => callAction('open_item', { p_item_id: id }),
  freeze: (id: string) => callAction('freeze_item', { p_item_id: id }),
  thaw: (id: string) => callAction('thaw_item', { p_item_id: id }),
  finish: (id: string) => callAction('finish_item', { p_item_id: id }),
  discard: (id: string, reason?: string) =>
    callAction('discard_item', { p_item_id: id, p_reason: reason ?? null }),
  use: (id: string, amountInBaseUnit: number) =>
    callAction('use_quantity', { p_item_id: id, p_amount: amountInBaseUnit }),
};

async function callAction(fn: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}
