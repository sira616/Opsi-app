import { QueryClient } from '@tanstack/react-query';

/**
 * Una sola clave por consulta, declarada aquí y no a mano en cada pantalla:
 * invalidar tras una acción es el 90 % de los bugs de datos rancios, y con las
 * claves esparcidas se falla en la que se olvida.
 *
 * ── Qué cuelga de la nevera y qué no ──────────────────────────────────────
 *
 * Una persona tiene varias neveras y las tablas de inventario le devuelven las
 * filas de TODAS. Por eso lo que es «de una nevera» lleva su id en la clave:
 * sin él, cambiar de nevera enseñaría un instante la lista de la anterior, o
 * peor, la dejaría en caché como si fuera de la nueva.
 *
 *   · Lista de prioridad, miembros, invitaciones enviadas y nombres de autores:
 *     llevan el id de la nevera.
 *   · Un elemento concreto y todo lo suyo (eventos, conservación, ficha): no.
 *     El id del elemento ya lo acota —es un uuid— y es un dato que no cambia de
 *     nevera. Meterle además el id de la nevera obligaría a saber en qué
 *     nevera estaba antes de poder buscarlo.
 *   · Lo que es de la persona y no de una nevera (ajustes, correo,
 *     invitaciones recibidas, la lista de neveras, lo que evita por salud): sin id.
 *   · El catálogo de productos (`catalogo`): se pide por el id del producto, no de
 *     una nevera. Un producto global es de todos y uno privado lo acota la RLS.
 *
 * ── Invalidar por prefijo ─────────────────────────────────────────────────
 *
 * TanStack Query invalida por prefijo, y las claves están escritas para eso:
 *
 *   · `inventario`     todo el inventario, de todas las neveras. Es lo que se
 *                      marca al CAMBIAR de nevera.
 *   · `priorityLists`  la lista de «Consumir primero» de todas las neveras.
 *                      Lo que se invalida tras cualquier acción sobre un
 *                      elemento o al cambiar la zona horaria: las inactivas no
 *                      se recargan hasta que alguien las mire, así que es
 *                      barato y no hay que acertar cuál era la del elemento.
 *   · `household`      miembros e invitaciones de todas las neveras. NO incluye
 *                      la lista de neveras (`neveras`), que es aparte.
 */
