/**
 * Open Food Facts: la consulta y, sobre todo, la desconfianza.
 *
 * OFF es una base de datos que EDITA CUALQUIERA. Todo lo que devuelve es entrada
 * no confiable: un nombre con saltos de línea, una marca con caracteres que
 * invierten el sentido del texto, una URL de imagen que apunta a otro dominio, o
 * una frase pensada para que un modelo la obedezca el día que el chat la lea. Y lo
 * que aquí se guarda lo ve todo el mundo, porque la caché del catálogo es global.
 *
 * Por eso este módulo tiene dos mitades que no se mezclan:
 *
 *   · `normalizarRespuestaOff` —pura— se queda con un SUBCONJUNTO de campos y cada
 *     uno pasa por su filtro (texto limpio y con tope, imagen solo de un dominio,
 *     categorías, alérgenos y trazas con un formato exacto, etiquetas de salud solo
 *     de una lista cerrada, ingredientes limpios y recortados, y la nutrición: números
 *     solo si son `number` finitos y están en rango, listas cerradas para Nutri-Score,
 *     NOVA y semáforos). Lo demás se tira. Es lo que se prueba con fixtures.
 *   · `consultarOff` hace la llamada, con el host fijo en el código, sin seguir
 *     redirecciones, con tiempo máximo y con tope de tamaño.
 *
 * Sin dependencias de Deno: se prueba con `node --test`.
 */

export type FamiliaUnidad = 'mass' | 'volume' | 'count';

/** Lo ÚNICO que sale de aquí hacia la base de datos. Todo ya filtrado. */
export type ProductoOff = {
  name: string;
  brand: string | null;
  unitFamily: FamiliaUnidad | null;
  /** En unidad base: gramos, mililitros o piezas. */
  netQuantity: number | null;
  imageUrl: string | null;
  categoriesTags: string[];
  /**
   * Datos de salud. Las tres listas son SIEMPRE arrays (vacíos si OFF no declara
   * nada) porque llegar aquí significa que OFF se acaba de consultar; que se guarden
   * como «consultado» o como «no consta» lo decide la base de datos con
   * `health_data_at`. Los ingredientes sí pueden faltar.
   */
  allergensTags: string[];
  tracesTags: string[];
  /** Solo las de `ETIQUETAS_DE_SALUD`. */
  labelsTags: string[];
  ingredientsText: string | null;
  /**
   * Nutrición (Opsi Premium). Va a OTRA tabla, por `upsert_product_nutrition`, y nunca
   * al `off_payload` ni a la respuesta de `lookup-barcode`: ver `NutricionOff`.
   */
  nutrition: NutricionOff;
};

export type NutriScore = 'a' | 'b' | 'c' | 'd' | 'e';
export type NivelNutriente = 'low' | 'moderate' | 'high';

/**
 * La nutrición de una ficha de OFF, ya filtrada. Todo es opcional (null = «OFF no lo da»,
 * que NO es cero) y llegar aquí significa que OFF se acaba de consultar: aunque todo sea
 * null se guarda la fila, para no volver a preguntar en cada escaneo. Que la nutrición
 * «conste» o «no conste» lo decide la base de datos con la existencia de la fila.
 *
 * Los valores son por 100 g o por 100 ml (`basis`), con dos decimales: energía de 0 a 950
 * kcal y el resto de 0 a 100 g. Las mismas reglas las revalida `upsert_product_nutrition`.
 */
export type NutricionOff = {
  nutriscoreGrade: NutriScore | null;
  novaGroup: 1 | 2 | 3 | 4 | null;
  /** 'g' si el producto se mide en masa, 'ml' si en volumen; null si no se sabe. */
  basis: 'g' | 'ml' | null;
  energyKcal: number | null;
  fat: number | null;
  saturatedFat: number | null;
  carbohydrates: number | null;
  sugars: number | null;
  fiber: number | null;
  proteins: number | null;
  salt: number | null;
  fatLevel: NivelNutriente | null;
  saturatedFatLevel: NivelNutriente | null;
  sugarsLevel: NivelNutriente | null;
  saltLevel: NivelNutriente | null;
  servingSize: string | null;
  /**
   * Códigos tipo `en:e330`. null = no se sabe (OFF no da la lista, o la da vacía pero la ficha
   * no trae ingredientes: OFF solo analiza aditivos a partir de ellos); [] = lista vacía CON
   * ingredientes. Ver `aditivosDeLaFicha`.
   */
  additivesTags: string[] | null;
};

