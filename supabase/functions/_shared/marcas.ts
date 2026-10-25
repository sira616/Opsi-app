/**
 * El cerebro de `opsi-marcas`: de las líneas de un ticket ya leído a su producto y su marca.
 * Igual que `ticket.ts` y `chat.ts`: sin Deno ni red propia, para poder probarlo con dobles.
 *
 * Es un SEGUNDO paso aparte de leer el ticket, y no va dentro de `opsi-ticket` a propósito:
 *   · La revisión del ticket sale en cuanto el lector termina (~4 s) y las marcas llegan después, por
 *     tandas, sin bloquear nada. Si Open Food Facts va lento o está caído, la persona ya está revisando.
 *   · El cupo de Open Food Facts es de 10 búsquedas por minuto entre TODAS las personas; un ticket de 24
 *     líneas no cabe de golpe. La app pide por tandas y vuelve a pedir lo que quedó sin consultar.
 *   · No usa el modelo de IA: no gasta la cuota de IA ni envía nada de la persona a un servicio de IA.
 *
 * ── Orden (cada paso solo corre si pasó el anterior) ──────────────────────
 *   1. método y tamaño del cuerpo      → barato y sin tocar nada
 *   2. sesión de una persona           → antes de gastar nada
 *   3. el cuerpo es lo que se espera   → líneas con tope, ids sin repetir, una nevera
 *   4. el plan                         → Premium, como leer el ticket
 *   5. las asociaciones de la persona  → una consulta para toda la tanda
 *   6. el resolutor                    → historial, catálogo, Open Food Facts (con su cupo)
 *
 * ── Lo que NO hace ───────────────────────────────────────────────────────
 *
 * No escribe nada: ni en el catálogo, ni en las asociaciones, ni en el inventario. Lo único que cambia
 * en la base de datos es el contador del cupo de búsquedas. Lo que la persona confirma lo guarda la
 * app por las funciones de siempre, con su sesión, DESPUÉS de revisarlo. Y no envía a Open Food Facts
 * más que las palabras del producto (letras y cifras): ni la tienda, ni el precio, ni quién pregunta.
 */

import { CacheTtl, adaptadoresPara, crearFuenteCatalogo, crearFuenteHistorial, crearFuenteOff, type BuscarCatalogo, type FilaAsociacion } from './fuentes-marcas.ts';
import type { Sesion } from './chat.ts';
import type { CandidatoOff, ConsultaOff, ResultadoBusquedaOff } from './off-busqueda.ts';
import {
  resolverLineas,
  type CandidatoPuntuado,
  type FuenteCandidatos,
  type FuenteSupermercado,
  type Resolucion,
} from './resolver.ts';
import { quitarCaracteresOcultos, sanearDato } from './saneo.ts';
import { claveDeLinea, claveDeTienda } from './texto-ticket.ts';

/**
 * La app pide de 8 en 8; 16 deja holgura. Un tope bajo acota lo que una petición cuesta (cada línea es una
 * búsqueda en el catálogo) sin depender de que quien llama sea la app.
 */
export const MAX_LINEAS_MARCAS = 16;
export const MAX_CUERPO_MARCAS = 16 * 1024;
const MAX_TEXTO = 200;
const MAX_NOMBRE = 120;
const MAX_TIENDA = 80;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DependenciasMarcas = {
  verificarUsuario(token: string): Promise<Sesion | null>;
  /** El plan de quien llama ('premium' o no). */
  plan(token: string): Promise<string>;
  /** Las asociaciones confirmadas de esta persona para estas claves. */
  asociaciones(token: string, claves: string[], neveraId: string): Promise<FilaAsociacion[]>;
  /** Busca en el catálogo que la persona ve. */
  catalogo(token: string, neveraId: string): BuscarCatalogo;
  /** Reserva búsquedas del cupo (por persona y global). */
  reservarBusquedas(token: string, n: number): Promise<{ concedidas: number; esperaS: number }>;
  /** Null si Opsi no tiene una identidad válida para presentarse ante Open Food Facts. */
  buscarOff: ((consulta: ConsultaOff) => Promise<ResultadoBusquedaOff>) | null;
  cache: CacheTtl<CandidatoOff[]>;
  /** Catálogos de supermercado conectados. Hoy ninguno (`ADAPTADORES_SUPERMERCADO`). */
  adaptadores?: readonly FuenteSupermercado[];
  log(evento: Record<string, unknown>): void;
};

// ── Respuestas ────────────────────────────────────────────────────────────

