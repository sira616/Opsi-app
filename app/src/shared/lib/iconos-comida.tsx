import {
  Avocado, BeerBottle, BowlFood, BowlSteam, Bread, Cake, Carrot, Cheese, Cherries,
  Coffee, Cookie, Egg, Fish, ForkKnife, Grains, IceCream, Jar, Leaf, Martini,
  Orange, Pepper, Pizza, Popcorn, Shrimp, Wine,
  type IconProps,
} from 'phosphor-react-native';
import type { ReactElement } from 'react';

/**
 * Un icono para cada alimento, adivinado por su nombre.
 *
 * Nadie elige el icono: sale de lo que escribes. «Leche entera» trae una
 * jarra, «huevos» un huevo, «merluza» un pez. Es lo que convierte una lista de
 * texto en algo que apetece mirar, y no le cuesta nada al usuario.
 *
 * Cuando no acierta, cae en unos cubiertos. Equivocarse es barato: el icono
 * acompaña al nombre, nunca lo sustituye.
 *
 * Las reglas devuelven el ELEMENTO ya construido y no el componente. Guardar
 * un componente en una variable dentro del render es un patrón que React
 * penaliza —lo trata como un componente nuevo en cada pasada— y el linter lo
 * rechaza con razón.
 */
type Render = (props: IconProps) => ReactElement;

const REGLAS: [RegExp, Render][] = [
  [/leche|nata|yogur|batido|kéfir|kefir|mantequilla/i, (p) => <Jar {...p} />],
  [/queso|mozzarella|parmesano|requesón|requeson/i, (p) => <Cheese {...p} />],
  [/huevo/i, (p) => <Egg {...p} />],
  [/pan|tostada|molde|baguette|bollo|bizcocho/i, (p) => <Bread {...p} />],
  [/pizza/i, (p) => <Pizza {...p} />],
  [/pescado|merluza|salmón|salmon|atún|atun|bacalao|sardina|lubina|dorada/i, (p) => <Fish {...p} />],
  [/gamba|langostino|marisco|calamar|pulpo|mejillón|mejillon/i, (p) => <Shrimp {...p} />],
  [/zanahoria|verdura|brócoli|brocoli|lechuga|espinaca|judía|judia|calabacín|calabacin|puerro|apio/i, (p) => <Carrot {...p} />],
  [/aguacate/i, (p) => <Avocado {...p} />],
  [/naranja|mandarina|limón|limon|pomelo|manzana|pera|plátano|platano/i, (p) => <Orange {...p} />],
  [/fresa|cereza|frambuesa|arándano|arandano|uva|mora|kiwi/i, (p) => <Cherries {...p} />],
  [/pimiento|guindilla|chile|picante|pimentón|pimenton/i, (p) => <Pepper {...p} />],
  [/arroz|pasta|macarr|espagueti|lenteja|garbanzo|alubia|quinoa|harina|avena|cereal|pan rallado/i, (p) => <Grains {...p} />],
  [/café|cafe|\bté\b|infusión|infusion|cacao/i, (p) => <Coffee {...p} />],
  [/cerveza|refresco|agua|zumo|jugo|gaseosa/i, (p) => <BeerBottle {...p} />],
  [/vino|cava|champ|sidra/i, (p) => <Wine {...p} />],
  [/licor|ginebra|\bron\b|vodka|whisk|vermut/i, (p) => <Martini {...p} />],
  [/galleta|magdalena|cruasán|cruasan/i, (p) => <Cookie {...p} />],
  [/tarta|pastel|postre|flan|natilla/i, (p) => <Cake {...p} />],
  [/helado|polo\b/i, (p) => <IceCream {...p} />],
  [/palomita|snack|patatas fritas|chip|fruto seco|almendra|nuez/i, (p) => <Popcorn {...p} />],
  [/sopa|caldo|crema|puré|pure|guiso|potaje|cocido|lasaña|lasana/i, (p) => <BowlSteam {...p} />],
  [/ensalada|salsa|tomate|hummus|conserva|bote|lata|aceituna|paté|pate/i, (p) => <BowlFood {...p} />],
  [/hierba|albahaca|perejil|cilantro|orégano|oregano|brote|rúcula|rucula/i, (p) => <Leaf {...p} />],
];

export function IconoComida({ nombre, ...props }: IconProps & { nombre: string }): ReactElement {
  const regla = REGLAS.find(([patron]) => patron.test(nombre));
  return regla ? regla[1](props) : <ForkKnife {...props} />;
}
