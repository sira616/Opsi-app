/**
 * Las fuentes de candidatos del resolutor (`resolver.ts`): lo que de verdad se consulta.
 *
 *   · HISTORIAL  — lo que ESTA persona confirmó antes para este mismo texto de ticket. Local y gratis.
 *   · CATÁLOGO   — los productos que Opsi ya conoce (el catálogo global, copia de Open Food Facts, y los
 *                  privados de la nevera). Local y gratis.
 *   · OFF        — la búsqueda de texto de Open Food Facts. Externa: gasta cupo, puede fallar y su caché
 *                  vive en memoria (ver `CacheTtl`).
 *   · SUPERMERCADO — un hueco con la misma interfaz. NO hay ninguna conectada: ver `ADAPTADORES_SUPERMERCADO`.
 *
 * Aquí no hay red propia ni base de datos: lo que hace falta se inyecta. Todo lo que entra se vuelve a
 * limpiar con los filtros de `off.ts` aunque ya viniera filtrado: es la última puerta antes de la pantalla.
 */

import { normalizarGtin } from './gtin.ts';
import type { CandidatoOff, ResultadoBusquedaOff } from './off-busqueda.ts';
import { textoDeBusqueda } from './off-busqueda.ts';
import { categoriasValidas, imagenValida, limpiarTexto, MAX_MARCA, MAX_NOMBRE } from './off.ts';
import type { Candidato, Consulta, FuenteCandidatos, FuenteSupermercado, ResultadoFuente } from './resolver.ts';
import { claveDeTienda } from './texto-ticket.ts';

const FAMILIAS = new Set(['mass', 'volume', 'count']);

function tamanoDe(familia: unknown, total: unknown): Candidato['tamano'] {
  const n = typeof total === 'string' ? Number(total) : total;
  if (typeof familia !== 'string' || !FAMILIAS.has(familia)) return null;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return { familia: familia as 'mass' | 'volume' | 'count', total: n };
}

function gtinOrNull(valor: unknown): string | null {
  return typeof valor === 'string' ? normalizarGtin(valor) : null;
}

// ── Historial ─────────────────────────────────────────────────────────────

/** Una fila de `ticket_associations` de ESTA persona (la RLS ya lo garantiza). */
export type FilaAsociacion = {
  line_key: string;
  store_key: string;
  product_id: string | null;
  name: string;
  brand: string | null;
  barcode: string | null;
  unit_family: string | null;
  net_quantity: number | string | null;
  confirmations: number;
};

/**
 * Las asociaciones ya leídas de la base de datos para las claves de esta tanda. Solo cuentan las de
 * texto IDÉNTICO: «LECHE ENTERA 1L» no se aplica a «LECHE ENTERA SIN LACTOSA 1L» ni a «LECHE». Si la tienda
 * coincide o no lo decide la puntuación (`resolver.ts`): aquí se devuelven las dos, marcadas con la suya.
 */
export function crearFuenteHistorial(filas: readonly FilaAsociacion[]): FuenteCandidatos {
  const porClave = new Map<string, FilaAsociacion[]>();
  for (const f of filas) {
    const lista = porClave.get(f.line_key);
    if (lista) lista.push(f);
    else porClave.set(f.line_key, [f]);
  }
  return {
    id: 'historial',
    coste: 'local',
    clave: (c) => `${c.clave}|${c.tiendaClave}`,
    async buscar(c: Consulta): Promise<ResultadoFuente> {
      if (c.clave === '') return { tipo: 'ok', candidatos: [] };
      const candidatos: Candidato[] = [];
      for (const f of porClave.get(c.clave) ?? []) {
        const nombre = limpiarTexto(f.name, MAX_NOMBRE);
        if (nombre === null) continue;
        candidatos.push({
          fuentes: ['historial'],
          origenes: ['usuario'],
          productoId: f.product_id,
          ean: gtinOrNull(f.barcode),
          nombre,
          marca: limpiarTexto(f.brand, MAX_MARCA),
          tamano: tamanoDe(f.unit_family, f.net_quantity),
          categorias: [],
          imagen: null,
          tiendas: [],
          asociacion: { tiendaClave: f.store_key, confirmaciones: Math.max(1, Math.floor(Number(f.confirmations) || 1)) },
        });
      }
      return { tipo: 'ok', candidatos };
    },
  };
}

// ── Catálogo local ────────────────────────────────────────────────────────

