/**
 * La marca de cada línea de un ticket, en la pantalla de revisión: lo que propone `opsi-marcas`, lo que la
 * persona decide y lo que de eso se recuerda. Pura, para poder probarla.
 *
 * ── Quién manda ──────────────────────────────────────────────────────────
 *
 * El servidor PROPONE (`ResolucionLinea`): unos candidatos con las razones de cada uno, y a veces uno ya
 * asignado cuando cumple unos umbrales conservadores. La persona DECIDE (`Eleccion`): confirma la sugerida,
 * elige otra, escribe la marca o dice que no se sabe. Y lo que se aprende —lo que se recordará para la
 * próxima vez— sale SOLO de lo que la persona hizo a propósito (`confirmada`): una sugerencia que se queda
 * como está al pulsar «Guardar» se usa para esa compra pero no se convierte en una verdad aprendida.
 *
 * ── Lo que nunca pasa ────────────────────────────────────────────────────
 *
 *   · Una marca que nadie dio. La única marca que sale de aquí es la de un candidato (que viene de una fuente)
 *     o la que escribió la persona. Sin elección, la marca es «sin identificar».
 *   · Pisar una decisión de la persona. Las respuestas del servidor llegan por tandas y pueden llegar tarde:
 *     si ya eligió, la respuesta se guarda pero no cambia su elección.
 *   · Obligar a elegir. «Sin identificar» es una respuesta válida y guardar no la exige.
 *
 * Lo que llega del servidor es entrada NO confiable aunque lo escriba nuestra función: sale de Open Food Facts
 * (un wiki que edita cualquiera). `leerResolucion` se queda con los campos y tipos que espera, limpia los
 * textos y acota las listas.
 */

import { borradorDeRuta } from '../chat/mensajes.ts';
import type { LineaRevision } from './lineas.ts';
import { nombreEsNoComida } from '../../shared/lib/no-comida.ts';

// ── Tipos ─────────────────────────────────────────────────────────────────

export type FamiliaTamano = 'mass' | 'volume' | 'count';

export type CandidatoMarca = {
  /** La fuente que más cuenta: 'historial', 'supermercado:…', 'off' o 'catalogo'. */
  fuente: string;
  fuentes: string[];
  /** El producto en NUESTRO catálogo, si ya está. */
  productoId: string | null;
  /** Un GTIN válido que dio la fuente. */
  ean: string | null;
  nombre: string;
  marca: string | null;
  tamano: { familia: FamiliaTamano; total: number } | null;
  puntos: number;
  senales: { tipo: string; puntos: number }[];
  incompatible: boolean;
  directa: boolean;
};

export type EstadoLineaMarca = 'no_producto' | 'resuelta' | 'ambigua' | 'sin_candidatos';
export type EstadoMarca = 'confirmada' | 'inferida' | 'desconocida';

export type ResolucionLinea = {
  /** La clave de la fila (`LineaRevision.clave`). */
  id: string;
  estado: EstadoLineaMarca;
  motivoNoProducto: string | null;
  /** La clave del historial y la de la tienda: con ellas se guarda una corrección. */
  clave: string;
  tiendaClave: string;
  /** El primer candidato viene asignado (cumple los umbrales). */
  elegido: boolean;
  puntuacion: number;
  confianza: 'alta' | 'media' | 'baja' | 'ninguna';
  estadoMarca: EstadoMarca;
  necesitaRevision: boolean;
  /** Falta consultar una fuente externa por el cupo: volver a intentarlo más tarde sirve. */
  reintentable: boolean;
  fuentes: { id: string; estado: string; motivo?: string; esperaS?: number }[];
  candidatos: CandidatoMarca[];
};

export type RespuestaMarcas = { tiendaClave: string; lineas: ResolucionLinea[] };

/** Lo que la persona (o la propuesta automática) dejó elegido en una fila. */
export type Eleccion =
  | { tipo: 'candidato'; candidato: CandidatoMarca; origen: 'auto' | 'persona' }
  | { tipo: 'ninguna' }
  | { tipo: 'manual'; marca: string };

