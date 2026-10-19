/**
 * Alérgenos e intolerancias: qué evita una persona, qué lleva un producto y qué hay
 * que avisar al cruzarlos.
 *
 * Esto son AVISOS, nunca prohibiciones: ninguna pantalla desactiva un botón ni impide
 * añadir nada por lo que salga de aquí. Y Opsi no es nutricionista: dice lo que Open
 * Food Facts (OFF) declara de un producto y se calla lo demás.
 *
 * Sin JSX ni imports de valor con alias, para poder probarlo con Node tal cual
 * (`salud.test.ts`). Como las reglas de abajo son de seguridad, son lo que hay que
 * poder probar a fondo.
 *
 * ── Las tres reglas que no se negocian ────────────────────────────────────
 *
 *   1. **«Sin datos» no es «sin alérgenos».** OFF devuelve las listas vacías tanto
 *      cuando un producto no lleva nada como cuando nadie ha rellenado sus
 *      ingredientes. La única señal fiable de que se pueden descartar las
 *      preferencias es que la ficha sea de OFF, se haya consultado de verdad
 *      (`health_data_at`) y traiga ingredientes. Si falta cualquiera de las tres, o si
 *      algo de lo recibido no cuadró y se tiró, se dice «Sin datos de alérgenos»; nunca
 *      que sea apto ni que no lleve nada.
 *   2. **Una etiqueta nunca anula un dato de conflicto.** Un «sin gluten» (declarado
 *      por quien edita la ficha) no oculta un «contiene gluten» ni unas trazas, y
 *      tampoco cuenta como garantía: no sirve para descartar nada ni se pinta con
 *      nada que parezca un visto bueno. Solo matiza la lactosa, y sin quitar el aviso.
 *   3. **La ausencia de marca no se anuncia.** Con datos completos y sin ningún aviso
 *      no se pinta nada: decir «todo bien» sería prometer lo que Opsi no sabe.
 *
 * ── Entrada no confiable ──────────────────────────────────────────────────
 *
 * Los textos de la ficha salen de un wiki que edita cualquiera. El servidor ya los
 * filtra dos veces, pero aquí se vuelven a comprobar (`leerSalud`): lo que no cuadra
 * se tira y la ficha pasa a contar como incompleta, que es siempre la dirección
 * segura. Nada se interpreta: son datos que se pintan como texto plano.
 */

// ── Qué se puede evitar ───────────────────────────────────────────────────

/**
 * La lista CERRADA que acepta el servidor (`user_health_preferences.avoid`): los 14
 * alérgenos de declaración obligatoria en la UE y la lactosa. «gluten» cubre también
 * la celiaquía. El orden es el de la pantalla de Ajustes —lo que más gente marca,
 * primero—, no el alfabético que guarda la base de datos.
 */
export const CLAVES_SALUD = [
  'gluten',
  'lactose',
  'milk',
  'eggs',
  'peanuts',
  'nuts',
  'soybeans',
  'fish',
  'crustaceans',
  'molluscs',
  'celery',
  'mustard',
  'sesame',
  'sulphites',
  'lupin',
] as const;

export type ClaveSalud = (typeof CLAVES_SALUD)[number];

export type PreferenciaSalud = {
  clave: ClaveSalud;
  /** Lo que se lee en Ajustes. */
  etiqueta: string;
  /** Cómo se nombra dentro de una frase: «Contiene ${nombre}». */
  nombre: string;
  /** La etiqueta de OFF (`allergens_tags` y `traces_tags`) con la que se cruza. */
  etiquetaOff: string;
};

/**
 * Casi todo es 1 a 1 con `en:<clave>`. Las excepciones son las que OFF nombra distinto
 * (`sesame` → `en:sesame-seeds`, `sulphites` → `en:sulphur-dioxide-and-sulphites`) y la
 * lactosa: OFF no tiene un alérgeno «lactosa», lo que declara es la leche. Por eso
 * `lactose` se cruza con `en:milk`, y `en:no-lactose` solo la matiza (ver `nivelDe`).
 * Quien evita la lactosa ve «Contiene leche», que es lo que de verdad lleva el producto.
 */
