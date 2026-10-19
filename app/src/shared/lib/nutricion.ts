/**
 * Nutrición de un producto (Opsi Premium ⭐): Nutri-Score, grupo NOVA, valores por 100 g o
 * 100 ml, niveles, ración y aditivos. Todo sale de Open Food Facts (OFF).
 *
 * Opsi no es nutricionista (docs/VOZ.md): aquí no hay una sola frase que diga si algo es
 * sano, ni cuánto conviene comer. Se enseña lo que OFF declara, con su origen, y se calla
 * lo demás. Los niveles («bajo», «moderado», «alto») y los nombres de los grupos NOVA son
 * los de OFF y siempre van atribuidos.
 *
 * Sin JSX ni imports de valor con alias, para poder probarlo con Node tal cual
 * (`nutricion.test.ts`). Los textos viven aquí, junto a la lectura, y no repartidos por las
 * pantallas: así el mismo dato se dice igual en la lista, en el detalle y en la hoja de la
 * ficha, y las reglas de abajo se pueden probar sin pintar nada.
 *
 * ── Las reglas que no se negocian ─────────────────────────────────────────
 *
 *   1. **Un dato que falta NUNCA es un cero.** `energy_kcal = 0` quiere decir que OFF
 *      declara cero; un NULL quiere decir que ese dato no consta. Se leen como `0` y `null`
 *      y se pintan como «0 g» y «—». Convertir uno en el otro cambia lo que la etiqueta dice.
 *   2. **Tres estados, no dos.** Sin fila en la base de datos (la ficha es anterior a estos
 *      datos, o se escribió a mano) = «no consta». Una fila con todo NULL = OFF se consultó
 *      y no declara nada. Una fila con valores = lo que OFF declara. Las dos primeras se
 *      dicen igual en pantalla («Sin datos nutricionales»), pero solo la primera se puede
 *      renovar consultando a OFF otra vez.
 *   3. **Nunca «sin aditivos» como afirmación propia** (docs/VOZ.md §4, regla 9). Se dice lo
 *      que OFF declara: «Open Food Facts no declara aditivos». Y una lista que OFF no da es
 *      NULL, no vacía: ahí no se dice nada.
 *
 * ── Entrada no confiable ──────────────────────────────────────────────────
 *
 * Los datos salen de un wiki que edita cualquiera. El servidor los filtra dos veces
 * (`lookup-barcode` y `upsert_product_nutrition`) y los CHECK de la tabla una tercera, pero
 * aquí se vuelven a comprobar (`leerNutricion`): lo que no cuadra se queda en `null`, nunca
 * en 0 ni en NaN, y todo se pinta como texto plano. La app no confía en que el servidor sea
 * lo único entre OFF y la pantalla.
 */

// ── Qué se lee ────────────────────────────────────────────────────────────

export const GRADOS_NUTRISCORE = ['a', 'b', 'c', 'd', 'e'] as const;
export type GradoNutriScore = (typeof GRADOS_NUTRISCORE)[number];

export type GrupoNova = 1 | 2 | 3 | 4;

/** Los tres niveles que calcula OFF. En pantalla: «bajo», «moderado», «alto». */
export type NivelOff = 'low' | 'moderate' | 'high';

/** De qué son los valores: por 100 g o por 100 ml. */
export type BaseNutricional = 'g' | 'ml';

/**
 * La nutrición de un producto, ya limpia. Todo lo que no cuadró es `null`.
 *
 * `aditivos` distingue dos cosas que no son lo mismo: `null` es «OFF no da la lista» y `[]`
 * es «OFF la da y está vacía». Los códigos ya van en el formato que se pinta («E330»).
 */
export type Nutricion = {
  readonly nutriscore: GradoNutriScore | null;
  readonly nova: GrupoNova | null;
  readonly base: BaseNutricional | null;
  readonly energiaKcal: number | null;
  readonly grasas: number | null;
  readonly saturadas: number | null;
  readonly hidratos: number | null;
  readonly azucares: number | null;
  readonly fibra: number | null;
  readonly proteinas: number | null;
  readonly sal: number | null;
  readonly nivelGrasas: NivelOff | null;
  readonly nivelSaturadas: NivelOff | null;
  readonly nivelAzucares: NivelOff | null;
  readonly nivelSal: NivelOff | null;
  readonly racion: string | null;
  readonly aditivos: readonly string[] | null;
};

