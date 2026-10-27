/**
 * El resolutor: de una línea de ticket al producto real y su marca, SIN inventar ninguna.
 *
 * Se ejecuta DESPUÉS de que el lector haya sacado las líneas (`ticket.ts`) y nunca las toca: recibe el
 * texto tal como salió, lo compara con candidatos que traen unas FUENTES intercambiables y devuelve una
 * decisión con sus razones. Sin Deno ni red propia: las fuentes se inyectan, y se prueba con dobles.
 *
 * ── El flujo, por línea ───────────────────────────────────────────────────
 *   1. ¿Es un producto? Subtotales, IVA, descuentos y pagos se descartan (`motivoNoProducto`).
 *   2. Se prepara la consulta: palabras distintivas, tamaño del envase, un EAN si la línea lo imprime,
 *      tienda. Los números y las unidades se conservan: «1 l» y «200 ml» son productos distintos.
 *   3. Se preguntan las fuentes EN ORDEN —primero las locales y gratis (el historial de lo que la persona
 *      confirmó, el catálogo ya conocido), después las externas— y en cuanto una decide con garantías no
 *      se gasta el cupo de las siguientes.
 *   4. Cada candidato se puntúa con señales documentadas (más abajo) y se decide con umbrales
 *      conservadores y un margen mínimo entre el primero y el segundo.
 *
 * ── La puntuación NO es una probabilidad ─────────────────────────────────
 *
 * `puntos` (0–100) suma señales con pesos fijos que alguien eligió leyendo ejemplos; no está calibrada con
 * datos de acierto y NO significa «el 87 % de las veces acierta». `confianza` es un nombre para tramos de
 * esa suma, y `CONFIG_DEFECTO` los pone conservadores a propósito: un umbral alto significa más líneas que
 * la persona tiene que mirar, que es el error barato; el caro es una marca equivocada guardada como cierta.
 *
 * ── Dos reglas que no se negocian ────────────────────────────────────────
 *   · La marca sale SIEMPRE de un candidato real (un producto que una fuente devolvió) o de la persona.
 *     Si no hay evidencia suficiente, `marca` es null. No hay ningún camino que la deduzca de la tienda,
 *     de una categoría ni del nombre solo.
 *   · La misma información no cuenta dos veces. El catálogo local es una copia de Open Food Facts: que
 *     coincidan los dos no es una segunda opinión, es la misma. Solo suma una corroboración si viene de
 *     un origen distinto (por ejemplo, el catálogo propio de un supermercado).
 */

import { normalizarGtin, esCodigoDeNoComida } from './gtin.ts';
import {
  claveDeLinea,
  compararTamanos,
  extraerTamano,
  motivoNoProducto,
  normalizarTexto,
  palabras,
  palabrasCoinciden,
  sinAcentos,
  type FamiliaTamano,
  type Tamano,
} from './texto-ticket.ts';

// ── Tipos ─────────────────────────────────────────────────────────────────

/** De dónde sale el DATO (no quién lo trajo): sirve para no contar dos veces lo mismo. */
export type OrigenDato = 'off' | 'usuario' | 'supermercado';

export type Candidato = {
  /** Quién lo trajo: 'historial', 'catalogo', 'off', 'supermercado:<id>'. Pueden ser varios si se fusionan. */
  fuentes: string[];
  origenes: OrigenDato[];
  /** El id en NUESTRO catálogo (`products`), si ya está. */
  productoId: string | null;
  /** Un GTIN válido, nunca inventado ni sacado del recibo. */
  ean: string | null;
  nombre: string;
  /** Lo que dice la fuente. Null si no consta: nunca se rellena. */
  marca: string | null;
  tamano: { familia: FamiliaTamano; total: number } | null;
  categorias: string[];
  imagen: string | null;
  /** Claves de tienda (`claveDeTienda`) donde se dice que se vende. Solo ordena. */
  tiendas: string[];
  /** Solo en lo que viene del historial de la persona. */
  asociacion?: { tiendaClave: string; confirmaciones: number };
};