/** En qué punto va la búsqueda de marca de una fila. */
export type EstadoBusqueda = 'no_aplica' | 'pendiente' | 'buscando' | 'hecha' | 'fallida';

/** Lo que cambia en una fila por la marca: se mezcla con `LineaRevision`. */
export type MarcaDeLinea = {
  /** La línea tal como está impresa (sin cantidad ni importe). Evidencia de origen: no se edita. */
  texto?: string;
  /** El importe de la línea en euros, tal como se leyó. */
  precio?: number;
  /** El nombre con el que se abrió la fila: sirve para saber si la persona lo cambió. */
  nombreOriginal?: string;
  busqueda?: EstadoBusqueda;
  resolucion?: ResolucionLinea;
  eleccion?: Eleccion;
  /** La persona hizo algo a propósito (confirmar, elegir, escribir): solo así se recuerda. */
  confirmada?: boolean;
  /** Por qué se dejó sin marcar: parece un descuento, un total… */
  avisoNoProducto?: string;
};

const MAX_NOMBRE = 80;
const MAX_MARCA = 80;
const MAX_CANDIDATOS = 5;
const MAX_LINEAS = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ESTADOS_LINEA: readonly string[] = ['no_producto', 'resuelta', 'ambigua', 'sin_candidatos'];
const ESTADOS_MARCA: readonly string[] = ['confirmada', 'inferida', 'desconocida'];
const CONFIANZAS: readonly string[] = ['alta', 'media', 'baja', 'ninguna'];
const FAMILIAS: readonly string[] = ['mass', 'volume', 'count'];

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const limpio = [...borradorDeRuta(v).trim()].slice(0, max).join('').trim();
  return limpio === '' ? null : limpio;
}

function numero(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : null;
}

// ── Leer lo que llega ─────────────────────────────────────────────────────

function leerCandidato(v: unknown): CandidatoMarca | null {
  if (!esObjeto(v)) return null;
  const nombre = texto(v.nombre, MAX_NOMBRE);
  const puntos = numero(v.puntos, 0, 100);
  if (nombre === null || puntos === null) return null;

  const t = esObjeto(v.tamano) ? v.tamano : null;
  const total = t ? numero(t.total, 0.001, 1_000_000) : null;
  const tamano =
    t && total !== null && FAMILIAS.includes(t.familia as string)
      ? { familia: t.familia as FamiliaTamano, total }
      : null;

  const senales: CandidatoMarca['senales'] = [];
  if (Array.isArray(v.senales)) {
    for (const s of v.senales.slice(0, 12)) {
      if (!esObjeto(s)) continue;
      const tipo = texto(s.tipo, 30);
      const p = numero(s.puntos, -100, 100);
      if (tipo !== null && p !== null) senales.push({ tipo, puntos: p });
    }
  }
  const fuentes = Array.isArray(v.fuentes)
    ? v.fuentes.map((f) => texto(f, 40)).filter((f): f is string => f !== null).slice(0, 6)
    : [];

  return {
    fuente: texto(v.fuente, 40) ?? 'desconocida',
    fuentes,
    productoId: typeof v.productoId === 'string' && UUID.test(v.productoId) ? v.productoId : null,
    ean: typeof v.ean === 'string' && /^[0-9]{8,14}$/.test(v.ean) ? v.ean : null,
    nombre,
    marca: texto(v.marca, MAX_MARCA),
    tamano,
    puntos,
    senales,
    incompatible: v.incompatible === true,
    directa: v.directa === true,
  };
}

