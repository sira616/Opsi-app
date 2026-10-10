import { useQuery } from '@tanstack/react-query';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Nevera } from '@/api/household';
import { fetchPriorityList, type PriorityGroup, type PriorityItem } from '@/api/inventory';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { AvisoInvitaciones } from '@/features/neveras/AvisoInvitaciones';
import { PildoraNevera } from '@/features/neveras/PildoraNevera';
import { describeDbError } from '@/shared/lib/db-errors';
import type { Palette } from '@/shared/theme/tokens';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import {
  aplicarFiltro,
  FILTRO_VACIO,
  FiltroInventario,
  filtroActivo,
  type Filtro,
} from '@/shared/ui/FiltroInventario';
import { ItemRow } from '@/shared/ui/ItemRow';
import { queryKeys } from '@/shared/lib/query';
import { Barcode, BowlFood, Carrot, Confetti, Egg } from 'phosphor-react-native';
import { tabBarClearance,makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

/**
 * El orden de los grupos NO es alfabético ni casual: es el orden en que hay
 * que mirar la despensa. Y «sin fecha» va antes que «congelado» a propósito:
 * no saber cuándo vence algo es una pregunta abierta, no una tranquilidad.
 */
type Grupo = { key: PriorityGroup; title: string; dot: string; tone?: 'danger' | 'warn' | 'frost' };

function grupos(c: Palette): Grupo[] {
  return [
    { key: 'high', title: 'Prioridad alta', dot: c.expiry, tone: 'danger' },
    { key: 'medium', title: 'Prioridad media', dot: c.warning, tone: 'warn' },
    { key: 'low', title: 'Sin urgencia', dot: c.inkFaint },
    { key: 'undated', title: 'Sin fecha', dot: 'transparent' },
    { key: 'frozen', title: 'En el congelador', dot: c.frost, tone: 'frost' },
  ];
}

/**
 * «Consumir primero» de la nevera activa.
 *
 * La pantalla de verdad está en `Inventario`, y esta cáscara solo le da la
 * nevera con `key` por su id. Es a propósito: al cambiar de nevera la pantalla
 * se monta de cero, y con ella se van el filtro por pasillo —una categoría de
 * la nevera anterior que quizá no existe en la nueva, y dejaría un «Por ahí no
 * sale nada» sin explicación— y la posición del scroll.
 */
export default function ConsumirPrimero() {
  const { activa } = useNeveraActual();
  return <Inventario key={activa.id} nevera={activa} />;
}

function Inventario({ nevera }: { nevera: Nevera }) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();

  // La clave lleva el id de la nevera: sin él, la caché de una nevera se serviría
  // como la de otra durante el minuto que dura fresca.
  const { data, error, isPending, isFetching, refetch } = useQuery({
    queryKey: queryKeys.priorityList(nevera.id),
    queryFn: () => fetchPriorityList(nevera.id),
  });

  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VACIO);

  const todos = data ?? [];
  // El filtro se aplica ENCIMA del orden que trae la base de datos, no en su
  // lugar: por defecto no quita nada y la pantalla es la de siempre.
  const items = aplicarFiltro(todos, filtro);
  const urgent = items.filter((i) => i.priority === 'high').length;
  const filtrando = filtroActivo(filtro);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.wordmark}>Opsi</Text>
          {/* Con el hueco sobrante para sí: el nombre de la nevera cede ante el
              logo y el «+», que tienen ancho fijo. */}
          <View style={styles.pildoraHueco}>
            <PildoraNevera />
          </View>
          <Link href="/escanear" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Escanear un código de barras"
              style={styles.escanear}
            >
              <Barcode size={22} color={c.brandInk} weight="bold" />
            </Pressable>
          </Link>
          <Link href="/alta" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Añadir alimento" style={styles.add}>
              <Text style={styles.addIcon}>+</Text>
            </Pressable>
          </Link>
        </View>
        <Text style={t.title}>Consumir primero</Text>
        <Text style={t.bodySmall}>
          {todos.length === 0
            ? 'Aún no hay nada guardado'
            : filtrando
              ? `${items.length} de ${todos.length}`
              : `${items.length} ${items.length === 1 ? 'alimento' : 'alimentos'}` +
                (urgent > 0
                  ? ` · ${urgent} ${urgent === 1 ? 'pide' : 'piden'} atención hoy`
                  : ' · nada urgente hoy')}
        </Text>

        <AvisoInvitaciones />

        {todos.length > 0 ? (
          <View style={styles.filtro}>
            <FiltroInventario items={todos} filtro={filtro} onChange={setFiltro} />
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={isFetching && !isPending} onRefresh={() => void refetch()} tintColor={c.brand} />
        }
      >
        {isPending ? <ActivityIndicator color={c.brand} style={styles.loader} /> : null}

        <ErrorNote message={error ? describeDbError(error) : null} />

        {!isPending && todos.length > 0 && items.length === 0 ? (
          <View style={styles.sinResultados}>
            <Text style={styles.emptyTitle}>Por ahí no sale nada</Text>
            <Text style={t.bodySmall}>
              Tienes {todos.length} {todos.length === 1 ? 'guardado' : 'guardados'}, pero ninguno
              encaja con este filtro. Quítalo y vuelven todos.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setFiltro(FILTRO_VACIO)}
              style={styles.emptyButton}
            >
              <Text style={styles.emptyButtonText}>Ver todo</Text>
            </Pressable>
          </View>
        ) : null}

        {!isPending && todos.length === 0 && !error ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcons}>
              <View style={[styles.emptyIcon, { backgroundColor: c.brandSoft }]}>
                <Carrot size={26} color={c.brand} weight="duotone" />
              </View>
              <View style={[styles.emptyIcon, { backgroundColor: c.warningSoft, marginLeft: -12 }]}>
                <Egg size={26} color={c.warning} weight="duotone" />
              </View>
              <View style={[styles.emptyIcon, { backgroundColor: c.frostSoft, marginLeft: -12 }]}>
                <BowlFood size={26} color={c.frost} weight="duotone" />
              </View>
            </View>
            <Text style={styles.emptyTitle}>Aquí no hay nada. Tu nevera está en modo monje.</Text>
            <Text style={t.bodySmall}>
              Añade lo primero que pilles. Lo que corra más prisa se pone arriba del todo.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/alta')}
              style={styles.emptyButton}
            >
              <Text style={styles.emptyButtonText}>Añadir alimento</Text>
            </Pressable>
          </View>
        ) : null}

        {!isPending && items.length > 0 && urgent === 0 && !filtrando ? (
          <View style={styles.allGood}>
            <Confetti size={20} color={c.brand} weight="fill" />
            <Text style={styles.allGoodText}>
              Hoy no corre prisa nada. Cena lo que te apetezca.
            </Text>
          </View>
        ) : null}

        {grupos(c).map((group) => {
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
                    group.tone === 'danger' && { color: c.expiry },
                    group.tone === 'warn' && { color: c.warning },
                    group.tone === 'frost' && { color: c.frost },
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

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: space.md, gap: space.xs },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  pildoraHueco: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  wordmark: { fontSize: 21, fontWeight: '600', color: c.brand },
  add: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    backgroundColor: c.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addIcon: { color: c.ground, fontSize: 26, lineHeight: 30, fontWeight: '400' },
  // El gemelo del «+», en tono suave: escanear es la forma rápida de añadir y no
  // debe pesar más que el botón principal.
  escanear: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    backgroundColor: c.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filtro: { marginTop: space.md },
  content: { paddingHorizontal: space.xl, paddingBottom: tabBarClearance, gap: space.lg },
  sinResultados: { gap: space.md, paddingVertical: space.xxl, alignItems: 'flex-start' },
  loader: { marginTop: space.xl },
  allGood: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    backgroundColor: c.brandSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  allGoodText: { flex: 1, fontSize: 13, lineHeight: 18, color: c.brandInk },
  group: { gap: space.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotHollow: { borderWidth: 1.5, borderColor: c.inkFaint },
  groupTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  empty: { gap: space.md, paddingVertical: space.xxl, alignItems: 'flex-start' },
  emptyIcons: { flexDirection: 'row', marginBottom: space.xs },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: c.ground,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: c.ink },
  emptyButton: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    backgroundColor: c.brand,
    marginTop: space.xs,
  },
  emptyButtonText: { color: c.ground, fontSize: 15, fontWeight: '600' },
}));