export type TipoSenal =
  | 'ean'
  | 'historial'
  | 'historial_otra_tienda'
  | 'nombre'
  | 'marca_impresa'
  | 'tamano'
  | 'tamano_distinto'
  | 'categoria'
  | 'categoria_distinta'
  | 'tienda'
  | 'corroborado';

export type Senal = { tipo: TipoSenal; puntos: number };

export type CandidatoPuntuado = Candidato & {
  /** 0–100. Interna y heurística: NO es una probabilidad. */
  puntos: number;
  senales: Senal[];
  /** El tamaño o la categoría lo contradicen: no puede asignarse solo. */
  incompatible: boolean;
  /** Qué parte de las palabras de la línea están en el candidato (0–1). */
  cobertura: number;
  /** Evidencia directa: un EAN impreso que coincide, o algo que la persona ya confirmó para esta tienda. */
  directa: boolean;
};

export type Consulta = {
  /** La clave del historial: el texto impreso, normalizado. */
  clave: string;
  tiendaClave: string;
  /** Las palabras distintivas del nombre, ya expandidas, sin el tamaño ni las vacías. */
  palabras: string[];
  /** Las de arriba más las del texto impreso: sirven para ver si la marca está escrita en la línea. */
  palabrasImpresas: string[];
  tamano: Tamano | null;
  /** Un GTIN válido que la propia línea imprime. */
  ean: string | null;
  grupos: GrupoCategoria[];
};

export type EntradaLinea = {
  id: string;
  /** La línea tal cual salió del ticket. Si el lector no la dio, el nombre. */
  texto: string;
  nombre: string;
  tiendaClave: string;
};

export type EstadoFuente = 'ok' | 'error' | 'limite' | 'omitida';
export type ResultadoFuente =
  | { tipo: 'ok'; candidatos: Candidato[] }
  | { tipo: 'error'; motivo: string }
  | { tipo: 'limite'; esperaS: number };

/**
 * Una fuente de candidatos. Hay tres reales (historial, catálogo local, Open Food Facts) y un hueco para
 * catálogos de supermercado (`FuenteSupermercado`, sin ninguna conectada: ver docs).
 */
export interface FuenteCandidatos {
  id: string;
  /** 'local' no gasta cupo externo ni depende de la red; 'externa' sí. */
  coste: 'local' | 'externa';
  /** Qué identifica una consulta DE ESTA FUENTE: dos líneas con la misma clave comparten una sola llamada. */
  clave(consulta: Consulta): string;
  buscar(consulta: Consulta): Promise<ResultadoFuente>;
}

/** Un catálogo propio de un supermercado. La interfaz es la misma; lo único que cambia es qué cadenas cubre. */
export interface FuenteSupermercado extends FuenteCandidatos {
  /** Las claves de tienda (`claveDeTienda`) para las que tiene sentido preguntar. */
  tiendas: readonly string[];
}

export type Confianza = 'alta' | 'media' | 'baja' | 'ninguna';
export type EstadoMarca = 'confirmada' | 'inferida' | 'desconocida';
export type EstadoLinea = 'no_producto' | 'resuelta' | 'ambigua' | 'sin_candidatos';

export type Resolucion = {
  id: string;
  estado: EstadoLinea;
  /** Por qué no es un producto, si no lo es. */
  motivoNoProducto: string | null;
  /** La clave del historial (para guardar una corrección) y la de la tienda. */
  clave: string;
  tiendaClave: string;
  /** Los candidatos, el mejor primero. Con `elegido` el primero ya viene asignado. */
  candidatos: CandidatoPuntuado[];
  /** El primer candidato se asigna solo (cumple los umbrales). Si es false, hay que elegir. */
  elegido: boolean;
  puntuacion: number;
  confianza: Confianza;
  estadoMarca: EstadoMarca;
  necesitaRevision: boolean;
  /** Qué pasó con cada fuente: la pantalla lo usa para decir «no he podido consultar…». */
  fuentes: { id: string; estado: EstadoFuente; motivo?: string; esperaS?: number }[];
  /** Falta consultar una fuente externa por el cupo: volver a intentarlo más tarde sirve. */
  reintentable: boolean;
};

