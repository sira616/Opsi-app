import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { env } from './env';

/**
 * El cliente de Supabase.
 *
 * Tres ajustes que no son el valor por defecto y tienen su motivo:
 *
 *   · `storage: AsyncStorage` — en React Native no hay localStorage. Sin esto
 *     la sesión se pierde al cerrar la app.
 *   · `detectSessionInUrl: false` — eso es para navegadores, donde el token
 *     vuelve en el fragmento de una URL. En un móvil no aplica.
 *   · `autoRefreshToken` se para cuando la app pasa a segundo plano; de eso se
 *     encarga `useAppStateRefresh`, más abajo en session.tsx.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
