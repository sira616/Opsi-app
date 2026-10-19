/**
 * El perfil personal: lo que una persona cuenta de sí para que Opsi la conozca.
 *
 * Todo es OPCIONAL: se puede no rellenar nada, rellenar una cosa o borrarlo todo, y la app
 * funciona igual. Y se trata con cuidado, como un dato sensible: cuánto se mueve alguien y
 * cómo come dicen cosas de esa persona. Por eso, igual que lo de salud (`salud.ts`):
 *
 *   · No se guarda ni se usa sin su permiso (`consentimiento`), que es PROPIO y distinto del
 *     de salud. El servidor no deja guardar nada sin él (`check_user_profile`).
 *   · Solo lo ve su dueña (RLS). Aquí no sale a ningún otro sitio: ni a una URL, ni a un
 *     registro, ni al disco del aparato.
 *   · Lo que llega del servidor se lee con desconfianza (`leerPerfil`): lo que no cuadra con
 *     las listas cerradas se tira.
 *
 * No hay opciones religiosas (halal, kosher) a propósito: serían otra categoría especial y
 * no se han pedido (ver PENDIENTES).
 *
 * Sin JSX ni imports, para probarlo con Node tal cual (`perfil.test.ts`).
 */

// ── Los vocabularios (los mismos que valida el servidor) ──────────────────

export const NIVELES_ACTIVIDAD = [
  { clave: 'sedentary', etiqueta: 'Casi nada' },
  { clave: 'light', etiqueta: 'Poco' },
  { clave: 'moderate', etiqueta: 'Normal' },
  { clave: 'active', etiqueta: 'Bastante' },
  { clave: 'very_active', etiqueta: 'Mucho' },
] as const;
export type ClaveActividad = (typeof NIVELES_ACTIVIDAD)[number]['clave'];

export const DIETAS = [
  { clave: 'omnivore', etiqueta: 'De todo' },
  { clave: 'vegetarian', etiqueta: 'Vegetariana' },
  { clave: 'vegan', etiqueta: 'Vegana' },
  { clave: 'pescatarian', etiqueta: 'Con pescado, sin carne' },
  { clave: 'flexitarian', etiqueta: 'Poca carne' },
] as const;
export type ClaveDieta = (typeof DIETAS)[number]['clave'];

/** El vocabulario de gustos y disgustos: el mismo para los dos, y una cosa no está en los dos. */
export const ALIMENTOS = [
  { clave: 'vegetables', etiqueta: 'Verduras' },
  { clave: 'fruit', etiqueta: 'Fruta' },
  { clave: 'legumes', etiqueta: 'Legumbres' },
  { clave: 'pasta', etiqueta: 'Pasta' },
  { clave: 'rice', etiqueta: 'Arroz' },
  { clave: 'bread', etiqueta: 'Pan' },
  { clave: 'fish', etiqueta: 'Pescado' },
  { clave: 'oily_fish', etiqueta: 'Pescado azul' },
  { clave: 'seafood', etiqueta: 'Marisco' },
  { clave: 'chicken', etiqueta: 'Pollo' },
  { clave: 'red_meat', etiqueta: 'Carne roja' },
  { clave: 'offal', etiqueta: 'Vísceras' },
  { clave: 'eggs', etiqueta: 'Huevos' },
  { clave: 'cheese', etiqueta: 'Queso' },
  { clave: 'strong_cheese', etiqueta: 'Queso fuerte' },
  { clave: 'nuts', etiqueta: 'Frutos secos' },
  { clave: 'spicy', etiqueta: 'Picante' },
  { clave: 'sweets', etiqueta: 'Dulces' },
  { clave: 'mushrooms', etiqueta: 'Setas' },
  { clave: 'onion', etiqueta: 'Cebolla' },
  { clave: 'tomato', etiqueta: 'Tomate' },
  { clave: 'olives', etiqueta: 'Aceitunas' },
  { clave: 'crucifers', etiqueta: 'Coliflor y brócoli' },
  { clave: 'cilantro', etiqueta: 'Cilantro' },
  { clave: 'eggplant', etiqueta: 'Berenjena' },
  { clave: 'beetroot', etiqueta: 'Remolacha' },
] as const;
export type ClaveAlimento = (typeof ALIMENTOS)[number]['clave'];

/** Cuántos productos concretos se pueden añadir (el tope del servidor). */
export const MAX_OTROS = 10;
export const MIN_LONGITUD_OTRO = 2;
export const MAX_LONGITUD_OTRO = 40;

/** La versión del aviso de consentimiento del perfil. Subirla obliga a aceptarlo de nuevo. */
export const VERSION_AVISO_PERFIL = 1;

// ── El perfil ─────────────────────────────────────────────────────────────

export type Perfil = {
  actividad: ClaveActividad | null;
  dieta: ClaveDieta | null;
  gustos: ClaveAlimento[];
  disgustos: ClaveAlimento[];
  /** Productos concretos que no gustan, tal como los escribió la persona (ya limpios). */
  otros: string[];
};