/**
 * Una nutrición sin ningún dato. Congelada: es una constante compartida y nadie debe poder
 * cambiarla. Es lo que sale de leer algo que no es una fila.
 */
export const SIN_DATOS_DE_NUTRICION: Nutricion = Object.freeze({
  nutriscore: null,
  nova: null,
  base: null,
  energiaKcal: null,
  grasas: null,
  saturadas: null,
  hidratos: null,
  azucares: null,
  fibra: null,
  proteinas: null,
  sal: null,
  nivelGrasas: null,
  nivelSaturadas: null,
  nivelAzucares: null,
  nivelSal: null,
  racion: null,
  aditivos: null,
});

// ── Lo que se acepta ──────────────────────────────────────────────────────

/** Los rangos de la tabla: energía de 0 a 950 kcal (la grasa pura son 900), el resto de 0 a 100 g. */
const MAX_ENERGIA = 950;
const MAX_NUTRIENTE = 100;
const MAX_RACION = 60;
const MAX_ADITIVOS = 60;
/** `en:e` + de 3 a 4 cifras + hasta 4 letras (las subformas, p. ej. `en:e331iii`): el formato del servidor. */
const FORMATO_ADITIVO = /^en:e[0-9]{3,4}[a-z]{0,4}$/;
/** Lo más largo que puede medir un código válido, para no pasar la expresión por un texto enorme. */
const MAX_LARGO_ADITIVO = 12;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const NIVELES: ReadonlySet<string> = new Set<NivelOff>(['low', 'moderate', 'high']);

/**
 * Lo que el servidor prohíbe en un texto (la misma clase que `upsert_product_nutrition`):
 * controles y DEL, el bloque C1, el guion blando, los espacios de ancho cero y las marcas
 * direccionales, los separadores de línea y de párrafo y el formato bidireccional, los
 * invisibles de U+2060 a U+206F, el BOM y el marcado (`<` y `>`). Además, lo que la
 * revisión de seguridad encontró que pasaba sin quitarse: la marca de letra árabe (U+061C),
 * el separador mongol (U+180E), las anotaciones interlineales (U+FFF9 a U+FFFB), las zonas
 * de uso privado y el bloque de «etiquetas» (U+E0000 a U+E007F), que no se ve y sirve para
 * esconder instrucciones dentro de un texto. Un texto con alguno no salió de la función: se
 * tira entero en vez de arreglarlo.
 *
 * Se mira por código de carácter, como en `salud.ts`: así cada rango se lee como número y
 * nadie tiene que fiarse de unos caracteres invisibles pegados en un fichero. Los de fuera
 * del plano básico llegan como dos unidades (pareja sustituta): se tira la pareja alta de
 * los planos 14 a 16 (0xDB40 y de 0xDB80 a 0xDBFF).
 */
function tieneProhibidos(texto: string): boolean {
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (
      c <= 0x1f ||
      (c >= 0x7f && c <= 0x9f) ||
      c === 0xad ||
      c === 0x61c ||
      c === 0x180e ||
      (c >= 0x200b && c <= 0x200f) ||
      (c >= 0x2028 && c <= 0x202e) ||
      (c >= 0x2060 && c <= 0x206f) ||
      (c >= 0xe000 && c <= 0xf8ff) ||
      (c >= 0xfff9 && c <= 0xfffb) ||
      c === 0xfeff ||
      c === 0xdb40 ||
      (c >= 0xdb80 && c <= 0xdbff) ||
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
 * Solo lo que la fila tiene EN PROPIO. Una clave heredada (un prototipo contaminado, un
 * objeto creado con `Object.create`) no es un dato de la base de datos y no se lee.
 */
function propio(fila: Record<string, unknown>, clave: string): unknown {
  return Object.prototype.hasOwnProperty.call(fila, clave) ? fila[clave] : undefined;
}

/**
 * Un número finito entre 0 y `max`. Lo demás —un texto, un NaN, un Infinity, un negativo, un
 * objeto, algo fuera de rango— es `null`: ni 0, ni el número recortado al límite.
 */
function leerNumero(valor: unknown, max: number): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > max) return null;
  // `-0` pasa el rango y se pintaría «-0»: se normaliza.
  return valor === 0 ? 0 : valor;
}