export type ConfigResolutor = {
  /** Puntos mínimos para asignar solo. */
  umbralAuto: number;
  /** Puntos mínimos para enseñarlo como opción. */
  umbralSugerir: number;
  /** Diferencia mínima entre el primero y el segundo para asignar solo. */
  margenMinimo: number;
  /** Cobertura mínima de las palabras de la línea para asignar solo. */
  coberturaMinimaAuto: number;
  /** Cobertura mínima para ser siquiera una opción (sin evidencia directa). */
  coberturaMinimaOpcion: number;
  maxCandidatos: number;
};

/** Conservadores a propósito. Ver la cabecera: más revisión humana es el error barato. */
export const CONFIG_DEFECTO: ConfigResolutor = {
  umbralAuto: 70,
  umbralSugerir: 40,
  margenMinimo: 15,
  coberturaMinimaAuto: 0.75,
  coberturaMinimaOpcion: 0.5,
  maxCandidatos: 4,
};

/** Cuánto vale cada señal. Cambiar uno es cambiar cómo decide todo: se prueba en `resolver.test.ts`. */
export const PESOS = {
  ean: 60,
  historial: 70,
  historialOtraTienda: 25,
  cobertura: 40,
  precision: 10,
  marcaImpresa: 15,
  tamanoIgual: 15,
  tamanoDistinto: -40,
  categoriaIgual: 5,
  categoriaDistinta: -10,
  tienda: 3,
  corroboracion: 5,
} as const;

// ── Categorías ────────────────────────────────────────────────────────────

export type GrupoCategoria =
  | 'lacteos'
  | 'carne'
  | 'pescado'
  | 'fruta_verdura'
  | 'bebida'
  | 'panaderia'
  | 'cereales_pasta'
  | 'dulces_snacks'
  | 'huevos'
  | 'aceites_salsas'
  | 'conservas';

/** Palabras de una línea que delatan el grupo. Pocas y claras: es una señal flojita, no un clasificador. */
const PALABRAS_DE_GRUPO: Record<GrupoCategoria, readonly string[]> = {
  lacteos: ['leche', 'yogur', 'yogures', 'queso', 'mantequilla', 'nata', 'kefir', 'natillas', 'flan', 'cuajada', 'requeson'],
  carne: ['pollo', 'pavo', 'cerdo', 'ternera', 'vacuno', 'jamon', 'chorizo', 'salchicha', 'salchichas', 'lomo', 'bacon', 'hamburguesa', 'pechuga', 'solomillo', 'carne', 'fuet', 'mortadela', 'salchichon', 'cordero'],
  pescado: ['atun', 'salmon', 'merluza', 'bacalao', 'gambas', 'pescado', 'sardinas', 'mejillones', 'calamar', 'anchoas', 'lubina', 'dorada', 'surimi'],
  fruta_verdura: ['manzana', 'manzanas', 'platano', 'naranja', 'naranjas', 'limon', 'tomate', 'tomates', 'lechuga', 'patata', 'patatas', 'cebolla', 'zanahoria', 'pimiento', 'ensalada', 'fruta', 'verdura', 'pepino', 'calabacin', 'aguacate', 'uvas', 'fresas', 'pera', 'melon', 'sandia'],
  bebida: ['agua', 'refresco', 'coca', 'pepsi', 'cerveza', 'vino', 'zumo', 'bebida', 'isotonica', 'tonica', 'gaseosa', 'cava'],
  panaderia: ['pan', 'baguette', 'bollos', 'croissant', 'magdalenas', 'tostadas', 'pasteleria'],
  cereales_pasta: ['arroz', 'pasta', 'espaguetis', 'macarrones', 'fideos', 'harina', 'cereales', 'avena', 'lentejas', 'garbanzos'],
  dulces_snacks: ['galletas', 'chocolate', 'caramelos', 'gominolas', 'chicles', 'snack', 'bombones', 'cacao', 'fritas'],
  huevos: ['huevos', 'huevo'],
  aceites_salsas: ['aceite', 'vinagre', 'salsa', 'ketchup', 'mayonesa', 'mostaza'],
  conservas: ['conserva', 'conservas', 'lata'],
};