export type ResultadoOff =
  | { tipo: 'encontrado'; producto: ProductoOff }
  | { tipo: 'no_existe' }
  /** El código existe, pero en otra base de la familia (cosmética, mascotas, otros): no es comida. */
  | { tipo: 'no_es_comida' }
  | { tipo: 'error'; motivo: string };

// ── Límites ───────────────────────────────────────────────────────────────

export const MAX_NOMBRE = 120;
export const MAX_MARCA = 80;
const MAX_IMAGEN = 300;
/** Tope de etiquetas por lista (categorías, alérgenos, trazas): el mismo que revalida la base de datos. */
const MAX_ETIQUETAS = 40;
export const MAX_INGREDIENTES = 2000;
/**
 * Las únicas `labels_tags` de OFF que se guardan: «sin gluten», «sin lactosa» y la
 * marca de aptitud para celiacos (otra rama de la taxonomía: sus certificaciones
 * cuelgan de ella y no de `en:no-gluten`). Comprobadas contra la taxonomía pública de
 * OFF. OFF añade a `labels_tags` los padres de cada etiqueta, así que una variante
 * («certified-gluten-free», «sin-tacc») ya trae `en:no-gluten`. La lista está también
 * en la base de datos (`upsert_global_product` y `products_health_limits_ck`); una
 * prueba comprueba que coinciden.
 */
export const ETIQUETAS_DE_SALUD: readonly string[] = [
  'en:no-gluten',
  'en:no-lactose',
  'en:suitable-for-celiacs',
];
/** Más que esto de cantidad es un error de la ficha, no un producto. */
const MAX_CANTIDAD = 1_000_000;
/** Nutrición: los mismos topes que revalida `upsert_product_nutrition` y los CHECK de la tabla. */
export const MAX_KCAL = 950;
export const MAX_NUTRIENTE = 100;
export const MAX_RACION = 60;
export const MAX_ADITIVOS = 60;
/** Margen por el redondeo de OFF: las saturadas pueden pasarse de las grasas en 0,5 g, y los azúcares de los hidratos. */
const MARGEN_PARES_CENTESIMAS = 50;

// ── Texto ─────────────────────────────────────────────────────────────────

/**
 * Deja un texto de OFF listo para guardar y enseñar, o null si no queda nada.
 *
 *   1. Todo espacio (saltos de línea y tabuladores incluidos) pasa a UN espacio:
 *      un nombre de una línea no puede colar un párrafo en un prompt.
 *   2. Se borran los caracteres de control, los de formato —que incluyen los
 *      bidireccionales (U+202A–202E, U+2066–2069) con los que se reordena el texto
 *      al pintarlo, y los de ancho cero— y los de uso privado.
 *   3. Se quitan `<` y `>`: nada de lo que se guarda necesita marcado.
 *   4. Tope de longitud en caracteres, sin partir un par sustituto.
 */
export function limpiarTexto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null;
  // Se corta ANTES de procesar: no tiene sentido normalizar un megabyte.
  const bruto = valor.length > max * 8 ? valor.slice(0, max * 8) : valor;
  const limpio = bruto
    .normalize('NFC')
    .replace(/\s+/gu, ' ')
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, '')
    .replace(/[<>]/g, '')
    .trim();
  if (limpio === '') return null;
  const cortado = Array.from(limpio).slice(0, max).join('').trim();
  return cortado === '' ? null : cortado;
}

/**
 * Los ingredientes: lo mismo que `limpiarTexto` con dos diferencias.
 *
 *   · Sin guiones bajos. OFF marca los alérgenos con `_leche_`; en una pantalla no
 *     son más que ruido. Se quitan ANTES de limpiar, para que el recorte no los
 *     cuente.
 *   · Si no cabe, no se corta en seco: acaba en «…», dentro del límite. Así quien lo
 *     lee sabe que falta texto, y no parece que la lista de ingredientes terminara
 *     ahí (que es lo que importa cuando se busca un alérgeno).
 */