export const PREFERENCIAS_SALUD: readonly PreferenciaSalud[] = [
  { clave: 'gluten', etiqueta: 'Cereales con gluten (celiaquía)', nombre: 'gluten', etiquetaOff: 'en:gluten' },
  { clave: 'lactose', etiqueta: 'Lactosa', nombre: 'leche', etiquetaOff: 'en:milk' },
  { clave: 'milk', etiqueta: 'Leche', nombre: 'leche', etiquetaOff: 'en:milk' },
  { clave: 'eggs', etiqueta: 'Huevos', nombre: 'huevo', etiquetaOff: 'en:eggs' },
  { clave: 'peanuts', etiqueta: 'Cacahuetes', nombre: 'cacahuetes', etiquetaOff: 'en:peanuts' },
  { clave: 'nuts', etiqueta: 'Frutos de cáscara', nombre: 'frutos de cáscara', etiquetaOff: 'en:nuts' },
  { clave: 'soybeans', etiqueta: 'Soja', nombre: 'soja', etiquetaOff: 'en:soybeans' },
  { clave: 'fish', etiqueta: 'Pescado', nombre: 'pescado', etiquetaOff: 'en:fish' },
  { clave: 'crustaceans', etiqueta: 'Crustáceos', nombre: 'crustáceos', etiquetaOff: 'en:crustaceans' },
  { clave: 'molluscs', etiqueta: 'Moluscos', nombre: 'moluscos', etiquetaOff: 'en:molluscs' },
  { clave: 'celery', etiqueta: 'Apio', nombre: 'apio', etiquetaOff: 'en:celery' },
  { clave: 'mustard', etiqueta: 'Mostaza', nombre: 'mostaza', etiquetaOff: 'en:mustard' },
  { clave: 'sesame', etiqueta: 'Sésamo', nombre: 'sésamo', etiquetaOff: 'en:sesame-seeds' },
  { clave: 'sulphites', etiqueta: 'Sulfitos', nombre: 'sulfitos', etiquetaOff: 'en:sulphur-dioxide-and-sulphites' },
  { clave: 'lupin', etiqueta: 'Altramuces', nombre: 'altramuces', etiquetaOff: 'en:lupin' },
];

const POR_CLAVE = new Map(PREFERENCIAS_SALUD.map((p) => [p.clave, p]));

export function esClaveSalud(valor: unknown): valor is ClaveSalud {
  return typeof valor === 'string' && POR_CLAVE.has(valor as ClaveSalud);
}

/**
 * Las claves válidas de lo que llegue, sin repetidos y en el orden de la pantalla.
 * Lo que no esté en la lista cerrada se tira: la base de datos ya lo rechazaría al
 * guardar, y aquí no hay motivo para fiarse de lo que devuelva.
 */
export function leerClaves(valor: unknown): ClaveSalud[] {
  if (!Array.isArray(valor)) return [];
  const vistas = new Set<unknown>(valor.slice(0, 100));
  return CLAVES_SALUD.filter((clave) => vistas.has(clave));
}

// ── El permiso para guardar lo que evita la persona ───────────────────────
//
// Lo que se marca es un dato de salud (RGPD, categoría especial) y no se guarda ni se
// usa sin el permiso de su dueña. El servidor no deja guardar una lista no vacía sin él
// (`check_health_consent`); aquí, además, la app no cruza nada si no hay permiso
// VIGENTE. Lo dicho abajo es la parte pura, que se prueba sin pantalla ni red.

/**
 * La versión del aviso de consentimiento que la app enseña. Subirla cuando cambie el
 * aviso (qué se guarda, para qué, quién lo ve) obliga a quien ya aceptó a aceptarlo de
 * nuevo: mientras tanto, su lista no se usa.
 */
export const VERSION_AVISO_SALUD = 1;

/** Qué versión del aviso aceptó la persona y cuándo (la fecha la pone el servidor). */
export type ConsentimientoSalud = { version: number; en: string };

/**
 * El permiso tal y como llega de la fila. Lo que no tenga la forma exacta —una versión
 * que no sea un entero positivo, o una fecha que no sea una fecha— cuenta como «sin
 * permiso»: ante la duda, no hay permiso.
 */
export function leerConsentimiento(version: unknown, en: unknown): ConsentimientoSalud | null {
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  if (typeof en !== 'string' || Number.isNaN(Date.parse(en))) return null;
  return { version, en };
}

/** ¿Vale el permiso que hay para la versión del aviso que enseña la app? */
export function consentimientoVigente(
  consentimiento: ConsentimientoSalud | null,
  vigente: number = VERSION_AVISO_SALUD,
): boolean {
  return consentimiento !== null && consentimiento.version >= vigente;
}