function leerLinea(v: unknown): ResolucionLinea | null {
  if (!esObjeto(v)) return null;
  const id = typeof v.id === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(v.id) ? v.id : null;
  if (id === null || !ESTADOS_LINEA.includes(v.estado as string)) return null;
  const candidatos = Array.isArray(v.candidatos)
    ? v.candidatos.slice(0, MAX_CANDIDATOS).map(leerCandidato).filter((c): c is CandidatoMarca => c !== null)
    : [];
  const estado = v.estado as EstadoLineaMarca;
  return {
    id,
    estado,
    motivoNoProducto: texto(v.motivoNoProducto, 30),
    clave: typeof v.clave === 'string' && /^[a-z0-9.% ]{0,160}$/.test(v.clave) ? v.clave : '',
    tiendaClave: typeof v.tiendaClave === 'string' && /^[a-z0-9.% ]{0,40}$/.test(v.tiendaClave) ? v.tiendaClave : '',
    // Solo se asigna solo si de verdad hay un candidato al que asignarlo.
    elegido: v.elegido === true && candidatos.length > 0 && estado === 'resuelta',
    puntuacion: numero(v.puntuacion, 0, 100) ?? 0,
    confianza: CONFIANZAS.includes(v.confianza as string) ? (v.confianza as ResolucionLinea['confianza']) : 'ninguna',
    estadoMarca: ESTADOS_MARCA.includes(v.estadoMarca as string) ? (v.estadoMarca as EstadoMarca) : 'desconocida',
    necesitaRevision: v.necesitaRevision === true,
    reintentable: v.reintentable === true,
    fuentes: Array.isArray(v.fuentes)
      ? v.fuentes
          .slice(0, 6)
          .filter(esObjeto)
          .map((f) => {
            const motivo = texto(f.motivo, 40);
            const espera = numero(f.esperaS, 0, 86_400);
            return {
              id: texto(f.id, 40) ?? '?',
              estado: texto(f.estado, 20) ?? '?',
              ...(motivo !== null ? { motivo } : {}),
              ...(espera !== null ? { esperaS: espera } : {}),
            };
          })
      : [],
    candidatos,
  };
}

/** La respuesta de `opsi-marcas`, ya limpia. Cualquier cosa rara da menos líneas, no un fallo. */
export function leerResolucion(valor: unknown): RespuestaMarcas {
  if (!esObjeto(valor) || !Array.isArray(valor.lineas)) return { tiendaClave: '', lineas: [] };
  const t = esObjeto(valor.tienda) ? valor.tienda : null;
  return {
    tiendaClave: t && typeof t.clave === 'string' && /^[a-z0-9.% ]{0,40}$/.test(t.clave) ? t.clave : '',
    lineas: valor.lineas.slice(0, MAX_LINEAS).map(leerLinea).filter((l): l is ResolucionLinea => l !== null),
  };
}

// ── La búsqueda, por tandas ───────────────────────────────────────────────

/** Cuántas líneas se piden cada vez: el servidor decide además cuántas búsquedas externas caben. */
export const TAMANO_TANDA = 8;

export type LineaParaResolver = { id: string; texto: string; nombre: string };

/** Las siguientes líneas por resolver: las pendientes con nombre y que parecen comida. */
export function siguienteTanda(lineas: readonly LineaRevision[], max: number = TAMANO_TANDA): LineaParaResolver[] {
  const salida: LineaParaResolver[] = [];
  for (const l of lineas) {
    if (salida.length >= max) break;
    if (l.busqueda !== 'pendiente' || l.guardada === true) continue;
    const nombre = l.nombre.trim();
    if (nombre === '' || nombreEsNoComida(nombre)) continue;
    salida.push({ id: l.clave, texto: (l.texto ?? nombre).trim() || nombre, nombre });
  }
  return salida;
}

function conBusqueda(lineas: readonly LineaRevision[], ids: ReadonlySet<string>, busqueda: EstadoBusqueda): LineaRevision[] {
  return lineas.map((l) => (ids.has(l.clave) ? { ...l, busqueda } : l));
}

export function marcarBuscando(lineas: readonly LineaRevision[], ids: readonly string[]): LineaRevision[] {
  return conBusqueda(lineas, new Set(ids), 'buscando');
}

