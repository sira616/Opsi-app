import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { Snowflake } from 'phosphor-react-native';

import type { PriorityItem } from '@/api/inventory';
import { IconoComida } from '@/shared/lib/iconos-comida';
import {
  describeDateSource,
  describeDaysLeft,
  describeReason,
  diasDesde,
  diasRestantes,
} from '@/shared/lib/dates';
import { formatQuantity } from '@/shared/lib/units';
import { makeStyles, radius, space, tabular, useTheme } from '@/shared/theme/tokens';

const STATE_LABEL: Record<PriorityItem['state'], string> = {
  closed: 'Cerrado',
  open: 'Abierto',
  partially_consumed: 'Abierto',
  frozen: 'Congelado',
  thawed: 'Descongelado',
  finished: 'Agotado',
  discarded: 'Tirado',
};

const LOCATION_LABEL: Record<PriorityItem['location'], string> = {
  pantry: 'Despensa',
  fridge: 'Nevera',
  freezer: 'Congelador',
  other: 'Otro',
};

/**
 * Una fila de «Consumir primero».
 *
 * Tres cosas que esta fila tiene que dejar claras, y que no son adorno:
 *   · Caducidad y consumo preferente NO se pintan igual: una es seguridad y
 *     la otra calidad.
 *   · El origen de la fecha se ve siempre. Una fecha sin procedencia es justo
 *     el dato que este proyecto se niega a enseñar.
 *   · El motivo, cuando no es la etiqueta. Que algo abierto venza antes que
 *     lo que pone el envase no se entiende si no se dice.
 */