/** Fragmentos de las etiquetas de categoría de OFF (en inglés, español…) que delatan el grupo. */
const ETIQUETAS_DE_GRUPO: Record<GrupoCategoria, RegExp> = {
  lacteos: /dairies|milk|yogurt|yoghurt|cheese|butter|cream|leche|lacteos|queso|yogur/,
  carne: /meat|poultr|pork|beef|sausage|ham\b|charcuter|embutid|chicken|turkey|carne/,
  pescado: /fish|seafood|tuna|salmon|shellfish|pescado|marisco/,
  fruta_verdura: /fruit|vegetable|salad|frutas|verduras|legum/,
  bebida: /beverage|waters|sodas|juices|beers|wines|drinks|bebidas|refrescos/,
  panaderia: /bread|bakery|pastr|panader|bolleria|baguette/,
  cereales_pasta: /cereal|pasta|rice|noodle|flours|arroz|pulses/,
  dulces_snacks: /biscuit|chocolate|snack|sweet|confection|cookies|crisps|galletas|dulces/,
  huevos: /\beggs?\b|huevos/,
  aceites_salsas: /\boils?\b|sauces?|condiment|vinegar|aceites|salsas/,
  conservas: /canned|preserved|conservas/,
};

export function gruposDePalabras(lista: readonly string[]): GrupoCategoria[] {
  const salida: GrupoCategoria[] = [];
  for (const g of Object.keys(PALABRAS_DE_GRUPO) as GrupoCategoria[]) {
    if (lista.some((p) => PALABRAS_DE_GRUPO[g].includes(p))) salida.push(g);
  }
  return salida;
}

export function gruposDeEtiquetas(etiquetas: readonly string[]): GrupoCategoria[] {
  const salida: GrupoCategoria[] = [];
  for (const g of Object.keys(ETIQUETAS_DE_GRUPO) as GrupoCategoria[]) {
    if (etiquetas.some((e) => ETIQUETAS_DE_GRUPO[g].test(e.toLowerCase()))) salida.push(g);
  }
  return salida;
}

// ── Preparar la consulta ──────────────────────────────────────────────────

/** Palabras que, si son la «marca», no demuestran nada: aparecen en media despensa. */
const MARCAS_GENERICAS = new Set([
  'natural', 'fresco', 'fresca', 'casero', 'casera', 'tradicional', 'clasico', 'clasica', 'original', 'bio', 'eco',
  'ecologico', 'light', 'zero', 'extra', 'premium', 'selecto', 'familiar', 'gourmet', 'artesano', 'artesana',
  'nuestro', 'nuestra', 'mi', 'la', 'el',
]);

/** Un GTIN válido suelto entre las palabras de la línea impresa. */
function eanDeLaLinea(textoNormalizado: string): string | null {
  for (const token of textoNormalizado.split(' ')) {
    if (!/^[0-9]{8,14}$/.test(token)) continue;
    const gtin = normalizarGtin(token);
    if (gtin !== null && !esCodigoDeNoComida(gtin)) return gtin;
  }
  return null;
}

function soloPalabrasDeVerdad(lista: readonly string[]): string[] {
  // Un número suelto («2») no distingue un producto de otro; «0%» o «1.5» entre letras tampoco, salvo el porcentaje.
  return lista.filter((p) => !/^[0-9.]+$/.test(p));
}