/**
 * Lo que de verdad se cruza con los productos: la lista guardada si hay permiso
 * vigente, y NADA si no. Una lista sin permiso (la de antes de pedirlo, o la de una
 * versión vieja del aviso) no se usa, y quien pinta la pantalla lo dice en voz alta
 * (`faltaPermisoSalud`): que de pronto no haya marcas no puede leerse como «todo bien».
 */
export function preferenciasEfectivas(
  guardadas: readonly ClaveSalud[],
  consentimiento: ConsentimientoSalud | null,
  vigente: number = VERSION_AVISO_SALUD,
): readonly ClaveSalud[] {
  return consentimientoVigente(consentimiento, vigente) ? guardadas : [];
}

/** Hay algo guardado que no se está usando porque falta el permiso. */
export function faltaPermisoSalud(
  guardadas: readonly ClaveSalud[],
  consentimiento: ConsentimientoSalud | null,
  vigente: number = VERSION_AVISO_SALUD,
): boolean {
  return guardadas.length > 0 && !consentimientoVigente(consentimiento, vigente);
}

/**
 * El camino inverso: de una etiqueta de OFF al nombre con el que se pinta («en:milk» →
 * «leche»). Null si no es una de las 14: lo que Opsi no sabe nombrar no se enseña.
 * `lactose` no entra a propósito: comparte `en:milk` y daría igual el nombre.
 */
const NOMBRE_DE_ETIQUETA = new Map(
  PREFERENCIAS_SALUD.filter((p) => p.clave !== 'lactose').map((p) => [p.etiquetaOff, p.nombre]),
);

export function nombreDeEtiquetaOff(etiqueta: string): string | null {
  return NOMBRE_DE_ETIQUETA.get(etiqueta) ?? null;
}

/**
 * Los nombres que Opsi sabe poner a una lista de etiquetas de OFF, sin repetidos y en
 * el orden en que vienen. Las desconocidas se quedan fuera.
 */
export function nombresDeEtiquetas(etiquetas: readonly string[]): string[] {
  const nombres: string[] = [];
  for (const etiqueta of etiquetas) {
    const nombre = nombreDeEtiquetaOff(etiqueta);
    if (nombre !== null && !nombres.includes(nombre)) nombres.push(nombre);
  }
  return nombres;
}

