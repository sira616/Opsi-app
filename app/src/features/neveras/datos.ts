import { useQuery } from '@tanstack/react-query';

import type { Nevera } from '@/api/household';
import { fetchSettings } from '@/api/settings';
import { queryKeys } from '@/shared/lib/query';
import { useNeveraActual } from './NeveraActiva';

/**
 * Una línea sobre una nevera: de quién es y cuánta gente hay.
 *
 * Es la que ve quien elige entre neveras (el selector) y quien las repasa en
 * Ajustes. Vive aquí y no en cada pantalla porque las dos tienen que decir lo
 * mismo: que la privada sea «La tuya» en un sitio y «Privada» en otro sería un
 * concepto con dos nombres.
 */
export function describirNevera(nevera: Nevera): string {
  if (nevera.kind === 'personal') return 'La tuya';
  const gente = nevera.member_count === 1 ? 'persona' : 'personas';
  return `Compartida · ${nevera.member_count} ${gente}`;
}

/**
 * Qué decir cuando ya no cabe otra nevera.
 *
 * Sin fechas ni promesas: el número sale del servidor y lo que pase con él en
 * el futuro no es cosa de esta pantalla. Si hay una compartida de la que salir,
 * se dice, porque es lo único que la persona puede hacer ahora mismo.
 */
export function textoTope(limite: number, hayCompartidas: boolean): string {
  const neveras = limite === 1 ? 'nevera' : 'neveras';
  const base = `Tu plan por ahora llega a ${limite} ${neveras}, la tuya incluida.`;
  return hayCompartidas ? `${base} Para crear otra, sal antes de una compartida.` : base;
}

export type LimiteNeveras = {
  /**
   * Cuántas neveras permite mi plan, la privada incluida. Null mientras no se
   * sabe: los ajustes cargan aparte de la lista de neveras.
   */
  limite: number | null;
  /**
   * Si ya tengo todas las que caben. Con el límite sin cargar es `false`, a
   * propósito: ofrecer un botón que el servidor acaba rechazando —y explicando
   * él— es mejor que esconder uno que sí iba a funcionar.
   */
  enElMaximo: boolean;
  /** Si tengo alguna compartida de la que poder salir para hacer sitio. */
  hayCompartidas: boolean;
};

/**
 * El tope de neveras, leído del servidor.
 *
 * El número viene de `user_settings.household_limit` y el cliente ni lo escribe
 * ni lo supone: hoy vale 2, y quien lo suba lo hace con un UPDATE, sin tocar la
 * app. La comprobación de verdad la hace el servidor al crear y al aceptar; esto
 * solo sirve para no ofrecer lo que se sabe que va a fallar y para poder decir
 * cuánto es.
 *
 * Comparte clave y función con la pantalla de Ajustes: es UNA consulta, no dos.
 */
export function useLimiteNeveras(): LimiteNeveras {
  const { neveras } = useNeveraActual();
  const ajustes = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });

  const limite = ajustes.data?.household_limit ?? null;

  return {
    limite,
    enElMaximo: limite !== null && neveras.length >= limite,
    hayCompartidas: neveras.some((n) => n.kind === 'shared'),
  };
}
