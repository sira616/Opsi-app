/**
 * Los avisos de la app: qué se le recomienda a la persona cuando la abre, y cuándo.
 *
 * Es solo la parte que decide. No hay pantalla ni red aquí, para poder probarla con Node.
 * Lo que enseña el aviso (`PopupAvisos.tsx`) y lo que hace al tocarlo vive en otro sitio.
 *
 * ── Qué es un aviso ───────────────────────────────────────────────────────
 *
 * Una recomendación sobre UN elemento de la nevera que vence pronto: «congélalo o úsalo»
 * (si se puede congelar) o «úsalo» (hacer una receta). Es un consejo: no cambia fechas, no
 * bloquea nada y no dice que algo «aguante» ni «esté bueno».
 *
 * ── Qué NO se avisa ───────────────────────────────────────────────────────
 *
 *   · Lo vencido (`days_left < 0`): aquí manda el rojo de siempre y ningún consejo
 *     («úsalo», una receta) sobre algo pasado de fecha. Es seguridad alimentaria.
 *   · Lo congelado (la cuenta atrás está parada), lo agotado y lo tirado.
 *   · Lo que no vence pronto: «si no hay nada urgente, no hay aviso». Un aviso que sale
 *     todos los días sin motivo se aprende a cerrar sin leerlo, y entonces el que importa
 *     también.
 *
 * ── Cuándo sale ───────────────────────────────────────────────────────────
 *
 * Como mucho UNA vez al día y solo con algo que avisar (`tocaAvisar`). Se puede apagar en
 * Ajustes. Hasta tres avisos juntos, los más urgentes primero: una lista larga de
 * recomendaciones no se lee.
 */

import type { PriorityItem } from '@/api/inventory';

/** Hasta cuántos avisos se enseñan a la vez. */
export const MAX_AVISOS = 3;

/** Hasta cuántos días de margen para recomendar usarlo: hoy y mañana. */
export const DIAS_PARA_USAR = 1;

export type Aviso = {
  /** El elemento sobre el que avisa. */
  itemId: string;
  nombre: string;
  /** `congelar`: se ofrece congelarlo o usarlo. `usar`: solo usarlo (no se congela). */
  tipo: 'congelar' | 'usar';
  diasRestantes: number;
  /** El texto, con el dato primero: «Vence mañana. Congélalo o úsalo.» */
  texto: string;
};

/** «hoy», «mañana», «pasado mañana». Solo para 0 a 2: es todo lo que avisa. */
function cuando(dias: number): string {
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'mañana';
  return 'pasado mañana';
}

/** Los estados en los que algo está ahí para usarse: ni congelado, ni agotado, ni tirado. */
const USABLE = new Set<PriorityItem['state']>(['closed', 'open', 'partially_consumed', 'thawed']);

/**
 * Los avisos de una nevera, del más urgente al menos y con tope. Lo que ya viene ordenado
 * por prioridad no se da por supuesto: se ordena aquí por días y, a igual fecha, por nombre,
 * para que el resultado no dependa del orden en que llegue la lista.
 *
 * `recomendarCongelar` (de `shared/lib/congelar.ts`) se recibe y no se importa: este fichero se
 * prueba con Node, que no resuelve el alias `@/`, y el código de la app no puede importar con
 * extensión `.ts`. Es la misma función que usa la tarjeta del inventario, así que el aviso y la
 * tarjeta nunca discrepan.
 */
export function avisosDe(
  items: readonly PriorityItem[],
  recomendarCongelar: (e: PriorityItem) => boolean,
): Aviso[] {
  const avisos: Aviso[] = [];

  for (const e of items) {
    if (!USABLE.has(e.state)) continue;
    const dias = e.days_left;
    if (dias === null || dias < 0 || dias > DIAS_PARA_USAR + 1) continue;

    const congelar = recomendarCongelar(e);
    // Para usarlo solo hoy y mañana; congelar da un día más de margen (hasta pasado mañana).
    if (!congelar && dias > DIAS_PARA_USAR) continue;

    // «Caduca» es seguridad; «vence», calidad. Mismas palabras que el resto de la app.
    const verbo = e.date_kind === 'expiry' ? 'Caduca' : 'Vence';
    avisos.push({
      itemId: e.id,
      nombre: e.name,
      tipo: congelar ? 'congelar' : 'usar',
      diasRestantes: dias,
      texto: `${verbo} ${cuando(dias)}.${congelar ? ' Congélalo o úsalo.' : ''}`,
    });
  }

  return avisos
    .sort((a, b) => a.diasRestantes - b.diasRestantes || a.nombre.localeCompare(b.nombre, 'es'))
    .slice(0, MAX_AVISOS);
}

/**
 * ¿Hay que enseñar el aviso ahora? Si está encendido, hay algo que avisar y todavía no se
 * enseñó hoy. `hoy` y `ultimoDia` son fechas «aaaa-mm-dd» del día de ESTE dispositivo.
 */
export function tocaAvisar(opciones: {
  activos: boolean;
  avisos: readonly Aviso[];
  ultimoDia: string | null;
  hoy: string;
}): boolean {
  return opciones.activos && opciones.avisos.length > 0 && opciones.ultimoDia !== opciones.hoy;
}

/** La pregunta con la que se abre el chat para hacer una receta con esto. */
export function preguntaDeReceta(nombre: string): string {
  return `¿Qué receta puedo hacer con ${nombre}?`;
}
