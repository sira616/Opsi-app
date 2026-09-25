/**
 * Las neveras: cuáles tengo, cómo se crean y se personalizan, y quién está
 * dentro de cada una.
 *
 * Una persona pertenece a VARIAS neveras: la suya, privada y para siempre, y
 * las compartidas que cree o a las que la inviten. Todo lo que aquí hace algo
 * sobre «una nevera» recibe el id de ESA nevera y lo manda al servidor, que
 * comprueba que es tuya y que tienes el papel que la acción exige. No hay ya
 * ninguna función que dé por hecho «mi hogar»: buscar el único hogar de alguien
 * (`.limit(1)`) devolvería una al azar.
 *
 * Todo pasa por RPC, y no por gusto: `households`, `household_members` y
 * `household_invitations` no tienen permiso de escritura a propósito (ver las
 * migraciones 20260922110000 y 20260924100000). Un `insert` desde aquí no
 * fallaría por la RLS, fallaría por permisos, y no hay forma de escribirlo bien
 * desde el cliente.
 *
 * ── Las tres cosas que hay que saber antes de tocar esto ──────────────────
 *
 * 1. **`invite_to_household` devuelve los fallos en vez de lanzarlos.** Cuando
 *    el problema depende de la OTRA cuenta —no existe, ya está dentro, ya la
 *    invitaste— contesta con un `outcome` y un `message` ya escrito en
 *    español, y la transacción confirma para dejar contado el intento. Ese
 *    mensaje se enseña TAL CUAL. Sustituirlo por un texto propio ya ha tapado
 *    tres veces en este proyecto la pista que servía para arreglar el problema.
 *
 * 2. **El límite de personas vive en la nevera** (`member_limit`, que llega en
 *    cada fila de `my_households`), no aquí. Hoy vale 5 en las compartidas y 1
 *    en la privada. Escribir un número en el cliente convierte cambiarlo en un
 *    despliegue.
 *
 * 3. **El límite de NEVERAS por persona vive en `user_settings.household_limit`**
 *    y el cliente solo lo lee (`api/settings.ts`). El servidor lo hace cumplir
 *    al crear y al aceptar, con un error `P0001` de `hint = 'limite_neveras'`;
 *    lo que la app haga con esa pista es enseñar el tope, nunca reescribir el
 *    mensaje.
 */

import type { Database } from '@/lib/database.types';
import { supabase } from '@/shared/lib/supabase';

export type RolHogar = Database['public']['Enums']['household_role'];
export type EstadoInvitacion = Database['public']['Enums']['household_invitation_status'];
export type TipoNevera = Database['public']['Enums']['household_kind'];

/**
 * Una fila de `my_households()`: la nevera y lo mío en ella.
 *
 * Derivado de los tipos generados: si el servidor cambia una columna, se rompe
 * el `typecheck` y no la pantalla.
 *
 *   · `kind`          `personal` (la mía, nunca se comparte) o `shared`.
 *   · `role`          mi papel en ESA nevera. En la privada soy `owner`.
 *   · `member_count`  cuánta gente hay dentro ahora.
 *   · `member_limit`  cuánta cabe. Es de la nevera y no global.
 */
export type Nevera = Database['public']['Functions']['my_households']['Returns'][number];

/**
 * Lo que devuelven `create_shared_household` y `update_household`: la fila de
 * `households`, sin mi papel ni el recuento de gente. Para tener una `Nevera`
 * entera hay que volver a pedir la lista.
 */
export type FilaNevera = Pick<Nevera, 'id' | 'name' | 'icon' | 'kind' | 'member_limit'>;

/**
 * Las neveras a las que pertenezco, con la privada siempre la primera.
 *
 * Es también la comprobación de que la sesión sigue siendo de alguien que
 * existe: devuelve una lista VACÍA cuando el token apunta a un usuario que ya
 * no está —el caso de una base reiniciada con el token todavía guardado en el
 * móvil—, y eso, en la práctica, es una sesión huérfana. Ver `(app)/_layout.tsx`.
 */
export async function fetchMisNeveras(): Promise<Nevera[]> {
  const { data, error } = await supabase.rpc('my_households');
  if (error) throw error;
  return (data ?? []) as unknown as Nevera[];
}

/**
 * Crea una nevera compartida de la que soy el dueño.
 *
 * El icono es opcional: sin él, el servidor pone el de un grupo de gente. El
 * tope de neveras se comprueba allí y bajo cerrojo, así que dos toques rápidos
 * no se lo saltan; si no cabe, lanza `P0001` con `hint = 'limite_neveras'`.
 */
export async function createSharedHousehold(input: {
  name: string;
  icon?: string;
}): Promise<FilaNevera> {
  const { data, error } = await supabase.rpc('create_shared_household', {
    p_name: input.name,
    p_icon: input.icon ?? null,
  });
  if (error) throw error;
  return data as unknown as FilaNevera;
}

/**
 * Cambia el nombre y/o el icono. Solo el dueño; vale también para la privada.
 *
 * Un campo sin definir se manda como `null`, que el servidor lee como «no lo
 * cambies»: la pantalla puede mandar solo lo que la persona ha tocado. Una
 * cadena vacía NO es null y se rechaza con su propio mensaje, así que un campo
 * mal leído no deja una nevera sin nombre.
 */
export async function updateHousehold(input: {
  householdId: string;
  name?: string;
  icon?: string;
}): Promise<FilaNevera> {
  const { data, error } = await supabase.rpc('update_household', {
    p_household_id: input.householdId,
    p_name: input.name ?? null,
    p_icon: input.icon ?? null,
  });
  if (error) throw error;
  return data as unknown as FilaNevera;
}

// ── Quién está dentro ──────────────────────────────────────────────────────