export function prepararConsulta(entrada: EntradaLinea): Consulta {
  const normTexto = normalizarTexto(entrada.texto);
  const normNombre = normalizarTexto(entrada.nombre);
  const deNombre = extraerTamano(normNombre);
  const deTexto = extraerTamano(normTexto);
  const pNombre = soloPalabrasDeVerdad(palabras(deNombre.resto));
  const pTexto = soloPalabrasDeVerdad(palabras(deTexto.resto));
  return {
    clave: claveDeLinea(entrada.texto !== '' ? entrada.texto : entrada.nombre),
    tiendaClave: entrada.tiendaClave,
    palabras: pNombre,
    palabrasImpresas: [...new Set([...pNombre, ...pTexto])],
    // Lo impreso manda sobre lo que el lector reescribió.
    tamano: deTexto.tamano ?? deNombre.tamano,
    ean: eanDeLaLinea(normTexto),
    grupos: gruposDePalabras(pNombre),
  };
}

// ── Puntuar ───────────────────────────────────────────────────────────────

function sacarPalabras(texto: string): { palabras: string[]; tamano: Tamano | null } {
  const { tamano, resto } = extraerTamano(normalizarTexto(texto));
  return { palabras: soloPalabrasDeVerdad(palabras(resto)), tamano };
}

function algunaCoincide(palabra: string, lista: readonly string[]): boolean {
  return lista.some((x) => palabrasCoinciden(palabra, x));
}

export function puntuar(consulta: Consulta, c: Candidato): CandidatoPuntuado {
  const senales: Senal[] = [];
  const poner = (tipo: TipoSenal, puntos: number) => {
    if (puntos !== 0) senales.push({ tipo, puntos });
  };
  let incompatible = false;
  let directa = false;

  // ── Evidencia directa ──
  if (consulta.ean !== null && c.ean !== null && consulta.ean === c.ean) {
    poner('ean', PESOS.ean);
    directa = true;
  }
  if (c.asociacion) {
    if (c.asociacion.tiendaClave === consulta.tiendaClave) {
      poner('historial', PESOS.historial);
      directa = true;
    } else {
      // El mismo texto en otra tienda (o sin saber cuál) es una pista, no una prueba: «DESNAT 1L» no es
      // lo mismo en todas las cadenas.
      poner('historial_otra_tienda', PESOS.historialOtraTienda);
    }
  }

  // ── El nombre ──
  const delCandidato = sacarPalabras(c.nombre);
  const marca = c.marca ? soloPalabrasDeVerdad(palabras(extraerTamano(normalizarTexto(c.marca)).resto)) : [];
  const palabrasCand = delCandidato.palabras.filter((p) => !marca.includes(p));
  const todasCand = [...delCandidato.palabras, ...marca];
  const cobertura =
    consulta.palabras.length === 0
      ? 0
      : consulta.palabras.filter((l) => algunaCoincide(l, todasCand)).length / consulta.palabras.length;
  const precision =
    palabrasCand.length === 0
      ? 0
      : palabrasCand.filter((p) => algunaCoincide(p, consulta.palabrasImpresas)).length / palabrasCand.length;
  poner('nombre', Math.round(cobertura * PESOS.cobertura + precision * PESOS.precision));

  // ── La marca, escrita en la propia línea ──
  const marcaUtil = marca.filter((m) => m.length >= 3);
  if (
    marcaUtil.length > 0 &&
    marcaUtil.length === marca.length &&
    !marca.every((m) => MARCAS_GENERICAS.has(m)) &&
    marca.every((m) => algunaCoincide(m, consulta.palabrasImpresas))
  ) {
    poner('marca_impresa', PESOS.marcaImpresa);
  }

  // ── El tamaño ──
  const tamanoCand = c.tamano ?? delCandidato.tamano;
  const tam = compararTamanos(consulta.tamano, tamanoCand);
  if (tam === 'igual') poner('tamano', PESOS.tamanoIgual);
  if (tam === 'distinto') {
    poner('tamano_distinto', PESOS.tamanoDistinto);
    incompatible = true;
  }

  // ── La categoría ──
  const gruposCand = gruposDeEtiquetas(c.categorias);
  if (consulta.grupos.length > 0 && gruposCand.length > 0) {
    if (consulta.grupos.some((g) => gruposCand.includes(g))) poner('categoria', PESOS.categoriaIgual);
    else poner('categoria_distinta', PESOS.categoriaDistinta);
  }

  // ── La tienda: ordena, no demuestra ──
  if (consulta.tiendaClave !== '' && c.tiendas.includes(consulta.tiendaClave)) poner('tienda', PESOS.tienda);

  // ── Corroboración: solo orígenes distintos del mismo dato ──
  const independientes = new Set(c.origenes.filter((o) => o === 'off' || o === 'supermercado'));
  if (independientes.size >= 2) poner('corroborado', PESOS.corroboracion);

  const puntos = Math.max(0, Math.min(100, senales.reduce((s, x) => s + x.puntos, 0)));
  return { ...c, puntos, senales, incompatible, cobertura, directa };
}

