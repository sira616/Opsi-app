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

export type UserSettings = {
  user_id: string;
  timezone: string;
  digest_enabled: boolean;
  digest_hour: number;
  auto_add_to_shopping_list: boolean;
  locale: string;
};

export async function fetchSettings(): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('user_id, timezone, digest_enabled, digest_hour, auto_add_to_shopping_list, locale')
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as UserSettings;
}

/**
 * Sin `.eq('user_id', ...)`: la política RLS de user_settings ya limita el
 * UPDATE a tu propia fila. Ponerlo aquí sería repetir la regla.
 */
export async function updateSettings(patch: Partial<UserSettings>): Promise<void> {
  const { error } = await supabase.from('user_settings').update(patch).not('user_id', 'is', null);
  if (error) throw error;
}
