import type { Session } from '@supabase/supabase-js';
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';

type SessionState = {
  session: Session | null;
  /** Mientras es true no se sabe aún si hay sesión: no se debe redirigir. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

/**
 * Supabase refresca el token con un temporizador, y los temporizadores de
 * JavaScript no corren cuando la app está en segundo plano. Sin esto, volver a
 * la app tras un rato deja peticiones fallando con un token caducado hasta que
 * algo dispara el refresco.
 */
function useAppStateRefresh() {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void supabase.auth.startAutoRefresh();
      } else {
        void supabase.auth.stopAutoRefresh();
      }
    });
    return () => subscription.remove();
  }, []);
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useAppStateRefresh();

  useEffect(() => {
    let active = true;

    // La sesión guardada se lee del disco, así que tarda. Hasta que llega,
    // loading se queda en true y nadie redirige a ningún sitio.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    // Una sola suscripción para todo: login, logout, refresco del token y
    // cambios hechos en otra pantalla. La UI no tiene que enterarse de cuál.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      session,
      loading,

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
      },

      async signUp(email, password) {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        // El hogar personal lo crea un trigger de la base de datos al
        // registrarse, así que aquí no hay nada más que hacer: cuando esto
        // vuelve, el usuario ya tiene hogar, pertenencia y ajustes.
      },

      async signOut() {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      },
    }),
    [session, loading],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionState {
  const value = use(SessionContext);
  if (!value) {
    throw new Error('useSession se ha usado fuera de <SessionProvider>');
  }
  return value;
}