function mismoTamano(a: Candidato['tamano'], b: Candidato['tamano']): boolean {
  if (a === null || b === null) return a === b;
  return a.familia === b.familia && a.total === b.total;
}

/** Mezcla los candidatos que son el MISMO producto (mismo EAN o mismo id), juntando de dónde vienen. */
export function fusionar(candidatos: readonly Candidato[]): Candidato[] {
  const salida: Candidato[] = [];
  for (const c of candidatos) {
    const igual = salida.find(
      (x) =>
        (c.ean !== null && x.ean === c.ean) ||
        (c.productoId !== null && x.productoId === c.productoId) ||
        // Sin identificador, el mismo nombre, la misma marca Y el mismo tamaño son el mismo candidato: dos
        // tamaños de un producto son dos productos.
        (c.ean === null &&
          x.ean === null &&
          c.productoId === null &&
          x.productoId === null &&
          sinAcentos(x.nombre) === sinAcentos(c.nombre) &&
          sinAcentos(x.marca ?? '') === sinAcentos(c.marca ?? '') &&
          mismoTamano(x.tamano, c.tamano)),
    );
    if (!igual) {
      salida.push({ ...c, fuentes: [...c.fuentes], origenes: [...c.origenes], tiendas: [...c.tiendas] });
      continue;
    }
    // Lo que la persona confirmó manda sobre lo que dice una fuente.
    if (c.asociacion && !igual.asociacion) {
      igual.asociacion = c.asociacion;
      igual.nombre = c.nombre;
      igual.marca = c.marca;
    }
    igual.productoId ??= c.productoId;
    igual.ean ??= c.ean;
    igual.imagen ??= c.imagen;
    igual.tamano ??= c.tamano;
    if (igual.categorias.length === 0) igual.categorias = c.categorias;
    for (const f of c.fuentes) if (!igual.fuentes.includes(f)) igual.fuentes.push(f);
    for (const o of c.origenes) if (!igual.origenes.includes(o)) igual.origenes.push(o);
    for (const t of c.tiendas) if (!igual.tiendas.includes(t)) igual.tiendas.push(t);
  }
  return salida;
}

// ── Decidir ───────────────────────────────────────────────────────────────

type Decision = Pick<
  Resolucion,
  'estado' | 'candidatos' | 'elegido' | 'puntuacion' | 'confianza' | 'estadoMarca' | 'necesitaRevision'
>;

function tiene(c: CandidatoPuntuado, tipo: TipoSenal): boolean {
  return c.senales.some((s) => s.tipo === tipo);
}

/** Dos candidatos distintos con evidencia directa que apuntan a productos diferentes: no se decide solo. */
function mismoProducto(a: CandidatoPuntuado, b: CandidatoPuntuado): boolean {
  return (a.ean !== null && a.ean === b.ean) || (a.productoId !== null && a.productoId === b.productoId);
}