/** «a», «a y b», «a, b y c». `Intl.ListFormat` no está en todos los motores de móvil. */
export function unir(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres.join('');
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

// ── Lo que lleva un producto ──────────────────────────────────────────────

/**
 * Las únicas etiquetas de OFF que se guardan (lista cerrada del servidor). Son
 * declaraciones de quien edita la ficha, no una garantía: la app las enseña como
 * «según Open Food Facts» y nunca las usa para descartar nada.
 */
export type EtiquetaSalud = 'en:no-gluten' | 'en:no-lactose' | 'en:suitable-for-celiacs';

const ETIQUETAS_SALUD: ReadonlySet<string> = new Set<EtiquetaSalud>([
  'en:no-gluten',
  'en:no-lactose',
  'en:suitable-for-celiacs',
]);

/**
 * Cómo se dice cada una. «Para celíacos» y no «apto»: «apto» es una promesa que Opsi
 * no hace, aunque aquí solo repita lo que OFF dice que dice el envase.
 */
export const TEXTO_ETIQUETA_SALUD: Record<EtiquetaSalud, string> = {
  'en:no-gluten': 'sin gluten',
  'en:no-lactose': 'sin lactosa',
  'en:suitable-for-celiacs': 'para celíacos',
};

/**
 * Lo que se sabe de salud de un producto, ya limpio.
 *
 *   · `deOff`: la ficha viene de Open Food Facts. Es lo que decide si se ofrece mirar
 *     los ingredientes, y también lo único que deja fiarse de las listas: un producto
 *     escrito a mano o privado no trae datos de salud (la base de datos lo impide con
 *     un CHECK), y aun así lo que no sea de OFF se trata como «sin datos».
 *   · `consta`: OFF se consultó de verdad para esta ficha. Falso en una ficha anterior a
 *     estos datos: sus listas vacías no significan nada.
 *   · `descartado`: algo de lo recibido no cuadró y se tiró. Con una etiqueta mala se
 *     habría podido tirar justo la que importaba, así que la ficha deja de valer para
 *     descartar preferencias (sigue valiendo para avisar de lo que sí se leyó).
 */
export type SaludProducto = {
  readonly deOff: boolean;
  readonly consta: boolean;
  readonly alergenos: readonly string[];
  readonly trazas: readonly string[];
  readonly etiquetas: readonly EtiquetaSalud[];
  readonly ingredientes: string | null;
  readonly descartado: boolean;
};

/**
 * Un producto del que no se sabe nada de salud. Congelado, listas incluidas: es una
 * constante compartida y nadie debe poder cambiarla.
 */
export const SIN_DATOS_DE_SALUD: SaludProducto = Object.freeze({
  deOff: false,
  consta: false,
  alergenos: Object.freeze([] as string[]),
  trazas: Object.freeze([] as string[]),
  etiquetas: Object.freeze([] as EtiquetaSalud[]),
  ingredientes: null,
  descartado: false,
});

/** El mismo formato que valida el servidor (`upsert_global_product`). */
const FORMATO_ETIQUETA = /^[a-z]{2}:[a-z0-9-]{1,80}$/;
const MAX_LARGO_ETIQUETA = 83;
/** Lo que el servidor deja guardar como mucho (CHECK de `products`). */
const MAX_ETIQUETAS = 40;
const MAX_INGREDIENTES = 2000;
/**
 * Lo que el servidor prohíbe en un texto (la misma clase que `upsert_global_product`):
 * controles y DEL, el bloque C1, el guion blando, los espacios de ancho cero y las marcas
 * direccionales, los separadores de línea y de párrafo y el formato bidireccional, los
 * invisibles de U+2060 a U+206F, el BOM y el marcado (`<` y `>`). Un texto con alguno no
 * salió de la función: se tira entero en vez de arreglarlo.
 *
 * Se mira por código de carácter y no con una expresión regular a propósito: así cada
 * rango se lee como número y nadie tiene que fiarse de unos caracteres invisibles
 * pegados en un fichero.
 */
function tieneProhibidos(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (
      c <= 0x1f ||
      (c >= 0x7f && c <= 0x9f) ||
      c === 0xad ||
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x2028 && c <= 0x202e) ||
      (c >= 0x2060 && c <= 0x206f) ||
      c === 0xfeff ||
      c === 0x3c ||
      c === 0x3e
    ) {
      return true;
    }
  }
  return false;
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Una lista de etiquetas de alérgenos o trazas. Lo que no sea una lista, o traiga algo
 * con otra forma, o pase del tope, marca la ficha como `descartado`. `en:none` (OFF lo
 * usa para decir «ninguno») no es un alérgeno: se ignora sin más.
 */
function leerEtiquetas(valor: unknown): { etiquetas: string[]; descartado: boolean } {
  if (!Array.isArray(valor)) return { etiquetas: [], descartado: true };

  let descartado = valor.length > MAX_ETIQUETAS;
  const etiquetas: string[] = [];
  // Por índice y con tope: una lista enorme o con huecos no se recorre entera.
  const hasta = Math.min(valor.length, MAX_ETIQUETAS);
  for (let i = 0; i < hasta; i++) {
    const elemento: unknown = valor[i];
    if (
      typeof elemento !== 'string' ||
      elemento.length > MAX_LARGO_ETIQUETA ||
      !FORMATO_ETIQUETA.test(elemento)
    ) {
      descartado = true;
      continue;
    }
    if (elemento === 'en:none' || etiquetas.includes(elemento)) continue;
    etiquetas.push(elemento);
  }
  return { etiquetas, descartado };
}

/** Las etiquetas de la lista cerrada. Que falten solo quita un matiz: no marca nada. */
function leerEtiquetasSalud(valor: unknown): EtiquetaSalud[] {
  if (!Array.isArray(valor)) return [];
  const encontradas: EtiquetaSalud[] = [];
  for (let i = 0; i < Math.min(valor.length, MAX_ETIQUETAS); i++) {
    const elemento: unknown = valor[i];
    if (typeof elemento === 'string' && ETIQUETAS_SALUD.has(elemento)) {
      if (!encontradas.includes(elemento as EtiquetaSalud)) encontradas.push(elemento as EtiquetaSalud);
    }
  }
  return encontradas;
}

function esFecha(valor: unknown): boolean {
  return typeof valor === 'string' && valor.length >= 10 && valor.length <= 40 && !Number.isNaN(Date.parse(valor));
}