export function limpiarIngredientes(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  // Se acota antes de procesar, como en `limpiarTexto`.
  const acotado = valor.length > MAX_INGREDIENTES * 8 ? valor.slice(0, MAX_INGREDIENTES * 8) : valor;
  // Se pide uno más del tope: si sobra, es que hubo que recortar.
  const limpio = limpiarTexto(acotado.replace(/_/g, ''), MAX_INGREDIENTES + 1);
  if (limpio === null) return null;
  const caracteres = Array.from(limpio);
  if (caracteres.length <= MAX_INGREDIENTES) return limpio;
  return `${caracteres.slice(0, MAX_INGREDIENTES - 1).join('').trimEnd()}…`;
}

// ── Cantidad ──────────────────────────────────────────────────────────────

/** Cada unidad reconocida: su familia y cuánto vale en la unidad base. */
const UNIDADES: Record<string, { familia: FamiliaUnidad; factor: number }> = {
  kg: { familia: 'mass', factor: 1000 },
  g: { familia: 'mass', factor: 1 },
  gr: { familia: 'mass', factor: 1 },
  grs: { familia: 'mass', factor: 1 },
  mg: { familia: 'mass', factor: 0.001 },
  l: { familia: 'volume', factor: 1000 },
  lt: { familia: 'volume', factor: 1000 },
  litro: { familia: 'volume', factor: 1000 },
  litros: { familia: 'volume', factor: 1000 },
  dl: { familia: 'volume', factor: 100 },
  cl: { familia: 'volume', factor: 10 },
  ml: { familia: 'volume', factor: 1 },
  u: { familia: 'count', factor: 1 },
  ud: { familia: 'count', factor: 1 },
  uds: { familia: 'count', factor: 1 },
  un: { familia: 'count', factor: 1 },
  unidad: { familia: 'count', factor: 1 },
  unidades: { familia: 'count', factor: 1 },
  pieza: { familia: 'count', factor: 1 },
  piezas: { familia: 'count', factor: 1 },
};

export type Cantidad = { unitFamily: FamiliaUnidad; netQuantity: number };

function aCantidad(familia: FamiliaUnidad, valor: number): Cantidad | null {
  if (!Number.isFinite(valor) || valor <= 0 || valor > MAX_CANTIDAD) return null;
  return { unitFamily: familia, netQuantity: Math.round(valor * 1000) / 1000 };
}

/**
 * El campo `quantity` de OFF es texto libre y llega de todo: «1 L», «330 ml»,
 * «500g», «1,5 l», «6 x 33 cl», «400 g e» (la «e» es la marca de estimado).
 * Se reconoce el principio con una expresión de tamaño acotado y se ignora el
 * resto. Lo que no se entiende devuelve null: más vale dejar la cantidad para
 * que la ponga la persona que inventar una.
 */
export function parsearCantidad(texto: unknown): Cantidad | null {
  if (typeof texto !== 'string' || texto.length > 80) return null;
  const m =
    /^\s*(?:(\d{1,3})\s*[x×*]\s*)?(\d{1,6}(?:[.,]\d{1,3})?)(?![.,]?\d)\s*([a-zA-Z]+)?/.exec(
      texto,
    );
  if (!m) return null;
  const multiplicador = m[1] ? Number(m[1]) : 1;
  const numero = Number(m[2].replace(',', '.'));
  const unidad = m[3] ? UNIDADES[m[3].toLowerCase()] : undefined;

  // Una unidad que no se conoce («e», «oz», «lb») invalida la cantidad entera:
  // no se adivina si «12 oz» eran onzas de peso o de volumen.
  if (m[3] && !unidad) return null;
  // Un número solo («12») son piezas.
  const familia = unidad?.familia ?? 'count';
  const factor = unidad?.factor ?? 1;
  return aCantidad(familia, numero * multiplicador * factor);
}