export function decidir(
  puntuados: readonly CandidatoPuntuado[],
  config: ConfigResolutor = CONFIG_DEFECTO,
): Decision {
  const ordenados = [...puntuados]
    .filter((c) => c.directa || c.cobertura >= config.coberturaMinimaOpcion)
    .filter((c) => c.puntos >= config.umbralSugerir)
    // Desempate estable: los que ya están en nuestro catálogo, luego por nombre.
    .sort(
      (a, b) =>
        b.puntos - a.puntos ||
        Number(b.productoId !== null) - Number(a.productoId !== null) ||
        a.nombre.localeCompare(b.nombre),
    )
    .slice(0, config.maxCandidatos);

  if (ordenados.length === 0) {
    return {
      estado: 'sin_candidatos',
      candidatos: [],
      elegido: false,
      puntuacion: 0,
      confianza: 'ninguna',
      estadoMarca: 'desconocida',
      necesitaRevision: false,
    };
  }

  const primero = ordenados[0];
  const segundo = ordenados[1];
  const margen = segundo ? primero.puntos - segundo.puntos : Infinity;

  let auto = false;
  if (!primero.incompatible) {
    if (primero.directa) {
      // Lo que la persona ya confirmó, o un EAN impreso. Solo se duda si otra evidencia directa dice otra cosa.
      const rival = ordenados.slice(1).find((c) => c.directa && !mismoProducto(primero, c));
      auto = rival === undefined;
    } else {
      // Sin evidencia directa se pide un nombre casi completo, algo más que el nombre (el tamaño o la marca
      // escrita) y que no haya otro igual de bueno. «Leche entera» sola nunca pasa: hay cien.
      const masQueNombre = tiene(primero, 'tamano') || tiene(primero, 'marca_impresa') || tiene(primero, 'corroborado');
      // Lo confirmado en OTRA tienda es una pista: ayuda a ordenar, pero no suma para decidir. Se decide como si
      // no estuviera, con lo que sí demuestran el nombre, el tamaño y la marca escrita.
      const pista = primero.senales.filter((s) => s.tipo === 'historial_otra_tienda').reduce((suma, s) => suma + s.puntos, 0);
      auto =
        primero.puntos - pista >= config.umbralAuto &&
        primero.cobertura >= config.coberturaMinimaAuto &&
        masQueNombre &&
        margen >= config.margenMinimo;
    }
  }

  if (!auto) {
    return {
      estado: 'ambigua',
      candidatos: ordenados,
      elegido: false,
      puntuacion: primero.puntos,
      // Un primero alto que no se asigna es un empate o falta de pruebas; uno flojo, una pista.
      confianza: primero.puntos >= config.umbralAuto ? 'media' : 'baja',
      estadoMarca: 'desconocida',
      necesitaRevision: true,
    };
  }

  // La marca solo existe si la fuente la dio. Una ficha sin marca identifica el producto, no la marca.
  let estadoMarca: EstadoMarca = 'desconocida';
  if (primero.marca !== null) {
    estadoMarca = primero.directa || tiene(primero, 'marca_impresa') ? 'confirmada' : 'inferida';
  }
  return {
    estado: 'resuelta',
    candidatos: ordenados,
    elegido: true,
    puntuacion: primero.puntos,
    confianza: 'alta',
    estadoMarca,
    // Lo inferido se enseña para que la persona lo confirme; lo confirmado (por ella o por el recibo) no.
    necesitaRevision: estadoMarca === 'inferida',
  };
}

// ── Orquestar ─────────────────────────────────────────────────────────────

export type OpcionesResolutor = {
  config?: ConfigResolutor;
  /** Líneas resolviéndose a la vez. Las fuentes que repiten una consulta comparten la llamada. */
  concurrencia?: number;
};

async function enParalelo<T>(items: readonly T[], n: number, tarea: (item: T) => Promise<void>): Promise<void> {
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    for (;;) {
      const i = siguiente;
      siguiente += 1;
      if (i >= items.length) return;
      await tarea(items[i]);
    }
  });
  await Promise.all(trabajadores);
}