function leerGrado(valor: unknown): GradoNutriScore | null {
  return typeof valor === 'string' && (GRADOS_NUTRISCORE as readonly string[]).includes(valor)
    ? (valor as GradoNutriScore)
    : null;
}

function leerNova(valor: unknown): GrupoNova | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 4
    ? (valor as GrupoNova)
    : null;
}

function leerBase(valor: unknown): BaseNutricional | null {
  return valor === 'g' || valor === 'ml' ? valor : null;
}

function leerNivel(valor: unknown): NivelOff | null {
  return typeof valor === 'string' && NIVELES.has(valor) ? (valor as NivelOff) : null;
}

/** La ración: texto de 1 a 60 sin caracteres de control, de formato ni marcado. Se recorta al final. */
function leerRacion(valor: unknown): string | null {
  // Crudo y antes de recortar: `trim()` se llevaría por delante un salto de línea o un BOM
  // de los extremos, que son justo lo que no debería haber.
  if (typeof valor !== 'string' || valor.length === 0 || valor.length > MAX_RACION) return null;
  if (tieneProhibidos(valor)) return null;
  const limpio = valor.trim();
  return limpio.length > 0 ? limpio : null;
}

/**
 * Los aditivos como se pintan: `en:e330` → «E330», `en:e150d` → «E150D».
 *
 * Una lista con UN solo elemento que no cuadre (o más de 60) se tira ENTERA y vale `null`,
 * no se queda con lo que sí cuadraba: «OFF declara 4 aditivos» sería mentira si eran 5, y no
 * saber la lista es el único lado seguro. Los repetidos sí se quitan, que no cambian lo que
 * se dice.
 */
function leerAditivos(valor: unknown): readonly string[] | null {
  if (!Array.isArray(valor) || valor.length > MAX_ADITIVOS) return null;
  const codigos: string[] = [];
  for (let i = 0; i < valor.length; i++) {
    const etiqueta: unknown = valor[i];
    if (
      typeof etiqueta !== 'string' ||
      etiqueta.length > MAX_LARGO_ADITIVO ||
      !FORMATO_ADITIVO.test(etiqueta)
    ) {
      return null;
    }
    const codigo = etiqueta.slice(3).toUpperCase();
    if (!codigos.includes(codigo)) codigos.push(codigo);
  }
  return Object.freeze(codigos);
}

/**
 * De una fila de `product_nutrition` (lo que devuelve `nutrition_of_products`) a una
 * nutrición limpia. Nunca lanza.
 *
 * Solo mira las claves que conoce y solo las que la fila tiene en propio. Lo que no es un
 * objeto da `SIN_DATOS_DE_NUTRICION`.
 */
export function leerNutricion(fila: unknown): Nutricion {
  if (!esObjeto(fila)) return SIN_DATOS_DE_NUTRICION;
  const dato = (clave: string): unknown => propio(fila, clave);

  return Object.freeze({
    nutriscore: leerGrado(dato('nutriscore_grade')),
    nova: leerNova(dato('nova_group')),
    base: leerBase(dato('basis')),
    energiaKcal: leerNumero(dato('energy_kcal'), MAX_ENERGIA),
    grasas: leerNumero(dato('fat'), MAX_NUTRIENTE),
    saturadas: leerNumero(dato('saturated_fat'), MAX_NUTRIENTE),
    hidratos: leerNumero(dato('carbohydrates'), MAX_NUTRIENTE),
    azucares: leerNumero(dato('sugars'), MAX_NUTRIENTE),
    fibra: leerNumero(dato('fiber'), MAX_NUTRIENTE),
    proteinas: leerNumero(dato('proteins'), MAX_NUTRIENTE),
    sal: leerNumero(dato('salt'), MAX_NUTRIENTE),
    nivelGrasas: leerNivel(dato('fat_level')),
    nivelSaturadas: leerNivel(dato('saturated_fat_level')),
    nivelAzucares: leerNivel(dato('sugars_level')),
    nivelSal: leerNivel(dato('salt_level')),
    racion: leerRacion(dato('serving_size')),
    aditivos: leerAditivos(dato('additives_tags')),
  });
}