/** Una fila de `products` que la persona puede ver (el catálogo global y los privados de sus neveras). */
export type FilaCatalogo = {
  id: string;
  household_id: string | null;
  barcode: string | null;
  name: string;
  brand: string | null;
  unit_family: string | null;
  net_quantity: number | string | null;
  image_url: string | null;
  categories_tags: string[] | null;
};

export type BuscarCatalogo = (consulta: { palabras: string[]; ean: string | null }) => Promise<FilaCatalogo[]>;

export function crearFuenteCatalogo(buscar: BuscarCatalogo): FuenteCandidatos {
  return {
    id: 'catalogo',
    coste: 'local',
    clave: (c) => `${c.ean ?? ''}|${c.palabras.join(' ')}`,
    async buscar(c: Consulta): Promise<ResultadoFuente> {
      if (c.palabras.length === 0 && c.ean === null) return { tipo: 'ok', candidatos: [] };
      let filas: FilaCatalogo[];
      try {
        filas = await buscar({ palabras: c.palabras.slice(0, 6), ean: c.ean });
      } catch {
        return { tipo: 'error', motivo: 'catalogo_no_disponible' };
      }
      const candidatos: Candidato[] = [];
      for (const f of filas) {
        const nombre = limpiarTexto(f.name, MAX_NOMBRE);
        if (nombre === null || typeof f.id !== 'string') continue;
        candidatos.push({
          fuentes: ['catalogo'],
          // El catálogo global ES una copia de OFF; un producto privado lo escribió una persona.
          origenes: [f.household_id === null ? 'off' : 'usuario'],
          productoId: f.id,
          ean: gtinOrNull(f.barcode),
          nombre,
          marca: limpiarTexto(f.brand, MAX_MARCA),
          tamano: tamanoDe(f.unit_family, f.net_quantity),
          categorias: categoriasValidas(f.categories_tags),
          imagen: imagenValida(f.image_url),
          tiendas: [],
        });
      }
      return { tipo: 'ok', candidatos };
    },
  };
}

// ── Caché en memoria ──────────────────────────────────────────────────────

/**
 * Una caché pequeña con caducidad, en la memoria de la instancia de la función. A propósito NO es una
 * tabla compartida: para escribir en una hace falta la clave de servicio, y una caché global que escribe
 * código que no controla el servidor sería un sitio donde una persona envenena lo que ven las demás.
 * Lo que se pierde: no se comparte entre instancias ni sobrevive a un reinicio. Lo que se gana: nadie
 * puede meter ahí nada que no haya pasado por los filtros de este mismo proceso.
 */
export class CacheTtl<T> {
  private readonly datos = new Map<string, { valor: T; hasta: number }>();
  private readonly maxEntradas: number;
  private readonly ahora: () => number;

  // Sin «parameter properties»: el modo de Node que ejecuta los tests solo borra tipos, no los transforma.
  constructor(maxEntradas: number, ahora: () => number = Date.now) {
    this.maxEntradas = maxEntradas;
    this.ahora = ahora;
  }

  leer(clave: string): T | undefined {
    const e = this.datos.get(clave);
    if (!e) return undefined;
    if (e.hasta <= this.ahora()) {
      this.datos.delete(clave);
      return undefined;
    }
    return e.valor;
  }

  guardar(clave: string, valor: T, ttlMs: number): void {
    this.datos.delete(clave);
    this.datos.set(clave, { valor, hasta: this.ahora() + ttlMs });
    // Se sacan primero las más antiguas (el orden de inserción de un Map).
    while (this.datos.size > this.maxEntradas) {
      const primera = this.datos.keys().next().value;
      if (primera === undefined) break;
      this.datos.delete(primera);
    }
  }

  get tamano(): number {
    return this.datos.size;
  }
}

/** Lo que se encuentra se recuerda 6 horas; un «no hay nada», 1 hora (por si OFF lo añade). Los errores, nada. */
export const TTL_CON_RESULTADOS_MS = 6 * 60 * 60 * 1000;
export const TTL_SIN_RESULTADOS_MS = 60 * 60 * 1000;

// ── Open Food Facts ───────────────────────────────────────────────────────

export type DependenciasOff = {
  /** Reserva `n` búsquedas del cupo (por persona y global). Devuelve cuántas se pueden hacer. */
  reservar(n: number): Promise<{ concedidas: number; esperaS: number }>;
  buscar(consulta: { palabras: readonly string[] } | { codigo: string }): Promise<ResultadoBusquedaOff>;
  cache: CacheTtl<CandidatoOff[]>;
};