/**
 * OFF trae además `product_quantity` (el total ya sumado) y su unidad, que es
 * siempre g o ml. Cuando están, valen más que el texto libre.
 */
function cantidadNumerica(numero: unknown, unidad: unknown): Cantidad | null {
  const valor = typeof numero === 'number' ? numero : Number(numero);
  if (typeof unidad !== 'string') return null;
  const u = unidad.toLowerCase();
  if (u === 'g') return aCantidad('mass', valor);
  if (u === 'ml') return aCantidad('volume', valor);
  return null;
}

// ── Imagen ────────────────────────────────────────────────────────────────

/** El único dominio del que se acepta una imagen. Cualquier otro se descarta. */
const DOMINIO_IMAGENES = 'images.openfoodfacts.org';

/**
 * Una URL de imagen es una orden a la app para que descargue algo. Si OFF dejara
 * poner cualquiera, el catálogo global serviría de pixel de seguimiento a quien
 * edite una ficha: cada móvil que abriera el producto avisaría a su servidor.
 */
export function imagenValida(valor: unknown): string | null {
  if (typeof valor !== 'string' || valor.length > MAX_IMAGEN) return null;
  let url: URL;
  try {
    url = new URL(valor);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.hostname !== DOMINIO_IMAGENES) return null;
  if (url.port !== '' || url.username !== '' || url.password !== '') return null;
  return url.href.length <= MAX_IMAGEN ? url.href : null;
}

// ── Etiquetas: categorías, alérgenos, trazas y etiquetas de salud ──────────

/**
 * Todas las listas de etiquetas de OFF se filtran igual: solo cuentan las que tienen
 * la forma de OFF —idioma, dos puntos y un identificador en minúsculas—, sin repetir
 * y con tope. OFF trae basura mezclada («en:Petit-déjeuners», «pt:bebidas
 * cafeína»); lo que no encaja exacto se tira.
 *
 * Con `permitidas`, además, solo se quedan las de esa lista cerrada. El filtro va
 * ANTES del tope: si fuera después, 40 etiquetas de relleno delante harían perder una
 * `en:no-gluten` que viene en el puesto 41.
 */
export function etiquetasValidas(valor: unknown, permitidas?: readonly string[]): string[] {
  if (!Array.isArray(valor)) return [];
  const vistas = new Set<string>();
  for (const etiqueta of valor) {
    if (
      typeof etiqueta === 'string' &&
      /^[a-z]{2}:[a-z0-9-]{1,80}$/.test(etiqueta) &&
      (permitidas === undefined || permitidas.includes(etiqueta))
    ) {
      vistas.add(etiqueta);
      if (vistas.size >= MAX_ETIQUETAS) break;
    }
  }
  return [...vistas];
}

/** Las categorías sirven para buscar cuánto aguanta abierto el producto una vez abierto. */
export function categoriasValidas(valor: unknown): string[] {
  return etiquetasValidas(valor);
}

// ── Nutrición ─────────────────────────────────────────────────────────────

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

/**
 * Un número de OFF listo para guardar, o null. Solo cuenta un `number` finito entre 0 y
 * `max` (un texto «12,5», un NaN, un Infinity, un negativo o un objeto son null: no se
 * adivina ni se arregla), y se deja con dos decimales. El rango se mira sobre lo que
 * llega y se redondea después, igual que hace la base de datos.
 *
 * «No lo da» es null y no 0: una ficha sin sal declarada no tiene «0 g de sal». Y un 0
 * significa «OFF declara cero»: un valor POSITIVO que al redondear a dos decimales se queda
 * en 0 (una sal de 0,004 g) no cabe en la precisión que se guarda, y se dice null en vez de
 * afirmar un cero que OFF no dijo. La base de datos no impone esto (guarda lo que llega).
 */
export function numeroEnRango(valor: unknown, max: number): number | null {
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor < 0 || valor > max) return null;
  const redondeado = Math.round(valor * 100) / 100;
  // Un cero que viene de un cero (o de un -0) es un cero; uno que viene de redondear, no.
  if (redondeado === 0) return valor === 0 ? 0 : null;
  return redondeado;
}

