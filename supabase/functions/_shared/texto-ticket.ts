/**
 * El texto de una línea de ticket, preparado para compararlo: normalizar, sacar el tamaño del envase,
 * partir en palabras y decir si la línea ni siquiera es un producto (un subtotal, un descuento, el pago).
 *
 * Todo puro y sin red: lo usa el resolutor (`resolver.ts`) y el lector de tickets (`ticket.ts`), y se
 * prueba con `node --test`.
 *
 * ── Qué se conserva y qué no ─────────────────────────────────────────────
 *
 * Normalizar es quitar lo que no distingue —mayúsculas, acentos, puntuación, espacios de más— y NADA
 * más. Los números, los tamaños, las unidades y las palabras que separan productos parecidos
 * («sin lactosa», «0%», «zero») se quedan: «leche entera 1l» y «leche entera 200ml» son dos productos,
 * y una clave que los juntara aprendería una cosa falsa. El texto ORIGINAL de la línea nunca se toca:
 * esto solo produce versiones auxiliares para buscar y comparar.
 */

/** Familia de una cantidad, en la unidad base (g, ml, piezas): la misma que `off.ts`. */
export type FamiliaTamano = 'mass' | 'volume' | 'count';

/**
 * El tamaño de un envase. `total` está en la unidad base; `porUnidad` solo si es un pack («4x125 g» →
 * total 500, porUnidad 125), porque el catálogo a veces apunta el pack y a veces una unidad.
 */
export type Tamano = { familia: FamiliaTamano; total: number; porUnidad: number | null };

const MAX_CLAVE = 160;

