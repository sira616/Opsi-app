import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchSettings, updateSettings, type SettingsPatch } from '@/api/settings';
import { SeccionAcercaDe } from '@/features/ajustes/SeccionAcercaDe';
import { SeccionAspecto } from '@/features/ajustes/SeccionAspecto';
import { SeccionAvisos } from '@/features/ajustes/SeccionAvisos';
import { SeccionCuenta } from '@/features/ajustes/SeccionCuenta';
import { SeccionListaCompra } from '@/features/ajustes/SeccionListaCompra';
import { SeccionPrivacidad } from '@/features/ajustes/SeccionPrivacidad';
import { SeccionMisNeveras } from '@/features/ajustes/SeccionMisNeveras';
import { TarjetaPerfil } from '@/features/ajustes/TarjetaPerfil';
import { useAjustesStyles } from '@/features/ajustes/ui';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { useSession } from '@/shared/lib/session';
import {
  makeStyles,
  radius,
  space,
  tabBarClearance,
  touchTarget,
  useTheme,
  useType,
} from '@/shared/theme/tokens';
import { ErrorNote } from '@/shared/ui/ErrorNote';

/**
 * Ajustes, en ocho bloques y por orden de a qué distancia está cada cosa de ti.
 *
 *   Perfil · Aspecto · Avisos · Lista de la compra · Nevera compartida ·
 *   Cuenta · Privacidad y datos · Acerca de
 *
 * Esta pantalla ya no dibuja nada: reparte. Cada sección vive en
 * `features/ajustes/` con su estado, sus consultas y sus textos, porque aquí
 * había 763 líneas y la nevera compartida sola son unas cuantas más. Una
 * pantalla de mil y pico líneas no se toca sin miedo, y la que no se toca sin
 * miedo se queda como está.
 *
 * Aspecto, Privacidad y Acerca de se pintan FUERA del guardado de `data`: no
 * necesitan al servidor. Si los ajustes de la cuenta no cargan —una base
 * reiniciada, por ejemplo— sigue habiendo cómo poner la app en oscuro y dónde
 * mirar la versión, que es justo lo que se busca cuando algo va mal.
 */
export default function Ajustes() {
  const styles = useStyles();
  const compartidos = useAjustesStyles();
  const t = useType();
  const c = useTheme();
  const { signOut } = useSession();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });

  const save = useMutation({
    mutationFn: updateSettings,
    async onSuccess() {
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
        // La zona horaria cambia lo que cuenta como «hoy», así que la lista de
        // prioridad puede quedar distinta. Sin esto seguiría mostrando los
        // días calculados con la zona anterior. Es la de TODAS las neveras: la
        // zona es de la persona, no de una nevera.
        queryClient.invalidateQueries({ queryKey: queryKeys.priorityLists }),
      ]);
    },
    onError(caught: unknown) {
      setError(describeDbError(caught));
    },
  });

  function patch(next: SettingsPatch) {
    setError(null);
    save.mutate(next);
  }

  const data = settings.data;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={t.title}>Ajustes</Text>

        <TarjetaPerfil username={data?.username ?? null} cargando={settings.isPending} />

        {settings.isPending ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={error ?? (settings.error ? describeDbError(settings.error) : null)} />

        <SeccionAspecto />

        {data ? (
          <>
            <SeccionAvisos data={data} onPatch={patch} guardando={save.isPending} />
            <SeccionListaCompra data={data} onPatch={patch} guardando={save.isPending} />
            <SeccionMisNeveras />
            <SeccionCuenta username={data.username} />
          </>
        ) : settings.isPending ? null : (
          <View style={compartidos.card}>
            <Text style={t.body}>No encuentro tus ajustes.</Text>
            <Text style={t.bodySmall}>
              Suele significar que la sesión apunta a un usuario que ya no está en la base
              de datos. Cierra sesión y vuelve a entrar.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión"
              onPress={() => void signOut()}
              style={({ pressed }) => [styles.salir, pressed && compartidos.pressed]}
            >
              <Text style={styles.salirText}>Cerrar sesión</Text>
            </Pressable>
          </View>
        )}

        <SeccionPrivacidad />
        <SeccionAcercaDe />
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  content: { padding: space.xl, gap: space.xl, paddingBottom: tabBarClearance },

  salir: {
    minHeight: touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  salirText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
}));
