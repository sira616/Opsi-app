import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';

import {
  CheckCircle,
  Drop,
  ForkKnife,
  Package,
  PencilSimple,
  Plus,
  Snowflake,
  Trash,
} from 'phosphor-react-native';

import {
  fetchAutores,
  fetchItemEvents,
  type InventoryEvent,
  type ItemDetail,
} from '@/api/inventory';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { formatQuantity } from '@/shared/lib/units';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { makeStyles, radius, space, tabular, useTheme, useType } from '@/shared/theme/tokens';

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
 * Qué le ha pasado a este elemento, y quién lo hizo.
 *
 * Lleva la HORA además del día: abrir y usar algo la misma tarde salían como
 * dos líneas idénticas, y entonces el historial no contaba nada.
 *
 * El nombre solo aparece cuando la nevera es de más de uno. En un hogar de una
 * persona, «sira» repetido siete veces no informa: ya sabes que fuiste tú.
 */
export function Historial({ item }: { item: ItemDetail }) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();

  // Las dos van con la nevera DEL ELEMENTO, que no tiene por qué ser la activa:
  // los eventos son de esa nevera y quienes los hicieron, también.
  const eventos = useQuery({
    queryKey: queryKeys.itemEvents(item.id),
    queryFn: () => fetchItemEvents(item.id, item.household_id),
    enabled: Boolean(item.id),
  });

  const autores = useQuery({
    // Cuelga de `queryKeys.miembros(nevera)`, así que entrar o salir de esa
    // nevera lo refresca sin que esta pantalla tenga que enterarse. La clave es
    // propia porque lo que devuelve NO es lo mismo que pide la pantalla de la
    // nevera compartida, y dos consultas distintas bajo la misma clave se pisan.
    queryKey: queryKeys.autores(item.household_id),
    queryFn: () => fetchAutores(item.household_id),
    staleTime: 5 * 60_000,
  });

  const porId = new Map((autores.data ?? []).map((autor) => [autor.user_id, autor.username]));
  const compartida = porId.size > 1;

  /**
   * Quién hizo esto, si vale la pena decirlo.
   *
   * Tres degradaciones, y ninguna rompe el historial: sin nombres cargados no
   * se pinta ninguno, en una nevera de uno tampoco, y un `user_id` que ya no
   * está en el hogar —alguien que se fue— se dice sin fingir que no existió.
   */
  function quien(userId: string | null): string | null {
    if (!compartida || !userId) return null;
    return porId.get(userId) ?? 'alguien que ya no está';
  }

  return (
    <View style={styles.history}>
      <Text style={[t.section, styles.titulo]}>Historial</Text>

      {/* El historial que no se pudo leer NO es un historial vacío: el vacío
          se resuelve usando el elemento y el fallo reintentando. */}
      {eventos.isError ? (
        <ErrorNote message={describeDbError(eventos.error)} />
      ) : eventos.isPending ? (
        <ActivityIndicator color={c.brand} />
      ) : eventos.data.length === 0 ? (
        <Text style={t.bodySmall}>Aquí todavía no ha pasado nada.</Text>
      ) : (
        <View style={styles.historyCard}>
          {eventos.data.map((evento) => (
            <Fila
              key={evento.id}
              evento={evento}
              unidad={item.display_unit}
              autor={quien(evento.user_id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function Fila({
  evento,
  unidad,
  autor,
}: {
  evento: InventoryEvent;
  unidad: ItemDetail['display_unit'];
  autor: string | null;
}) {
  const styles = useStyles();
  const c = useTheme();
  const fecha = new Date(evento.created_at);
  const detalle = describeDetalle(evento);

  return (
    <View style={styles.eventRow}>
      <View style={styles.eventIcon}>
        <IconoEvento tipo={evento.type} color={c.inkMuted} />
      </View>

      <View style={styles.eventBody}>
        <Text style={styles.eventText}>
          {EVENT_LABEL[evento.type] ?? evento.type}
          {evento.quantity_used ? ` · ${formatQuantity(evento.quantity_used, unidad)}` : ''}
        </Text>
        {autor || detalle ? (
          <Text style={styles.eventMeta} numberOfLines={1}>
            {[autor, detalle].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>

      <Text style={styles.eventDate}>
        {fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
        {'  '}
        {fecha.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
      </Text>
    </View>
  );
}

/**
 * Lo que el evento guardó en su `payload` y merece leerse.
 *
 * Solo dos casos, y los dos porque explican algo que si no se pregunta uno:
 * por qué se dio por terminado sin tocar «Terminar», y cuántos días se le
 * sumaron a la fecha al sacarlo del congelador.
 */
function describeDetalle(evento: InventoryEvent): string | null {
  const payload = evento.payload ?? {};

  if (evento.type === 'finished' && payload.reason === 'quantity_reached_zero') {
    return 'se acabó la cantidad';
  }

  if (evento.type === 'thawed') {
    const dias = payload.frozen_days_added;
    if (typeof dias === 'number' && dias > 0) {
      return `${dias} ${dias === 1 ? 'día' : 'días'} en el congelador`;
    }
  }

  return null;
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

const useStyles = makeStyles((c) => ({
  history: { gap: space.sm - 2 },
  titulo: { marginBottom: space.xs },
  historyCard: {
    gap: space.sm - 1,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: space.md,
  },
  eventRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', minHeight: 26 },
  eventIcon: { width: 18, alignItems: 'center', paddingTop: 3 },
  eventBody: { flex: 1, minWidth: 0 },
  eventText: { fontSize: 14, color: c.ink },
  eventMeta: { fontSize: 11.5, lineHeight: 16, color: c.inkFaint },
  eventDate: { ...tabular, fontSize: 11.5, color: c.inkFaint, paddingTop: 2 },
}));