/** El Nutri-Score: solo de la a a la e. OFF también dice «unknown» o «not-applicable», y eso es null. */
export function nutriscoreValido(valor: unknown): NutriScore | null {
  return typeof valor === 'string' && /^[a-e]$/.test(valor) ? (valor as NutriScore) : null;
}

/** El grupo NOVA: un entero de 1 a 4. Un texto («4») o un 5 son null. */
export function novaValido(valor: unknown): 1 | 2 | 3 | 4 | null {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 4
    ? (valor as 1 | 2 | 3 | 4)
    : null;
}

/** Los semáforos de `nutrient_levels`: solo estos tres valores. */
export function nivelValido(valor: unknown): NivelNutriente | null {
  return valor === 'low' || valor === 'moderate' || valor === 'high' ? valor : null;
}

/**
 * La ración: un texto corto («30 g») y limpio, como los demás textos de OFF. Si no cabe en
 * 60 caracteres NO se recorta —«1 porción (unas 3 galletas, aproximadamente la…» no es una
 * ración—: es null.
 */
export function racionValida(valor: unknown): string | null {
  const limpia = limpiarTexto(valor, MAX_RACION + 1);
  return limpia !== null && Array.from(limpia).length <= MAX_RACION ? limpia : null;
}

/**
 * Los aditivos: códigos con el formato exacto `en:e330` / `en:e150d` / `en:e1442` /
 * `en:e331iii`, sin repetir y con tope. El sufijo admite hasta 4 letras porque OFF escribe
 * las subformas en cifras romanas (E331iii, E160aii, E450vii).
 *
 * Todo o nada: si algún elemento no es un texto con ese formato, o hay más de
 * `MAX_ADITIVOS` distintos, devuelve null. Una lista PARCIAL o truncada daría un recuento
 * menor que el real, y la app lo enseñaría como si fuera el de OFF. Tampoco es una lista
 * lo que no es un array (null: «OFF no da la lista»). Un array vacío es [].
 *
 * Ese [] todavía NO significa «sin aditivos»: ver `aditivosDeLaFicha`.
 */
export function aditivosValidos(valor: unknown): string[] | null {
  if (!Array.isArray(valor)) return null;
  const vistos = new Set<string>();
  for (const aditivo of valor) {
    if (typeof aditivo !== 'string' || !/^en:e[0-9]{3,4}[a-z]{0,4}$/.test(aditivo)) return null;
    vistos.add(aditivo);
    if (vistos.size > MAX_ADITIVOS) return null;
  }
  return [...vistos];
}

/**
 * Los aditivos de una ficha, con la regla que hace fiable la diferencia entre «no se sabe»
 * (null) y «OFF los analizó y no declara ninguno» ([]).
 *
 * OFF saca los aditivos de los ingredientes: una ficha SIN ingredientes devuelve la lista
 * vacía porque no hay nada que analizar, no porque el producto no lleve aditivos. Por eso:
 *
 *   · lista con códigos válidos                    → esos códigos
 *   · lista vacía y la ficha SIN ingredientes      → null (no se sabe)
 *   · lista vacía y la ficha CON ingredientes      → []   (OFF los analizó y no declara)
 *   · algún elemento inválido, o demasiados        → null (`aditivosValidos`: ni parcial ni
 *                                                    truncada, y nunca «ninguno»)
 *   · no es una lista                              → null
 *
 * `ingredientes` es el texto YA filtrado de la ficha (`limpiarIngredientes`), null si no hay.
 */
export function aditivosDeLaFicha(valor: unknown, ingredientes: string | null): string[] | null {
  const validos = aditivosValidos(valor);
  if (validos === null || validos.length > 0) return validos;
  // Aquí la lista es [] de verdad (cualquier elemento inválido ya habría dado null).
  return ingredientes === null ? null : [];
}

