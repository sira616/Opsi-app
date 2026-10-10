/**
 * Todo lo que la app pide al inventario, en un sitio.
 *
 * Funciones planas, sin hooks: los hooks de TanStack Query viven en las
 * pantallas. Así esta capa se puede probar sin montar React, y una pantalla
 * que cambia de forma no obliga a tocar las consultas.
 *
 * ── Qué se acota por nevera y qué no ──────────────────────────────────────
 *
 * Una persona pertenece a varias neveras, y las tablas de inventario y la vista
 * `inventory_with_priority` devuelven las filas de TODAS ellas: la RLS decide
 * qué puedes ver, no cuál estás mirando. Sin filtrar, «Consumir primero»
 * mezclaría la leche del piso con la de tu casa.
 *
 *   · Lo que LISTA (`fetchPriorityList`) recibe la nevera y filtra por
 *     `household_id`. Es la única regla que hace falta: la RLS sigue haciendo
 *     de red por debajo, pero no es quien elige la nevera.
 *   · Lo que busca UN elemento por su id (`fetchItem`, `fetchConservacion`) no
 *     filtra: el id ya lo acota, y filtrar por la nevera ACTIVA haría
 *     desaparecer un elemento legítimo si se abre con otra nevera activa —un
 *     enlace, una notificación—. Que el elemento sea de una nevera tuya lo
 *     comprueba la RLS. Los eventos (`fetchItemEvents`) sí llevan la nevera,
 *     pero la DEL ELEMENTO, que ya se conoce al pintar su historial.
 *   · Lo que ESCRIBE (`createItem`) recibe la nevera y la manda explícita: el
 *     servidor la exige y rechaza una ajena. Ya no existe «mi hogar».
 *   · Las acciones sobre un elemento (`actions.*`) tampoco la llevan: actúan
 *     sobre un id, y el servidor resuelve a qué nevera pertenece.
 *
 * SOBRE LOS `as unknown as`: los tipos generados YA EXISTEN, en
 * `src/lib/database.types.ts` —esa es la ruta que escribe `npm run types`, y no
 * `src/shared/lib/`, que es la que decía este comentario y nunca ha existido—.
 * Lo que sigue sin existir es el cliente tipado: `createClient()` se llama sin
 * el genérico `Database`, así que `data` llega sin tipar y hay que afirmarlo a
 * mano igual que antes.
 *
 * Lo que sí se hace desde que hay tipos generados es DERIVAR de ellos todo lo
 * que sale barato: los tipos de más abajo que empiezan por `Database[...]` se
 * rompen en el `typecheck` si la columna cambia de nombre. Los escritos a mano
 * —`PriorityItem`, `ItemDetail`— no, y siguen así porque cambiarlos obligaría a
 * tocar media app: la vista devuelve TODO anulable y las pantallas dan por
 * hecho que un elemento tiene nombre.
 */

import type { Database } from '@/lib/database.types';
import type { Categoria } from '@/shared/lib/categorias';
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
  /** El pasillo del supermercado. Con esto filtra la lista. */
  category: Categoria;
  /** Abierto o cerrado. Es la fecha, no un estado: lo abierto no se cierra. */
  opened_at: string | null;
  /** Cuándo empezó la congelación en curso. La lista cuenta desde aquí. */
  frozen_at: string | null;
};

/** Lo del detalle: todo lo de la lista más las fechas candidatas. */
export type ItemDetail = PriorityItem & {
  /**
   * La nevera a la que pertenece el elemento, que NO tiene por qué ser la
   * activa: se puede abrir desde un enlace. Es la que hay que mirar para saber
   * quién es «la gente de esta nevera» al poner nombre a los autores del
   * historial.
   */
  household_id: string;
  frozen_days: number;
  thawed_at: string | null;
  limit_date: string | null;
  date_kind: DateKind | null;
  date_source: DateSource | null;
  /** Las tres candidatas, para poder EXPLICAR de dónde sale la fecha límite. */
  date_from_label: string | null;
  date_from_opening: string | null;
  date_from_thaw: string | null;
  /** El producto de catálogo, si lo tiene. Un alta a mano de algo sin código no
   *  lo tiene: null es lo normal, no una anomalía. */
  product_id: string | null;
};