export type Miembro = {
  user_id: string;
  username: string;
  role: RolHogar;
};

/**
 * La gente de una nevera, con su rol. Vale también para la privada, que solo
 * tiene a su dueña.
 *
 * Viene de una función `SECURITY DEFINER` porque `user_settings` solo se lee a
 * sí misma: sin ella, la app solo podría enseñar identificadores.
 */
export async function fetchMiembros(householdId: string): Promise<Miembro[]> {
  const { data, error } = await supabase.rpc('household_member_names', {
    p_household_id: householdId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as Miembro[];
}

// ── Invitaciones ───────────────────────────────────────────────────────────

export type InvitacionRecibida = {
  id: string;
  household_id: string;
  household_name: string;
  /** La clave del icono de la nevera a la que me invitan. Ver `iconos-nevera`. */
  household_icon: string;
  inviter_username: string;
  created_at: string;
  expires_at: string;
};

/**
 * Las que me han mandado, solo pendientes y sin caducar: la función ya las
 * filtra en el servidor. Son de la persona y no de una nevera: te invitan A una.
 */
export async function fetchInvitacionesRecibidas(): Promise<InvitacionRecibida[]> {
  const { data, error } = await supabase.rpc('my_pending_invitations');
  if (error) throw error;
  return (data ?? []) as unknown as InvitacionRecibida[];
}

export type InvitacionEnviada = {
  id: string;
  invitee_username: string;
  status: EstadoInvitacion;
  created_at: string;
  expires_at: string;
  /**
   * Null mientras está sin responder… y también cuando se le pasó el plazo,
   * porque a una invitación caducada no la respondió nadie.
   *
   * Los tipos generados lo dan como `string` a secas: el generador no sabe
   * marcar nulables dentro de un `returns table`. Aquí se corrige, porque la
   * pantalla sí distingue esos dos casos.
   */
  responded_at: string | null;
};

/**
 * El historial completo de lo que ha invitado una nevera compartida, no solo lo
 * pendiente. La privada no se invita, y el servidor lo rechaza con su propio
 * mensaje: no hay que llamarla con su id.
 */
export async function fetchInvitacionesEnviadas(householdId: string): Promise<InvitacionEnviada[]> {
  const { data, error } = await supabase.rpc('household_sent_invitations', {
    p_household_id: householdId,
  });
  if (error) throw error;
  return (data ?? []) as unknown as InvitacionEnviada[];
}

/**
 * Los cuatro desenlaces posibles de invitar. Salen literalmente de la
 * migración; el `check` de `household_invite_attempts` usa estos mismos.
 */
export type ResultadoInvitacion = {
  outcome: 'creada' | 'desconocida' | 'ya_es_miembro' | 'ya_invitada';
  /** Ya redactado en español por el servidor. Se enseña sin tocarlo. */
  message: string;
  invitation_id: string | null;
};

/**
 * Invita por nombre de usuario a una nevera compartida.
 *
 * Lanza excepción solo cuando el problema es tuyo: no eres quien lleva la
 * nevera, es tu privada, el nombre está mal escrito, no queda plaza o te has
 * pasado de intentos. Todo lo demás vuelve como `ResultadoInvitacion`.
 */
export async function invitar(householdId: string, username: string): Promise<ResultadoInvitacion> {
  const { data, error } = await supabase.rpc('invite_to_household', {
    p_household_id: householdId,
    p_username: username.trim().toLowerCase(),
  });
  if (error) throw error;

  // `returns table` siempre llega como lista, aunque sea de una fila.
  const filas = (data ?? []) as unknown as ResultadoInvitacion[];
  const fila = filas[0];
  if (!fila) throw new Error('El servidor no ha contestado a la invitación. Vuelve a probar.');
  return fila;
}

/**
 * Aceptar AÑADE una pertenencia: no mueve a nadie ni saca a nadie de ninguna
 * nevera. Falla con `hint = 'limite_neveras'` si ya tengo todas las que mi plan
 * permite, y con `nevera_llena` si entretanto se llenó.
 */
export async function aceptarInvitacion(id: string): Promise<void> {
  const { error } = await supabase.rpc('accept_invitation', { p_invitation_id: id });
  if (error) throw error;
}

export async function rechazarInvitacion(id: string): Promise<void> {
  const { error } = await supabase.rpc('reject_invitation', { p_invitation_id: id });
  if (error) throw error;
}

export async function cancelarInvitacion(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_invitation', { p_invitation_id: id });
  if (error) throw error;
}

// ── Salir, sacar y traspasar ───────────────────────────────────────────────

/**
 * Sales de una nevera compartida. Sigues teniendo la tuya, así que no hay
 * nevera nueva que crear.
 *
 * Lo guardado se queda en la nevera que dejas: es de la nevera, no tuyo. La
 * pantalla tiene que avisarlo ANTES, porque es la consecuencia que no se ve
 * venir. Quien lleva una nevera y no está solo tiene que traspasarla primero
 * (`hint = 'debe_traspasar'`); la privada no se abandona (`nevera_personal`).
 * El servidor lo rechaza con su propio mensaje en ambos casos.
 */
export async function salirDelHogar(householdId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_household', { p_household_id: householdId });
  if (error) throw error;
}

/** Saca a alguien de una compartida. Solo quien la lleva, y nunca a sí mismo. */
export async function sacarMiembro(householdId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_household_member', {
    p_household_id: householdId,
    p_user_id: userId,
  });
  if (error) throw error;
}

/**
 * Pasa el mando de una compartida a otro miembro. Quien lo entrega se queda
 * dentro como miembro normal, que es justo lo que le permite salirse después.
 */
export async function traspasarHogar(householdId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_household_ownership', {
    p_household_id: householdId,
    p_user_id: userId,
  });
  if (error) throw error;
}