/**
 * De `nutriments` y compañía de OFF a lo único que se guarda. Cada campo pasa por su
 * filtro y uno malo es null SIN tirar la ficha entera. Dos reglas:
 *
 *   · Un par que se contradice se descarta entero: si las saturadas superan a las grasas
 *     (con 0,5 g de margen) no se fía uno de ninguno de los dos, y lo mismo con azúcares e
 *     hidratos. Se compara en centésimas enteras para que 0,3 + 0,5 no dependa del redondeo
 *     de un `float`.
 *   · La base (por 100 g o por 100 ml) sale de la familia de unidades del producto: masa
 *     es 'g', volumen es 'ml', y si no se sabe, null.
 *   · Los aditivos dependen de los ingredientes (`aditivosDeLaFicha`): una lista vacía de
 *     una ficha sin ingredientes es null, no «ninguno».
 */
export function normalizarNutricion(
  producto: Record<string, unknown>,
  familia: FamiliaUnidad | null,
  ingredientes: string | null,
): NutricionOff {
  const nutrientes = esObjeto(producto.nutriments) ? producto.nutriments : {};
  const niveles = esObjeto(producto.nutrient_levels) ? producto.nutrient_levels : {};

  let fat = numeroEnRango(nutrientes.fat_100g, MAX_NUTRIENTE);
  let saturatedFat = numeroEnRango(nutrientes['saturated-fat_100g'], MAX_NUTRIENTE);
  let carbohydrates = numeroEnRango(nutrientes.carbohydrates_100g, MAX_NUTRIENTE);
  let sugars = numeroEnRango(nutrientes.sugars_100g, MAX_NUTRIENTE);

  if (
    fat !== null &&
    saturatedFat !== null &&
    Math.round(saturatedFat * 100) > Math.round(fat * 100) + MARGEN_PARES_CENTESIMAS
  ) {
    fat = null;
    saturatedFat = null;
  }
  if (
    carbohydrates !== null &&
    sugars !== null &&
    Math.round(sugars * 100) > Math.round(carbohydrates * 100) + MARGEN_PARES_CENTESIMAS
  ) {
    carbohydrates = null;
    sugars = null;
  }

  return {
    nutriscoreGrade: nutriscoreValido(producto.nutriscore_grade),
    novaGroup: novaValido(producto.nova_group),
    basis: familia === 'volume' ? 'ml' : familia === 'mass' ? 'g' : null,
    energyKcal: numeroEnRango(nutrientes['energy-kcal_100g'], MAX_KCAL),
    fat,
    saturatedFat,
    carbohydrates,
    sugars,
    fiber: numeroEnRango(nutrientes.fiber_100g, MAX_NUTRIENTE),
    proteins: numeroEnRango(nutrientes.proteins_100g, MAX_NUTRIENTE),
    salt: numeroEnRango(nutrientes.salt_100g, MAX_NUTRIENTE),
    fatLevel: nivelValido(niveles.fat),
    saturatedFatLevel: nivelValido(niveles['saturated-fat']),
    sugarsLevel: nivelValido(niveles.sugars),
    saltLevel: nivelValido(niveles.salt),
    servingSize: racionValida(producto.serving_size),
    additivesTags: aditivosDeLaFicha(producto.additives_tags, ingredientes),
  };
}

// ── Normalizar la respuesta ───────────────────────────────────────────────

/**
 * De la respuesta de OFF a lo único que se guarda. Devuelve null si no hay un
 * producto con nombre: una ficha sin nombre no sirve de nada y no se cachea.
 */
export function normalizarRespuestaOff(json: unknown): ProductoOff | null {
  if (!esObjeto(json) || json.status !== 1 || !esObjeto(json.product)) return null;
  const p = json.product;

  const name =
    limpiarTexto(p.product_name_es, MAX_NOMBRE) ??
    limpiarTexto(p.product_name, MAX_NOMBRE) ??
    limpiarTexto(p.generic_name, MAX_NOMBRE);
  if (name === null) return null;

  // «Nutella, Ferrero»: la primera es la marca del producto.
  const marcas = typeof p.brands === 'string' ? p.brands.split(',') : [];
  const brand = limpiarTexto(marcas[0], MAX_MARCA);

  const cantidad = cantidadNumerica(p.product_quantity, p.product_quantity_unit) ?? parsearCantidad(p.quantity);
  // El texto en español manda; si no hay (o se queda en nada al limpiarlo), el original.
  const ingredientsText = limpiarIngredientes(p.ingredients_text_es) ?? limpiarIngredientes(p.ingredients_text);

  return {
    name,
    brand,
    unitFamily: cantidad?.unitFamily ?? null,
    netQuantity: cantidad?.netQuantity ?? null,
    imageUrl: imagenValida(p.image_front_url) ?? imagenValida(p.image_front_small_url),
    categoriesTags: categoriasValidas(p.categories_tags),
    allergensTags: etiquetasValidas(p.allergens_tags),
    tracesTags: etiquetasValidas(p.traces_tags),
    labelsTags: etiquetasValidas(p.labels_tags, ETIQUETAS_DE_SALUD),
    ingredientsText,
    nutrition: normalizarNutricion(p, cantidad?.unitFamily ?? null, ingredientsText),
  };
}

