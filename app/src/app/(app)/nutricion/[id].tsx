import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaretLeft, Lock } from 'phosphor-react-native';

import { idDeRuta } from '@/api/catalogo';
import { fetchSettings } from '@/api/settings';
import { ContenidoNutricion } from '@/features/nutricion/ContenidoNutricion';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

/**
 * El detalle de la nutrición de un producto del catálogo: Nutri-Score, grupo NOVA, la tabla
 * por 100 g o 100 ml, ración y aditivos, tal y como los declara Open Food Facts.
 *
 * El `id` de la ruta es el del producto del catálogo y se comprueba como uuid: lo que llega
 * por un enlace no se fía. Quién puede ver qué lo decide el servidor (`nutrition_of_products`
 * y la RLS de su tabla); aquí el candado solo evita pedir lo que se va a rechazar.
 *
 * Abrir este detalle puede renovar la ficha en Open Food Facts si es antigua (ver
 * `ContenidoNutricion`): es una acción de la persona, por eso no ocurre al listar.
 */
export default function DetalleNutricion() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const productoId = idDeRuta(params.id);

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const premium = settings.data?.plan === 'premium';

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
          <Text style={styles.backText}>Nutrición</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {settings.isPending ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={settings.error ? describeDbError(settings.error) : null} />

        {!settings.isPending && !premium ? (
          <View style={styles.bloqueo}>
            <Lock size={22} color={c.inkMuted} weight="duotone" />
            <Text style={styles.texto}>
              Con Opsi Premium ⭐ ves el Nutri-Score y el grupo NOVA de tus productos.
            </Text>
          </View>
        ) : null}

        {premium && productoId === null ? (
          <View style={styles.sinProducto}>
            <Text style={t.body}>No encuentro ese producto.</Text>
            <Button label="Volver" variant="quiet" onPress={() => router.back()} />
          </View>
        ) : null}

        {premium && productoId !== null ? <ContenidoNutricion productoId={productoId} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.xs },
  back: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.md },
  texto: { flex: 1, fontSize: 13.5, lineHeight: 19, color: c.inkMuted },
  sinProducto: { gap: space.md },
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