/** Una tanda que no se pudo pedir (sin conexión, error): las filas siguen, sin marca, y se puede reintentar a mano. */
export function marcarFallidas(lineas: readonly LineaRevision[], ids: readonly string[]): LineaRevision[] {
  return conBusqueda(lineas, new Set(ids), 'fallida');
}

/** Cuánto hay que esperar para que quepan más búsquedas, según lo que dijeron las respuestas; null si nadie lo dijo. */
export function esperaDe(resoluciones: readonly ResolucionLinea[]): number | null {
  let max: number | null = null;
  for (const r of resoluciones) {
    for (const f of r.fuentes) if (f.esperaS !== undefined) max = Math.max(max ?? 0, f.esperaS);
  }
  return max;
}

/** Una fila que se quiere volver a buscar (con el nombre que tenga ahora). */
export function volverABuscar(lineas: readonly LineaRevision[], clave: string): LineaRevision[] {
  return lineas.map((l) =>
    l.clave === clave
      ? {
          ...l,
          busqueda: 'pendiente',
          // Lo que la persona no decidió se descarta; lo que decidió, no.
          eleccion: l.eleccion?.tipo === 'candidato' && l.eleccion.origen === 'auto' ? undefined : l.eleccion,
          // Buscar con un nombre cambiado: ya no es la línea impresa.
          texto: l.nombre.trim() !== l.nombreOriginal ? undefined : l.texto,
        }
      : l,
  );
}

function recortar(nombre: string): string {
  return [...nombre].slice(0, MAX_NOMBRE).join('');
}

/**
 * Mezcla lo que respondió el servidor en las filas. No pisa nunca lo que la persona ya decidió, ni su nombre
 * editado. Una fila marcada `reintentable` queda pendiente para volver a pedirla cuando haya cupo.
 */
export function aplicarResoluciones(lineas: readonly LineaRevision[], resoluciones: readonly ResolucionLinea[]): LineaRevision[] {
  const por = new Map(resoluciones.map((r) => [r.id, r]));
  return lineas.map((l) => {
    const r = por.get(l.clave);
    if (!r) return l;
    const base: LineaRevision = { ...l, resolucion: r, busqueda: r.reintentable ? 'pendiente' : 'hecha' };

    if (r.estado === 'no_producto') {
      // Parece un descuento, un total, el pago… Se deja sin marcar, y la persona puede marcarla si no lo es.
      return l.eleccion === undefined && l.confirmada !== true
        ? { ...base, incluir: false, avisoNoProducto: r.motivoNoProducto ?? 'otro' }
        : base;
    }

    const c = r.candidatos[0];
    if (r.elegido && c !== undefined && l.eleccion === undefined) {
      return {
        ...base,
        eleccion: { tipo: 'candidato', candidato: c, origen: 'auto' },
        // El nombre normalizado del catálogo, salvo que la persona ya hubiera cambiado el suyo.
        nombre: l.nombre === l.nombreOriginal ? recortar(c.nombre) : l.nombre,
      };
    }
    return base;
  });
}

// ── Lo que hace la persona ────────────────────────────────────────────────

/** Elige uno de los candidatos. Es una decisión a propósito: se recordará. */
export function elegirCandidato(lineas: readonly LineaRevision[], clave: string, candidato: CandidatoMarca): LineaRevision[] {
  return lineas.map((l) =>
    l.clave === clave
      ? { ...l, eleccion: { tipo: 'candidato', candidato, origen: 'persona' }, confirmada: true, nombre: recortar(candidato.nombre) }
      : l,
  );
}

/** Confirma la sugerida tal como está. */
export function confirmarSugerida(lineas: readonly LineaRevision[], clave: string): LineaRevision[] {
  return lineas.map((l) =>
    l.clave === clave && l.eleccion?.tipo === 'candidato'
      ? { ...l, eleccion: { ...l.eleccion, origen: 'persona' }, confirmada: true }
      : l,
  );
}

