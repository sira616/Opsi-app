import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CaretLeft,
  ChartPie,
  ChartPieSlice,
  CheckCircle,
  CircleHalf,
  Drop,
  ForkKnife,
  Minus,
  Package,
  PencilSimple,
  Plus,
  Snowflake,
  Trash,
  type IconProps,
} from 'phosphor-react-native';

import {
  actions,
  fetchItem,
  fetchItemEvents,
  type InventoryEvent,
  type ItemDetail,
} from '@/api/inventory';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { describeDateSource, describeDaysLeft, describeDesde, diasDesde } from '@/shared/lib/dates';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { formatQuantity, toBase } from '@/shared/lib/units';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TextField } from '@/shared/ui/TextField';
import {
  fonts,
  makeStyles,
  radius,
  space,
  tabular,
  touchTarget,
  useTheme,
  useType,
} from '@/shared/theme/tokens';

const STATE_LABEL: Record<ItemDetail['state'], string> = {
  closed: 'Sin abrir',
  open: 'Abierto',
  partially_consumed: 'Empezado',
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

/**
 * Las fracciones de «usar cantidad».
 *
 * Son de lo QUE QUEDA, no de lo inicial: «me he bebido la mitad» dicho sobre
 * un brick por la mitad significa la mitad de lo que había, no la mitad del
 * litro original.
 *
 * No hay un botón de «todo»: llegar a cero cierra el elemento, y para eso está
 * «Terminar», que pregunta antes. Una fracción nunca llega a cero, así que
 * ninguna de estas tres puede cerrar nada por accidente.
 */
const FRACCIONES: { glifo: string; valor: number; icono: (p: IconProps) => React.ReactElement }[] = [
  { glifo: '½', valor: 1 / 2, icono: (p) => <CircleHalf {...p} /> },
  { glifo: '⅓', valor: 1 / 3, icono: (p) => <ChartPieSlice {...p} /> },
  { glifo: '¼', valor: 1 / 4, icono: (p) => <ChartPie {...p} /> },
];

/**
 * Lo que descuenta una fracción, en unidad base.
 *
 * Se redondea a dos decimales y NO se ajusta al resto exacto. Cuadrar el
 * último tercio con lo que queda parece amable hasta que se ve lo que
 * implica: llegar a cero cierra el elemento, así que un toque en «⅓» lo daría
 * por terminado sin preguntar. Mejor que sobre un poco.
 */
function cantidadFraccion(restante: number, fraccion: number): number {
  return Math.round(restante * fraccion * 100) / 100;
}

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

  // Un fallo de red NO es «ese elemento ya no está». Los dos dejaban `data`
  // vacío y la pantalla decía lo mismo para los dos, que es mandar a alguien a
  // buscar un elemento borrado cuando lo único que pasa es que el servidor no
  // contesta. Se distinguen, y solo el caso real ofrece volver.
  if (item.isError) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.safe, styles.center]}>
        <Text style={t.body}>No he podido cargarlo.</Text>
        <View style={styles.errorBox}>
          <ErrorNote message={describeDbError(item.error)} />
        </View>
        <Pressable onPress={() => void item.refetch()} style={styles.backLink}>
          <Text style={styles.backText}>Reintentar</Text>
        </Pressable>
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
  const congelado = data.state === 'frozen';
  const urgente = data.priority === 'high';
  const percent =
    data.initial_quantity > 0
      ? Math.max(0, Math.min(1, data.remaining_quantity / data.initial_quantity))
      : 0;
  const tono = urgente ? c.expiry : congelado ? c.frost : c.brand;
  const tonoSuave = urgente ? c.expirySoft : congelado ? c.frostSoft : c.brandSoft;
  // Para TEXTO sobre el fondo suave hace falta el tono oscuro: el vivo sobre
  // su propio fondo se queda por debajo de AA (frost sobre frostSoft, 3.9:1).
  const tonoInk = urgente ? c.expiryInk : congelado ? c.frostInk : c.brandInk;

  /**
   * Lanza una acción.
   *
   * Sin `onError` propio, y eso es el arreglo de un bug: el que había
   * sustituía el mensaje del servidor por un «No se pudo usar esa cantidad»
   * genérico. Nuestras funciones ya contestan en español y dicen lo que pasa
   * —«Quieres usar 500 pero solo quedan 300»—, así que taparlo era perder el
   * único dato útil. Es el mismo error que ya se cometió con P0002.
   */
  function run(fn: () => Promise<void>) {
    setError(null);
    act.mutate(fn);
  }

  function usar(cantidadBase: number) {
    if (cantidadBase <= 0) {
      setError('Queda muy poco para descontar una parte. Usa «Terminar».');
      return;
    }
    run(() => actions.use(detail.id, cantidadBase));
  }

  function onUse() {
    const value = Number(amount.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) {
      setError('Pon una cantidad mayor que cero.');
      return;
    }
    const base = toBase(value, detail.display_unit);
    if (base > detail.remaining_quantity) {
      setError(
        `Solo quedan ${formatQuantity(detail.remaining_quantity, detail.display_unit)}.`,
      );
      return;
    }
    usar(base);
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
          <CaretLeft size={16} color={c.inkMuted} weight="bold" />
          <Text style={styles.backText}>Inventario</Text>
        </Pressable>

        {/* ── Cabecera: el mismo icono que en la lista ──────────────────── */}
        <View style={styles.cabecera}>
          <View style={[styles.avatar, { backgroundColor: tonoSuave }]}>
            <IconoComida nombre={data.name} size={30} color={tono} weight="duotone" />
          </View>
          <View style={styles.cabeceraTexto}>
            <Text style={t.title}>{data.name}</Text>
            <View style={styles.chips}>
              <Text style={[styles.stateChip, { backgroundColor: tonoSuave, color: tonoInk }]}>
                {STATE_LABEL[data.state]}
              </Text>
              {data.opened_at ? (
                <Text style={t.caption}>abierto {describeDesde(data.opened_at)}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {/* ── Cuánto queda ─────────────────────────────────────────────── */}
        <View style={styles.cantidadCard}>
          <View style={styles.cantidadFila}>
            <Text style={[styles.cantidadValor, { color: tono }]}>
              {formatQuantity(data.remaining_quantity, data.display_unit)}
            </Text>
            {data.remaining_quantity !== data.initial_quantity ? (
              <Text style={styles.cantidadInicial}>
                de {formatQuantity(data.initial_quantity, data.display_unit)}
              </Text>
            ) : null}
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${percent * 100}%`, backgroundColor: tono }]} />
          </View>
        </View>

        <FechaLimite item={data} />

        <ErrorNote message={error} />

        {!closedOut ? (
          <View style={styles.actions}>
            <Text style={styles.sectionTitle}>Qué hago con esto</Text>

            {congelado ? (
              <>
                <Action
                  label="Descongelar"
                  icono={<Drop size={20} color={c.frost} weight="duotone" />}
                  hint="A partir de ahí, 24 horas para consumirlo."
                  onPress={() => run(() => actions.thaw(detail.id))}
                  busy={act.isPending}
                />
                <ConfirmAction
                  label="Tirar"
                  icon={<Trash size={20} color={c.expiry} weight="duotone" />}
                  confirmLabel="Sí, tirarlo"
                  question={`¿Tirar ${data.name}? No se puede deshacer.`}
                  danger
                  onConfirm={() => run(() => actions.discard(detail.id))}
                  busy={act.isPending}
                />
              </>
            ) : (
              <>
                {data.opened_at === null ? (
                  <Action
                    label="Abrir"
                    icono={<Package size={20} color={c.brand} weight="duotone" />}
                    hint="Desde que se abre, muchos alimentos duran menos de lo que pone el envase."
                    onPress={() => run(() => actions.open(detail.id))}
                    busy={act.isPending}
                  />
                ) : null}

                {/* ── Usar cantidad, con sus fracciones ─────────────────── */}
                <View style={styles.usarBloque}>
                  <View style={styles.usarHead}>
                    <ForkKnife size={18} color={c.brand} weight="duotone" />
                    <Text style={styles.usarTitulo}>Usar</Text>
                  </View>

                  <View style={styles.fracciones}>
                    {FRACCIONES.map(({ glifo, valor, icono }) => {
                      const base = cantidadFraccion(data.remaining_quantity, valor);
                      const vacio = base <= 0;
                      return (
                        <Pressable
                          key={glifo}
                          accessibilityRole="button"
                          accessibilityLabel={`Usar ${glifo}, ${formatQuantity(base, data.display_unit)}`}
                          accessibilityState={{ disabled: vacio || act.isPending }}
                          disabled={vacio || act.isPending}
                          onPress={() => usar(base)}
                          style={({ pressed }) => [
                            styles.fraccion,
                            pressed && styles.pressed,
                            (vacio || act.isPending) && styles.fraccionApagada,
                          ]}
                        >
                          {icono({ size: 15, color: c.brand, weight: 'duotone' })}
                          <Text style={styles.fraccionGlifo}>{glifo}</Text>
                          <Text style={styles.fraccionCantidad} numberOfLines={1}>
                            {formatQuantity(base, data.display_unit)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {usePanel ? (
                    <View style={styles.usePanel}>
                      <TextField
                        label={`Otra cantidad, en ${
                          data.display_unit === 'unit' ? 'unidades' : data.display_unit
                        }`}
                        hint={`Quedan ${formatQuantity(data.remaining_quantity, data.display_unit)}`}
                        value={amount}
                        onChangeText={setAmount}
                        keyboardType="decimal-pad"
                        inputMode="decimal"
                        autoFocus
                      />
                      <Action
                        label="Descontar"
                        icono={<Minus size={20} color={c.onBrand} weight="bold" />}
                        onPress={onUse}
                        busy={act.isPending}
                        primary
                      />
                    </View>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => setUsePanel(true)}
                      style={({ pressed }) => [styles.otraCantidad, pressed && styles.pressed]}
                    >
                      <PencilSimple size={14} color={c.brand} weight="duotone" />
                      <Text style={styles.otraCantidadText}>Otra cantidad</Text>
                    </Pressable>
                  )}
                </View>

                <Action
                  label="Congelar"
                  icono={<Snowflake size={20} color={c.frost} weight="duotone" />}
                  hint={
                    data.state === 'thawed'
                      ? 'Ya se descongeló una vez: no vuelvas a congelarlo sin cocinarlo antes.'
                      : 'La cuenta atrás se para mientras esté congelado.'
                  }
                  onPress={() => run(() => actions.freeze(detail.id))}
                  busy={act.isPending}
                />

                <ConfirmAction
                  label="Terminar"
                  icon={<CheckCircle size={20} color={c.brand} weight="duotone" />}
                  confirmLabel="Sí, se ha terminado"
                  question={`¿Dar ${data.name} por terminado? Sale del inventario y no se puede deshacer.`}
                  onConfirm={() => run(() => actions.finish(detail.id))}
                  busy={act.isPending}
                />

                <ConfirmAction
                  label="Tirar"
                  icon={<Trash size={20} color={c.expiry} weight="duotone" />}
                  confirmLabel="Sí, tirarlo"
                  question={`¿Tirar ${data.name}? No se puede deshacer.`}
                  danger
                  onConfirm={() => run(() => actions.discard(detail.id))}
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

        <Historial
          eventos={events.data ?? []}
          unidad={data.display_unit}
          fallo={events.isError ? describeDbError(events.error) : null}
          cargando={events.isPending}
        />
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
        {item.date_kind === 'expiry' && item.effective_date_reason === 'label'
          ? 'Caduca'
          : 'Fecha límite'}{' '}
        · {describeDateSource(item.effective_date_source)}
      </Text>
      <Text style={[styles.dateValue, urgent && styles.dateValueUrgent]}>
        {describeDaysLeft(item.days_left)}
      </Text>
      <Text style={[styles.dateExplain, urgent && styles.dateExplainUrgent]}>{explanation}</Text>
    </View>
  );
}

/**
 * El historial.
 *
 * Lleva la HORA además del día: abrir y usar algo la misma tarde salían como
 * dos líneas idénticas, y entonces el historial no contaba nada.
 */
function Historial({
  eventos,
  unidad,
  fallo,
  cargando,
}: {
  eventos: InventoryEvent[];
  unidad: ItemDetail['display_unit'];
  /** El historial que no se pudo leer NO es un historial vacío. */
  fallo: string | null;
  cargando: boolean;
}) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();

  return (
    <View style={styles.history}>
      <Text style={styles.sectionTitle}>Historial</Text>
      {fallo ? (
        <ErrorNote message={fallo} />
      ) : cargando ? (
        <ActivityIndicator color={c.brand} />
      ) : eventos.length === 0 ? (
        <Text style={t.bodySmall}>Todavía no hay nada registrado.</Text>
      ) : (
        <View style={styles.historyCard}>
        {eventos.map((event) => {
          const fecha = new Date(event.created_at);
          return (
            <View key={event.id} style={styles.eventRow}>
              <View style={styles.eventIcon}>
                <IconoEvento tipo={event.type} color={c.inkMuted} />
              </View>
              <Text style={styles.eventText}>
                {EVENT_LABEL[event.type] ?? event.type}
                {event.quantity_used ? ` · ${formatQuantity(event.quantity_used, unidad)}` : ''}
              </Text>
              <Text style={styles.eventDate}>
                {fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                {'  '}
                {fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          );
        })}
        </View>
      )}
    </View>
  );
}

function IconoEvento({ tipo, color }: { tipo: string; color: string }) {
  const props = { size: 14, color, weight: 'duotone' } as const;
  switch (tipo) {
    case 'created':
      return <Plus {...props} weight="bold" />;
    case 'opened':
      return <Package {...props} />;
    case 'quantity_used':
      return <ForkKnife {...props} />;
    case 'frozen':
      return <Snowflake {...props} />;
    case 'thawed':
      return <Drop {...props} />;
    case 'finished':
      return <CheckCircle {...props} />;
    case 'discarded':
      return <Trash {...props} />;
    default:
      return <PencilSimple {...props} />;
  }
}

function Action({
  label,
  icono,
  hint,
  onPress,
  busy,
  danger,
  primary,
}: {
  label: string;
  /** El icono de la acción: congelar es un copo, tirar una papelera. */
  icono?: React.ReactNode;
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
        {icono}
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
  errorBox: { alignSelf: 'stretch', paddingHorizontal: space.xl },
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl * 2 },

  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: touchTarget,
    marginLeft: -4,
    alignSelf: 'flex-start',
  },
  backLink: { minHeight: touchTarget, justifyContent: 'center' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },

  cabecera: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cabeceraTexto: { flex: 1, minWidth: 0, gap: space.xs },
  chips: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  stateChip: {
    fontFamily: fonts.semibold,
    fontSize: 11.5,
    borderRadius: radius.sm - 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: 'hidden',
  },

  cantidadCard: {
    gap: space.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  cantidadFila: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  cantidadValor: { ...tabular, fontSize: 26, fontWeight: '700' },
  cantidadInicial: { ...tabular, fontSize: 13, color: c.inkMuted },
  bar: { height: 8, borderRadius: 4, backgroundColor: c.surfaceAlt, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },

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
  dateExplain: { fontSize: 12.5, lineHeight: 18, color: c.inkMuted },
  dateExplainUrgent: { color: c.expiryInk },
  frozenHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  frozenSince: { fontSize: 13, fontWeight: '600', color: c.frostInk },

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
  actionTextPrimary: { color: c.onBrand },
  actionTextDanger: { color: c.expiry },
  actionHint: { fontSize: 11.5, lineHeight: 16, color: c.inkFaint, paddingHorizontal: 2 },

  usarBloque: {
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  usarHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  usarTitulo: { fontSize: 15, fontWeight: '600', color: c.ink },

  fracciones: { flexDirection: 'row', gap: space.sm - 2 },
  fraccion: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingVertical: space.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.brandSoft,
    backgroundColor: c.brandSoft,
  },
  fraccionApagada: { opacity: 0.4 },
  fraccionGlifo: { fontFamily: fonts.semibold, fontSize: 21, color: c.brandInk, lineHeight: 26 },
  fraccionCantidad: { ...tabular, fontSize: 10.5, color: c.brandInk },

  otraCantidad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: touchTarget - 8,
  },
  otraCantidadText: { fontSize: 13.5, fontWeight: '600', color: c.brand },
  usePanel: { gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md },

  closedNote: {
    padding: space.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
  },

  history: { gap: space.sm - 2 },
  historyCard: {
    gap: space.sm - 3,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: space.md,
  },
  eventRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center', minHeight: 26 },
  eventIcon: { width: 18, alignItems: 'center' },
  eventText: { flex: 1, fontSize: 14, color: c.ink },
  eventDate: { ...tabular, fontSize: 11.5, color: c.inkFaint },

  pressed: { opacity: 0.7 },
}));