export const queryKeys = {
  inventario: ['inventory'] as const,
  priorityLists: ['inventory', 'priority'] as const,
  priorityList: (neveraId: string) => ['inventory', 'priority', neveraId] as const,
  item: (id: string) => ['inventory', 'item', id] as const,
  itemEvents: (id: string) => ['inventory', 'item', id, 'events'] as const,

  /**
   * Conservación tras abrir. Cuelga del elemento y no de su categoría porque
   * la precedencia la resuelve el servidor mirando TAMBIÉN el producto
   * asociado: dos elementos de la misma categoría pueden contestar distinto.
   */
  itemConservacion: (id: string) => ['inventory', 'item', id, 'conservacion'] as const,

  /**
   * Las neveras a las que pertenezco (`my_households`). La lee UN solo sitio,
   * el proveedor de la nevera activa (`features/neveras/NeveraActiva.tsx`), y
   * el resto la usa a través de `useNeveraActiva()`. Quien cambie una nevera
   * —crear, renombrar, salir, aceptar una invitación— invalida esta clave.
   */
  neveras: ['neveras'] as const,

  // ── Nevera compartida ───────────────────────────────────────────────────
  // Claves separadas y no una: cancelar una invitación solo toca las enviadas,
  // y con una clave común la pantalla entera parpadearía por nada.
  //
  // Cuelgan de `household` a propósito, y conviene saberlo: invalidar
  // `household` se lleva por delante las tres de golpe, de todas las neveras.
  // Es lo que se quiere al aceptar una invitación o al salir —cambia la gente
  // de arriba abajo y no queda nada válido—, pero significa que `household` no
  // es una clave más: es el martillo.
  household: ['household'] as const,
  miembros: (neveraId: string) => ['household', neveraId, 'miembros'] as const,
  /**
   * Quién es quién, para poner nombre a quien hizo cada cosa en el historial.
   * Cuelga de `miembros(neveraId)`: entrar o salir de la nevera lo refresca sin
   * que el historial tenga que enterarse. La clave es propia porque lo que
   * devuelve no es lo mismo que pide la pantalla de la nevera compartida, y dos
   * consultas distintas bajo la misma clave se pisan.
   */
  autores: (neveraId: string) => ['household', neveraId, 'miembros', 'nombres'] as const,
  // Las recibidas son de la persona y no de una nevera: te invitan A una.
  invitacionesRecibidas: ['household', 'invitaciones', 'recibidas'] as const,
  invitacionesEnviadas: (neveraId: string) =>
    ['household', neveraId, 'invitaciones', 'enviadas'] as const,

  /**
   * La lista de la compra. Cuelga de la nevera, como la lista de prioridad: sin su
   * id, la lista de una nevera se serviría como la de otra durante el minuto que
   * dura fresca. `lista` solo invalida las de TODAS las neveras (al guardar algo
   * comprado, que puede venir de cualquiera).
   */
  lista: ['lista'] as const,
  /**
   * Sin `listaId` es el prefijo de TODO lo de esa nevera (las listas y las líneas de
   * cada una), que es lo que se invalida al cambiar algo.
   */
  listaDe: (neveraId: string, listaId?: string) =>
    (listaId ? ['lista', neveraId, listaId] : ['lista', neveraId]) as readonly string[],
  /** Las listas de una nevera (sus nombres), no las líneas. */
  listasDe: (neveraId: string) => ['lista', neveraId, 'listas'] as const,
  linea: (id: string) => ['lista', 'linea', id] as const,

  /** Todo lo de Premium (prefijo): al añadir algo, «tus productos» y «lo que más gastas» cambian. */
  premium: ['premium'] as const,
  /** Lo que más se gasta en una nevera (premium): el resumen (pocos) o la lista entera. */
  masUsados: (neveraId: string, limite: number) => ['premium', 'mas-usados', neveraId, limite] as const,
  /** Lo que ya has añadido a una nevera, sin repetidos (premium). */
  productosConocidos: (neveraId: string) => ['premium', 'productos', neveraId] as const,

  settings: ['settings'] as const,
  correo: ['cuenta', 'correo'] as const,

  // ── Salud ───────────────────────────────────────────────────────────────

  /**
   * Los alérgenos e intolerancias que evita la persona. DATO DE SALUD: solo existe
   * aquí, en memoria, y en su tabla del servidor. Nada lo copia a otro sitio (ni a
   * AsyncStorage, ni a una URL, ni a un registro) y `session.tsx` vacía esta caché al
   * cambiar de persona.
   *
   * Ninguna otra consulta depende de su VALOR: las marcas se calculan al pintar
   * (`evaluarSalud`), así que al guardar basta con escribir esta clave. Lo único que
   * cambia con ella es si hace falta pedir las fichas (`enabled`), no lo que se pide.
   */
  preferenciasSalud: ['salud', 'preferencias'] as const,

  /** El perfil personal (opcional, sensible): solo su dueña lo lee. Se vacía al cambiar de persona. */
  perfil: ['perfil'] as const,

  /**
   * Un producto del catálogo, con su ficha de salud ya limpia. Lo leen la ficha del
   * detalle, el alta, el aviso de salud y las hojas rápidas: una sola clave para que
   * pedir los ingredientes y renovar una ficha antigua actualice a todos a la vez.
   */
  producto: (id: string) => ['catalogo', 'producto', id] as const,
  /** Las fichas de salud de TODOS los productos de una lista (prefijo, para invalidar). */
  fichasSalud: ['catalogo', 'salud'] as const,
  /** Las de una lista concreta de productos. Los ids van ordenados: mismo conjunto, misma clave. */
  fichasSaludDe: (ids: readonly string[]) => ['catalogo', 'salud', ...ids] as const,
  /**
   * La hoja de ingredientes. Clave propia y no `producto(id)`: su consulta puede renovar
   * la ficha en Open Food Facts (gasta cuota), y dos consultas con funciones distintas
   * bajo la misma clave se pisan.
   */
  ingredientes: (id: string) => ['catalogo', 'ingredientes', id] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // En un móvil se sale y se vuelve a la app constantemente. Un minuto
      // evita recargar en cada vuelta sin llegar a enseñar datos viejos.
      staleTime: 60_000,
      retry: 1,
    },
  },
});
