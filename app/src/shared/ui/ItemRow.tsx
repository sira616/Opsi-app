import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PriorityItem } from '@/api/inventory';
import { describeDateSource, describeDaysLeft, describeReason } from '@/shared/lib/dates';
import { formatQuantity } from '@/shared/lib/units';
import { colors, radius, space } from '@/shared/theme/tokens';

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
  const urgent = item.priority === 'high';
  const isExpiry = item.effective_date_source === 'package' && item.effective_date_reason === 'label';

  const reason = describeReason(item.effective_date_reason);
  const source = describeDateSource(item.effective_date_source);
  const footnote = [reason, source].filter(Boolean).join(' · ');

  return (
    <Link href={{ pathname: '/elemento/[id]', params: { id: item.id } }} asChild>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${describeDaysLeft(item.days_left).toLowerCase()}`}
        style={({ pressed }) => [
          styles.card,
          item.effective_limit_date === null && styles.cardUndated,
          pressed && styles.cardPressed,
        ]}
      >
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

      <View style={styles.dateBlock}>
        <Text style={[styles.dateLabel, urgent && isExpiry && styles.dateLabelUrgent]}>
          {isExpiry ? 'Preferente' : reason ? 'Límite' : 'Preferente'}
        </Text>
        <Text style={[styles.dateValue, urgent && styles.dateValueUrgent]}>
          {describeDaysLeft(item.days_left)}
        </Text>
      </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingVertical: 13,
    paddingHorizontal: 14,
  },
  cardUndated: { borderStyle: 'dashed', borderColor: '#DCD3C4' },
  cardPressed: { opacity: 0.7 },
  main: { flex: 1, gap: 3 },
  name: { fontSize: 15.5, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12.5, color: colors.inkMuted },
  footnote: { fontSize: 11, color: colors.inkFaint },
  dateBlock: { alignItems: 'flex-end', gap: 1 },
  dateLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  dateLabelUrgent: { color: colors.expiry },
  dateValue: { fontSize: 15.5, fontWeight: '600', color: colors.ink },
  dateValueUrgent: { color: colors.expiry },
});
