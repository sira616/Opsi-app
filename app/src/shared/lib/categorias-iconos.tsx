import {
  Basket,
  BeerBottle,
  Bread,
  Carrot,
  Cookie,
  Egg,
  Fish,
  Grains,
  Hamburger,
  Snowflake,
  type IconProps,
} from 'phosphor-react-native';
import type { ReactElement } from 'react';

import type { Categoria } from './categorias';

/**
 * Un icono por categoría.
 *
 * Vive aparte de `categorias.ts` para que aquel fichero no tenga JSX y se
 * pueda ejecutar con Node al probar las reglas de adivinación.
 *
 * Devuelven el ELEMENTO y no el componente: guardar un componente en una
 * variable dentro del render hace que React lo trate como uno nuevo en cada
 * pasada, y el linter lo rechaza con razón.
 *
 * Phosphor no tiene un icono de carne; `Hamburger` es lo más cercano y se lee
 * a la primera, que es lo único que se le pide.
 */
const ICONOS: Record<Categoria, (props: IconProps) => ReactElement> = {
  frutas_verduras: (p) => <Carrot {...p} />,
  carne: (p) => <Hamburger {...p} />,
  pescado: (p) => <Fish {...p} />,
  lacteos: (p) => <Egg {...p} />,
  panaderia: (p) => <Bread {...p} />,
  despensa: (p) => <Grains {...p} />,
  congelados: (p) => <Snowflake {...p} />,
  bebidas: (p) => <BeerBottle {...p} />,
  dulces: (p) => <Cookie {...p} />,
  otros: (p) => <Basket {...p} />,
};

export function IconoCategoria({
  categoria,
  ...props
}: IconProps & { categoria: Categoria }): ReactElement {
  return (ICONOS[categoria] ?? ICONOS.otros)(props);
}
