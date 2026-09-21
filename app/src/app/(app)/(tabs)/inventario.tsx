import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { fetchPriorityList, type PriorityGroup, type PriorityItem } from '@/api/inventory';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { ItemRow } from '@/shared/ui/ItemRow';
import { queryKeys } from '@/shared/lib/query';
import { colors, font, radius, space, touchTarget } from '@/shared/theme/tokens';

/**
 * El orden de los grupos NO es alfabético ni casual: es el orden en que hay
 * que mirar la despensa. Y «sin fecha» va antes que «congelado» a propósito:
 * no saber cuándo vence algo es una pregunta abierta, no una tranquilidad.
 */
const GROUPS: { key: PriorityGroup; title: string; dot: string; tone?: 'danger' | 'warn' }[] = [
  { key: 'high', title: 'Prioridad alta', dot: colors.expiry, tone: 'danger' },
  { key: 'medium', title: 'Prioridad media', dot: '#C67A1E', tone: 'warn' },
  { key: 'low', title: 'Sin urgencia', dot: '#B9B1A3' },
  { key: 'undated', title: 'Sin fecha', dot: 'transparent' },
  { key: 'frozen', title: 'En el congelador', dot: '#8FB9D9' },
];

export default function ConsumirPrimero() {
  const router = useRouter();

  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: queryKeys.priorityList,
    queryFn: fetchPriorityList,
  });

  const items = data ?? [];
  const urgent = items.filter((i) => i.priority === 'high').length;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.wordmark}>Opsi</Text>
          <Link href="/alta" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Añadir alimento" style={styles.add}>
              <Text style={styles.addIcon}>+</Text>
            </Pressable>
          </Link>
        </View>
        <Text style={font.title}>Consumir primero</Text>
        <Text style={font.bodySmall}>
          {items.length === 0
            ? 'Nada guardado todavía'
            : `${items.length} ${items.length === 1 ? 'alimento' : 'alimentos'}` +
              (urgent > 0 ? ` · ${urgent} ${urgent === 1 ? 'pide' : 'piden'} atención hoy` : '')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isPending} onRefresh={() => void refetch()} tintColor={colors.brand} />
        }
      >
        {isPending ? <ActivityIndicator color={colors.brand} style={styles.loader} /> : null}

        <ErrorNote message={error ? (error as Error).message : null} />

        {!isPending && items.length === 0 && !error ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tu despensa está vacía</Text>
            <Text style={font.bodySmall}>
              Da de alta lo primero y aparecerá aquí, ordenado por lo que conviene gastar antes.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/alta')}
              style={styles.emptyButton}
            >
              <Text style={styles.emptyButtonText}>Añadir un alimento</Text>
            </Pressable>
          </View>
        ) : null}

        {GROUPS.map((group) => {
          const groupItems = items.filter((i: PriorityItem) => i.priority === group.key);
          if (groupItems.length === 0) return null;

          return (
            <View key={group.key} style={styles.group}>
              <View style={styles.groupHeader}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: group.dot },
                    group.dot === 'transparent' && styles.dotHollow,
                  ]}
                />
                <Text
                  style={[
                    styles.groupTitle,
                    group.tone === 'danger' && { color: colors.expiry },
                    group.tone === 'warn' && { color: colors.warning },
                  ]}
                >
                  {group.title}
                </Text>
              </View>
              {groupItems.map((item) => (
                <ItemRow key={item.id} item={item} />
              ))}
            </View>
          );
        })}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md, gap: space.xs },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  wordmark: { fontSize: 21, fontWeight: '600', color: colors.brand },
  add: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: { color: colors.ground, fontSize: 26, lineHeight: 30, fontWeight: '400' },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.lg },
  loader: { marginTop: space.xl },
  group: { gap: space.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotHollow: { borderWidth: 1.5, borderColor: '#B9B1A3' },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  empty: { gap: space.md, paddingVertical: space.xxl, alignItems: 'flex-start' },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: colors.ink },
  emptyButton: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    backgroundColor: colors.brand,
    marginTop: space.xs,
  },
  emptyButtonText: { color: colors.ground, fontSize: 15, fontWeight: '600' },
});
