import { supabase } from '@/shared/lib/supabase';

export type Household = { id: string; name: string };

/**
 * El hogar del usuario.
 *
 * Sin filtrar: la RLS ya limita la consulta al tuyo. Devuelve `null` cuando no
 * hay ninguno, que en la práctica significa que la sesión apunta a un usuario
 * que ya no existe — el caso de una base reiniciada con el token todavía
 * guardado en el móvil.
 */
export async function fetchHousehold(): Promise<Household | null> {
  const { data, error } = await supabase
    .from('households')
    .select('id, name')
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as unknown as Household | null;
}
