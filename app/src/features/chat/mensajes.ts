import type { PropuestaChat } from './propuestas.ts';

/**
 * La parte del chat que no necesita pantalla: qué es un mensaje, qué se sugiere y cómo se
 * limpia un borrador que llega de fuera. Pura, para poder probarla.
 */

export type Mensaje = {
  /** Único en la conversación; solo sirve de clave de lista. */
  id: string;
  /** Quién lo dice. Los dos son texto plano: nunca se interpretan como marcado ni como orden. */
  de: 'persona' | 'opsi';
  texto: string;
  /** Lo que Opsi propone hacer con este mensaje (solo en los suyos). No se manda al servidor. */
  propuestas?: PropuestaChat[];
};

/** Lo más largo que se deja escribir. Un mensaje corto es lo que se espera de un chat de cocina. */
export const MAX_LONGITUD_MENSAJE = 500;

/**
 * Qué se le puede preguntar, para no empezar frente a una caja vacía. Frases que la persona
 * diría tal cual: tocarlas las pone en el cuadro de escribir, no las manda.
 */
export const SUGERENCIAS = [
  '¿Qué ceno hoy?',
  '¿Qué se me va a estropear?',
  '¿Qué me falta para la compra?',
] as const;

/**
 * Un texto que llega de fuera (la ruta `/chat?mensaje=…` puede abrirla cualquier enlace) y
 * acaba como borrador en el cuadro de escribir. Solo es un borrador: no se envía solo, y la
 * persona lo ve y lo manda o lo borra. Aun así se limpia: texto plano, sin caracteres de
 * control ni de formato (los que cambian el sentido de lectura o esconden texto), con los
 * espacios apretados y con tope de longitud.
 *
 * Los caracteres de formato se quitan por su código y no con una expresión con `\p{…}`: en
 * este proyecto una expresión con escapes `\u…` escrita por una herramienta llegó a quedar
 * con caracteres invisibles literales y rompió el módulo (ver BITACORA, sesión 37).
 */
export function borradorDeRuta(valor: unknown): string {
  const crudo = Array.isArray(valor) ? valor[0] : valor;
  if (typeof crudo !== 'string') return '';

  let limpio = '';
  for (const caracter of crudo) {
    const codigo = caracter.codePointAt(0) ?? 0;
    const control = codigo < 0x20 || (codigo >= 0x7f && codigo <= 0x9f);
    // Espacios y saltos de línea cuentan como un espacio; el resto del control, fuera.
    if (codigo === 0x09 || codigo === 0x0a || codigo === 0x0d) limpio += ' ';
    else if (!control && !esDeFormato(codigo)) limpio += caracter;
  }
  return limpio.replace(/ {2,}/g, ' ').trim().slice(0, MAX_LONGITUD_MENSAJE);
}

/** Caracteres invisibles que cambian cómo se lee un texto: marcas de dirección, espacios de ancho cero, etc. */
function esDeFormato(codigo: number): boolean {
  return (
    (codigo >= 0x200b && codigo <= 0x200f) || // ancho cero y marcas de dirección
    (codigo >= 0x202a && codigo <= 0x202e) || // incrustaciones de dirección
    (codigo >= 0x2060 && codigo <= 0x2064) || // unión de palabras, operadores invisibles
    (codigo >= 0x2066 && codigo <= 0x2069) || // aislamientos de dirección
    codigo === 0xfeff || // marca de orden de bytes
    codigo === 0x00ad // guion blando
  );
}

/** Cuántos mensajes acepta `opsi-chat` (`MAX_MENSAJES` en `supabase/functions/_shared/chat.ts`). */
export const MAX_MENSAJES_ENVIADOS = 20;

/**
 * Lo que se manda a la función: los últimos mensajes, sin ids (solo sirven de clave de lista)
 * y con el mismo recorte que hace el servidor. La conversación no se guarda: con cada pregunta
 * va entera, así que una larga se corta por el principio, nunca por el final.
 */
export function paraEnviar(conversacion: readonly Mensaje[]): { de: Mensaje['de']; texto: string }[] {
  return conversacion
    .slice(-MAX_MENSAJES_ENVIADOS)
    .map((m) => ({ de: m.de, texto: m.texto.trim().slice(0, MAX_LONGITUD_MENSAJE) }));
}

/**
 * Lo que se le dice a la persona cuando llega al límite de mensajes (la cuota del servidor,
 * `opsi-chat` → 429): el dato primero y qué hacer, con la espera redondeada hacia ARRIBA para
 * no decirle que vuelva antes de tiempo. Sin dato de cuánto falta, un minuto.
 */
export function avisoDeLimite(esperaS: number): string {
  const s = Number.isFinite(esperaS) && esperaS > 0 ? esperaS : 60;
  const minutos = Math.ceil(s / 60);
  let cuando: string;
  if (s < 60) cuando = 'menos de un minuto';
  else if (minutos < 60) cuando = minutos === 1 ? 'un minuto' : `${minutos} minutos`;
  else {
    const horas = Math.ceil(minutos / 60);
    cuando = horas === 1 ? 'una hora' : `${horas} horas`;
  }
  return `Has llegado al límite de mensajes. Prueba otra vez en ${cuando}.`;
}

/** ¿Se puede mandar? Con algo escrito de verdad, y sin pasarse. */
export function puedeEnviar(texto: string): boolean {
  const t = texto.trim();
  return t.length > 0 && t.length <= MAX_LONGITUD_MENSAJE;
}