/**
 * De lo que llegue —una fila de `products` o el `product` de `lookup-barcode`— a una
 * ficha de salud limpia. Nunca lanza.
 *
 * Acepta las dos formas porque son el mismo dato con dos nombres:
 *
 *   · origen:     `data_source`      (fila)   |  `source`       (función)
 *   · ¿consta?:   `health_data_at`   (fila)   |  `health_data`   (función)
 *
 * Todo lo dudoso cae del lado de «sin datos»: una fuente que no es exactamente
 * `openfoodfacts`, un `health_data` que no es exactamente `true`, una lista que no es
 * lista… Lo único que nunca ocurre es que un dato roto parezca un «sin alérgenos».
 */
export function leerSalud(valor: unknown): SaludProducto {
  if (!esObjeto(valor)) return SIN_DATOS_DE_SALUD;

  const deOff = (valor.data_source ?? valor.source) === 'openfoodfacts';
  // Si el producto no es de OFF, sus listas no se leen aunque las traiga.
  if (!deOff) return SIN_DATOS_DE_SALUD;

  const consta = valor.health_data !== undefined ? valor.health_data === true : esFecha(valor.health_data_at);
  if (!consta) return { ...SIN_DATOS_DE_SALUD, deOff: true };

  const alergenos = leerEtiquetas(valor.allergens_tags);
  const trazas = leerEtiquetas(valor.traces_tags);

  let descartado = alergenos.descartado || trazas.descartado;

  let ingredientes: string | null = null;
  const bruto = valor.ingredients_text;
  if (typeof bruto === 'string') {
    // Crudo y antes de recortar: `trim()` se llevaría por delante un BOM o un salto de
    // línea de los extremos, que son justo lo que no debería haber.
    if (bruto.length > MAX_INGREDIENTES || tieneProhibidos(bruto)) descartado = true;
    else if (bruto.trim().length > 0) ingredientes = bruto.trim();
  } else if (bruto !== null && bruto !== undefined) {
    descartado = true;
  }

  return {
    deOff: true,
    consta: true,
    alergenos: alergenos.etiquetas,
    trazas: trazas.etiquetas,
    etiquetas: leerEtiquetasSalud(valor.labels_tags),
    ingredientes,
    descartado,
  };
}

// ── Cruzar lo que evita una persona con lo que lleva el producto ──────────

/**
 * Cuánto pesa un aviso, de más a menos:
 *
 *   · `contiene`: la ficha declara el alérgeno.
 *   · `trazas`:   la ficha declara trazas.
 *   · `etiqueta`: solo la lactosa. Lleva leche, pero la ficha trae `en:no-lactose`.
 *                 Se enseña igualmente, en un tono más bajo y atribuido a OFF; jamás
 *                 como «apto».
 */
export type Nivel = 'contiene' | 'trazas' | 'etiqueta';

export type Aviso = {
  pref: ClaveSalud;
  nivel: Nivel;
  /** Solo en `etiqueta`: si la leche está como alérgeno o como trazas. */
  via?: 'contiene' | 'trazas';
};

export type Evaluacion = {
  avisos: Aviso[];
  /**
   * Hay preferencias que esta ficha no deja descartar. Es falso si todas las
   * preferencias ya tienen aviso (no queda nada que descartar) o si no hay
   * preferencias.
   */
  sinDatos: boolean;
};

const ORDEN_NIVEL: Record<Nivel, number> = { contiene: 0, trazas: 1, etiqueta: 2 };

function nivelDe(
  pref: PreferenciaSalud,
  ficha: SaludProducto,
): Pick<Aviso, 'nivel' | 'via'> | null {
  const enAlergenos = ficha.alergenos.includes(pref.etiquetaOff);
  const enTrazas = !enAlergenos && ficha.trazas.includes(pref.etiquetaOff);
  if (!enAlergenos && !enTrazas) return null;

  // La única etiqueta que se mira, y solo para BAJAR el tono, no para quitar el aviso.
  // «Sin gluten» y «para celíacos» ni se miran: no pueden pesar más que un «contiene».
  if (pref.clave === 'lactose' && ficha.etiquetas.includes('en:no-lactose')) {
    return { nivel: 'etiqueta', via: enAlergenos ? 'contiene' : 'trazas' };
  }
  return { nivel: enAlergenos ? 'contiene' : 'trazas' };
}

/**
 * Qué avisar de un producto a quien evita `prefs`.
 *
 * Sin preferencias no se evalúa nada: ni avisos ni «sin datos». Los avisos de lo que la
 * ficha SÍ declara salen siempre, tenga o no datos completos: que falten los
 * ingredientes no quita que el alérgeno conste. `sinDatos` es lo otro: que haya
 * preferencias sin aviso y no se puedan descartar.
 *
 * `prefs` puede traer repetidos o claves que no existen: se ignoran.
 */
