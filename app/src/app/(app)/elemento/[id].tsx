import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CheckCircle,
  Drop,
  ForkKnife,
  Minus,
  Package,
  Snowflake,
  Trash,
} from 'phosphor-react-native';

import {
  actions,
  fetchItem,
  fetchItemEvents,
  type InventoryEvent,
  type ItemDetail,
} from '@/api/inventory';
import { describeDateSource, describeDaysLeft, describeDesde, diasDesde } from '@/shared/lib/dates';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { formatQuantity, toBase } from '@/shared/lib/units';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TextField } from '@/shared/ui/TextField';
import { makeStyles, radius, space, tabular, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

const STATE_LABEL: Record<ItemDetail['state'], string> = {
  closed: 'Cerrado',
  open: 'Abierto',
  partially_consumed: 'Abierto',
  frozen: 'Congelado',
  thawed: 'Descongelado',
  finished: 'Agotado',
  discarded: 'Tirado',
};

const EVENT_LABEL: Record<string, string> = {
  created: 'Añadido',
  opened: 'Abierto',
  quantity_used: 'Usado',
  frozen: 'Congelado',
  thawed: 'Descongelado',
  finished: 'Terminado',
  discarded: 'Tirado',
  updated: 'Modificado',
};

export default function Detalle() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [usePanel, setUsePanel] = useState(false);
  const [amount, setAmount] = useState('');

  const item = useQuery({
    queryKey: queryKeys.item(id),
    queryFn: () => fetchItem(id),
    enabled: Boolean(id),
  });

  const events = useQuery({
    queryKey: queryKeys.itemEvents(id),
    queryFn: () => fetchItemEvents(id),
    enabled: Boolean(id),
  });

  /**
   * Una sola mutación para las seis acciones.
   *
   * Lo importante está en onSuccess: se invalida TAMBIÉN la lista, porque
   * cualquier acción cambia la fecha límite efectiva y por tanto el sitio del
   * elemento en «Consumir primero». Olvidarlo deja la lista mintiendo hasta la
   * siguiente recarga, que es el bug clásico de estas pantallas.
   */
  const act = useMutation({
    mutationFn: (run: () => Promise<void>) => run(),
    async onSuccess() {
      setError(null);
      setUsePanel(false);
      setAmount('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.item(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.itemEvents(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.priorityList }),
      ]);
    },
    onError(caught: unknown) {
      setError(describeDbError(caught));
    },
  });

  if (item.isPending) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.safe, styles.center]}>
        <ActivityIndicator color={c.brand} />
      </SafeAreaView>
    );
  }

  const data = item.data;
  if (!data) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.safe, styles.center]}>
        <Text style={t.body}>Ese elemento ya no está.</Text>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backText}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  // Un alias ya estrechado: dentro de las funciones de abajo TypeScript no
  // arrastra el `if (!data) return` de arriba, porque están izadas.
  const detail: ItemDetail = data;

  const closedOut = data.state === 'finished' || data.state === 'discarded';
  const percent =
    data.initial_quantity > 0
      ? Math.max(0, Math.min(1, data.remaining_quantity / data.initial_quantity))
      : 0;

  function run(label: string, fn: () => Promise<void>) {
    setError(null);
    act.mutate(fn, { onError: () => setError(`No se pudo ${label}.`) });
  }

  function onUse() {
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Pon una cantidad mayor que cero.');
      return;
    }
    run('usar esa cantidad', () => actions.use(detail.id, toBase(value, detail.display_unit)));
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={styles.back}
        >
          <Text style={styles.backText}>‹ Inventario</Text>
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={t.title}>{data.name}</Text>
          <View style={styles.chips}>
            <Text style={styles.stateChip}>{STATE_LABEL[data.state]}</Text>
            <Text style={t.bodySmall}>{formatQuantity(data.remaining_quantity, data.display_unit)}</Text>
          </View>
        </View>

        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${percent * 100}%` }]} />
        </View>

        <FechaLimite item={data} />

        <ErrorNote message={error} />

        {!closedOut ? (
          <View style={styles.actions}>
            <Text style={styles.sectionTitle}>Qué hago con esto</Text>

            {data.state === 'frozen' ? (
              <>
                <Action
                  label="Descongelar"
                  icon={<Drop size={20} color={c.frost} weight="duotone" />}
                  hint="A partir de ahí, 24 horas para consumirlo."
                  onPress={() => run('descongelarlo', () => actions.thaw(data.id))}
                  busy={act.isPending}
                />
                <ConfirmAction
                  label="Tirar"
                  icon={<Trash size={20} color={c.expiry} weight="duotone" />}
                  confirmLabel="Sí, tirarlo"
                  question={`¿Tirar ${data.name}? No se puede deshacer.`}
                  danger
                  onConfirm={() => run('tirarlo', () => actions.discard(detail.id))}
                  busy={act.isPending}
                />
              </>
            ) : (
              <>
                {data.opened_at === null ? (
                  <Action
                    label="Abrir"
                    icon={<Package size={20} color={c.brand} weight="duotone" />}
                    hint="Desde que se abre, muchos alimentos duran menos de lo que pone el envase."
                    onPress={() => run('abrirlo', () => actions.open(data.id))}
                    busy={act.isPending}
                  />
                ) : null}

                <Action
                  label="Usar cantidad"
                  icon={<ForkKnife size={20} color={c.brand} weight="duotone" />}
                  onPress={() => setUsePanel((v) => !v)}
                  busy={act.isPending}
                />

                {usePanel ? (
                  <View style={styles.usePanel}>
                    <TextField
                      label={`Cuánto has usado (en ${data.display_unit === 'unit' ? 'unidades' : data.display_unit})`}
                      value={amount}
                      onChangeText={setAmount}
                      keyboardType="decimal-pad"
                      inputMode="decimal"
                      autoFocus
                    />
                    <Action
                      label="Descontar"
                      icon={<Minus size={20} color={c.onBrand} weight="bold" />}
                      onPress={onUse}
                      busy={act.isPending}
                      primary
                    />
                  </View>
                ) : null}

                <Action
                  label="Congelar"
                  icon={<Snowflake size={20} color={c.frost} weight="duotone" />}
                  hint={
                    data.state === 'thawed'
                      ? 'Ya se descongeló una vez: no vuelvas a congelarlo sin cocinarlo antes.'
                      : 'La cuenta atrás se para mientras esté congelado.'
                  }
                  onPress={() => run('congelarlo', () => actions.freeze(data.id))}
                  busy={act.isPending}
                />

                <ConfirmAction
                  label="Terminar"
                  icon={<CheckCircle size={20} color={c.brand} weight="duotone" />}
                  confirmLabel="Sí, se ha terminado"
                  question={`¿Dar ${data.name} por terminado? Sale del inventario y no se puede deshacer.`}
                  onConfirm={() => run('marcarlo como terminado', () => actions.finish(detail.id))}
                  busy={act.isPending}
                />

                <ConfirmAction
                  label="Tirar"
                  icon={<Trash size={20} color={c.expiry} weight="duotone" />}
                  confirmLabel="Sí, tirarlo"
                  question={`¿Tirar ${data.name}? No se puede deshacer.`}
                  danger
                  onConfirm={() => run('tirarlo', () => actions.discard(detail.id))}
                  busy={act.isPending}
                />
              </>
            )}
          </View>
        ) : (
          <View style={styles.closedNote}>
            <Text style={t.bodySmall}>
              Este elemento está {STATE_LABEL[data.state].toLowerCase()} y ya no admite acciones.
            </Text>
          </View>
        )}

        <View style={styles.history}>
          <Text style={styles.sectionTitle}>Historial</Text>
          {(events.data ?? []).length === 0 ? (
            <Text style={t.bodySmall}>Todavía no hay nada registrado.</Text>
          ) : (
            (events.data ?? []).map((event: InventoryEvent) => (
              <View key={event.id} style={styles.eventRow}>
                <Text style={styles.eventDate}>
                  {new Date(event.created_at).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </Text>
                <Text style={t.body}>
                  {EVENT_LABEL[event.type] ?? event.type}
                  {event.quantity_used
                    ? ` · ${formatQuantity(event.quantity_used, data.display_unit)}`
                    : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * La parte que justifica que esta pantalla exista.
 *
 * Enseña la fecha límite efectiva Y de dónde sale. Que un brick abierto venza
 * antes de lo que pone el envase parece un error hasta que se explica, y un
 * número sin explicación es justo lo que el proyecto no quiere dar.
 */
function FechaLimite({ item }: { item: ItemDetail }) {
  const styles = useStyles();
  const c = useTheme();
  const urgent = item.priority === 'high';

  const explanation =
    item.effective_date_reason === 'after_thawing'
      ? 'Se descongeló, y lo descongelado se consume en 24 horas: eso manda sobre la fecha del envase.'
      : item.effective_date_reason === 'after_opening'
        ? 'Está abierto, y la conservación tras abrir llega antes que la fecha del envase.'
        : item.frozen_days > 0
          ? `La fecha del envase, retrasada los ${item.frozen_days} días que pasó congelado.`
          : 'La fecha que trae el envase.';

  if (item.state === 'frozen') {
    // Dos cuentas distintas, y confundirlas sería mentir: `dentro` son los días
    // del tramo EN CURSO, y frozen_days los de tramos anteriores ya cerrados.
    const dentro = diasDesde(item.frozen_at);
    const desde = describeDesde(item.frozen_at);

    return (
      <View style={[styles.dateCard, styles.dateCardFrozen]}>
        <View style={styles.frozenHead}>
          <Snowflake size={15} color={c.frost} weight="fill" />
          <Text style={[styles.dateLabel, styles.dateLabelFrozen]}>En el congelador</Text>
        </View>

        <Text style={styles.dateValue}>
          {dentro === null
            ? 'Sin cuenta atrás'
            : dentro === 0
              ? 'Desde hoy'
              : `${dentro} ${dentro === 1 ? 'día' : 'días'}`}
        </Text>

        {desde && dentro !== null && dentro > 0 ? (
          <Text style={styles.frozenSince}>Lo congelaste {desde}.</Text>
        ) : null}

        <Text style={styles.dateExplain}>
          Mientras esté ahí no vence: la cuenta atrás está parada y se reanuda donde se quedó
          al sacarlo.
          {item.frozen_days > 0
            ? ` De veces anteriores lleva ${item.frozen_days} ${
                item.frozen_days === 1 ? 'día' : 'días'
              } ya sumados a su fecha.`
            : ''}
        </Text>
      </View>
    );
  }

  if (item.effective_limit_date === null) {
    return (
      <View style={[styles.dateCard, styles.dateCardNeutral]}>
        <Text style={styles.dateLabel}>Sin fecha</Text>
        <Text style={styles.dateValue}>No sabemos cuándo vence</Text>
        <Text style={styles.dateExplain}>
          No es lo mismo que «sin urgencia». Si el envase trae una fecha, merece la pena ponerla.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.dateCard, urgent ? styles.dateCardUrgent : styles.dateCardNeutral]}>
      <Text style={[styles.dateLabel, urgent && styles.dateLabelUrgent]}>
        Fecha límite · {describeDateSource(item.effective_date_source)}
      </Text>
      <Text style={[styles.dateValue, urgent && styles.dateValueUrgent]}>
        {describeDaysLeft(item.days_left)}
      </Text>
      <Text style={[styles.dateExplain, urgent && styles.dateExplainUrgent]}>{explanation}</Text>
    </View>
  );
}

function Action({
  label,
  icon,
  hint,
  onPress,
  busy,
  danger,
  primary,
}: {
  label: string;
  /** El icono de la acción: congelar es un copo, tirar una papelera. */
  icon?: React.ReactNode;
  hint?: string;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.actionWrapper}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onPress}
        style={({ pressed }) => [
          styles.action,
          danger && styles.actionDanger,
          primary && styles.actionPrimary,
          pressed && styles.actionPressed,
          busy && styles.actionBusy,
        ]}
      >
        {icon}
        <Text
          style={[
            styles.actionText,
            danger && styles.actionTextDanger,
            primary && styles.actionTextPrimary,
          ]}
        >
          {label}
        </Text>
      </Pressable>
      {hint ? <Text style={styles.actionHint}>{hint}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md },
  content: { padding: space.xl, gap: space.xl, paddingBottom: space.xxl * 2 },

  back: { minHeight: touchTarget, justifyContent: 'center', marginLeft: -2, alignSelf: 'flex-start' },
  backLink: { minHeight: touchTarget, justifyContent: 'center' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },

  titleBlock: { gap: space.sm },
  chips: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  stateChip: {
    fontSize: 11.5,
    fontWeight: '600',
    color: c.brand,
    backgroundColor: c.brandSoft,
    borderRadius: radius.sm - 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: 'hidden',
  },

  bar: { height: 8, borderRadius: 4, backgroundColor: c.border, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4, backgroundColor: c.brand },

  dateCard: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.xs + 2 },
  dateCardNeutral: { backgroundColor: c.surface, borderColor: c.border },
  dateCardFrozen: { backgroundColor: c.frostSoft, borderColor: c.frost },
  dateCardUrgent: { backgroundColor: c.expirySoft, borderColor: c.expiryLine },
  dateLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  dateLabelUrgent: { color: c.expiry },
  dateLabelFrozen: { color: c.frostInk },
  dateValue: { ...tabular, fontSize: 22, fontWeight: '600', color: c.ink },
  dateValueUrgent: { color: c.expiry },
  frozenHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  frozenSince: { fontSize: 13, fontWeight: '600', color: c.frostInk },
  dateExplain: { fontSize: 12.5, lineHeight: 18, color: c.inkMuted },
  dateExplainUrgent: { color: c.expiryInk },

  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
    marginBottom: space.xs,
  },

  actions: { gap: space.sm },
  actionWrapper: { gap: 3 },
  action: {
    minHeight: touchTarget + 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 2,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  actionPrimary: { backgroundColor: c.brand, borderColor: c.brand },
  actionDanger: { borderColor: c.expiryLine },
  actionPressed: { opacity: 0.85 },
  actionBusy: { opacity: 0.5 },
  actionText: { fontSize: 15, fontWeight: '600', color: c.ink },
  actionTextPrimary: { color: c.ground },
  actionTextDanger: { color: c.expiry },
  actionHint: { fontSize: 11.5, lineHeight: 16, color: c.inkFaint, paddingHorizontal: 2 },

  usePanel: {
    gap: space.md,
    padding: space.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
  },

  closedNote: {
    padding: space.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
  },

  history: { gap: space.sm },
  eventRow: { flexDirection: 'row', gap: space.md, alignItems: 'baseline' },
  eventDate: { fontSize: 12, color: c.inkFaint, minWidth: 58 },
}));
