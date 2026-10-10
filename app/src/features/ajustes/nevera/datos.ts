/**
 * Lo que la nevera compartida necesita saber antes de pintar un solo botón.
 *
 * Está aquí y no repartido por los componentes porque las consultas se leen
 * juntas o no se leen: sin la nevera no se sabe el límite, sin los miembros no
 * se sabe si mandas, y sin las invitaciones enviadas no se sabe si queda plaza.
 * Cada trozo por su cuenta pintaba un botón que el servidor rechazaba.
 *
 * Todo va de UNA nevera, la que se le pasa: una persona tiene varias y ya no
 * hay «el hogar» del que hablar. La nevera se busca en la lista de las mías
 * (`useNeveraActual().neveras`), que ya trae el límite de plazas de cada una.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchInvitacionesEnviadas,
  fetchInvitacionesRecibidas,
  fetchMiembros,
  type InvitacionEnviada,
  type InvitacionRecibida,
  type Miembro,
} from '@/api/household';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { queryKeys } from '@/shared/lib/query';
import { useSession } from '@/shared/lib/session';

export type EstadoNevera = {
  cargando: boolean;
  error: unknown;
  miId: string | null;
  miembros: Miembro[];
  recibidas: InvitacionRecibida[];
  enviadas: InvitacionEnviada[];
  /** Solo quien lleva la nevera invita, saca gente y traspasa. */
  soyQuienLleva: boolean;
  /** Cuánta gente cabe. Sale de la fila de la nevera, nunca de una constante. */
  limite: number | null;
  /**
   * Si se puede invitar a alguien más.
   *
   * Cuenta los miembros MÁS las invitaciones sin responder, igual que el
   * servidor: una invitación pendiente es una plaza ya prometida. Contar solo
   * los miembros dejaría escribir una invitación que va a salir rechazada.
   */
  hayPlaza: boolean;
};

/** Sin responder y todavía en plazo. Es lo que el servidor cuenta como plaza. */
export function estaViva(inv: InvitacionEnviada): boolean {
  return inv.status === 'pending' && new Date(inv.expires_at).getTime() > Date.now();
}

export function useNevera(neveraId: string): EstadoNevera {
  const { session } = useSession();
  const { neveras } = useNeveraActual();
  const miId = session?.user.id ?? null;

  const nevera = neveras.find((n) => n.id === neveraId);
  // La privada no se invita: el servidor rechaza pedir sus invitaciones con un
  // error `nevera_personal`, y esta pantalla lo enseñaría como un fallo en el
  // caso más normal de todos, que es tener la privada delante.
  const esCompartida = nevera?.kind === 'shared';

  const miembros = useQuery({
    queryKey: queryKeys.miembros(neveraId),
    queryFn: () => fetchMiembros(neveraId),
  });
  const recibidas = useQuery({
    queryKey: queryKeys.invitacionesRecibidas,
    queryFn: fetchInvitacionesRecibidas,
  });
  const enviadas = useQuery({
    queryKey: queryKeys.invitacionesEnviadas(neveraId),
    queryFn: () => fetchInvitacionesEnviadas(neveraId),
    enabled: esCompartida,
  });

  const listaMiembros = miembros.data ?? [];
  const listaEnviadas = enviadas.data ?? [];
  const limite = nevera?.member_limit ?? null;
  const ocupadas = listaMiembros.length + listaEnviadas.filter(estaViva).length;

  return {
    // Una consulta desactivada se queda «pending» para siempre: contarla
    // dejaría el indicador de carga girando sin fin en la privada.
    cargando: miembros.isPending || recibidas.isPending || (esCompartida && enviadas.isPending),
    error: miembros.error ?? recibidas.error ?? enviadas.error,
    miId,
    miembros: listaMiembros,
    recibidas: recibidas.data ?? [],
    enviadas: listaEnviadas,
    soyQuienLleva: listaMiembros.some((m) => m.user_id === miId && m.role === 'owner'),
    limite,
    // Sin límite todavía cargado no se abre el formulario: es preferible que
    // aparezca medio segundo tarde a dejar escribir una invitación que se va a
    // rechazar.
    hayPlaza: limite !== null && ocupadas < limite,
  };
}

/**
 * Cuántos días quedan para responder una invitación.
 *
 * Se redondea hacia arriba porque «te quedan 0 días» no significa nada: si aún
 * está viva, queda al menos hoy.
 */
function diasParaResponder(expiresAt: string): number {
  const restan = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(restan / 86_400_000));
}

/** «Te quedan 6 días para responder». Sin la palabra «caduca», que aquí es de comida. */
export function plazoLargo(expiresAt: string): string {
  const dias = diasParaResponder(expiresAt);
  if (dias <= 1) return 'Te queda hoy para responder.';
  return `Te quedan ${dias} días para responder.`;
}

/** Lo mismo desde el otro lado: lo que ve quien la envió. */
export function plazoCorto(expiresAt: string): string {
  const dias = diasParaResponder(expiresAt);
  if (dias <= 1) return 'le queda hoy';
  return `le quedan ${dias} días`;
}

/**
 * Invalida TODO tras aceptar una invitación o salirse de una nevera.
 *
 * Es deliberadamente bruto y aquí es lo correcto: cambia la lista de neveras
 * (y con ella cuál es la activa, si era la que se deja), el inventario, el
 * historial y quién está en cada una. Enumerar las claves afectadas garantiza
 * olvidarse de una, y la que se olvide enseñará lo de la nevera anterior.
 */
export function useRecargarTodo() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}
