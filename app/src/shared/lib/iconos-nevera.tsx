import {
  BowlFood,
  Buildings,
  Carrot,
  Coffee,
  CookingPot,
  Couch,
  Door,
  ForkKnife,
  HandHeart,
  House,
  Pizza,
  Student,
  Tent,
  Users,
  UsersFour,
  UsersThree,
  type IconProps,
} from 'phosphor-react-native';
import type { ReactElement } from 'react';

/**
 * Los iconos que puede llevar una nevera.
 *
 * ── Dos listas que hay que mantener alineadas ─────────────────────────────
 *
 * La lista CERRADA de iconos vive en el servidor, en la tabla
 * `household_icons` (`key`, `label`, `sort_order`; migración 20260924100000):
 * una clave que no esté allí la rechaza el motor con una clave foránea. Esta es
 * la otra mitad, el DIBUJO de cada clave. Si se añade un icono al servidor y
 * aquí no, la app lo pinta con `House` —nunca rompe la pantalla, para eso está
 * el respaldo— pero no se puede elegir hasta que esté aquí.
 *
 * Añadir un icono es siempre las dos cosas: un INSERT en `household_icons`
 * (migración nueva) y una entrada en `ICONOS_NEVERA`. `npm run db:check`
 * comprueba que cada clave del servidor existe en Phosphor con el nombre que
 * sale de ella, pero no que exista aquí: eso lo cubre el respaldo.
 *
 * La CLAVE es el nombre del icono de Phosphor en snake_case (`users_three` →
 * `UsersThree`) y es un dato guardado: si Phosphor renombrase uno, la clave se
 * queda y solo cambia el import de arriba.
 *
 * La etiqueta es la del servidor, en español y para quien no ve: describe el
 * dibujo, no la broma. El orden es el de `sort_order`: casa, gente, comida.
 *
 * Devuelven el ELEMENTO y no el componente, igual que `categorias-iconos` y
 * `iconos-comida`: guardar un componente en una variable dentro del render hace
 * que React lo trate como uno nuevo en cada pasada, y el linter lo rechaza con
 * razón.
 */
type Render = (props: IconProps) => ReactElement;

/** El de la nevera privada. Es también el respaldo de una clave desconocida. */
export const ICONO_PRIVADA = 'house';

/** El que lleva una compartida si no se elige otro: el mismo que pone el servidor. */
export const ICONO_COMPARTIDA = 'users_three';

const DIBUJOS: Record<string, Render> = {
  house: (p) => <House {...p} />,
  door: (p) => <Door {...p} />,
  buildings: (p) => <Buildings {...p} />,
  couch: (p) => <Couch {...p} />,
  tent: (p) => <Tent {...p} />,
  users_three: (p) => <UsersThree {...p} />,
  users: (p) => <Users {...p} />,
  users_four: (p) => <UsersFour {...p} />,
  hand_heart: (p) => <HandHeart {...p} />,
  student: (p) => <Student {...p} />,
  fork_knife: (p) => <ForkKnife {...p} />,
  cooking_pot: (p) => <CookingPot {...p} />,
  bowl_food: (p) => <BowlFood {...p} />,
  pizza: (p) => <Pizza {...p} />,
  carrot: (p) => <Carrot {...p} />,
  coffee: (p) => <Coffee {...p} />,
};

/** Cada icono elegible, en el orden del servidor, con su etiqueta para lectores de pantalla. */
export const ICONOS_NEVERA: readonly { clave: string; etiqueta: string }[] = [
  { clave: 'house', etiqueta: 'Casa' },
  { clave: 'door', etiqueta: 'Puerta' },
  { clave: 'buildings', etiqueta: 'Edificio' },
  { clave: 'couch', etiqueta: 'Sofá' },
  { clave: 'tent', etiqueta: 'Tienda de campaña' },
  { clave: 'users_three', etiqueta: 'Grupo de gente' },
  { clave: 'users', etiqueta: 'Dos personas' },
  { clave: 'users_four', etiqueta: 'Cuatro personas' },
  { clave: 'hand_heart', etiqueta: 'Mano con corazón' },
  { clave: 'student', etiqueta: 'Estudiante' },
  { clave: 'fork_knife', etiqueta: 'Cubiertos' },
  { clave: 'cooking_pot', etiqueta: 'Olla' },
  { clave: 'bowl_food', etiqueta: 'Cuenco' },
  { clave: 'pizza', etiqueta: 'Pizza' },
  { clave: 'carrot', etiqueta: 'Zanahoria' },
  { clave: 'coffee', etiqueta: 'Café' },
];

/** La etiqueta de una clave, o la de la casa si no la conocemos. */
export function etiquetaIconoNevera(clave: string): string {
  return ICONOS_NEVERA.find((i) => i.clave === clave)?.etiqueta ?? 'Casa';
}

/**
 * El dibujo de una nevera.
 *
 * Por omisión va en `duotone`, que es el peso que usa la app para los iconos
 * decorativos (el vacío del inventario, los avatares, las secciones del alta).
 * El tamaño y el color los pone quien lo usa: aquí no hay ninguno que valga
 * para el selector y para una fila a la vez.
 */
export function IconoNevera({
  icono,
  weight = 'duotone',
  ...props
}: IconProps & { icono: string }): ReactElement {
  const dibujar = DIBUJOS[icono] ?? DIBUJOS[ICONO_PRIVADA];
  // `noUncheckedIndexedAccess` da `undefined` a la lectura de un Record por
  // muy segura que sea: el respaldo del respaldo es `House` a pelo.
  return dibujar ? dibujar({ weight, ...props }) : <House weight={weight} {...props} />;
}