export const PERFIL_VACIO: Perfil = Object.freeze({
  actividad: null,
  dieta: null,
  gustos: [],
  disgustos: [],
  otros: [],
}) as Perfil;

/** Qué versión del aviso aceptó la persona y cuándo (la fecha la pone el servidor). */
export type ConsentimientoPerfil = { version: number; en: string };

/** Lo que hay guardado: el perfil y el permiso con el que se guardó. */
export type PerfilGuardado = { perfil: Perfil; consentimiento: ConsentimientoPerfil | null };

const CLAVES_ACTIVIDAD: ReadonlySet<string> = new Set(NIVELES_ACTIVIDAD.map((n) => n.clave));
const CLAVES_DIETA: ReadonlySet<string> = new Set(DIETAS.map((d) => d.clave));
const CLAVES_ALIMENTO: ReadonlySet<string> = new Set(ALIMENTOS.map((a) => a.clave));

// ── Productos concretos ───────────────────────────────────────────────────

/**
 * Lo que no tiene sitio en el nombre de un producto: caracteres de control, de formato
 * (dirección, ancho cero, uniones, BOM), las «etiquetas» U+E0000 —no se ven y esconden
 * instrucciones— y el marcado y las comillas inversas. Es la MISMA regla que aplica el
 * servidor (`check_user_profile`); se repite aquí para dar el error antes de mandar nada
 * y para no fiarse de lo que vuelva.
 *
 * Se comprueba carácter a carácter y no con una expresión con escapes: en este proyecto una
 * expresión con `\u…` escrita por una herramienta llegó a quedar con caracteres invisibles
 * literales y rompió el módulo (BITACORA, sesión 37).
 */
function caracterProhibido(codigo: number): boolean {
  return (
    codigo < 0x20 ||
    (codigo >= 0x7f && codigo <= 0x9f) ||
    codigo === 0xad ||
    (codigo >= 0x200b && codigo <= 0x200f) ||
    (codigo >= 0x202a && codigo <= 0x202e) ||
    (codigo >= 0x2060 && codigo <= 0x2069) ||
    codigo === 0xfeff ||
    (codigo >= 0xe0000 && codigo <= 0xe007f) ||
    // < > { } [ ] ` \ | $
    codigo === 0x3c ||
    codigo === 0x3e ||
    codigo === 0x7b ||
    codigo === 0x7d ||
    codigo === 0x5b ||
    codigo === 0x5d ||
    codigo === 0x60 ||
    codigo === 0x5c ||
    codigo === 0x7c ||
    codigo === 0x24
  );
}

export type ResultadoProducto = { ok: true; valor: string } | { ok: false };

/**
 * Un producto concreto como lo guardaría el servidor: sin espacios sobrantes, de 2 a 40
 * caracteres y sin nada de lo prohibido. Un texto vacío tras recortar no es un error: no hay
 * nada que añadir (`valor: ''`).
 */
export function limpiarProducto(texto: string): ResultadoProducto {
  // Solo los espacios ASCII cuentan como espacio, como en el servidor (`btrim` y `\s` de
  // Postgres): en JavaScript `\s` y `trim()` también comen el BOM (U+FEFF) y otros, que aquí
  // tienen que llegar a la comprobación de abajo y rechazarse, no desaparecer.
  const valor = texto
    .replace(/[ \t\n\r\f\v]+/g, ' ')
    .replace(/^ | $/g, '');
  if (valor === '') return { ok: true, valor: '' };
  const largo = [...valor].length;
  if (largo < MIN_LONGITUD_OTRO || largo > MAX_LONGITUD_OTRO) return { ok: false };
  for (const caracter of valor) {
    if (caracterProhibido(caracter.codePointAt(0) ?? 0)) return { ok: false };
  }
  return { ok: true, valor };
}

/** Añade un producto concreto: sin repetir (sin distinguir mayúsculas) y con tope. */
export function conProductoAnadido(otros: readonly string[], texto: string): string[] | null {
  const r = limpiarProducto(texto);
  if (!r.ok || r.valor === '') return null;
  if (otros.some((o) => o.toLowerCase() === r.valor.toLowerCase())) return [...otros];
  if (otros.length >= MAX_OTROS) return null;
  return [...otros, r.valor];
}

// ── Cambios sobre las listas ──────────────────────────────────────────────

/** Los alimentos en el orden del vocabulario, que es el de la pantalla. */
function enOrden(claves: ReadonlySet<ClaveAlimento>): ClaveAlimento[] {
  return ALIMENTOS.map((a) => a.clave).filter((c) => claves.has(c));
}

/**
 * Marca o desmarca algo en «me gusta». Si estaba en «no me gusta» sale de ahí: una cosa no
 * puede gustar y no gustar a la vez, y el servidor lo rechaza si se intenta.
 */
