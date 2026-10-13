import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CaretLeft,
  CheckCircle,
  Drop,
  ForkKnife,
  Package,
  PencilSimple,
  Snowflake,
  Trash,
} from 'phosphor-react-native';

import { actions, fetchItem, type ItemDetail } from '@/api/inventory';
import { agregarLinea } from '@/api/lista';
import { fetchSettings } from '@/api/settings';
import { FichaProducto } from '@/features/elemento/FichaProducto';
import { HojaUsar } from '@/features/elemento/HojaUsar';
import { Historial } from '@/features/elemento/Historial';
import { TarjetaConservacion } from '@/features/elemento/TarjetaConservacion';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { describeDateSource, describeDaysLeft, describeDesde, diasDesde } from '@/shared/lib/dates';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { formatQuantity } from '@/shared/lib/units';
import { Button } from '@/shared/ui/Button';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { Info } from '@/shared/ui/Info';
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

export default function Detalle() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [error, setError] = useState<string | null>(null);
  const [hojaUsar, setHojaUsar] = useState(false);
  // Lo que se acaba de hacer con la lista al agotarse algo: preguntar, o avisar de
  // que ya se apuntó (solo si la persona tiene encendido apuntar lo que se acaba).
  const [lista, setLista] = useState<null | { paso: 'pregunta' } | { paso: 'hecho'; nuevo: boolean }>(
    null,
  );

  const item = useQuery({
    queryKey: queryKeys.item(id),
    queryFn: () => fetchItem(id),
    enabled: Boolean(id),
  });

  /**
   * Una sola mutación para las seis acciones.
   *
   * Lo importante está en onSuccess: se invalida TAMBIÉN la lista, porque
   * cualquier acción cambia la fecha límite efectiva y por tanto el sitio del
   * elemento en «Consumir primero». Olvidarlo deja la lista mintiendo hasta la
   * siguiente recarga, que es el bug clásico de estas pantallas.
   *
   * Se invalidan las listas de TODAS las neveras (`priorityLists`) y no la de
   * la activa. El elemento pudo abrirse desde un enlace de otra nevera, y
   * acertar cuál era la suya exigiría esperar a que cargue el detalle; así no
   * hay que acertar. Cuesta lo mismo: solo se recarga la que está a la vista.
   */
  const act = useMutation({
    mutationFn: (run: () => Promise<{ state: string } | void>) => run(),
    async onSuccess(resultado) {
      setError(null);
      setHojaUsar(false);
      // Se acabó (terminándolo, o usando lo que quedaba): toca ofrecer apuntarlo.
      if (resultado && resultado.state === 'finished') void alAcabarse();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.item(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.itemEvents(id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.priorityLists }),
      ]);
    },
    onError(caught: unknown) {
      setError(describeDbError(caught));
    },
  });

  const ajustes = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });

  /**
   * Algo se acaba de agotar: ofrecer apuntarlo en la lista.
   *
   * NADA se apunta solo salvo que la persona lo haya encendido en Ajustes (y el
   * servidor lo exige: ver `check_shopping_item`). Apagado, que es como viene, se
   * pregunta. Encendido, se apunta y se dice, sin pedir nada otra vez.
   */
  async function alAcabarse() {
    if (!ajustes.data?.auto_add_to_shopping_list) {
      setLista({ paso: 'pregunta' });
      return;
    }
    try {
      setLista({ paso: 'hecho', nuevo: await apuntarEnLista('auto_restock') });
    } catch (caught) {
      setLista(null);
      setError(describeDbError(caught));
    }
  }

  /** Apunta lo que se ha acabado, con lo que traía. `false` si ya estaba pendiente. */
  async function apuntarEnLista(origen: 'manual' | 'auto_restock'): Promise<boolean> {
    // El elemento recién agotado, tal como se cargó: su nombre y lo que traía no cambian.
    const e = item.data;
    if (!e) return false;
    const nuevo = await agregarLinea({
      householdId: e.household_id,
      name: e.name,
      origen,
      productId: e.product_id,
      cantidad: { unitFamily: e.unit_family, displayUnit: e.display_unit, quantity: e.initial_quantity },
    });
    await queryClient.invalidateQueries({ queryKey: queryKeys.lista });
    return nuevo;
  }

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
  function run(fn: () => Promise<{ state: string } | void>) {
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

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.topFila}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Volver"
            onPress={() => router.back()}
            style={styles.back}
          >
            <CaretLeft size={16} color={c.inkMuted} weight="bold" />
            <Text style={styles.backText}>Inventario</Text>
          </Pressable>

          {/* Editar, a propósito casi invisible: se busca cuando hace falta (un
              nombre mal escrito, una fecha mal copiada) y no debe competir con
              las acciones de abajo. Lo cerrado no se edita, así que no sale. */}
          {!closedOut ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Editar"
              onPress={() =>
                router.push({ pathname: '/editar-elemento/[id]', params: { id: detail.id } })
              }
              hitSlop={6}
              style={({ pressed }) => [styles.editar, pressed && styles.pressed]}
            >
              <PencilSimple size={18} color={c.inkFaint} weight="regular" />
            </Pressable>
          ) : null}
        </View>

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

        {/* La conservación tras abrir se calla en dos casos, y los dos por lo
            mismo: diría algo que contradice a lo de arriba. Congelado, porque
            la cuenta atrás está parada y «guárdalo en la nevera» sonaría a
            sacarlo; cerrado, porque a lo tirado o agotado no se le aconseja
            nada. */}
        {!closedOut && !congelado ? <TarjetaConservacion item={data} /> : null}

        <ErrorNote message={error} />

        {!closedOut ? (
          <View style={styles.actions}>
            <Text style={styles.sectionTitle}>Qué hago con esto</Text>

            {congelado ? (
              <>
                <Action
                  label="Descongelar"
                  icono={<Drop size={20} color={c.frost} weight="duotone" />}
                  // Lo que protege a alguien va a la vista y DENTRO del botón.
                  subtitulo="24 horas para consumirlo"
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
                    onPress={() => run(() => actions.open(detail.id))}
                    busy={act.isPending}
                  />
                ) : null}

                {/* Las fracciones y la cantidad exacta suben al tocar: no ocupan
                    la pantalla hasta que se va a usar algo. */}
                <Action
                  label="Usar"
                  icono={<ForkKnife size={20} color={c.brand} weight="duotone" />}
                  onPress={() => {
                    setError(null);
                    setHojaUsar(true);
                  }}
                  busy={act.isPending}
                />

                <Action
                  label="Congelar"
                  icono={<Snowflake size={20} color={c.frost} weight="duotone" />}
                  // Recongelar lo descongelado sin cocinarlo es un riesgo, no una
                  // curiosidad: se dice a la vista, dentro del botón.
                  subtitulo={
                    data.state === 'thawed' ? 'Ya se descongeló: cocínalo antes de volver a congelar' : undefined
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
              Esto ya está {STATE_LABEL[data.state].toLowerCase()}. Se queda en el historial y no
              admite más acciones.
            </Text>
          </View>
        )}

        <FichaProducto item={data} />

        <Historial item={data} />
      </ScrollView>

      {/* Al agotarse algo: ofrecer apuntarlo, o decir que ya se apuntó. */}
      <HojaInferior
        visible={lista !== null}
        onClose={() => setLista(null)}
        titulo={
          lista?.paso === 'hecho'
            ? lista.nuevo
              ? 'Apuntado en la lista'
              : 'Ya estaba en la lista'
            : '¿Lo apunto en la lista?'
        }
      >
        <Text style={styles.listaTexto}>
          {lista?.paso === 'hecho'
            ? `«${data.name}» está en la lista de la compra.`
            : `Se te ha acabado «${data.name}». ¿Lo apunto en la lista de la compra?`}
        </Text>
        {lista?.paso === 'pregunta' ? (
          <>
            <Button
              label="Apuntarlo"
              onPress={async () => {
                try {
                  setLista({ paso: 'hecho', nuevo: await apuntarEnLista('manual') });
                } catch (caught) {
                  setLista(null);
                  setError(describeDbError(caught));
                }
              }}
            />
            <Button label="Ahora no" variant="quiet" onPress={() => setLista(null)} />
          </>
        ) : (
          <Button label="Vale" onPress={() => setLista(null)} />
        )}
      </HojaInferior>

      <HojaUsar
        visible={hojaUsar}
        onClose={() => {
          setHojaUsar(false);
          setError(null);
        }}
        restante={data.remaining_quantity}
        unidad={data.display_unit}
        ocupado={act.isPending}
        error={error}
        onUsar={usar}
        onAviso={setError}
      />
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

  // De dónde salió la fecha de partida. Decir «la que trae el envase» de una
  // fecha que puso el usuario es inventarse el dato justo que este proyecto se
  // comprometió a enseñar tal cual.
  const departida = item.effective_date_source === 'user' ? 'La que pusiste tú' : 'La del envase';

  const explanation =
    item.effective_date_reason === 'after_thawing'
      ? 'Se descongeló, y lo descongelado se consume en 24 horas: eso manda sobre cualquier otra fecha.'
      : item.effective_date_reason === 'after_opening'
        ? 'Está abierto, y lo que aguanta abierto se acaba antes que la fecha que tenía puesta.'
        : item.frozen_days > 0
          ? `${departida}, retrasada los ${item.frozen_days} días que pasó congelado.`
          : `${departida}.`;

  if (item.state === 'frozen') {
    // Dos cuentas distintas, y confundirlas sería mentir: `dentro` son los días
    // del tramo EN CURSO, y frozen_days los de tramos anteriores ya cerrados.
    const dentro = diasDesde(item.frozen_at);
    const desde = describeDesde(item.frozen_at);

    return (
      <View style={[styles.dateCard, styles.dateCardFrozen]}>
        <View style={styles.frozenHead}>
          <Snowflake size={15} color={c.frost} weight="fill" />
          <Text style={[styles.dateLabel, styles.dateLabelFrozen, styles.dateLabelTexto]}>
            En el congelador
          </Text>
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

      </View>
    );
  }

  if (item.effective_limit_date === null) {
    return (
      <View style={[styles.dateCard, styles.dateCardNeutral]}>
        <View style={styles.frozenHead}>
          <Text style={[styles.dateLabel, styles.dateLabelTexto]}>Sin fecha</Text>
        </View>
        <Text style={styles.dateValue}>No sé cuándo vence</Text>
      </View>
    );
  }

  return (
    <View style={[styles.dateCard, urgent ? styles.dateCardUrgent : styles.dateCardNeutral]}>
      <View style={styles.frozenHead}>
        <Text style={[styles.dateLabel, styles.dateLabelTexto, urgent && styles.dateLabelUrgent]}>
          {item.date_kind === 'expiry' && item.effective_date_reason === 'label'
            ? 'Caduca'
            : 'Fecha límite'}{' '}
          · {describeDateSource(item.effective_date_source)}
        </Text>
        <Info titulo="De dónde sale esta fecha" texto={explanation} />
      </View>
      <Text style={[styles.dateValue, urgent && styles.dateValueUrgent]}>
        {describeDaysLeft(item.days_left)}
      </Text>
    </View>
  );
}