const CABECERAS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };

function json(estado: number, cuerpo: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: { ...CABECERAS, ...extra } });
}

function tokenDe(req: Request): string | null {
  const m = /^Bearer ([A-Za-z0-9._~+/=-]{10,4096})$/.exec(req.headers.get('authorization') ?? '');
  return m ? m[1] : null;
}

// ── Lo que se pide ────────────────────────────────────────────────────────

export type PeticionMarcas = {
  lineas: { id: string; texto: string; nombre: string }[];
  tienda: string | null;
  nevera: string;
};

/** La petición limpia, o el motivo (para el log) si no es lo que se espera. */
export function validarPeticion(cuerpo: unknown): PeticionMarcas | { motivo: string } {
  if (typeof cuerpo !== 'object' || cuerpo === null) return { motivo: 'el cuerpo no es un objeto' };
  const c = cuerpo as Record<string, unknown>;

  if (typeof c.nevera !== 'string' || !UUID.test(c.nevera)) return { motivo: 'falta la nevera' };
  if (!Array.isArray(c.lineas) || c.lineas.length === 0) return { motivo: 'faltan las líneas' };
  if (c.lineas.length > MAX_LINEAS_MARCAS) return { motivo: 'demasiadas líneas' };

  const lineas: PeticionMarcas['lineas'] = [];
  const ids = new Set<string>();
  for (const crudo of c.lineas) {
    if (typeof crudo !== 'object' || crudo === null) return { motivo: 'una línea no es un objeto' };
    const l = crudo as Record<string, unknown>;
    if (typeof l.id !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(l.id)) return { motivo: 'id de línea no válido' };
    if (ids.has(l.id)) return { motivo: 'id de línea repetido' };
    ids.add(l.id);
    const nombre = sanearDato(typeof l.nombre === 'string' ? quitarCaracteresOcultos(l.nombre) : '', MAX_NOMBRE);
    if (nombre === '') return { motivo: 'una línea sin nombre' };
    const texto = sanearDato(typeof l.texto === 'string' ? quitarCaracteresOcultos(l.texto) : '', MAX_TEXTO);
    lineas.push({ id: l.id, nombre, texto: texto === '' ? nombre : texto });
  }

  let tienda: string | null = null;
  if (typeof c.tienda === 'string') {
    const t = sanearDato(quitarCaracteresOcultos(c.tienda), MAX_TIENDA);
    tienda = t === '' ? null : t;
  }
  return { lineas, tienda, nevera: c.nevera };
}

// ── Lo que se contesta ────────────────────────────────────────────────────

/**
 * Qué fuente consta como «la» fuente de un candidato: la que más cuenta como prueba. El historial solo si es
 * una prueba (lo confirmado en esta tienda): una pista de otra tienda no es la fuente de nada.
 */
function fuentePrincipal(fuentes: readonly string[], historialEsPrueba: boolean): string {
  if (historialEsPrueba && fuentes.includes('historial')) return 'historial';
  const sinHistorial = fuentes.filter((f) => f !== 'historial');
  if (!historialEsPrueba && sinHistorial.length > 0) fuentes = sinHistorial;
  const adaptador = fuentes.find((f) => f.startsWith('supermercado:'));
  if (adaptador) return adaptador;
  if (fuentes.includes('off')) return 'off';
  return fuentes[0] ?? 'desconocida';
}

function publico(c: CandidatoPuntuado) {
  const salida: Record<string, unknown> = {
    fuente: fuentePrincipal(c.fuentes, c.senales.some((s) => s.tipo === 'historial')),
    fuentes: c.fuentes,
    productoId: c.productoId,
    ean: c.ean,
    nombre: c.nombre,
    marca: c.marca,
    tamano: c.tamano,
    imagen: c.imagen,
    puntos: c.puntos,
    senales: c.senales,
    incompatible: c.incompatible,
    directa: c.directa,
  };
  if (c.asociacion) salida.asociacion = c.asociacion;
  return salida;
}

export function publicarResolucion(r: Resolucion) {
  return {
    id: r.id,
    estado: r.estado,
    motivoNoProducto: r.motivoNoProducto,
    clave: r.clave,
    tiendaClave: r.tiendaClave,
    elegido: r.elegido,
    puntuacion: r.puntuacion,
    confianza: r.confianza,
    estadoMarca: r.estadoMarca,
    necesitaRevision: r.necesitaRevision,
    reintentable: r.reintentable,
    fuentes: r.fuentes,
    candidatos: r.candidatos.map(publico),
  };
}