/** Minúsculas, sin acentos (la ñ también: «piña» y «pina» son lo mismo para buscar), sin símbolos raros. */
export function sinAcentos(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * La versión auxiliar de un texto para buscar y comparar: minúsculas, sin acentos, la puntuación hecha
 * espacios y los espacios colapsados. Los decimales («1,5 l») pasan a punto y siguen pegados.
 */
export function normalizarTexto(texto: string): string {
  return sinAcentos(texto)
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^a-z0-9.%]+/g, ' ')
    // Un punto entre letras es una abreviatura («q.burgos»); entre cifras, un decimal; en cualquier otro sitio, adorno.
    .replace(/(?<![0-9])\.|\.(?![0-9])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Quita el importe con el que acaba una línea («leche entera 1l 0.89»): cambia de un día a otro y no
 * distingue ningún producto. Solo cifras con dos decimales al final y SIN unidad detrás; un peso
 * («0.750 kg») tiene tres decimales y una unidad, y se queda.
 */
export function quitarImporteFinal(normalizado: string): string {
  let t = normalizado;
  for (let i = 0; i < 2; i += 1) {
    const sin = t.replace(/\s+\d{1,4}\.\d{2}(?:\s*(?:eur|euros))?$/, '');
    if (sin === t) break;
    t = sin;
  }
  return t.trim();
}

/** La clave con la que se recuerda una línea: el texto normalizado y sin el importe, acotado. Vacía si no queda nada. */
export function claveDeLinea(texto: string): string {
  return quitarImporteFinal(normalizarTexto(texto)).slice(0, MAX_CLAVE).trim();
}

// ── Tamaño del envase ─────────────────────────────────────────────────────

const UNIDADES_TAMANO: Record<string, { familia: FamiliaTamano; factor: number }> = {
  kg: { familia: 'mass', factor: 1000 },
  kgs: { familia: 'mass', factor: 1000 },
  g: { familia: 'mass', factor: 1 },
  gr: { familia: 'mass', factor: 1 },
  grs: { familia: 'mass', factor: 1 },
  mg: { familia: 'mass', factor: 0.001 },
  l: { familia: 'volume', factor: 1000 },
  lt: { familia: 'volume', factor: 1000 },
  lts: { familia: 'volume', factor: 1000 },
  litro: { familia: 'volume', factor: 1000 },
  litros: { familia: 'volume', factor: 1000 },
  dl: { familia: 'volume', factor: 100 },
  cl: { familia: 'volume', factor: 10 },
  ml: { familia: 'volume', factor: 1 },
  ud: { familia: 'count', factor: 1 },
  uds: { familia: 'count', factor: 1 },
  u: { familia: 'count', factor: 1 },
  unidad: { familia: 'count', factor: 1 },
  unidades: { familia: 'count', factor: 1 },
};

const NOMBRES_UNIDAD = Object.keys(UNIDADES_TAMANO)
  .sort((a, b) => b.length - a.length)
  .join('|');

/** «4x125g», «6 x 33 cl», «2x1l» (multiplicador opcional), o «1,5 l», «500 g», «12 uds». */
const REGEX_TAMANO = new RegExp(
  `(?<![a-z0-9.])(?:(\\d{1,3})\\s*[x*]\\s*)?(\\d{1,6}(?:\\.\\d{1,3})?)\\s*(${NOMBRES_UNIDAD})(?![a-z0-9])`,
  'g',
);
/** «pack 6», «pack6», «p-6», «p6», «x4» al final: seis piezas, sin más. */
const REGEX_PACK = /(?<![a-z0-9])(?:pack|p|x)\s?-?\s?(\d{1,3})(?![a-z0-9.%])/;

function aTamano(familia: FamiliaTamano, valor: number, multiplicador: number): Tamano | null {
  const total = valor * multiplicador;
  if (!Number.isFinite(total) || total <= 0 || total > 1_000_000) return null;
  return {
    familia,
    total: Math.round(total * 1000) / 1000,
    porUnidad: multiplicador > 1 ? Math.round(valor * 1000) / 1000 : null,
  };
}

/**
 * Busca el tamaño del envase en un texto ya normalizado y lo devuelve junto con el texto SIN ese trozo
 * (para que «1l» no cuente como una palabra al comparar nombres). Si hay varios, manda el primero con
 * unidad de peso o volumen; un número suelto («leche 2») no es un tamaño.
 */
export function extraerTamano(normalizado: string): { tamano: Tamano | null; resto: string } {
  REGEX_TAMANO.lastIndex = 0;
  let elegido: { tamano: Tamano; inicio: number; fin: number } | null = null;
  for (let m = REGEX_TAMANO.exec(normalizado); m !== null; m = REGEX_TAMANO.exec(normalizado)) {
    const u = UNIDADES_TAMANO[m[3]];
    if (!u) continue;
    const t = aTamano(u.familia, Number(m[2]) * u.factor, m[1] ? Number(m[1]) : 1);
    if (!t) continue;
    // «6 uds» y similares valen solo si no hay peso o volumen.
    if (elegido === null || (elegido.tamano.familia === 'count' && t.familia !== 'count')) {
      elegido = { tamano: t, inicio: m.index, fin: m.index + m[0].length };
    }
  }
  if (elegido) {
    return { tamano: elegido.tamano, resto: quitarTrozo(normalizado, elegido.inicio, elegido.fin) };
  }
  const pack = REGEX_PACK.exec(normalizado);
  if (pack) {
    const n = Number(pack[1]);
    // De 2 a 48 piezas: «x 125» sin unidad no es un pack de 125.
    if (n >= 2 && n <= 48) {
      return {
        tamano: { familia: 'count', total: n, porUnidad: null },
        resto: quitarTrozo(normalizado, pack.index, pack.index + pack[0].length),
      };
    }
  }
  return { tamano: null, resto: normalizado };
}

function quitarTrozo(texto: string, inicio: number, fin: number): string {
  return `${texto.slice(0, inicio)} ${texto.slice(fin)}`.replace(/\s+/g, ' ').trim();
}

/**
 * Dos tamaños, comparados.
 *   · `igual`: la misma familia y la misma cantidad (2 % de margen), o la de una unidad del pack.
 *   · `distinto`: los dos se conocen y NO cuadran. Una bebida de 2 L no es la de 330 ml aunque se llamen igual.
 *   · `desconocido`: a uno le falta el dato; no es ni a favor ni en contra. También cuando uno cuenta
 *     piezas y el otro pesa o mide: «pack 6» no contradice «312 g», y no se sabe cuánto trae cada una.
 */
export function compararTamanos(
  a: Tamano | null,
  b: { familia: FamiliaTamano; total: number } | null,
): 'igual' | 'distinto' | 'desconocido' {
  if (a === null || b === null) return 'desconocido';
  if (a.familia !== b.familia) return a.familia === 'count' || b.familia === 'count' ? 'desconocido' : 'distinto';
  const cerca = (x: number, y: number) => Math.abs(x - y) <= Math.max(x, y) * 0.02;
  if (cerca(a.total, b.total)) return 'igual';
  if (a.porUnidad !== null && cerca(a.porUnidad, b.total)) return 'igual';
  return 'distinto';
}

// ── Palabras ──────────────────────────────────────────────────────────────

/** Palabras que no distinguen un producto de otro. «con» y «sin» NO están: «sin sal» ≠ «con sal». */
const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'en', 'y', 'a', 'al', 'un', 'una', 'e', 'o']);