export function alternarGusto(perfil: Perfil, clave: ClaveAlimento): Pick<Perfil, 'gustos' | 'disgustos'> {
  const gustos = new Set(perfil.gustos);
  const disgustos = new Set(perfil.disgustos);
  if (gustos.has(clave)) gustos.delete(clave);
  else {
    gustos.add(clave);
    disgustos.delete(clave);
  }
  return { gustos: enOrden(gustos), disgustos: enOrden(disgustos) };
}

/** Lo mismo, para «no me gusta». */
export function alternarDisgusto(perfil: Perfil, clave: ClaveAlimento): Pick<Perfil, 'gustos' | 'disgustos'> {
  const gustos = new Set(perfil.gustos);
  const disgustos = new Set(perfil.disgustos);
  if (disgustos.has(clave)) disgustos.delete(clave);
  else {
    disgustos.add(clave);
    gustos.delete(clave);
  }
  return { gustos: enOrden(gustos), disgustos: enOrden(disgustos) };
}

// ── Leer lo que llega del servidor ────────────────────────────────────────

function lista(valor: unknown): unknown[] {
  return Array.isArray(valor) ? valor.slice(0, 100) : [];
}

/**
 * El perfil tal y como llega de la fila. No se fía de la forma: lo que no esté en las listas
 * cerradas se tira, lo repetido se junta, y un producto concreto que no pasa la limpieza se
 * descarta. Sin fila: el perfil vacío.
 */
export function leerPerfil(fila: unknown): Perfil {
  if (typeof fila !== 'object' || fila === null) return PERFIL_VACIO;
  const f = fila as Record<string, unknown>;

  const alimentos = (valor: unknown): Set<ClaveAlimento> =>
    new Set(lista(valor).filter((v): v is ClaveAlimento => typeof v === 'string' && CLAVES_ALIMENTO.has(v)));

  const disgustos = alimentos(f.dislikes);
  // Por si el servidor dejara una cosa en las dos listas (no debería): gana «no me gusta»,
  // que es lo que evita algo que se le recomienda a alguien que no lo quiere.
  const gustos = alimentos(f.likes);
  for (const d of disgustos) gustos.delete(d);

  const otros: string[] = [];
  for (const v of lista(f.dislikes_custom)) {
    if (typeof v !== 'string') continue;
    const r = limpiarProducto(v);
    if (r.ok && r.valor !== '' && !otros.some((o) => o.toLowerCase() === r.valor.toLowerCase())) otros.push(r.valor);
    if (otros.length >= MAX_OTROS) break;
  }

  return {
    actividad: typeof f.activity_level === 'string' && CLAVES_ACTIVIDAD.has(f.activity_level)
      ? (f.activity_level as ClaveActividad)
      : null,
    dieta: typeof f.diet === 'string' && CLAVES_DIETA.has(f.diet) ? (f.diet as ClaveDieta) : null,
    gustos: enOrden(gustos),
    disgustos: enOrden(disgustos),
    otros,
  };
}

/**
 * El permiso tal y como llega de la fila. Lo que no tenga la forma exacta —una versión que
 * no sea un entero positivo, o una fecha que no sea una fecha— cuenta como «sin permiso».
 */
export function leerConsentimientoPerfil(version: unknown, en: unknown): ConsentimientoPerfil | null {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  if (typeof en !== 'string' || Number.isNaN(Date.parse(en))) return null;
  return { version, en };
}

/** ¿Vale el permiso que hay para la versión del aviso que enseña la app? */
export function consentimientoPerfilVigente(
  consentimiento: ConsentimientoPerfil | null,
  vigente: number = VERSION_AVISO_PERFIL,
): boolean {
  return consentimiento !== null && consentimiento.version >= vigente;
}

/**
 * Lo que de verdad se usa para recomendar: el perfil guardado si hay permiso vigente, y
 * vacío si no. Hoy nada recomienda con él; cuando algo lo haga, lo lee por aquí.
 */
export function perfilEfectivo(guardado: PerfilGuardado, vigente: number = VERSION_AVISO_PERFIL): Perfil {
  return consentimientoPerfilVigente(guardado.consentimiento, vigente) ? guardado.perfil : PERFIL_VACIO;
}

/** Cuántas cosas ha contado la persona: cada campo relleno y cada alimento, uno. */
export function respuestasDelPerfil(perfil: Perfil): number {
  return (
    (perfil.actividad ? 1 : 0) +
    (perfil.dieta ? 1 : 0) +
    perfil.gustos.length +
    perfil.disgustos.length +
    perfil.otros.length
  );
}

/** La línea del widget: sin números sueltos que no digan nada. */
export function resumenDelPerfil(guardado: PerfilGuardado): string {
  if (!consentimientoPerfilVigente(guardado.consentimiento)) return 'Opcional: ejercicio, dieta y gustos';
  const n = respuestasDelPerfil(guardado.perfil);
  if (n === 0) return 'Sin rellenar';
  return `${n} ${n === 1 ? 'respuesta' : 'respuestas'}`;
}
