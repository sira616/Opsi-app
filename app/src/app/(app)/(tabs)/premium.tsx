import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ChartBar,
  ChatCircleDots,
  Check,
  JarLabel,
  ListChecks,
  Package,
  Palette,
  Star,
  UserCircle,
} from 'phosphor-react-native';

import { fetchMasUsados, fetchProductosConocidos, GASTOS_EN_RESUMEN } from '@/api/premium';
import { fetchSettings, updateSettings } from '@/api/settings';
import { Nota, useAjustesStyles } from '@/features/ajustes/ui';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { usePerfil } from '@/features/perfil/usePerfil';
import { Widget } from '@/features/premium/Widget';
import { describeDbError } from '@/shared/lib/db-errors';
import { resumenDelPerfil } from '@/shared/lib/perfil';
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
  useAspecto,
  useTheme,
  useType,
  type Acento,
} from '@/shared/theme/tokens';

/**
 * Opsi Premium ⭐: el panel de lo que añade, organizado en widgets por categoría.
 *
 * Premium es un conjunto de funciones sueltas, y cada una es un widget: icono, título, una
 * línea con lo que hay dentro y, al tocarlo, su pantalla. Las categorías son «Asistente»,
 * «Tu comida» y «A tu manera». Cuando llegue una función nueva, es un widget más en su
 * categoría, no una sección nueva de una lista que ya nadie lee entera.
 *
 * Todo lo premium lo decide el SERVIDOR: el color solo lo guarda el trigger de
 * `user_settings` si el plan lo permite, y `most_used_products`, `my_known_products` y
 * `nutrition_of_products` rechazan a quien no lo tiene. Esta pantalla enseña candados en
 * vez de botones que van a fallar, y esa es toda su parte; si alguien se saltara los
 * candados, el servidor diría que no igual. El chat NO está bloqueado: todavía no hay nada
 * que cobrar ni limitar.
 *
 * Es una pestaña de la barra, donde antes estaba el chat de Opsi (que ahora vive como una
 * pantalla propia y se abre desde la nevera y desde aquí).
 *
 * Contratarlo todavía no se puede: no hay pago (ver `docs/internal/PENDIENTES.md`), y
 * la pantalla lo dice en vez de enseñar un botón de compra que no compra nada. Hoy el
 * plan lo cambia quien tiene acceso a la base de datos (`npm run dev:plan`).
 */
export default function Premium() {
  const styles = useStyles();
  const compartidos = useAjustesStyles();
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

  // Se piden uno más de los que se enseñan en la pantalla de dentro: la misma consulta
  // que ya tiene en caché, y de aquí solo se lee el primero.
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

  /** Un widget de Premium: sin el plan no abre nada y lo dice; con él, va a su pantalla. */
  function abrir(ruta: '/productos' | '/gastos' | '/nutricion') {
    if (!premium) {
      setAviso('Eso es de Opsi Premium ⭐.');
      return;
    }
    setAviso(null);
    router.push(ruta);
  }

  // El perfil personal es opcional y no lleva candado: es tu dato, no una función de pago.
  const { guardado: perfilGuardado, cargando: cargandoPerfil } = usePerfil();

  const totalProductos = conocidos.data?.length ?? 0;
  const masGastado = gastos.data?.[0];

  const resumenProductos = conocidos.error
    ? 'No he podido cargarlos'
    : conocidos.isPending
      ? ''
      : totalProductos === 0
        ? 'Aún no tienes ninguno'
        : `${totalProductos} ${totalProductos === 1 ? 'producto' : 'productos'}`;

  const resumenGastos = gastos.error
    ? 'No he podido cargarlo'
    : gastos.isPending
      ? ''
      : masGastado
        ? `${masGastado.nombre}: ${masGastado.agotado} ${masGastado.agotado === 1 ? 'vez' : 'veces'}`
        : `Nada terminado en ${activa.name}`;

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
          {premium ? null : (
            <Text style={styles.planTexto}>Todavía no se puede contratar.</Text>
          )}
        </View>

        <View style={styles.categoria}>
          <Text style={compartidos.sectionTitle}>Asistente</Text>
          <View style={styles.rejilla}>
            <Widget
              ancho
              icono={ChatCircleDots}
              titulo="Chat de Opsi"
              resumen="Pregúntale qué cenar o qué gastar primero"
              onPress={() => router.push('/chat')}
            />
            <Widget
              ancho
              icono={UserCircle}
              titulo="Tu perfil"
              resumen={cargandoPerfil ? '' : resumenDelPerfil(perfilGuardado)}
              onPress={() => router.push('/perfil')}
            />
          </View>
        </View>

        <View style={styles.categoria}>
          <Text style={compartidos.sectionTitle}>Tu comida</Text>
          <View style={styles.rejilla}>
            <Widget
              icono={Package}
              titulo="Tus productos"
              resumen={resumenProductos}
              bloqueado={!premium}
              onPress={() => abrir('/productos')}
            />
            <Widget
              icono={ChartBar}
              titulo="Lo que más gastas"
              resumen={resumenGastos}
              bloqueado={!premium}
              onPress={() => abrir('/gastos')}
            />
            {/* El resumen dice qué hay dentro y no cuenta nada: la nutrición se pide al abrir la pantalla, no en este panel. */}
            <Widget
              icono={JarLabel}
              titulo="Nutrición"
              resumen="Nutri-Score y NOVA de tus productos"
              bloqueado={!premium}
              onPress={() => abrir('/nutricion')}
            />
          </View>
        </View>

        <View style={styles.categoria}>
          <Text style={compartidos.sectionTitle}>A tu manera</Text>
          <View style={styles.rejilla}>
            <Widget ancho icono={Palette} titulo="Color de la app">
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
            </Widget>
            <Widget
              icono={ListChecks}
              titulo="Listas de la compra"
              resumen={premium ? 'Hasta 10 por nevera' : 'Hasta 3 por nevera. Con Premium, más'}
              onPress={() => router.push('/lista')}
            />
          </View>
        </View>
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

  categoria: { gap: space.sm },
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  pulsado: { opacity: 0.7 },

  colores: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  color: { alignItems: 'center', gap: 6, minWidth: 56 },
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
}));