/**
 * Abreviaturas de ticket que no están ya expandidas. Se aplican a cada palabra entera. El lector de
 * tickets ya expande las que ve claras; esto cubre las que se le escapan, y las del texto impreso.
 */
const ABREVIATURAS: Record<string, string> = {
  nat: 'natural',
  desna: 'desnatado',
  desnat: 'desnatado',
  semi: 'semidesnatado',
  ent: 'entero',
  ens: 'ensalada',
  mer: 'merluza',
  q: 'queso',
  yog: 'yogur',
  yogu: 'yogur',
  gall: 'galletas',
  choc: 'chocolate',
  jam: 'jamon',
  pech: 'pechuga',
  tom: 'tomate',
  manz: 'manzana',
  plat: 'platano',
  zum: 'zumo',
  cerv: 'cerveza',
  ac: 'aceite',
  aceit: 'aceite',
  vac: 'vacuno',
  vacun: 'vacuno',
  cong: 'congelado',
  ecol: 'ecologico',
  integ: 'integral',
  lact: 'lactosa',
};

/** Las palabras distintivas de un texto ya normalizado y SIN el tamaño: expandidas y sin las vacías. */
export function palabras(sinTamano: string): string[] {
  const salida: string[] = [];
  for (const crudo of sinTamano.split(' ')) {
    if (crudo === '' || PALABRAS_VACIAS.has(crudo)) continue;
    const p = crudo.replace(/^\.+|\.+$/g, '');
    if (p === '') continue;
    salida.push(ABREVIATURAS[p] ?? p);
  }
  return salida;
}

/**
 * ¿Una palabra de la línea es la misma que una del candidato? Igual, un plural sencillo («huevo» /
 * «huevos»), o una es el principio de la otra («desna» → «desnatado») con al menos cuatro letras y
 * la mitad de la palabra larga. Con menos no: «sal» no es el principio de «salmón».
 */
export function palabrasCoinciden(a: string, b: string): boolean {
  if (a === b) return true;
  const corta = a.length <= b.length ? a : b;
  const larga = a.length <= b.length ? b : a;
  if (corta.length < 3) return false;
  if (larga === corta + 's' || larga === corta + 'es') return true;
  // Solo letras: «1.5» o «0%» no son principio de nada.
  if (corta.length < 4 || !/^[a-z]+$/.test(corta)) return false;
  return larga.startsWith(corta) && corta.length / larga.length >= 0.5;
}

// ── Qué es una línea de producto y qué no ────────────────────────────────

type ClaseNoProducto = 'total' | 'impuesto' | 'descuento' | 'pago' | 'mensaje';

/**
 * Para cada clase, las palabras que puede llevar una línea de ese tipo. Una línea es de esa clase si
 * TODAS sus palabras (las cifras, los importes y los símbolos no cuentan) están en la lista y hay al menos
 * una de las que la definen. Así «total 0% natural» sigue siendo un yogur (le sobra «natural»), pero
 * «total a pagar 23,45» no.
 */