// ── Qué hay ───────────────────────────────────────────────────────────────

/** ¿Hay algún valor de la tabla? Sin ninguno la tabla entera sería guiones, y no se pinta. */
export function hayNutrientes(n: Nutricion): boolean {
  return [n.energiaKcal, n.grasas, n.saturadas, n.hidratos, n.azucares, n.fibra, n.proteinas, n.sal].some(
    (valor) => valor !== null,
  );
}

/**
 * ¿Hay algo que enseñar? Una fila con todo en `null` —OFF se consultó y no declara nada—
 * dice lo mismo que no tener fila: «Sin datos nutricionales». Una lista de aditivos VACÍA no
 * cuenta: «OFF no declara aditivos» no es un dato nutricional, y una ficha con solo eso no
 * tiene nada que enseñar.
 */
export function hayDatos(n: Nutricion): boolean {
  return (
    n.nutriscore !== null ||
    n.nova !== null ||
    hayNutrientes(n) ||
    n.nivelGrasas !== null ||
    n.nivelSaturadas !== null ||
    n.nivelAzucares !== null ||
    n.nivelSal !== null ||
    n.racion !== null ||
    (n.aditivos !== null && n.aditivos.length > 0)
  );
}

// ── Los ids, de un lado a otro ────────────────────────────────────────────

/** Cuántos ids acepta `nutrition_of_products` por llamada. Con más, el servidor rechaza. */
export const MAX_IDS_POR_LLAMADA = 200;

/** Un uuid en minúsculas, o null. Los ids vuelven de Postgres así; así se buscan. */
export function idDeProducto(valor: unknown): string | null {
  return typeof valor === 'string' && UUID.test(valor) ? valor.toLowerCase() : null;
}

/**
 * Los ids que se van a pedir, en trozos de `MAX_IDS_POR_LLAMADA`. Sin repetidos, solo los que
 * son uuid y en minúsculas. Sin ids no hay trozos: no se hace ni una llamada.
 */
export function trocearIds(ids: readonly unknown[]): string[][] {
  const unicos = new Set<string>();
  for (const id of ids) {
    const limpio = idDeProducto(id);
    if (limpio !== null) unicos.add(limpio);
  }
  const todos = [...unicos];
  const trozos: string[][] = [];
  for (let i = 0; i < todos.length; i += MAX_IDS_POR_LLAMADA) {
    trozos.push(todos.slice(i, i + MAX_IDS_POR_LLAMADA));
  }
  return trozos;
}

/**
 * Las filas que devuelve el servidor, por id de producto. SIN prototipo: la clave sale de
 * fuera, y en un objeto normal un `__proto__` o un `constructor` serían una clave con
 * significado. Con la clave comprobada como uuid ya no podría llegar uno, pero el objeto sin
 * prototipo no depende de que alguien se acuerde.
 *
 * Un producto que no está aquí NO CONSTA: no es lo mismo que uno con todo en `null`.
 */
export function agruparNutricion(filas: readonly unknown[]): Record<string, Nutricion> {
  const porProducto = Object.create(null) as Record<string, Nutricion>;
  for (const fila of filas) {
    if (!esObjeto(fila)) continue;
    const id = idDeProducto(propio(fila, 'product_id'));
    if (id !== null) porProducto[id] = leerNutricion(fila);
  }
  return porProducto;
}

// ── Cómo se dice ──────────────────────────────────────────────────────────

/** El hueco de un dato que no consta. Nunca un cero. */
export const SIN_DATO = '—';

export const SIN_DATOS = 'Sin datos nutricionales';
export const SIN_SELLOS = 'Sin Nutri-Score ni grupo NOVA';
export const SIN_NUTRISCORE = 'Open Food Facts no calcula el Nutri-Score de este producto.';
export const SIN_NOVA = 'Open Food Facts no da el grupo NOVA de este producto.';

/** De dónde sale cada sello, a la vista junto a él. */
export const ORIGEN_NUTRISCORE = 'Nutri-Score calculado por Open Food Facts';
export const ORIGEN_NOVA = 'Grupo NOVA según Open Food Facts';