/** «Sin identificar»: una respuesta válida. Se usa para esta compra y no se recuerda. */
export function dejarSinIdentificar(lineas: readonly LineaRevision[], clave: string): LineaRevision[] {
  return lineas.map((l) => (l.clave === clave ? { ...l, eleccion: { tipo: 'ninguna' }, confirmada: false } : l));
}

/** La marca la escribe la persona. En blanco es «sin identificar». Es a propósito: se recordará. */
export function escribirMarca(lineas: readonly LineaRevision[], clave: string, marcaEscrita: string): LineaRevision[] {
  const marca = texto(marcaEscrita, MAX_MARCA);
  if (marca === null) return dejarSinIdentificar(lineas, clave);
  return lineas.map((l) => (l.clave === clave ? { ...l, eleccion: { tipo: 'manual', marca }, confirmada: true } : l));
}

// ── Lo que se enseña ──────────────────────────────────────────────────────

/** La marca que se enseña en la fila, o null = «Marca sin identificar». */
export function marcaMostrada(l: Pick<LineaRevision, 'eleccion'>): string | null {
  const e = l.eleccion;
  if (!e) return null;
  if (e.tipo === 'manual') return e.marca;
  if (e.tipo === 'candidato') return e.candidato.marca;
  return null;
}

export type NivelIndicador = 'fiable' | 'sugerida' | 'dudosa' | 'buscando' | 'ninguna';

/** El indicador discreto de la fila. */
export function indicador(l: Pick<LineaRevision, 'eleccion' | 'confirmada' | 'busqueda' | 'resolucion'>): { nivel: NivelIndicador; texto: string } {
  const e = l.eleccion;
  if (e?.tipo === 'manual') return { nivel: 'fiable', texto: 'Marca escrita por ti' };
  if (e?.tipo === 'ninguna') return { nivel: 'ninguna', texto: 'Sin identificar' };
  if (e?.tipo === 'candidato') {
    if (l.confirmada === true) return { nivel: 'fiable', texto: 'Confirmada por ti' };
    if (l.resolucion?.estadoMarca === 'confirmada' && e.candidato.marca !== null) return { nivel: 'fiable', texto: 'Coincidencia fiable' };
    return { nivel: 'sugerida', texto: 'Sugerida · confírmala' };
  }
  if (l.busqueda === 'buscando') return { nivel: 'buscando', texto: 'Buscando la marca…' };
  if (l.busqueda === 'pendiente') return { nivel: 'buscando', texto: 'Esperando para buscar…' };
  if (l.busqueda === 'fallida') return { nivel: 'ninguna', texto: 'No he podido buscar la marca' };
  if (l.resolucion?.estado === 'ambigua') return { nivel: 'dudosa', texto: 'Dudosa · elige una opción' };
  return { nivel: 'ninguna', texto: 'Marca sin identificar' };
}

/** Cuántas opciones hay para elegir en la fila. */
export function opcionesDisponibles(l: Pick<LineaRevision, 'resolucion'>): number {
  return l.resolucion?.candidatos.length ?? 0;
}

const RAZONES: Record<string, string> = {
  ean: 'el código de barras coincide',
  historial: 'lo confirmaste antes',
  historial_otra_tienda: 'lo confirmaste en otra tienda',
  marca_impresa: 'la marca está en el ticket',
  tamano: 'mismo tamaño',
  tamano_distinto: 'otro tamaño',
  categoria: 'misma categoría',
  categoria_distinta: 'otra categoría',
  tienda: 'se vende en esta tienda',
  corroborado: 'dos fuentes coinciden',
};

/** Las razones de un candidato, en palabras. Solo las que dicen algo: el parecido del nombre no se repite. */
export function razonesDe(c: Pick<CandidatoMarca, 'senales'>): string[] {
  return c.senales.map((s) => RAZONES[s.tipo]).filter((r): r is string => r !== undefined);
}