export type InventoryEvent = {
  id: number;
  type: string;
  quantity_used: number | null;
  created_at: string;
  payload: Record<string, unknown>;
  /** Quién lo hizo. Null en eventos anteriores a la nevera compartida, y en
   *  los que escriba el servidor por su cuenta. */
  user_id: string | null;
};

// ── Conservación tras abrir ───────────────────────────────────────────────

/** Quién contestó: el catálogo para ese alimento, o la referencia general. */
export type ShelfLifeOrigin = Database['public']['Enums']['shelf_life_origin'];

type ShelfLifeRow = Database['public']['Functions']['shelf_life_for_item']['Returns'][number];

/**
 * Cuánto dura abierto, dónde guardarlo y de dónde sale el dato.
 *
 * Todo esto es ORIENTATIVO, los dos orígenes incluidos, y la pantalla lo dice.
 * Nunca es la fecha del envase: lo que diga el envase manda por encima.
 */
export type Conservacion = {
  dias: number;
  ubicacionRecomendada: StorageLocation;
  origen: ShelfLifeOrigin;
  /** La línea en español de la tabla por categoría, para leerse tal cual. */
  nota: string | null;
};

/** Lo que el catálogo sabe del producto. Solo se pinta lo que no sea null. */
export type ProductoCatalogo = Pick<
  Database['public']['Tables']['products']['Row'],
  | 'name'
  | 'brand'
  | 'net_quantity'
  | 'barcode'
  | 'image_url'
  | 'unit_family'
  | 'open_shelf_life_days'
  | 'data_source'
>;

/** Un miembro del hogar, para poner nombre a quien hizo cada cosa. */
export type Autor = Pick<
  Database['public']['Functions']['household_member_names']['Returns'][number],
  'user_id' | 'username'
>;

const PRIORITY_FIELDS =
  'id, name, state, location, unit_family, display_unit, initial_quantity, ' +
  'remaining_quantity, priority, effective_limit_date, effective_date_reason, ' +
  'effective_date_source, date_kind, days_left, frozen_at, category, opened_at';

/**
 * Lo que alimenta «Consumir primero» EN UNA NEVERA.
 *
 * El `household_id` no es opcional ni tiene valor por omisión, y es lo que
 * separa una nevera de otra: sin él la vista devolvería lo de todas las tuyas
 * mezclado. El orden lo pone la base de datos por la fecha límite efectiva; lo
 * agrupa la pantalla. Se deja fuera lo agotado y lo tirado: siguen existiendo
 * para el historial, pero no son cosas que consumir.
 */