function Action({
  label,
  icono,
  subtitulo,
  onPress,
  busy,
  danger,
  primary,
}: {
  label: string;
  /** El icono de la acción: congelar es un copo, tirar una papelera. */
  icono?: React.ReactNode;
  /**
   * Una línea debajo de la etiqueta, DENTRO del botón. Solo para lo que protege a
   * alguien (las 24 horas de lo descongelado): lo que se entiende solo no lleva texto.
   */
  subtitulo?: string;
  onPress: () => void;
  busy?: boolean;
  danger?: boolean;
  primary?: boolean;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        subtitulo ? styles.actionConSubtitulo : null,
        danger && styles.actionDanger,
        primary && styles.actionPrimary,
        pressed && styles.actionPressed,
        busy && styles.actionBusy,
      ]}
    >
      {icono}
      <View style={styles.actionTextos}>
        <Text
          style={[
            styles.actionText,
            danger && styles.actionTextDanger,
            primary && styles.actionTextPrimary,
          ]}
        >
          {label}
        </Text>
        {subtitulo ? <Text style={styles.actionSubtitulo}>{subtitulo}</Text> : null}
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md },
  errorBox: { alignSelf: 'stretch', paddingHorizontal: space.xl },
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl * 2 },

  topFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editar: {
    width: touchTarget,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -space.sm,
  },
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
  frozenHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  dateLabelTexto: { flex: 1 },
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
  actionConSubtitulo: { paddingVertical: space.sm },
  actionTextos: { flex: 1, gap: 1 },
  actionSubtitulo: { fontSize: 12, lineHeight: 16, color: c.inkMuted },

  listaTexto: { fontSize: 15, lineHeight: 22, color: c.inkMuted },

  closedNote: {
    padding: space.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
  },

  pressed: { opacity: 0.7 },
}));