/** El origen de los sellos de la lista, donde no cabe uno por fila. */
export const ORIGEN_LISTA = 'Nutri-Score y grupo NOVA según Open Food Facts.';

/** La línea que siempre se ve, con o sin datos. Open Food Facts es un wiki: se equivoca. */
export const AVISO_INCOMPLETO =
  'Open Food Facts puede estar incompleto o desactualizado. Mira siempre la etiqueta.';
export const LICENCIA_ODBL = 'Datos de Open Food Facts, bajo licencia ODbL.';

/**
 * 12.5 → «12,5», 12 → «12», 0.07 → «0,07». Con coma y sin decimales que no aportan.
 * Lo que no sea una cantidad por 100 g o 100 ml (null, NaN, Infinity, negativo, más de 950)
 * da `null`: quien lo pinta pone «—», nunca un cero.
 */
function numeroConComa(valor: number | null, maxDecimales: number): string | null {
  if (valor === null || !Number.isFinite(valor) || valor < 0 || valor > MAX_ENERGIA) return null;
  return String(Number(valor.toFixed(maxDecimales))).replace('.', ',');
}

/** «12,5 g», o «—» si no consta. Hasta dos decimales: la tabla guarda dos y 0,07 g de sal no es 0,1. */
export function formatearGramos(valor: number | null): string {
  const numero = numeroConComa(valor, 2);
  return numero === null ? SIN_DATO : `${numero} g`;
}

/** «245 kcal», o «—» si no consta. Hasta un decimal. */
export function formatearEnergia(valor: number | null): string {
  const numero = numeroConComa(valor, 1);
  return numero === null ? SIN_DATO : `${numero} kcal`;
}

/** El encabezado de la tabla. Sin base («no se sabe») no se inventa: «Por 100 g o 100 ml». */
export function etiquetaBase(base: BaseNutricional | null): string {
  if (base === 'g') return 'Por 100 g';
  if (base === 'ml') return 'Por 100 ml';
  return 'Por 100 g o 100 ml';
}

/** El nivel de OFF, en palabras. */
export function textoNivel(nivel: NivelOff): string {
  if (nivel === 'low') return 'bajo';
  if (nivel === 'moderate') return 'moderado';
  return 'alto';
}

/**
 * Los nombres de los cuatro grupos NOVA, los de su clasificación y tal cual: ni un adjetivo
 * más (docs/VOZ.md). Aparecen siempre junto a «según Open Food Facts».
 */
export const NOMBRES_NOVA: Readonly<Record<GrupoNova, string>> = Object.freeze({
  1: 'Sin procesar o mínimamente procesado',
  2: 'Ingrediente culinario procesado',
  3: 'Procesado',
  4: 'Ultraprocesado',
});

export function nombreNova(grupo: GrupoNova): string {
  return NOMBRES_NOVA[grupo];
}

/** Para el lector de pantalla, todo el sello en una frase: la letra, de dónde sale. */
export function etiquetaNutriScore(grado: GradoNutriScore): string {
  return `Nutri-Score ${grado.toUpperCase()}, calculado por Open Food Facts`;
}

export function etiquetaNova(grupo: GrupoNova): string {
  return `Grupo NOVA ${grupo}: ${nombreNova(grupo)}, según Open Food Facts`;
}

/** Cuántos aditivos declara OFF. `null` si no da la lista. */
export function contarAditivos(aditivos: readonly string[] | null): number | null {
  return aditivos === null ? null : aditivos.length;
}

/**
 * Lo que OFF declara de aditivos, o `null` si no hay nada que decir (OFF no da la lista).
 * Nunca «sin aditivos»: con la lista vacía se dice que OFF no los declara, y de quién es.
 */
export function textoAditivos(aditivos: readonly string[] | null): string | null {
  const total = contarAditivos(aditivos);
  if (aditivos === null || total === null) return null;
  if (total === 0) return 'Open Food Facts no declara aditivos.';
  return `Open Food Facts declara ${total} ${total === 1 ? 'aditivo' : 'aditivos'}: ${aditivos.join(', ')}.`;
}

/** «Ración: 30 g», o null si no la trae. Es el texto de OFF tal cual, ya limpio. */
export function textoRacion(racion: string | null): string | null {
  return racion === null ? null : `Ración: ${racion}`;
}

