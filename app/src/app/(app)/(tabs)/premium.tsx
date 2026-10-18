import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaretRight, Check, Lock, Package, Star } from 'phosphor-react-native';

import { fetchMasUsados, fetchProductosConocidos, GASTOS_EN_RESUMEN } from '@/api/premium';
import { fetchSettings, updateSettings } from '@/api/settings';
import { Nota, Row, Section } from '@/features/ajustes/ui';
import { FilaGasto } from '@/features/gastos/FilaGasto';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import {
  ACENTOS,
  MUESTRAS_ACENTO,
  fonts,
  makeStyles,
  radius,
  space,
  tabBarClearance,
  touchTarget,
  useAspecto,
  useTheme,
  useType,
  type Acento,
} from '@/shared/theme/tokens';

/**
 * Opsi Premium ⭐: el color de la app, tus productos, lo que más gastas y más listas.
 *
 * Todo lo premium lo decide el SERVIDOR: el color solo lo guarda el trigger de
 * `user_settings` si el plan lo permite, y `most_used_products` y `my_known_products`
 * rechazan a quien no lo tiene. Esta pantalla enseña candados en vez de botones que van a fallar, y esa es
 * toda su parte; si alguien se saltara los candados, el servidor diría que no igual.
 *
 * Es una pestaña de la barra, donde antes estaba el chat de Opsi (que volverá como una
 * burbuja en la nevera, no como una sección).
 *
 * Contratarlo todavía no se puede: no hay pago (ver `docs/internal/PENDIENTES.md`), y
 * la pantalla lo dice en vez de enseñar un botón de compra que no compra nada. Hoy el
 * plan lo cambia quien tiene acceso a la base de datos (`npm run dev:plan`).
 */
