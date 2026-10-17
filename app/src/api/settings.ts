/**
 * Los ajustes del usuario.
 *
 * Es la única tabla que no cuelga de un hogar: la hora a la que quieres el
 * aviso y tu zona horaria son tuyas, no de tu casa. Cuando el hogar sea
 * compartido, cada miembro tendrá su propio resumen a su propia hora.
 *
 * La fila la crea el trigger de alta, así que aquí nunca hay que insertar:
 * siempre existe.
 */

import { supabase } from '@/shared/lib/supabase';
import type { Acento } from '@/shared/theme/tokens';

export type Plan = 'basic' | 'premium';

export type UserSettings = {
  user_id: string;
  /** El nombre de usuario. Es la identidad visible; ver shared/lib/usuario.ts. */
  username: string;
  timezone: string;
  digest_enabled: boolean;
  digest_hour: number;
  /** Los minutos de la hora del resumen. Se eligen junto con la hora. */
  digest_minute: number;
  auto_add_to_shopping_list: boolean;
  locale: string;
  /**
   * Cuántas neveras puede tener esta persona, la privada incluida. Es del
   * SERVIDOR y de solo lectura: hoy vale 2, y lo que ese número signifique el
   * día de mañana se decide allí. El cliente no lo escribe —el permiso de
   * columna lo impide— ni lo sustituye por una constante: solo lo enseña y lo
   * usa para no ofrecer un botón que el servidor va a rechazar.
   */
  household_limit: number;
  /**
   * El plan. Es del SERVIDOR y de solo lectura, como `household_limit`: ningún permiso
   * de columna deja escribirlo. Lo premium lo vuelve a comprobar el servidor; la app
   * solo lo usa para enseñar candados en vez de botones que van a fallar.
   */
  plan: Plan;
  /** El color elegido. Distinto del verde solo vale con `plan = premium`. */
  accent: Acento;
};

export async function fetchSettings(): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select(
      'user_id, username, timezone, digest_enabled, digest_hour, digest_minute, ' +
        'auto_add_to_shopping_list, locale, household_limit, plan, accent',
    )
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as UserSettings;
}

/**
 * Lo que se puede tocar. `user_id` y `username` quedan fuera a propósito: el
 * primero es la identidad de la fila y el segundo es inmutable, y la base de
 * datos ya lo impide quitando el UPDATE de esa columna. `household_limit` sale
 * por lo mismo: es del servidor y tampoco tiene permiso de escritura. Dejarlos
 * en el tipo solo serviría para que el error saliera en tiempo de ejecución.
 */
export type SettingsPatch = Partial<
  Omit<UserSettings, 'user_id' | 'username' | 'household_limit' | 'plan'>
>;

/**
 * Sin `.eq('user_id', ...)`: la política RLS de user_settings ya limita el
 * UPDATE a tu propia fila. Ponerlo aquí sería repetir la regla.
 */
export async function updateSettings(patch: SettingsPatch): Promise<void> {
  const { error } = await supabase.from('user_settings').update(patch).not('user_id', 'is', null);
  if (error) throw error;
}