/** Una fila de la tabla de «Información nutricional», ya escrita. */
export type FilaNutricional = {
  clave: 'energia' | 'grasas' | 'saturadas' | 'hidratos' | 'azucares' | 'fibra' | 'proteinas' | 'sal';
  etiqueta: string;
  /** Cuelga de la de arriba («de las cuales saturadas»): se pinta sangrada. */
  subfila: boolean;
  /** «12,5 g» o «—». */
  valor: string;
  /** «Nivel alto», si OFF lo da para este nutriente. */
  nivel: string | null;
  /** La fila de una vez para el lector de pantalla: «Fibra: no consta». */
  lectura: string;
};

function filaDeTabla(
  clave: FilaNutricional['clave'],
  etiqueta: string,
  subfila: boolean,
  valor: string,
  nivel: NivelOff | null,
): FilaNutricional {
  const nivelDicho = nivel === null ? null : `Nivel ${textoNivel(nivel)}`;
  const dicho = valor === SIN_DATO ? 'no consta' : valor;
  return {
    clave,
    etiqueta,
    subfila,
    valor,
    nivel: nivelDicho,
    lectura: `${etiqueta}: ${dicho}${nivelDicho === null ? '' : `. ${nivelDicho}, según Open Food Facts`}`,
  };
}

/**
 * Las ocho filas de la tabla, en el orden de una etiqueta. Un valor que no consta sale como
 * «—». La tabla entera solo se pinta si hay algún valor (`hayNutrientes`).
 */
export function filasNutricionales(n: Nutricion): FilaNutricional[] {
  return [
    filaDeTabla('energia', 'Energía', false, formatearEnergia(n.energiaKcal), null),
    filaDeTabla('grasas', 'Grasas', false, formatearGramos(n.grasas), n.nivelGrasas),
    filaDeTabla('saturadas', 'de las cuales saturadas', true, formatearGramos(n.saturadas), n.nivelSaturadas),
    filaDeTabla('hidratos', 'Hidratos de carbono', false, formatearGramos(n.hidratos), null),
    filaDeTabla('azucares', 'de los cuales azúcares', true, formatearGramos(n.azucares), n.nivelAzucares),
    filaDeTabla('fibra', 'Fibra', false, formatearGramos(n.fibra), null),
    filaDeTabla('proteinas', 'Proteínas', false, formatearGramos(n.proteinas), null),
    filaDeTabla('sal', 'Sal', false, formatearGramos(n.sal), n.nivelSal),
  ];
}

/**
 * Lo que dice una fila de la lista, para el lector de pantalla: los sellos que hay con su
 * origen, o que no hay datos. Sin nutrición (no consta, o todavía cargando) es «Sin datos».
 */
export function resumenNutricion(n: Nutricion | null | undefined): string {
  if (!n || !hayDatos(n)) return `${SIN_DATOS}.`;
  const partes: string[] = [];
  if (n.nutriscore !== null) partes.push(etiquetaNutriScore(n.nutriscore));
  if (n.nova !== null) partes.push(etiquetaNova(n.nova));
  return partes.length > 0 ? `${partes.join('. ')}.` : `${SIN_SELLOS}.`;
}

// ── El buscador ───────────────────────────────────────────────────────────

/**
 * Un texto listo para comparar: sin tildes, sin mayúsculas y con los espacios en uno. «Café»,
 * «cafe» y «CAFÉ» son lo mismo. La eñe también pierde la tilde («piña» → «pina»): quien
 * busca desde un teclado sin tildes tampoco tiene la eñe.
 */
export function normalizarBusqueda(texto: unknown): string {
  if (typeof texto !== 'string') return '';
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ¿Algún campo contiene la búsqueda? `busqueda` ya viene normalizada (se normaliza una vez
 * por pulsación y no una por fila). Una búsqueda vacía lo deja pasar todo.
 */
export function coincideConBusqueda(
  busqueda: string,
  ...campos: readonly (string | null | undefined)[]
): boolean {
  if (busqueda === '') return true;
  return campos.some((campo) => typeof campo === 'string' && normalizarBusqueda(campo).includes(busqueda));
}