/**
 * Resuelve las líneas. Nunca lanza por culpa de una fuente: lo que una fuente haga mal (error, límite,
 * respuesta rara) queda anotado en `fuentes` y la línea sigue con lo que haya.
 */
export async function resolverLineas(
  entradas: readonly EntradaLinea[],
  fuentes: readonly FuenteCandidatos[],
  opciones: OpcionesResolutor = {},
): Promise<Resolucion[]> {
  const config = opciones.config ?? CONFIG_DEFECTO;
  const memo = new Map<string, Promise<ResultadoFuente>>();
  // Una fuente que dijo «sin cupo» no vuelve a preguntarse en esta tanda: las demás líneas no insisten.
  // Guarda cuánto dijo que había que esperar.
  const sinCupo = new Map<string, number>();

  function preguntar(fuente: FuenteCandidatos, consulta: Consulta): Promise<ResultadoFuente> {
    const clave = `${fuente.id}|${fuente.clave(consulta)}`;
    let p = memo.get(clave);
    if (!p) {
      p = fuente.buscar(consulta).then(
        (r) => {
          if (r.tipo === 'limite') sinCupo.set(fuente.id, r.esperaS);
          return r;
        },
        // Una fuente que lanza se trata como una que falla: la línea no se pierde.
        (): ResultadoFuente => ({ tipo: 'error', motivo: 'excepcion' }),
      );
      memo.set(clave, p);
    }
    return p;
  }

  const salida = new Map<string, Resolucion>();

  await enParalelo(entradas, opciones.concurrencia ?? 3, async (entrada) => {
    const motivo = motivoNoProducto(entrada.texto !== '' ? entrada.texto : entrada.nombre);
    const consulta = prepararConsulta(entrada);
    if (motivo !== null) {
      salida.set(entrada.id, {
        id: entrada.id,
        estado: 'no_producto',
        motivoNoProducto: motivo,
        clave: consulta.clave,
        tiendaClave: consulta.tiendaClave,
        candidatos: [],
        elegido: false,
        puntuacion: 0,
        confianza: 'ninguna',
        estadoMarca: 'desconocida',
        necesitaRevision: false,
        fuentes: [],
        reintentable: false,
      });
      return;
    }

    const recogidos: Candidato[] = [];
    const estados: Resolucion['fuentes'] = [];
    let decision: Decision = decidir([], config);
    let reintentable = false;

    for (const fuente of fuentes) {
      // Si ya hay una decisión firme con lo que no cuesta, no se gasta el cupo de las externas.
      if (decision.estado === 'resuelta' && fuente.coste === 'externa') {
        estados.push({ id: fuente.id, estado: 'omitida', motivo: 'ya_resuelta' });
        continue;
      }
      if (sinCupo.has(fuente.id)) {
        estados.push({ id: fuente.id, estado: 'omitida', motivo: 'sin_cupo', esperaS: sinCupo.get(fuente.id) });
        reintentable = true;
        continue;
      }
      const r = await preguntar(fuente, consulta);
      if (r.tipo === 'ok') {
        estados.push({ id: fuente.id, estado: 'ok' });
        recogidos.push(...r.candidatos);
      } else if (r.tipo === 'limite') {
        estados.push({ id: fuente.id, estado: 'limite', esperaS: r.esperaS });
        reintentable = true;
      } else {
        estados.push({ id: fuente.id, estado: 'error', motivo: r.motivo });
      }
      decision = decidir(fusionar(recogidos).map((c) => puntuar(consulta, c)), config);
    }

    salida.set(entrada.id, {
      id: entrada.id,
      ...decision,
      motivoNoProducto: null,
      clave: consulta.clave,
      tiendaClave: consulta.tiendaClave,
      fuentes: estados,
      reintentable,
    });
  });

  // En el mismo orden en que llegaron.
  return entradas.map((e) => salida.get(e.id)).filter((r): r is Resolucion => r !== undefined);
}