const CLASES: Record<ClaseNoProducto, { define: readonly string[]; admite: readonly string[] }> = {
  total: {
    define: ['total', 'subtotal', 'importe', 'suma'],
    admite: ['a', 'pagar', 'euros', 'eur', 'factura', 'compra', 'ticket', 'parcial', 'iva', 'incluido', 'articulos', 'productos', 'de', 'del', 'neto', 'bruto', 'final', 'cobrar'],
  },
  impuesto: {
    define: ['iva', 'igic', 'impuesto', 'impuestos', 'cuota', 'imponible', 'tipo'],
    admite: ['base', 'imponible', 'cuota', 'iva', 'igic', 'incluido', 'total', 'tipo', 'impuesto', 'impuestos', 'de', 'euros', 'eur', 'rec', 'equivalencia', 'general', 'reducido', 'superreducido'],
  },
  descuento: {
    define: ['dto', 'dcto', 'dscto', 'desc', 'descuento', 'descuentos', 'promo', 'promocion', 'oferta', 'ahorro', 'cupon', 'vale', 'bonificacion', 'rebaja', 'regalo'],
    admite: ['dto', 'dcto', 'dscto', 'desc', 'descuento', 'descuentos', 'promo', 'promocion', 'oferta', 'ahorro', 'cupon', 'vale', 'bonificacion', 'rebaja', 'regalo', 'total', 'de', 'del', 'la', 'el', 'por', 'club', 'cliente', 'socio', 'tarjeta', 'fidelizacion', 'segunda', 'unidad', 'ud', 'uds', 'euros', 'eur', 'directo', 'caja', 'acumulado', 'puntos', 'canje', 'canjeado'],
  },
  pago: {
    define: ['tarjeta', 'visa', 'mastercard', 'maestro', 'efectivo', 'cambio', 'entregado', 'pago', 'pagado', 'bizum', 'contactless', 'devolver', 'redondeo', 'credito', 'debito', 'metalico', 'datafono'],
    admite: ['tarjeta', 'visa', 'mastercard', 'maestro', 'efectivo', 'cambio', 'entregado', 'pago', 'pagado', 'bizum', 'contactless', 'devolver', 'a', 'de', 'del', 'redondeo', 'credito', 'debito', 'bancaria', 'metalico', 'euros', 'eur', 'total', 'importe', 'datafono', 'con', 'en', 'recibido', 'cliente'],
  },
  mensaje: {
    define: ['gracias', 'atendido', 'cajero', 'cajera', 'factura', 'simplificada', 'operacion', 'telefono', 'tel', 'nif', 'cif', 'iban', 'devoluciones', 'conserve', 'caja', 'tienda', 'fecha', 'hora', 'cliente', 'socio', 'puntos', 'visitanos', 'ticket', 'duplicado', 'regalo', 'www', 'comprobante', 'autorizacion', 'terminal'],
    admite: ['gracias', 'por', 'su', 'su', 'compra', 'visita', 'atendido', 'le', 'atendio', 'cajero', 'cajera', 'factura', 'simplificada', 'operacion', 'telefono', 'tel', 'nif', 'cif', 'iban', 'devoluciones', 'conserve', 'este', 'ticket', 'caja', 'tienda', 'fecha', 'hora', 'cliente', 'socio', 'puntos', 'visitanos', 'en', 'de', 'del', 'n', 'no', 'num', 'numero', 'duplicado', 'regalo', 'www', 'com', 'es', 'comprobante', 'autorizacion', 'terminal', 'con', 'y', 'la', 'el', 'los', 'las', 'para', 'acumulados', 'saldo', 'vuelva', 'pronto', 'hasta', 'luego', 'consulte', 'sus', 'datos', 'conservar', 'cambios'],
  },
};

/**
 * Líneas de recibo que acaban en un nombre propio (la cajera, el cliente): no se puede enumerar lo que
 * sigue, así que se reconocen por cómo EMPIEZAN. Solo palabras que no empiezan ningún producto.
 */
const EMPIEZA_COMO_MENSAJE = /^(?:le atendio|atendido|atendida|cajero|cajera|vendedor|vendedora|dependiente|gracias|telefono|tel|nif|cif|iban|fecha|factura|ticket|operacion|duplicado)\b/;

