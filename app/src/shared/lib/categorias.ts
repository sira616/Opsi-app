/**
 * Los pasillos del supermercado. Solo datos.
 *
 * Los iconos viven aparte, en `categorias-iconos.tsx`, y no por gusto: un
 * fichero sin JSX se puede ejecutar tal cual con Node, y estas reglas —que son
 * cincuenta expresiones regulares— son justo lo que hay que poder probar.
 *
 * El nombre de un alimento es texto libre y tiene que seguir siéndolo —nadie
 * busca «Leche semidesnatada sin lactosa» en un desplegable—, pero eso deja el
 * inventario sin ninguna forma de agruparlo que no sea la urgencia. La
 * categoría es esa forma, y se elige el supermercado porque es como ya tiene
 * la gente organizada la cabeza.
 *
 * Diez, ni una más: una fila de filtros que no cabe en un móvil no la usa
 * nadie.
 */
export type Categoria =
  | 'frutas_verduras'
  | 'carne'
  | 'pescado'
  | 'lacteos'
  | 'panaderia'
  | 'despensa'
  | 'congelados'
  | 'bebidas'
  | 'dulces'
  | 'otros';

export type Definicion = {
  valor: Categoria;
  etiqueta: string;
  /** Lo que la delata en el nombre. `otros` no tiene: es el resto. */
  patron?: RegExp;
};

/**
 * El orden es el del supermercado, no el alfabético: fresco primero, luego
 * despensa, y al final lo que se compra por capricho. Es el recorrido que ya
 * hace cualquiera con el carro.
 */