/**
 * El `off_payload` que se guarda junto a la ficha: lo ya filtrado y de dónde y cuándo
 * salió. Los datos de salud NO van dentro: tienen columna propia, y duplicarlos
 * gastaría los 8192 caracteres del tope en algo que ya está en otro sitio (los
 * ingredientes por sí solos pueden ocupar 2000). La nutrición tampoco, y por una razón
 * más seria: `products` la lee cualquier persona con sesión y la nutrición es de Opsi
 * Premium, que se decide en la tabla `product_nutrition`.
 *
 * Los campos se NOMBRAN uno a uno en vez de quitar los que sobran: así un campo nuevo de
 * `ProductoOff` no acaba en el payload sin que nadie lo decida.
 */
export function payloadDeOrigen(producto: ProductoOff, obtenidoEn: string): Record<string, unknown> {
  return {
    name: producto.name,
    brand: producto.brand,
    unitFamily: producto.unitFamily,
    netQuantity: producto.netQuantity,
    imageUrl: producto.imageUrl,
    categoriesTags: producto.categoriesTags,
    source: 'openfoodfacts',
    fetched_at: obtenidoEn,
  };
}

/**
 * ¿Dice OFF que el código existe pero NO es comida?
 *
 * OFF es solo de comida. Su familia (Open Beauty Facts, Open Pet Food Facts, Open
 * Products Facts) comparte códigos de barras, y distingue «no lo conozco» de «es de
 * otra de la familia» en el texto `status_verbose`: un champú contesta
 * «product found with a different product type: beauty». Se acepta solo esa forma
 * exacta, con un tipo corto de letras, y se ignora cualquier otro texto: lo que
 * escribe OFF no se interpreta más allá de esto.
 */
export function esRespuestaDeOtroTipo(json: unknown): boolean {
  return (
    esObjeto(json) &&
    json.status === 0 &&
    typeof json.status_verbose === 'string' &&
    /^product found with a different product type: [a-z_]{1,20}$/.test(json.status_verbose)
  );
}

// ── La llamada ────────────────────────────────────────────────────────────

/**
 * El servidor al que se llama. Va en el código y no se construye con nada que
 * venga del cliente: del cliente solo llega un código de barras de cifras, y va
 * en la ruta. Ni host, ni esquema, ni ruta ni parámetros se aceptan de fuera.
 */
const ORIGEN_OFF = 'https://world.openfoodfacts.org';

/** Los campos que se piden. Pedir menos es descargar menos y guardar menos. */
const CAMPOS_OFF = [
  'code',
  'product_name',
  'product_name_es',
  'generic_name',
  'brands',
  'quantity',
  'product_quantity',
  'product_quantity_unit',
  'categories_tags',
  'image_front_url',
  'image_front_small_url',
  'allergens_tags',
  'traces_tags',
  'labels_tags',
  'ingredients_text',
  'ingredients_text_es',
  'nutriscore_grade',
  'nova_group',
  'nutriments',
  'nutrient_levels',
  'serving_size',
  'additives_tags',
].join(',');

export const TIEMPO_MAXIMO_MS = 4000;
export const MAX_CUERPO_OFF = 256 * 1024;

export type OpcionesOff = {
  userAgent: string;
  /** Inyectable para las pruebas. En producción es el `fetch` global. */
  fetchImpl?: typeof fetch;
  tiempoMaximoMs?: number;
};