export default function Premium() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { activa } = useNeveraActual();
  const { acento, setAcento } = useAspecto();
  const [error, setError] = useState<string | null>(null);
  // Lo que no se puede por no tener premium no es un fallo: se dice sin rojo.
  const [aviso, setAviso] = useState<string | null>(null);
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const premium = settings.data?.plan === 'premium';

  // Se piden uno más de los que se enseñan: así se sabe si hay más y vale la pena «Ver todos».
  const gastos = useQuery({
    queryKey: queryKeys.masUsados(activa.id, GASTOS_EN_RESUMEN + 1),
    queryFn: () => fetchMasUsados(activa.id, GASTOS_EN_RESUMEN + 1),
    // Solo se pide con el plan: sin él el servidor contestaría que no.
    enabled: premium,
  });

  const conocidos = useQuery({
    queryKey: queryKeys.productosConocidos(activa.id),
    queryFn: () => fetchProductosConocidos(activa.id),
    enabled: premium,
  });

  const elegirColor = useMutation({
    mutationFn: (color: Acento) => updateSettings({ accent: color }),
    async onSuccess(_, color) {
      setError(null);
      setAcento(color);
      await queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  function elegir(color: Acento) {
    if (color !== 'green' && !premium) {
      setAviso('Ese color es de Opsi Premium ⭐.');
      return;
    }
    setError(null);
    setAviso(null);
    elegirColor.mutate(color);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.titulo}>
          <Text style={t.title}>Opsi Premium</Text>
          <Star size={26} color={c.brandBright} weight="fill" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {settings.isPending ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={error ?? (settings.error ? describeDbError(settings.error) : null)} />
        {aviso ? <Nota texto={aviso} tono="aviso" alerta /> : null}

        {/* El plan, dicho tal cual. */}
        <View style={[styles.plan, premium && styles.planPremium]}>
          <Text style={styles.planTitulo}>{premium ? 'Tienes Opsi Premium ⭐' : 'Plan básico'}</Text>
          <Text style={styles.planTexto}>
            {premium
              ? 'Colores, tus productos, lo que más gastas y hasta 10 listas por nevera.'
              : 'Colores, tus productos, lo que más gastas y más listas de la compra. Todavía no se puede contratar.'}
          </Text>
        </View>

        <Section title="Color de la app">
          <View style={styles.colores}>
            {ACENTOS.map((color) => {
              const { etiqueta, muestra } = MUESTRAS_ACENTO[color];
              const bloqueado = color !== 'green' && !premium;
              const on = acento === color;
              return (
                <Pressable
                  key={color}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on, disabled: false }}
                  accessibilityLabel={bloqueado ? `${etiqueta}, de Opsi Premium` : etiqueta}
                  onPress={() => elegir(color)}
                  style={({ pressed }) => [styles.color, pressed && styles.pulsado]}
                >
                  <View style={[styles.muestraAnillo, on && { borderColor: c.brand }]}>
                    <View
                      style={[
                        styles.muestra,
                        { backgroundColor: muestra },
                        bloqueado && styles.muestraBloqueada,
                      ]}
                    >
                      {on ? (
                        <Check
                          size={18}
                          color={color === 'yellow' ? '#16181A' : '#FFFFFF'}
                          weight="bold"
                        />
                      ) : null}
                    </View>
                    {bloqueado ? (
                      <View style={styles.estrella}>
                        <Star size={11} color={c.brandInk} weight="fill" />
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.colorEtiqueta, on && styles.colorEtiquetaOn]}>{etiqueta}</Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section title="Tus productos">
          {premium ? (
            conocidos.isPending ? (
              <ActivityIndicator color={c.brand} />
            ) : conocidos.error ? (
              <Text style={styles.texto}>{describeDbError(conocidos.error)}</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ver tus productos"
                onPress={() => router.push('/productos')}
                style={({ pressed }) => [styles.enlace, pressed && styles.pulsado]}
              >
                <Package size={22} color={c.brand} weight="duotone" />
                <Text style={styles.enlaceTexto}>
                  {(conocidos.data ?? []).length === 0
                    ? 'Aún no tienes ninguno'
                    : `${(conocidos.data ?? []).length} ${(conocidos.data ?? []).length === 1 ? 'producto' : 'productos'}`}
                </Text>
                <CaretRight size={16} color={c.inkMuted} weight="bold" />
              </Pressable>
            )
          ) : (
            <View style={styles.bloqueo}>
              <Lock size={20} color={c.inkMuted} weight="duotone" />
              <Text style={styles.texto}>
                Con Opsi Premium ⭐ tienes un almacén con los productos que has registrado y su ficha.
              </Text>
            </View>
          )}
        </Section>

        <Section title="Lo que más gastas">
          {premium ? (
            gastos.isPending ? (
              <ActivityIndicator color={c.brand} />
            ) : gastos.error ? (
              <Text style={styles.texto}>{describeDbError(gastos.error)}</Text>
            ) : (gastos.data ?? []).length === 0 ? (
              <Text style={styles.texto}>Aún no has terminado nada en {activa.name}.</Text>
            ) : (
              <>
                {(gastos.data ?? []).slice(0, GASTOS_EN_RESUMEN).map((p, i) => (
                  <FilaGasto key={p.nombre} puesto={i + 1} producto={p} />
                ))}
                {(gastos.data ?? []).length > GASTOS_EN_RESUMEN ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Ver todos los productos que más gastas"
                    onPress={() => router.push('/gastos')}
                    style={({ pressed }) => [styles.enlace, pressed && styles.pulsado]}
                  >
                    <Text style={styles.enlaceTexto}>Ver todos</Text>
                    <CaretRight size={16} color={c.inkMuted} weight="bold" />
                  </Pressable>
                ) : null}
              </>
            )
          ) : (
            <View style={styles.bloqueo}>
              <Lock size={20} color={c.inkMuted} weight="duotone" />
              <Text style={styles.texto}>
                Con Opsi Premium ⭐ ves qué es lo que más gastas y lo que acabas tirando.
              </Text>
            </View>
          )}
        </Section>

        <Section title="Listas de la compra">
          <Row
            title={premium ? 'Hasta 10 listas por nevera' : 'Hasta 3 listas por nevera'}
            subtitle={premium ? undefined : 'Con Opsi Premium ⭐ puedes tener muchas más.'}
          />
        </Section>
      </ScrollView>

    </SafeAreaView>
  );
}

const MUESTRA = 40;

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  content: { paddingHorizontal: space.xl, paddingBottom: tabBarClearance, gap: space.xl },

  plan: {
    gap: space.xs,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  planPremium: { borderColor: c.brand, backgroundColor: c.brandSoft },
  planTitulo: { fontFamily: fonts.semibold, fontSize: 16, color: c.ink },
  planTexto: { fontSize: 13.5, lineHeight: 19, color: c.inkMuted },

  colores: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  color: { alignItems: 'center', gap: 6, minWidth: 56 },
  pulsado: { opacity: 0.7 },
  muestraAnillo: {
    width: MUESTRA + 10,
    height: MUESTRA + 10,
    borderRadius: (MUESTRA + 10) / 2,
    borderWidth: 2,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muestra: {
    width: MUESTRA,
    height: MUESTRA,
    borderRadius: MUESTRA / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  muestraBloqueada: { opacity: 0.55 },
  estrella: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
    borderWidth: 1,
    borderColor: c.border,
  },
  colorEtiqueta: { fontFamily: fonts.medium, fontSize: 12.5, color: c.inkMuted },
  colorEtiquetaOn: { fontFamily: fonts.semibold, color: c.ink },

  texto: { fontSize: 13.5, lineHeight: 19, color: c.inkMuted },
  enlace: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touchTarget + 8 },
  enlaceTexto: { flex: 1, fontFamily: fonts.semibold, fontSize: 14.5, color: c.ink },
  bloqueo: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
}));
