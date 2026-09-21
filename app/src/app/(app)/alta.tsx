import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createItem, type DateKind, type DateSource, type StorageLocation } from '@/api/inventory';
import { toIsoDate } from '@/shared/lib/dates';
import { queryKeys } from '@/shared/lib/query';
import { familyOf, toBase, type MeasurementUnit } from '@/shared/lib/units';
import { Button } from '@/shared/ui/Button';
import { Chips, type ChipOption } from '@/shared/ui/Chips';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TextField } from '@/shared/ui/TextField';
import { colors, font, radius, space, touchTarget } from '@/shared/theme/tokens';

const UNIT_OPTIONS: ChipOption<MeasurementUnit>[] = [
  { value: 'unit', label: 'unidades' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'ml', label: 'ml' },
  { value: 'l', label: 'l' },
];

const LOCATION_OPTIONS: ChipOption<StorageLocation>[] = [
  { value: 'pantry', label: 'Despensa' },
  { value: 'fridge', label: 'Nevera' },
  { value: 'freezer', label: 'Congelador' },
  { value: 'other', label: 'Otro' },
];

// El rojo del chip de caducidad no es decoración: es seguridad frente a
// calidad, y el usuario tiene que verlo al elegir.
const KIND_OPTIONS: ChipOption<DateKind>[] = [
  { value: 'best_before', label: 'Consumo preferente' },
  { value: 'expiry', label: 'Caducidad', danger: true },
];

const SOURCE_OPTIONS: ChipOption<DateSource>[] = [
  { value: 'package', label: 'Del envase' },
  { value: 'user', label: 'La pongo yo' },
  { value: 'estimate', label: 'A ojo' },
];

export default function AltaManual() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<MeasurementUnit>('unit');
  const [location, setLocation] = useState<StorageLocation>('pantry');

  // La fecha es opcional a propósito. «Sin fecha» es una respuesta legítima y
  // tiene su propio grupo en la lista: obligar a inventarse una sería
  // exactamente lo que el proyecto se niega a hacer.
  const [hasDate, setHasDate] = useState(false);
  const [dateText, setDateText] = useState('');
  const [kind, setKind] = useState<DateKind>('best_before');
  const [source, setSource] = useState<DateSource>('package');

  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createItem,
    async onSuccess() {
      await queryClient.invalidateQueries({ queryKey: queryKeys.priorityList });
      router.back();
    },
    onError(caught: Error) {
      setError(caught.message);
    },
  });

  function onSubmit() {
    setError(null);

    const amount = Number(quantity.replace(',', '.'));
    if (!name.trim()) return setError('Ponle un nombre.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('La cantidad tiene que ser mayor que cero.');

    let limitDate: string | null = null;
    if (hasDate) {
      limitDate = parseSpanishDate(dateText);
      if (!limitDate) return setError('La fecha no se entiende. Escríbela como 31/12/2026.');
    }

    mutation.mutate({
      name: name.trim(),
      // La familia sale de la unidad, no se elige aparte: así es imposible
      // pedir «2 kg» de algo medido en volumen (D-07).
      unitFamily: familyOf(unit),
      displayUnit: unit,
      quantity: toBase(amount, unit),
      location,
      limitDate,
      dateKind: hasDate ? kind : null,
      dateSource: hasDate ? source : null,
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
            onPress={() => router.back()}
            style={styles.back}
          >
            <Text style={styles.backText}>Cancelar</Text>
          </Pressable>
          <Text style={font.title}>Añadir alimento</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <TextField
            label="Qué es"
            value={name}
            onChangeText={setName}
            placeholder="Leche entera"
            autoFocus
            returnKeyType="next"
          />

          <TextField
            label="Cuánto"
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            inputMode="decimal"
          />

          <Chips label="En qué se mide" options={UNIT_OPTIONS} value={unit} onChange={setUnit} />

          <Chips label="Dónde está" options={LOCATION_OPTIONS} value={location} onChange={setLocation} />

          <View style={styles.dateBlock}>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: hasDate }}
              onPress={() => setHasDate((v) => !v)}
              style={styles.toggle}
            >
              <View style={[styles.checkbox, hasDate && styles.checkboxOn]}>
                {hasDate ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <View style={styles.toggleText}>
                <Text style={styles.toggleTitle}>Tiene fecha en el envase</Text>
                <Text style={font.caption}>Si no la tiene, déjalo sin marcar. No pasa nada.</Text>
              </View>
            </Pressable>

            {hasDate ? (
              <View style={styles.dateFields}>
                <TextField
                  label="Fecha"
                  value={dateText}
                  onChangeText={setDateText}
                  placeholder="31/12/2026"
                  keyboardType="numbers-and-punctuation"
                  inputMode="numeric"
                />
                <Chips
                  label="De qué tipo"
                  options={KIND_OPTIONS}
                  value={kind}
                  onChange={setKind}
                  hint={
                    kind === 'expiry'
                      ? 'Pasada la fecha es un riesgo de seguridad.'
                      : 'Pasada la fecha es cuestión de calidad, no de seguridad.'
                  }
                />
                <Chips
                  label="De dónde sale"
                  options={SOURCE_OPTIONS}
                  value={source}
                  onChange={setSource}
                  hint="Se guarda y se muestra siempre. Una fecha sin procedencia no vale."
                />
              </View>
            ) : null}
          </View>

          <ErrorNote message={error} />

          <Button
            label="Guardar"
            onPress={onSubmit}
            loading={mutation.isPending}
            disabled={!name.trim()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * Acepta 31/12/2026 y 31-12-2026, que es como se escribe una fecha aquí.
 *
 * Hecho a mano y no con un selector nativo por una razón concreta: la fecha se
 * copia de un envase que tienes en la mano, y teclear seis números es más
 * rápido que girar tres ruedas. El selector llegará como alternativa, no como
 * sustituto.
 */
function parseSpanishDate(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!match) return null;

  const [, d, m, y] = match;
  const day = Number(d);
  const month = Number(m);
  const year = Number(y) < 100 ? 2000 + Number(y) : Number(y);

  const date = new Date(year, month - 1, day);
  // Rebota las fechas imposibles: el 31 de febrero se convertiría solo en el
  // 3 de marzo y se guardaría una fecha que nadie escribió.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return toIsoDate(date);
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  flex: { flex: 1 },
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, gap: space.xs },
  back: { minHeight: touchTarget, justifyContent: 'center', marginLeft: -2, alignSelf: 'flex-start' },
  backText: { fontSize: 14.5, fontWeight: '600', color: colors.inkMuted },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.xl },

  dateBlock: {
    gap: space.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  toggle: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: touchTarget },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  check: { color: colors.ground, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  dateFields: { gap: space.lg, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.lg },
});
