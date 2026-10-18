import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaretLeft, Lock, Star } from 'phosphor-react-native';

import { DIAS_PERIODO, fetchMasUsados } from '@/api/premium';
import { fetchSettings } from '@/api/settings';
import { FilaGasto } from '@/features/gastos/FilaGasto';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

/** Lo más que devuelve el servidor (`most_used_products`): más que cualquier nevera. */
const TODOS = 200;

/**
 * Lo que más gastas, entero: todos los productos que se han terminado en la nevera en los
 * últimos 90 días, del más gastado al menos. La pestaña de Premium enseña solo los cinco
 * primeros y manda aquí.
 *
 * Es de Premium ⭐ y lo comprueba el servidor (`most_used_products`); aquí el candado solo
 * evita pedir lo que se va a rechazar.
 */
export default function Gastos() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const { activa } = useNeveraActual();

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const premium = settings.data?.plan === 'premium';

  const gastos = useQuery({
    queryKey: queryKeys.masUsados(activa.id, TODOS),
    queryFn: () => fetchMasUsados(activa.id, TODOS),
    enabled: premium,
  });

  const lista = gastos.data ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={styles.back}
        >
          <CaretLeft size={16} color={c.inkMuted} weight="bold" />
          <Text style={styles.backText}>Premium</Text>
        </Pressable>
        <View style={styles.titulo}>
          <Text style={t.title}>Lo que más gastas</Text>
          <Star size={24} color={c.brandBright} weight="fill" />
        </View>
        {premium ? (
          <Text style={t.bodySmall}>
            {activa.name}, últimos {DIAS_PERIODO} días
          </Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {settings.isPending ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={settings.error ? describeDbError(settings.error) : null} />

        {!settings.isPending && !premium ? (
          <View style={styles.bloqueo}>
            <Lock size={22} color={c.inkMuted} weight="duotone" />
            <Text style={styles.texto}>
              Con Opsi Premium ⭐ ves qué es lo que más gastas y lo que acabas tirando.
            </Text>
          </View>
        ) : null}

        {premium && gastos.isPending ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={gastos.error ? describeDbError(gastos.error) : null} />

        {premium && !gastos.isPending && !gastos.error && lista.length === 0 ? (
          <Text style={styles.texto}>Aún no has terminado nada en {activa.name}.</Text>
        ) : null}

        {lista.map((p, i) => (
          <FilaGasto key={p.nombre} puesto={i + 1} producto={p} />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm, gap: space.xs },
  back: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.xs },
  texto: { fontSize: 13.5, lineHeight: 19, color: c.inkMuted },
  bloqueo: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
}));