export function ItemRow({ item }: { item: PriorityItem }) {
  const styles = useStyles();
  const c = useTheme();
  const urgent = item.priority === 'high';

  const reason = describeReason(item.effective_date_reason);
  const source = describeDateSource(item.effective_date_source);
  const footnote = [reason, source].filter(Boolean).join(' · ');

  // El icono sale del nombre: nadie lo elige. Es lo que convierte una lista de
  // texto en algo que apetece mirar, sin pedirle nada al usuario.
  const congelado = item.state === 'frozen';
  const tono = urgent ? c.expiry : congelado ? c.frost : c.brand;

  return (
    <Link href={{ pathname: '/elemento/[id]', params: { id: item.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${
          congelado
            ? `congelado ${describeCongelado(item.frozen_at)}`
            : describeDaysLeft(item.days_left).toLowerCase()
        }`}
        style={({ pressed }) => [
          styles.card,
          item.effective_limit_date === null && !congelado && styles.cardUndated,
          pressed && styles.cardPressed,
        ]}
      >
      <View
        style={[
          styles.avatar,
          { backgroundColor: urgent ? c.expirySoft : congelado ? c.frostSoft : c.brandSoft },
        ]}
      >
        <IconoComida nombre={item.name} size={22} color={tono} weight="duotone" />
      </View>

      <View style={styles.main}>
        <Text style={styles.name} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {STATE_LABEL[item.state]} · {formatQuantity(item.remaining_quantity, item.display_unit)}
          {item.remaining_quantity !== item.initial_quantity
            ? ` de ${formatQuantity(item.initial_quantity, item.display_unit)}`
            : ''}{' '}
          · {LOCATION_LABEL[item.location]}
        </Text>
        {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
      </View>

      <Contador item={item} urgent={urgent} />
      </Pressable>
    </Link>
  );
}

/**
 * La columna de la derecha.
 *
 * Tiene ANCHO FIJO, y eso es lo único que importa aquí: con la frase entera
 * («Venció hace 12 días» al lado de «Hoy») cada fila medía distinto y a partir
 * del tercer elemento la lista se veía torcida en un móvil. El número va
 * separado de su unidad para que la cifra caiga siempre en el mismo sitio.
 */
function Contador({ item, urgent }: { item: PriorityItem; urgent: boolean }) {
  const styles = useStyles();
  const c = useTheme();

  // Congelado no es «sin fecha»: es la cuenta atrás parada. Decir desde cuándo
  // lo lleva es lo que convierte ese estado en información útil.
  if (item.state === 'frozen') {
    const dias = diasDesde(item.frozen_at);
    return (
      <View style={styles.dateBlock}>
        <View style={styles.frozenLabel}>
          <Snowflake size={11} color={c.frost} weight="fill" />
          <Text style={[styles.dateLabel, styles.dateLabelFrozen]} numberOfLines={1}>
            Parado
          </Text>
        </View>
        {dias === null ? (
          <Text style={[styles.dateValue, styles.dateValueFrozen]} numberOfLines={1}>
            —
          </Text>
        ) : (
          <>
            <Text style={[styles.dateValue, styles.dateValueFrozen]} numberOfLines={1}>
              {dias === 0 ? 'Hoy' : `${dias}`}
            </Text>
            <Text style={styles.dateUnit} numberOfLines={1}>
              {dias === 0 ? 'lo congelaste' : dias === 1 ? 'día dentro' : 'días dentro'}
            </Text>
          </>
        )}
      </View>
    );
  }

  const { etiqueta, valor, unidad, vencido } = diasRestantes(item.days_left, etiquetaFecha(item));
  const rojo = vencido || urgent;

  return (
    <View style={styles.dateBlock}>
      <Text style={[styles.dateLabel, rojo && styles.dateLabelUrgent]} numberOfLines={1}>
        {etiqueta}
      </Text>
      <Text style={[styles.dateValue, rojo && styles.dateValueUrgent]} numberOfLines={1}>
        {valor}
      </Text>
      {unidad ? (
        <Text style={[styles.dateUnit, rojo && styles.dateUnitUrgent]} numberOfLines={1}>
          {unidad}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Qué clase de fecha se está enseñando.
 *
 * «Caduca» y «Preferente» NO son sinónimos: la primera es seguridad
 * alimentaria y pasarse es un riesgo; la segunda es calidad y pasarse es, como
 * mucho, peor sabor. La fila lo decía siempre igual, y era justo la distinción
 * que este proyecto se comprometió a no borrar.
 *
 * «Límite» es para las fechas que calculamos nosotros —tras abrir, tras
 * descongelar—, que no vienen del envase. De cuál se trata lo dice la nota que
 * va bajo el nombre.
 */
function etiquetaFecha(item: PriorityItem): string {
  if (item.effective_date_reason !== 'label') return 'Límite';
  return item.date_kind === 'expiry' ? 'Caduca' : 'Preferente';
}

function describeCongelado(frozenAt: string | null): string {
  const dias = diasDesde(frozenAt);
  if (dias === null) return 'sin fecha';
  if (dias === 0) return 'hoy';
  if (dias === 1) return 'desde ayer';
  return `desde hace ${dias} días`;
}

/**
 * El ancho de la columna de la derecha.
 *
 * Cabe «PREFERENTE» en versalitas y «Mañana», que son las dos cadenas más
 * largas que puede haber ahí. Es `minWidth` y no `width` para que siga
 * funcionando si el sistema agranda la letra.
 */
const ANCHO_CONTADOR = 74;

const useStyles = makeStyles((c) => ({
  card: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  cardUndated: { borderStyle: 'dashed', borderColor: c.borderStrong },
  cardPressed: { opacity: 0.7 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  // minWidth: 0 deja que el bloque central SE ENCOJA. Sin esto, un nombre
  // largo empuja la columna de la derecha fuera de la tarjeta en vez de
  // recortarse, que es el fallo clásico de flex en React Native.
  main: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 15.5, fontWeight: '600', color: c.ink },
  meta: { fontSize: 12.5, color: c.inkMuted },
  footnote: { fontSize: 11, color: c.inkFaint },

  dateBlock: {
    minWidth: ANCHO_CONTADOR,
    flexShrink: 0,
    alignItems: 'flex-end',
    gap: 1,
  },
  dateLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  dateLabelUrgent: { color: c.expiry },
  dateLabelFrozen: { color: c.frost },
  dateValue: { ...tabular, fontSize: 17, fontWeight: '700', color: c.ink, lineHeight: 21 },
  dateValueUrgent: { color: c.expiry },
  dateValueFrozen: { color: c.frost },
  dateUnit: { fontSize: 10.5, color: c.inkFaint },
  dateUnitUrgent: { color: c.expiry },

  frozenLabel: { flexDirection: 'row', alignItems: 'center', gap: 3 },
}));