/**
 * Si la línea NO es un producto (un subtotal, el IVA, un descuento, el medio de pago, un mensaje del
 * recibo), la clase; si lo es o no se sabe, null. Ante la duda, null: más vale enseñar una línea de más
 * —la persona la desmarca— que esconder un producto.
 */
export function motivoNoProducto(texto: string): ClaseNoProducto | 'solo_importe' | null {
  const n = normalizarTexto(texto);
  if (n === '') return null;
  // Solo cifras, y a lo sumo la moneda: un importe suelto.
  const sinMoneda = n.replace(/\b(?:eur|euros?)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/[a-z]/.test(sinMoneda)) return 'solo_importe';
  if (EMPIEZA_COMO_MENSAJE.test(n)) return 'mensaje';

  // Un peso o un volumen delata un producto («total 0% 500g» es un yogur, no un total).
  // «2 unidad» (el «dto 2ª unidad») no es un tamaño que delate nada.
  const tamano = extraerTamano(n).tamano;
  if (tamano !== null && tamano.familia !== 'count') return null;

  // Las palabras de la línea; las cifras, los importes y los símbolos no cuentan.
  const letras = n.split(' ').filter((p) => /^[a-z]+$/.test(p));
  if (letras.length === 0) return null;

  for (const clase of Object.keys(CLASES) as ClaseNoProducto[]) {
    const { define, admite } = CLASES[clase];
    if (!letras.some((p) => define.includes(p))) continue;
    if (!letras.every((p) => admite.includes(p) || define.includes(p))) continue;
    // «total 0%» sin IVA de por medio es un yogur; con IVA («iva 10%») es un impuesto.
    if (clase === 'total' && n.includes('%') && !letras.includes('iva')) continue;
    return clase;
  }
  return null;
}

// ── La tienda ─────────────────────────────────────────────────────────────

/** Las cadenas que se reconocen por su nombre impreso. La clave es lo que se guarda. */
const CADENAS: { clave: string; patron: RegExp }[] = [
  { clave: 'mercadona', patron: /\bmercadona\b/ },
  { clave: 'carrefour', patron: /\bcarrefour\b/ },
  { clave: 'lidl', patron: /\blidl\b/ },
  { clave: 'dia', patron: /\b(?:supermercados\s+)?dia\b|\bdia\s*%/ },
  { clave: 'alcampo', patron: /\balcampo\b/ },
  { clave: 'eroski', patron: /\beroski\b/ },
  { clave: 'aldi', patron: /\baldi\b/ },
  { clave: 'consum', patron: /\bconsum\b/ },
  { clave: 'el corte ingles', patron: /\bcorte\s+ingles\b|\bhipercor\b|\bsupercor\b/ },
  { clave: 'bonpreu', patron: /\bbonpreu\b|\besclat\b/ },
  { clave: 'caprabo', patron: /\bcaprabo\b/ },
  { clave: 'condis', patron: /\bcondis\b/ },
  { clave: 'ahorramas', patron: /\bahorramas\b/ },
  { clave: 'gadis', patron: /\bgadis\b/ },
  { clave: 'froiz', patron: /\bfroiz\b/ },
  { clave: 'supersol', patron: /\bsupersol\b/ },
];

const FORMAS_LEGALES = /\b(?:s\s?a|s\s?l|s\s?l\s?u|s\s?a\s?u|s\s?coop|sociedad|anonima|limitada|supermercados?|hipermercados?|cia|sucursal|el|la)\b/g;

/** La clave de la tienda que imprime la cabecera del ticket, o '' si no hay (o no se entiende). */
export function claveDeTienda(nombre: string | null | undefined): string {
  if (typeof nombre !== 'string') return '';
  const n = normalizarTexto(nombre);
  if (n === '') return '';
  for (const c of CADENAS) if (c.patron.test(n)) return c.clave;
  const generico = n.replace(FORMAS_LEGALES, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
  return generico.length >= 3 ? generico : '';
}