/** «500 g», «1 l», «6 uds» a partir de la unidad base. */
export function textoTamano(t: CandidatoMarca['tamano']): string | null {
  if (!t) return null;
  const redondear = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');
  if (t.familia === 'count') return `${redondear(t.total)} uds`;
  if (t.familia === 'mass') return t.total >= 1000 ? `${redondear(t.total / 1000)} kg` : `${redondear(t.total)} g`;
  return t.total >= 1000 ? `${redondear(t.total / 1000)} l` : `${redondear(t.total)} ml`;
}

// ── Guardar ───────────────────────────────────────────────────────────────

/** Con qué producto se enlaza lo que se guarda, según lo que quedó elegido. */
export type Vinculo =
  | { tipo: 'producto'; productoId: string; ean: string | null }
  | { tipo: 'codigo'; ean: string }
  | { tipo: 'marca'; marca: string }
  | { tipo: 'ninguno' };

export function vinculoDe(l: Pick<LineaRevision, 'eleccion'>): Vinculo {
  const e = l.eleccion;
  if (e?.tipo === 'manual') return { tipo: 'marca', marca: e.marca };
  if (e?.tipo === 'candidato') {
    if (e.candidato.productoId !== null) return { tipo: 'producto', productoId: e.candidato.productoId, ean: e.candidato.ean };
    if (e.candidato.ean !== null) return { tipo: 'codigo', ean: e.candidato.ean };
  }
  return { tipo: 'ninguno' };
}

export type OrigenAsociacion = 'history' | 'catalog' | 'off' | 'supermarket' | 'manual';

export function origenDe(fuente: string): OrigenAsociacion {
  if (fuente === 'historial') return 'history';
  if (fuente === 'catalogo') return 'catalog';
  if (fuente.startsWith('supermercado')) return 'supermarket';
  return 'off';
}

/** Una asociación lista para `confirm_ticket_association`: lo que la persona confirmó, con su traza. */
export type AsociacionParaGuardar = {
  clave: string;
  lineKey: string;
  storeKey: string;
  name: string;
  brand: string | null;
  productId: string | null;
  barcode: string | null;
  unitFamily: FamiliaTamano | null;
  netQuantity: number | null;
  source: OrigenAsociacion;
  matchScore: number | null;
};

/**
 * Lo que se recordará de esta tanda: SOLO las filas en las que la persona confirmó, eligió o escribió algo,
 * y que ya se guardaron (si no entra al inventario, no se aprende). Sin la clave del servidor no se puede
 * recordar la línea, y se omite en lugar de inventarla.
 *
 * `productoIds` trae el producto con el que SE ENLAZÓ de verdad cada fila (puede no ser el del candidato si
 * hubo que buscarlo por su código); sin él, `productId` va vacío.
 */
export function paraAprender(
  filas: readonly LineaRevision[],
  tiendaClave: string,
  productoIds: ReadonlyMap<string, string | null> = new Map(),
): AsociacionParaGuardar[] {
  const salida: AsociacionParaGuardar[] = [];
  for (const l of filas) {
    if (l.confirmada !== true || l.guardada !== true) continue;
    const clave = l.resolucion?.clave ?? '';
    if (clave === '') continue;
    const e = l.eleccion;
    const nombre = recortar(l.nombre.trim());
    if (nombre === '') continue;

    if (e?.tipo === 'manual') {
      salida.push({
        clave: l.clave, lineKey: clave, storeKey: tiendaClave, name: nombre, brand: e.marca,
        productId: null, barcode: null, unitFamily: null, netQuantity: null, source: 'manual', matchScore: null,
      });
    } else if (e?.tipo === 'candidato') {
      const c = e.candidato;
      salida.push({
        clave: l.clave, lineKey: clave, storeKey: tiendaClave, name: nombre, brand: c.marca,
        productId: productoIds.get(l.clave) ?? null,
        barcode: c.ean,
        unitFamily: c.tamano?.familia ?? null,
        netQuantity: c.tamano?.total ?? null,
        source: origenDe(c.fuente),
        matchScore: Math.round(c.puntos),
      });
    }
  }
  return salida;
}
