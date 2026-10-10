import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';
import { correoSintetico, normalizarUsuario } from './usuario';

type SessionState = {
  session: Session | null;
  /** Mientras es true no se sabe aún si hay sesión: no se debe redirigir. */
  loading: boolean;
  /** Por nombre de usuario, no por correo: ver shared/lib/usuario.ts. */
  signIn: (usuario: string, password: string) => Promise<void>;
  signUp: (usuario: string, password: string) => Promise<void>;
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
  const queryClient = useQueryClient();

  // Quién era el usuario de la última sesión que vimos. Es una referencia y no
  // estado porque solo sirve para comparar dentro del listener: cambiarla no
  // debe repintar nada.
  const usuarioAnterior = useRef<string | null>(null);

  useAppStateRefresh();

  useEffect(() => {
    let active = true;

    /**
     * Anota quién es ahora y, si ya no es la misma persona, tira la caché.
     *
     * ── Por qué hay que limpiarla ───────────────────────────────────────────
     *
     * La caché de TanStack Query es de la APP, no de la sesión, y aguanta
     * `staleTime` (60 s) con lo que trajo la cuenta anterior. Al cerrar sesión
     * y entrar con otra —en desarrollo, `syreta` y luego `compi`— quedaban a la
     * vista la lista de neveras y el inventario de la primera. No es solo feo:
     * es enseñar a una persona la comida de otra en el mismo móvil, que es lo
     * que la RLS impide en el servidor y que aquí se hacía desde la memoria. Y
     * la lista de neveras decide cuál está «activa», así que una cuenta nueva
     * podía arrancar con la nevera de la anterior seleccionada.
     *
     * ── Qué cuenta como «cambiar de persona» ────────────────────────────────
     *
     * Se compara el id del usuario, NO el evento. `SIGNED_IN` también salta al
     * volver a la app y al refrescar un token de la misma cuenta, y limpiar ahí
     * tiraría lo cargado a cada vuelta a primer plano. Se limpia solo cuando:
     *
     *   · había alguien y ahora no (cerrar sesión, sesión revocada), o
     *   · había alguien y ahora es otra persona (un cambio directo).
     *
     * Pasar de nadie a alguien no limpia: ya se limpió al salir, y en el
     * arranque en frío no hay nada que limpiar. Y `clear()` solo toca la caché
     * de consultas: la sesión guardada en el móvil es cosa de Supabase y ni se
     * mira.
     */
    function alCambiarLaSesion(next: Session | null) {
      const antes = usuarioAnterior.current;
      const ahora = next?.user.id ?? null;
      usuarioAnterior.current = ahora;
      if (antes !== null && antes !== ahora) queryClient.clear();
    }

    // La sesión guardada se lee del disco, así que tarda. Hasta que llega,
    // loading se queda en true y nadie redirige a ningún sitio.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      alCambiarLaSesion(data.session);
      setSession(data.session);
      setLoading(false);
    });

    // Una sola suscripción para todo: login, logout, refresco del token y
    // cambios hechos en otra pantalla. La UI no tiene que enterarse de cuál.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      alCambiarLaSesion(next);
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [queryClient]);

  const value = useMemo<SessionState>(
    () => ({
      session,
      loading,

      async signIn(usuario, password) {
        const nombre = normalizarUsuario(usuario);
        const { error } = await supabase.auth.signInWithPassword({
          email: correoSintetico(nombre),
          password,
        });
        if (!error) return;

        // Quien ya añadió un correo real perdió el sintético, así que el
        // intento anterior no encuentra nada. Se reintenta con el correo tal
        // cual por si lo que han escrito es eso. No es un caso raro: es
        // exactamente lo que pasa tras confirmar el correo en ajustes.
        if (usuario.includes('@')) {
          const reintento = await supabase.auth.signInWithPassword({
            email: usuario.trim(),
            password,
          });
          if (!reintento.error) return;
        }
        throw error;
      },

      async signUp(usuario, password) {
        const nombre = normalizarUsuario(usuario);
        const { error } = await supabase.auth.signUp({
          email: correoSintetico(nombre),
          password,
          // Lo lee el trigger handle_new_user para guardarlo en user_settings.
          // Sin esto se deduciría de la parte local del correo, que aquí da lo
          // mismo; se manda igual para que el día que el correo deje de
          // derivarse del nombre siga habiendo una fuente explícita.
          options: { data: { username: nombre } },
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