export function evaluarSalud(
  prefs: readonly string[],
  ficha: SaludProducto | null | undefined,
): Evaluacion {
  const elegidas = PREFERENCIAS_SALUD.filter((p) => prefs.includes(p.clave));
  if (elegidas.length === 0) return { avisos: [], sinDatos: false };

  const fiable = ficha != null && ficha.deOff && ficha.consta;

  const avisos: Aviso[] = [];
  if (fiable) {
    for (const pref of elegidas) {
      const nivel = nivelDe(pref, ficha);
      if (nivel) avisos.push({ pref: pref.clave, ...nivel });
    }
  }
  avisos.sort((a, b) => ORDEN_NIVEL[a.nivel] - ORDEN_NIVEL[b.nivel]);

  const completa = fiable && ficha.ingredientes !== null && !ficha.descartado;
  const hayAlgoSinAviso = elegidas.some((p) => !avisos.some((a) => a.pref === p.clave));
  return { avisos, sinDatos: !completa && hayAlgoSinAviso };
}

// ── Cómo se dice ──────────────────────────────────────────────────────────

export type NivelLinea = Nivel | 'sin_datos';

/** Una línea ya escrita, lista para pintar o para leer en voz alta. */
export type LineaAviso = { nivel: NivelLinea; texto: string };

/** Quién lo dice, para los sitios con sitio: los avisos salen de OFF, no de Opsi. */
export const ATRIBUCION_SALUD = 'Según Open Food Facts.';

/**
 * Las líneas de un aviso: «Contiene gluten y leche.», «Trazas de huevo.», lo de la
 * lactosa y, por último, lo que no se sabe. Escalón 4 de `docs/VOZ.md`: frases
 * cortas, sin atenuadores, sin paréntesis y sin una palabra que suene a visto bueno.
 *
 * Agrupa los nombres por nivel (una línea de «Contiene» y no una por alérgeno) y no
 * repite: con «leche» y «lactosa» marcadas, ambas dicen «Contiene leche» y sale una.
 */
export function lineasDeAviso(evaluacion: Evaluacion): LineaAviso[] {
  const lineas: LineaAviso[] = [];

  const nombresDe = (nivel: Nivel): string[] => {
    const nombres: string[] = [];
    for (const aviso of evaluacion.avisos) {
      const nombre = POR_CLAVE.get(aviso.pref)?.nombre;
      if (aviso.nivel === nivel && nombre && !nombres.includes(nombre)) nombres.push(nombre);
    }
    return nombres;
  };

  const contiene = nombresDe('contiene');
  if (contiene.length > 0) lineas.push({ nivel: 'contiene', texto: `Contiene ${unir(contiene)}.` });

  const trazas = nombresDe('trazas');
  if (trazas.length > 0) lineas.push({ nivel: 'trazas', texto: `Trazas de ${unir(trazas)}.` });

  for (const aviso of evaluacion.avisos) {
    if (aviso.nivel !== 'etiqueta') continue;
    const lleva = aviso.via === 'trazas' ? 'Trazas de leche' : 'Lleva leche';
    lineas.push({ nivel: 'etiqueta', texto: `${lleva}. Open Food Facts dice sin lactosa.` });
  }

  if (evaluacion.sinDatos) {
    lineas.push({
      nivel: 'sin_datos',
      texto: evaluacion.avisos.length > 0 ? 'Sin datos de otros alérgenos.' : 'Sin datos de alérgenos.',
    });
  }
  return lineas;
}

/**
 * ¿Hace falta decir que esto sale de Open Food Facts? Sí si hay un «contiene» o unas
 * trazas, que no lo dicen. El aviso de la lactosa ya lo dice en su propia frase, y «sin
 * datos» no sale de ningún sitio: repetirlo ahí sería ruido.
 */
export function necesitaAtribucion(evaluacion: Evaluacion): boolean {
  return evaluacion.avisos.some((a) => a.nivel === 'contiene' || a.nivel === 'trazas');
}

/** Lo mismo, de corrido, para el lector de pantalla. Con `atribuir`, dice de dónde sale. */
export function textoDeAviso(evaluacion: Evaluacion, atribuir = false): string {
  const texto = lineasDeAviso(evaluacion)
    .map((l) => l.texto)
    .join(' ');
  return atribuir && necesitaAtribucion(evaluacion) ? `${texto} ${ATRIBUCION_SALUD}` : texto;
}