function aCandidato(o: CandidatoOff): Candidato {
  return {
    fuentes: ['off'],
    origenes: ['off'],
    productoId: null,
    ean: o.code,
    nombre: o.name,
    marca: o.brand,
    tamano: o.cantidad ? { familia: o.cantidad.unitFamily, total: o.cantidad.netQuantity } : null,
    categorias: o.categoriesTags,
    imagen: o.imageUrl,
    // Las tiendas de OFF son texto libre de la comunidad: se reducen a la misma clave que la del ticket.
    tiendas: o.stores.map((t) => claveDeTienda(t)).filter((t) => t !== ''),
  };
}

export function crearFuenteOff(dep: DependenciasOff): FuenteCandidatos {
  async function consultar(
    clave: string,
    consulta: { palabras: readonly string[] } | { codigo: string },
  ): Promise<CandidatoOff[] | ResultadoFuente> {
    const guardado = dep.cache.leer(clave);
    if (guardado) return guardado;

    const cupo = await dep.reservar(1);
    if (cupo.concedidas < 1) return { tipo: 'limite', esperaS: cupo.esperaS };

    const r = await dep.buscar(consulta);
    if (r.tipo === 'error') {
      // 429 de OFF: nos piden parar. Se trata igual que quedarse sin cupo propio.
      if (r.motivo === 'http_429') return { tipo: 'limite', esperaS: 60 };
      return { tipo: 'error', motivo: r.motivo };
    }
    dep.cache.guardar(clave, r.candidatos, r.candidatos.length > 0 ? TTL_CON_RESULTADOS_MS : TTL_SIN_RESULTADOS_MS);
    return r.candidatos;
  }

  return {
    id: 'off',
    coste: 'externa',
    clave: (c) => (c.ean !== null ? `code:${c.ean}` : (textoDeBusqueda(c.palabras) ?? '')),
    async buscar(c: Consulta): Promise<ResultadoFuente> {
      const todos: CandidatoOff[] = [];

      // Un EAN que la propia línea imprime es lo más fuerte que hay: se busca primero por él.
      if (c.ean !== null) {
        const r = await consultar(`code:${c.ean}`, { codigo: c.ean });
        if (!Array.isArray(r)) return r;
        todos.push(...r);
      }
      // Sin EAN, o si el EAN no apareció en OFF, por las palabras.
      if (todos.length === 0) {
        const texto = textoDeBusqueda(c.palabras);
        if (texto !== null) {
          const r = await consultar(texto, { palabras: c.palabras });
          if (!Array.isArray(r)) return r;
          todos.push(...r);
        }
      }
      return { tipo: 'ok', candidatos: todos.map(aCandidato) };
    },
  };
}

// ── Catálogos de supermercado ─────────────────────────────────────────────

/**
 * Los catálogos de supermercado conectados: NINGUNO.
 *
 * Se investigó qué hay para las cadenas que más aparecen en los tickets españoles y no se encontró una
 * fuente que cumpla lo que se pidió —pública, documentada y con condiciones de uso que permitan consultarla
 * desde una app de terceros—: lo que existe son las APIs internas de sus webs y apps, que no están
 * documentadas, pueden cambiar o cortarse sin aviso y no ofrecen permiso de uso. Depender de ellas, o
 * rascar sus webs, es justo lo que se pidió no hacer. Esta lista está vacía a propósito, y una fuente nueva
 * entra aquí cuando alguien confirme que su uso está permitido (ver docs/internal/BITACORA.md, D-58).
 *
 * Una fuente que se añada implementa `FuenteSupermercado` (la misma interfaz que las demás, más las claves
 * de tienda que cubre) y devuelve candidatos con `origenes: ['supermercado']`: así, cuando coincide con
 * OFF en el mismo producto, el resolutor la cuenta como una corroboración independiente.
 */
export const ADAPTADORES_SUPERMERCADO: readonly FuenteSupermercado[] = [];

/** Los adaptadores que tiene sentido preguntar para la tienda del ticket. Sin tienda conocida, ninguno. */
export function adaptadoresPara(
  tiendaClave: string,
  adaptadores: readonly FuenteSupermercado[] = ADAPTADORES_SUPERMERCADO,
): FuenteSupermercado[] {
  if (tiendaClave === '') return [];
  return adaptadores.filter((a) => a.tiendas.includes(tiendaClave));
}