export async function fetchPriorityList(householdId: string): Promise<PriorityItem[]> {
  const { data, error } = await supabase
    .from('inventory_with_priority')
    .select(PRIORITY_FIELDS)
    .eq('household_id', householdId)
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

/**
 * El historial de un elemento. Inmutable: solo se lee.
 *
 * Lleva la nevera DEL ELEMENTO (`ItemDetail.household_id`), no la activa. El
 * id del elemento ya bastaría para acotar; se manda también para que ninguna
 * lectura de eventos dependa solo de un uuid.
 */
export async function fetchItemEvents(id: string, householdId: string): Promise<InventoryEvent[]> {
  const { data, error } = await supabase
    .from('inventory_events')
    .select('id, type, quantity_used, created_at, payload, user_id')
    .eq('household_id', householdId)
    .eq('item_id', id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw error;
  return (data ?? []) as unknown as InventoryEvent[];
}

/**
 * Cuánto aguanta este elemento una vez abierto, y dónde guardarlo.
 *
 * Dos peticiones EN PARALELO, no una detrás de otra: tardan lo que la más
 * lenta, y la tarjeta se pinta de una vez en lugar de a trozos.
 *
 *   · La RPC resuelve la precedencia (catálogo → categoría → nada). Que
 *     devuelva CERO FILAS es una respuesta legítima —«no lo sé»— y aquí se
 *     traduce a null, no a un error ni a un cero.
 *   · La nota es la línea en español de la tabla por categoría. Se pide aparte
 *     porque la RPC no la devuelve, y con la categoría que la pantalla ya
 *     tiene: pedirla otra vez al servidor sería un viaje de más.
 *
 * Por qué la categoría es un argumento y no parte de la clave de consulta: la
 * clave es `queryKeys.itemConservacion(id)`, que cuelga de `item(id)`, así que
 * cualquier invalidación del elemento —y toda acción invalida el elemento—
 * arrastra también a esta. Si un día se puede cambiar la categoría, la nota se
 * refresca sola por ese camino.
 */
export async function fetchConservacion(
  id: string,
  categoria: Categoria,
): Promise<Conservacion | null> {
  const [plazo, referencia] = await Promise.all([
    supabase.rpc('shelf_life_for_item', { p_item_id: id }),
    supabase
      .from('category_shelf_life_reference')
      .select('note')
      .eq('category', categoria)
      .maybeSingle(),
  ]);

  // Los errores se lanzan tal cual y sin envolver: el servidor ya contesta en
  // español y taparlo con un texto propio es el error que este proyecto lleva
  // pagado tres veces.
  if (plazo.error) throw plazo.error;
  if (referencia.error) throw referencia.error;

  const fila = ((plazo.data ?? []) as unknown as ShelfLifeRow[])[0];
  if (!fila) return null;

  return {
    dias: fila.days,
    ubicacionRecomendada: fila.recommended_location,
    origen: fila.origin,
    nota: (referencia.data as { note: string } | null)?.note ?? null,
  };
}

/**
 * La ficha del catálogo.
 *
 * Solo tiene sentido cuando el elemento trae `product_id`, que hoy es la
 * excepción: el alta a mano no crea producto. Quien llame comprueba antes.
 */
export async function fetchProducto(productId: string): Promise<ProductoCatalogo | null> {
  const { data, error } = await supabase
    .from('products')
    .select(
      'name, brand, net_quantity, barcode, image_url, unit_family, open_shelf_life_days, data_source',
    )
    .eq('id', productId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as ProductoCatalogo | null;
}

/**
 * Quién es quién en una nevera, para el historial.
 *
 * Vive aquí y no en `api/household.ts` porque su único consumidor es el
 * historial del inventario: la pantalla de la nevera compartida pide de los
 * miembros otras cosas —el rol, las invitaciones— que aquí sobran.
 *
 * `inventory_events` guarda `user_id`, no el nombre, y la RLS de
 * `user_settings` no deja resolverlo desde el cliente. Por eso hay una función
 * en el servidor, y por eso solo contesta de la gente de una nevera TUYA. Se
 * pide la del elemento, no la activa: son quienes pueden haber hecho cosas en él.
 */
export async function fetchAutores(householdId: string): Promise<Autor[]> {
  const { data, error } = await supabase.rpc('household_member_names', {
    p_household_id: householdId,
  });

  if (error) throw error;
  return (data ?? []) as unknown as Autor[];
}

export type NewItem = {
  /**
   * La nevera donde se guarda. Obligatoria: el servidor la exige, la comprueba
   * y rechaza una ajena sin insertar nada. No hay «la mía» que asumir.
   */
  householdId: string;
  name: string;
  unitFamily: UnitFamily;
  displayUnit: MeasurementUnit;
  /** En unidad base: gramos, mililitros o piezas. */
  quantity: number;
  location: StorageLocation;
  limitDate: string | null;
  dateKind: DateKind | null;
  dateSource: DateSource | null;
  category: Categoria;
  /**
   * El producto del catálogo al que se enlaza (el escaneado, o el privado que se
   * acaba de crear). Null en un alta a mano de algo sin código.
   */
  productId?: string | null;
};

/**
 * Da de alta un elemento en una nevera concreta.
 *
 * Va por RPC y no por un insert directo para que el elemento y su evento
 * `created` se escriban en la misma transacción.
 */
export async function createItem(item: NewItem): Promise<void> {
  // Sin `.single()`: la función devuelve una fila suelta, no un conjunto, y
  // pedirle a PostgREST que la trate como objeto único es una forma de fallar
  // a cambio de un dato que aquí no se usa.
  const { error } = await supabase
    .rpc('create_item', {
      p_household_id: item.householdId,
      p_name: item.name,
      p_unit_family: item.unitFamily,
      p_display_unit: item.displayUnit,
      p_quantity: item.quantity,
      p_location: item.location,
      p_limit_date: item.limitDate,
      p_date_kind: item.dateKind,
      p_date_source: item.dateSource,
      p_category: item.category,
      p_product_id: item.productId ?? null,
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