export const CATEGORIAS: readonly Definicion[] = [
  {
    valor: 'frutas_verduras',
    etiqueta: 'Fruta y verdura',
    patron:
      /fruta|verdura|hortaliza|zanahoria|lechuga|tomate|cebolla|ajo|patata|pimiento|calabac|berenjena|brócoli|brocoli|espinaca|acelga|judía|judia|puerro|apio|pepino|champiñ|champin|seta|manzana|pera|plátano|platano|naranja|mandarina|limón|limon|pomelo|uva|fresa|cereza|melón|melon|sandía|sandia|kiwi|piña|pina|mango|aguacate|melocotón|melocoton|albaricoque|ciruela|arándano|arandano|frambuesa|mora|higo|granada|lima|calabaza|remolacha|rábano|rabano|nabo|col\b|coliflor|repollo|canónigo|canonigo|rúcula|rucula|brote|germinado|perejil|cilantro|albahaca|orégano|oregano|romero|tomillo|hierbabuena|menta/i,
  },
  {
    valor: 'carne',
    etiqueta: 'Carne',
    patron:
      /carne|pollo|pavo|ternera|cerdo|cordero|conejo|solomillo|entrecot|chuleta|filete|lomo|costilla|bacon|beicon|panceta|jamón|jamon|chorizo|salchich|morcilla|fuet|salami|mortadela|embutido|hamburguesa|albóndiga|albondiga|pechuga|muslo|alita|picada|butifarra|cecina|lacón|lacon|pavo\b/i,
  },
  {
    valor: 'pescado',
    etiqueta: 'Pescado',
    patron:
      /pescado|marisco|merluza|salmón|salmon|atún|atun|bacalao|sardina|lubina|dorada|boquerón|boqueron|anchoa|trucha|rape|lenguado|caballa|emperador|pez espada|gamba|langostino|cigala|calamar|sepia|pulpo|mejillón|mejillon|almeja|berberecho|navaja|vieira|cangrejo|bogavante|centollo|surimi|palito de mar/i,
  },
  {
    valor: 'lacteos',
    etiqueta: 'Lácteos y huevos',
    patron:
      /leche|yogur|yogurt|queso|mozzarella|parmesano|requesón|requeson|mantequilla|margarina|nata|crema de leche|kéfir|kefir|cuajada|natilla|huevo|clara de huevo|batido|mascarpone|burrata|feta|cheddar|gouda|brie|camembert|manchego|petit|actimel/i,
  },
  {
    valor: 'panaderia',
    etiqueta: 'Panadería',
    patron:
      /\bpan\b|pan de|barra de pan|baguette|chapata|hogaza|molde|tostada|biscote|picos|colines|bollo|cruasán|cruasan|croissant|napolitana|ensaimada|magdalena|muffin|donut|rosquilla|empanada|hojaldre|pizza|masa quebrada|focaccia|tortilla de trigo|wrap|pita|regañá|regana/i,
  },
  {
    valor: 'despensa',
    etiqueta: 'Despensa',
    patron:
      /arroz|pasta|macarr|espagueti|fideo|tallarín|tallarin|lasaña|lasana|ñoqui|noqui|cuscús|cuscus|quinoa|lenteja|garbanzo|alubia|judión|judion|soja|harina|sémola|semola|avena|cereal|muesli|granola|pan rallado|aceite|vinagre|\bsal\b|azúcar|azucar|especia|pimentón|pimenton|curry|comino|canela|levadura|caldo|conserva|\blata\b|\bbote\b|tomate frito|tomate triturado|atún en lata|atun en lata|aceituna|encurtido|pepinillo|salsa|kétchup|ketchup|mayonesa|mostaza|soja\b|miel|mermelada|crema de cacahuete|paté|pate|foie|sopa de sobre|puré de patata|pure de patata|legumbre|garrofón|garrofon|tofu|seitán|seitan|hummus/i,
  },
  {
    valor: 'congelados',
    etiqueta: 'Congelados',
    patron:
      /congelad|ultracongelad|helado|polo\b|pizza congelada|varitas|croqueta|nugget|patatas fritas congeladas|guisante congelado|menestra|tarta helada/i,
  },
  {
    valor: 'bebidas',
    etiqueta: 'Bebidas',
    patron:
      /agua|zumo|jugo|refresco|gaseosa|cola\b|tónica|tonica|cerveza|vino|cava|champ|sidra|vermut|licor|ginebra|\bron\b|vodka|whisk|tequila|café|cafe|\bté\b|\bte\b|infusión|infusion|manzanilla|poleo|horchata|bebida|smoothie|kombucha|isotónic|isotonic|bitter/i,
  },
  {
    valor: 'dulces',
    etiqueta: 'Dulces y picoteo',
    patron:
      /galleta|chocolate|bombón|bombon|caramelo|chuche|gominola|regaliz|turrón|turron|polvorón|polvoron|mazapán|mazapan|tarta|pastel|bizcocho|brownie|flan|postre|gelatina|nube|palomita|snack|patatas fritas|nacho|dorito|cortez|fruto seco|almendra|nuez|nueces|anacardo|pistacho|cacahuete|avellana|pipa|dátil|datil|pasa\b|barrita|cacao|nocilla|nutella/i,
  },
  { valor: 'otros', etiqueta: 'Otros' },
];

const POR_VALOR = new Map(CATEGORIAS.map((cat) => [cat.valor, cat]));

export function etiquetaCategoria(valor: Categoria): string {
  return POR_VALOR.get(valor)?.etiqueta ?? 'Otros';
}

/**
 * La categoría que le toca a un nombre.
 *
 * Se propone, no se impone: el usuario puede cambiarla de un toque. Acertar la
 * mayoría de las veces convierte un campo obligatorio más en un campo que casi
 * nunca hay que tocar, y esa es toda la diferencia entre un formulario corto y
 * uno que da pereza.
 *
 * El orden de CATEGORIAS decide los empates, y por eso «congelados» va después
 * de los frescos: «guisantes congelados» son congelados, pero solo porque lo
 * dice la palabra, no porque dejen de ser verdura.
 */
export function adivinarCategoria(nombre: string): Categoria {
  const limpio = nombre.trim();
  if (!limpio) return 'otros';

  // Los congelados se miran primero justo por lo contrario que su posición en
  // la lista sugiere: «pizza congelada» tiene que ganar a «pizza».
  const congelados = POR_VALOR.get('congelados');
  if (congelados?.patron?.test(limpio)) return 'congelados';

  for (const cat of CATEGORIAS) {
    if (cat.patron?.test(limpio)) return cat.valor;
  }
  return 'otros';
}
