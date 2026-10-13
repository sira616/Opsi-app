import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarBlank, MapPin, Scales, Tag } from 'phosphor-react-native';

import {
  fetchItem,
  updateItem,
  type DateKind,
  type DateSource,
  type ItemDetail,
  type StorageLocation,
} from '@/api/inventory';
import { CATEGORIAS, type Categoria } from '@/shared/lib/categorias';
import { IconoCategoria } from '@/shared/lib/categorias-iconos';
import { describeDbError } from '@/shared/lib/db-errors';
import { aIso, deIso, isoEnDias, problemaDias, problemaFecha } from '@/shared/lib/fecha-input';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { queryKeys } from '@/shared/lib/query';
import { fromBase, toBase, UNITS, type MeasurementUnit } from '@/shared/lib/units';
import { Button } from '@/shared/ui/Button';
import { CampoFecha } from '@/shared/ui/CampoFecha';
import { Chips, type ChipOption } from '@/shared/ui/Chips';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TextField } from '@/shared/ui/TextField';
import {
  fonts,
  makeStyles,
  radius,
  space,
  touchTarget,
  useTheme,
  useType,
} from '@/shared/theme/tokens';

const LOCATION_OPTIONS: ChipOption<StorageLocation>[] = [
  { value: 'pantry', label: 'Despensa' },
  { value: 'fridge', label: 'Nevera' },
  { value: 'freezer', label: 'Congelador' },
  { value: 'other', label: 'Otro' },
];

/**
 * Corregir un elemento que ya está en la nevera.
 *
 * La cáscara pide el elemento y decide si se puede editar. Lo cerrado (agotado o
 * tirado) no admite ninguna acción, y esta es una: se dice y no se enseña un
 * formulario que el servidor va a rechazar.
 */