/**
 * Lee el cuerpo sin pasar de `max` bytes. Una respuesta enorme se corta en cuanto
 * se pasa, en lugar de cargarla entera en memoria para mirar después su tamaño.
 *
 * Sirve para una `Response` (lo que contesta OFF) y para una `Request` (lo que
 * manda el cliente): las dos tienen cabeceras y un cuerpo en flujo.
 */
export async function leerLimitado(
  respuesta: { headers: Headers; body: ReadableStream<Uint8Array> | null },
  max: number,
): Promise<string | null> {
  const declarado = Number(respuesta.headers.get('content-length'));
  if (Number.isFinite(declarado) && declarado > max) return null;
  if (!respuesta.body) return null;

  const lector = respuesta.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel();
      return null;
    }
    trozos.push(value);
  }
  const todo = new Uint8Array(total);
  let posicion = 0;
  for (const trozo of trozos) {
    todo.set(trozo, posicion);
    posicion += trozo.byteLength;
  }
  return new TextDecoder().decode(todo);
}

/** Lee el cuerpo de un 404 y dice si es el de «existe, pero no es comida». Nunca lanza. */
async function cuerpoEsDeOtroTipo(respuesta: Response): Promise<boolean> {
  try {
    const texto = await leerLimitado(respuesta, MAX_CUERPO_OFF);
    return texto !== null && esRespuestaDeOtroTipo(JSON.parse(texto));
  } catch {
    return false;
  }
}

/**
 * Pregunta a Open Food Facts por UN código, que debe llegar ya validado y
 * normalizado (`normalizarGtin`). Nunca lanza: todo fallo es un resultado.
 */
export async function consultarOff(codigo: string, opciones: OpcionesOff): Promise<ResultadoOff> {
  // Cinturón y tirantes: quien llama ya validó, pero esta es la función que pone
  // el código en una URL, y aquí no debe poder entrar nada que no sean cifras.
  if (!/^[0-9]{8,14}$/.test(codigo)) return { tipo: 'error', motivo: 'codigo_no_numerico' };

  const url = `${ORIGEN_OFF}/api/v2/product/${codigo}.json?fields=${CAMPOS_OFF}`;
  const llamar = opciones.fetchImpl ?? fetch;

  let respuesta: Response;
  try {
    respuesta = await llamar(url, {
      method: 'GET',
      // Una redirección sacaría la petición del host fijado arriba.
      redirect: 'error',
      headers: { 'User-Agent': opciones.userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(opciones.tiempoMaximoMs ?? TIEMPO_MAXIMO_MS),
    });
  } catch (error) {
    const nombre = error instanceof Error ? error.name : 'desconocido';
    return { tipo: 'error', motivo: nombre === 'TimeoutError' ? 'tiempo_agotado' : 'red' };
  }

  // OFF contesta 404 con `status: 0` cuando no conoce el código, y también cuando
  // lo conoce pero es de otra base (no es comida). Solo el cuerpo los distingue.
  if (respuesta.status === 404) {
    return (await cuerpoEsDeOtroTipo(respuesta)) ? { tipo: 'no_es_comida' } : { tipo: 'no_existe' };
  }
  if (!respuesta.ok) {
    await respuesta.body?.cancel();
    return { tipo: 'error', motivo: `http_${respuesta.status}` };
  }

  let json: unknown;
  try {
    const texto = await leerLimitado(respuesta, MAX_CUERPO_OFF);
    if (texto === null) return { tipo: 'error', motivo: 'respuesta_demasiado_grande' };
    json = JSON.parse(texto);
  } catch {
    return { tipo: 'error', motivo: 'respuesta_ilegible' };
  }

  if (esRespuestaDeOtroTipo(json)) return { tipo: 'no_es_comida' };

  // Un 200 con `status: 0` también significa «no existe» (pasa con códigos que
  // OFF considera inválidos). Y un producto sin nombre es lo mismo para nosotros.
  const producto = normalizarRespuestaOff(json);
  return producto ? { tipo: 'encontrado', producto } : { tipo: 'no_existe' };
}