// ── Las fuentes de esta petición ──────────────────────────────────────────

/** Una fuente que no se pudo preparar: contesta error en cada pregunta y la importación sigue sin ella. */
function fuenteCaida(id: string, coste: 'local' | 'externa', motivo: string): FuenteCandidatos {
  return { id, coste, clave: () => '', async buscar() { return { tipo: 'error', motivo }; } };
}

async function armarFuentes(
  dep: DependenciasMarcas,
  token: string,
  peticion: PeticionMarcas,
  tiendaClave: string,
): Promise<FuenteCandidatos[]> {
  const claves = [...new Set(peticion.lineas.map((l) => claveDeLinea(l.texto)).filter((k) => k !== ''))];

  let historial: FuenteCandidatos;
  try {
    historial = crearFuenteHistorial(claves.length > 0 ? await dep.asociaciones(token, claves, peticion.nevera) : []);
  } catch {
    historial = fuenteCaida('historial', 'local', 'historial_no_disponible');
  }

  const off: FuenteCandidatos =
    dep.buscarOff === null
      ? // Sin una identidad válida ante OFF no se le llama (ver `userAgentValido`), y se dice.
        fuenteCaida('off', 'externa', 'sin_configurar')
      : crearFuenteOff({
          reservar: (n) => dep.reservarBusquedas(token, n),
          buscar: dep.buscarOff,
          cache: dep.cache,
        });

  return [
    historial,
    crearFuenteCatalogo(dep.catalogo(token, peticion.nevera)),
    off,
    ...adaptadoresPara(tiendaClave, dep.adaptadores),
  ];
}

// ── El manejador ──────────────────────────────────────────────────────────

export async function manejarMarcas(req: Request, dep: DependenciasMarcas): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'método_no_permitido' });

  const declarado = Number(req.headers.get('content-length') ?? 0);
  if (declarado > MAX_CUERPO_MARCAS) return json(413, { error: 'cuerpo_demasiado_grande' });

  const token = tokenDe(req);
  if (!token) return json(401, { error: 'sin_sesion' });
  let sesion: Sesion | null;
  try {
    sesion = await dep.verificarUsuario(token);
  } catch {
    return json(503, { error: 'sesion_no_comprobable' });
  }
  if (!sesion) return json(401, { error: 'sin_sesion' });

  let cuerpo: unknown;
  try {
    const texto = await req.text();
    if (texto.length > MAX_CUERPO_MARCAS) return json(413, { error: 'cuerpo_demasiado_grande' });
    cuerpo = JSON.parse(texto);
  } catch {
    return json(400, { error: 'cuerpo_no_valido' });
  }
  const peticion = validarPeticion(cuerpo);
  if ('motivo' in peticion) {
    dep.log({ evento: 'opsi-marcas', rechazo: peticion.motivo });
    return json(400, { error: 'peticion_no_valida' });
  }

  let plan: string;
  try {
    plan = await dep.plan(token);
  } catch {
    dep.log({ evento: 'opsi-marcas', ok: false, fallo: 'plan_no_comprobable' });
    return json(503, { error: 'plan_no_comprobable' });
  }
  if (plan !== 'premium') {
    dep.log({ evento: 'opsi-marcas', ok: false, fallo: 'solo_premium' });
    return json(403, { error: 'solo_premium' });
  }

  const tiendaClave = claveDeTienda(peticion.tienda);
  const fuentes = await armarFuentes(dep, token, peticion, tiendaClave);

  const resoluciones = await resolverLineas(
    peticion.lineas.map((l) => ({ id: l.id, texto: l.texto, nombre: l.nombre, tiendaClave })),
    fuentes,
  );

  // Solo se cuenta cuántas: ni lo que compra la persona ni lo que se encontró van al registro.
  const cuentas: Record<string, number> = { resuelta: 0, ambigua: 0, sin_candidatos: 0, no_producto: 0 };
  const porFuente: Record<string, Record<string, number>> = {};
  for (const r of resoluciones) {
    cuentas[r.estado] += 1;
    for (const f of r.fuentes) {
      porFuente[f.id] ??= {};
      porFuente[f.id][f.estado] = (porFuente[f.id][f.estado] ?? 0) + 1;
    }
  }
  dep.log({ evento: 'opsi-marcas', ok: true, lineas: resoluciones.length, ...cuentas, fuentes: porFuente });

  return json(200, {
    tienda: { clave: tiendaClave },
    lineas: resoluciones.map(publicarResolucion),
  });
}