export default function EditarElemento() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const item = useQuery({
    queryKey: queryKeys.item(id),
    queryFn: () => fetchItem(id),
    enabled: Boolean(id),
  });

  if (item.isPending) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.safe, styles.centro]}>
        <ActivityIndicator color={c.brand} />
      </SafeAreaView>
    );
  }

  if (item.isError || !item.data) {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.safe, styles.centro]}>
        <Text style={t.body}>{item.isError ? 'No he podido cargarlo.' : 'Ese elemento ya no está.'}</Text>
        {item.isError ? <ErrorNote message={describeDbError(item.error)} /> : null}
        <Button label="Volver" variant="quiet" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  if (item.data.state === 'finished' || item.data.state === 'discarded') {
    return (
      <SafeAreaView edges={['bottom']} style={[styles.safe, styles.centro]}>
        <Text style={t.body}>Esto ya está cerrado y no se puede editar.</Text>
        <Button label="Volver" variant="quiet" onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  return <Formulario item={item.data} />;
}

function Formulario({ item }: { item: ItemDetail }) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  // La cantidad solo se corrige en lo que está sin abrir. En lo empezado, lo que
  // queda es el resultado de lo que se fue usando, cada uso con su evento: para
  // eso está «Usar».
  const sinAbrir = item.state === 'closed';
  const opcionesUnidad: ChipOption<MeasurementUnit>[] = UNITS.filter(
    (u) => u.family === item.unit_family,
  ).map((u) => ({ value: u.unit, label: u.label }));

  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState<Categoria>(item.category);
  const [location, setLocation] = useState<StorageLocation>(item.location);
  const [quantity, setQuantity] = useState(
    String(Math.round(fromBase(item.initial_quantity, item.display_unit) * 100) / 100).replace('.', ','),
  );
  const [unit, setUnit] = useState<MeasurementUnit>(item.display_unit);
  const [hasDate, setHasDate] = useState(item.limit_date !== null);
  const [dateText, setDateText] = useState(deIso(item.limit_date));
  // Los días del modo «la calculo yo»: es otro campo porque «7» ahí es una semana.
  const [diasText, setDiasText] = useState('');
  const [kind, setKind] = useState<DateKind>(item.date_kind ?? 'best_before');
  // Qué se pregunta: la fecha impresa, o los días. Una fecha que vino del envase se
  // enseña como tal; cualquier otra (tecleada, estimada, del catálogo) se enseña en
  // «la calculo yo», con la fecha que hay a la vista y sin tocarla hasta que se elija
  // un plazo.
  const [source, setSource] = useState<DateSource>(
    item.date_source === 'package' || !item.limit_date ? 'package' : 'user',
  );
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: (datos: Parameters<typeof updateItem>[1]) => updateItem(item.id, datos),
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.item(item.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.itemEvents(item.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.priorityLists }),
      ]);
      router.back();
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  function alGuardar() {
    setError(null);
    if (!name.trim()) return setError('Ponle un nombre, aunque sea «eso verde del cajón».');

    let limitDate: string | null = null;
    let dateSource: DateSource | null = null;
    if (hasDate) {
      if (source === 'user') {
        if (diasText === '' && item.limit_date) {
          // «La calculo yo» sin plazo elegido: la fecha que había se queda como estaba.
          limitDate = item.limit_date;
          dateSource = item.date_source ?? 'user';
        } else {
          const problema = problemaDias(diasText);
          if (problema) return setError(problema);
          limitDate = isoEnDias(Number(diasText));
          dateSource = 'user';
        }
      } else {
        const problema = problemaFecha(dateText);
        if (problema) return setError(problema);
        limitDate = aIso(dateText);
        // Una fecha que no se tocó conserva su origen (puede ser el del catálogo o el
        // de una estimación): solo lo que se teclea de nuevo lo afirma la persona.
        dateSource = limitDate === item.limit_date && item.date_source ? item.date_source : 'package';
      }
    }

    let cantidad: { quantity: number; displayUnit: MeasurementUnit } | null = null;
    if (sinAbrir) {
      const valor = Number(quantity.replace(',', '.'));
      if (!Number.isFinite(valor) || valor <= 0) return setError('Pon una cantidad mayor que cero.');
      const base = toBase(valor, unit);
      // Solo se manda si cambió: así guardar sin tocarla no depende de ella.
      if (base !== item.initial_quantity || unit !== item.display_unit) {
        cantidad = { quantity: base, displayUnit: unit };
      }
    }

    guardar.mutate({
      name: name.trim(),
      category,
      location,
      limitDate,
      dateKind: hasDate ? kind : null,
      dateSource,
      cantidad,
    });
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
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
          <Text style={t.title}>Editar</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.nombreFila}>
            <View
              style={[styles.avatar, { backgroundColor: name.trim() ? c.brandSoft : c.surfaceAlt }]}
            >
              <IconoComida
                nombre={name}
                size={26}
                color={name.trim() ? c.brand : c.inkFaint}
                weight="duotone"
              />
            </View>
            <View style={styles.nombreCampo}>
              <TextField label="Qué es" value={name} onChangeText={setName} returnKeyType="next" />
            </View>
          </View>

          {sinAbrir ? (
            <Seccion icono={<Scales size={15} color={c.inkMuted} weight="duotone" />} titulo="Cuánto">
              <TextField
                label="Cantidad"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
                inputMode="decimal"
                maxLength={7}
              />
              <Chips options={opcionesUnidad} value={unit} onChange={setUnit} />
            </Seccion>
          ) : null}

          <Seccion icono={<Tag size={15} color={c.inkMuted} weight="duotone" />} titulo="Qué pasillo">
            <View style={styles.categorias}>
              {CATEGORIAS.map((cat) => {
                const on = cat.valor === category;
                return (
                  <Pressable
                    key={cat.valor}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={cat.etiqueta}
                    onPress={() => setCategory(cat.valor)}
                    style={[styles.categoria, on && styles.categoriaOn]}
                  >
                    <IconoCategoria
                      categoria={cat.valor}
                      size={16}
                      color={on ? c.brand : c.inkMuted}
                      weight="duotone"
                    />
                    <Text style={[styles.categoriaText, on && styles.categoriaTextOn]}>
                      {cat.etiqueta}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Seccion>

          <Seccion icono={<MapPin size={15} color={c.inkMuted} weight="duotone" />} titulo="Dónde lo guardas">
            <Chips options={LOCATION_OPTIONS} value={location} onChange={setLocation} />
          </Seccion>

          <Seccion icono={<CalendarBlank size={15} color={c.inkMuted} weight="duotone" />} titulo="Hasta cuándo">
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: hasDate }}
              onPress={() => setHasDate((v) => !v)}
              style={styles.toggle}
            >
              <View style={[styles.checkbox, hasDate && styles.checkboxOn]}>
                {hasDate ? <Text style={styles.check}>✓</Text> : null}
              </View>
              <Text style={styles.toggleTitle}>Ponerle fecha</Text>
            </Pressable>

            {hasDate ? (
              <CampoFecha
                source={source}
                onSource={setSource}
                dateText={dateText}
                onDateText={setDateText}
                diasText={diasText}
                onDiasText={setDiasText}
                kind={kind}
                onKind={setKind}
                actual={item.limit_date}
              />
            ) : null}
          </Seccion>

          <ErrorNote message={error} />

          <Button
            label="Guardar cambios"
            onPress={alGuardar}
            loading={guardar.isPending}
            disabled={!name.trim()}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Un bloque del formulario, con su icono. Igual que en el alta. */
function Seccion({
  icono,
  titulo,
  children,
}: {
  icono: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.seccion}>
      <View style={styles.seccionHead}>
        {icono}
        <Text style={styles.seccionTitulo}>{titulo}</Text>
      </View>
      <View style={styles.seccionCuerpo}>{children}</View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  centro: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.xl },
  flex: { flex: 1 },
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, gap: space.xs },
  back: { minHeight: touchTarget, justifyContent: 'center', marginLeft: -2, alignSelf: 'flex-start' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.lg },

  nombreFila: { flexDirection: 'row', gap: space.md, alignItems: 'flex-end' },
  avatar: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  nombreCampo: { flex: 1, minWidth: 0 },

  seccion: { gap: space.sm - 2 },
  seccionHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  seccionTitulo: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  seccionCuerpo: {
    gap: space.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: space.md,
  },

  categorias: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm - 2 },
  categoria: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: touchTarget - 6,
    paddingHorizontal: space.md - 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  categoriaOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  categoriaText: { fontFamily: fonts.semibold, fontSize: 12.5, color: c.inkMuted },
  categoriaTextOn: { color: c.brandInk },

  toggle: { flexDirection: 'row', gap: space.md, alignItems: 'center', minHeight: touchTarget },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: c.brand, borderColor: c.brand },
  check: { color: c.ground, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: c.ink },
}));
