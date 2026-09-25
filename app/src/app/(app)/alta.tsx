import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CalendarBlank, MapPin, Scales, Sparkle, Tag } from 'phosphor-react-native';

import { createItem, type DateKind, type DateSource, type StorageLocation } from '@/api/inventory';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { adivinarCategoria, CATEGORIAS, type Categoria } from '@/shared/lib/categorias';
import { IconoCategoria } from '@/shared/lib/categorias-iconos';
import { describeDbError } from '@/shared/lib/db-errors';
import {
  aIso,
  enDias,
  fechaLegible,
  formatearMientrasEscribe,
  isoEnDias,
  problemaDias,
  problemaFecha,
} from '@/shared/lib/fecha-input';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { IconoNevera } from '@/shared/lib/iconos-nevera';
import { queryKeys } from '@/shared/lib/query';
import { familyOf, toBase, type MeasurementUnit } from '@/shared/lib/units';
import { Button } from '@/shared/ui/Button';
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

const UNIT_OPTIONS: ChipOption<MeasurementUnit>[] = [
  { value: 'unit', label: 'uds' },
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

/**
 * De dónde sale la fecha. Y, desde ahora, QUÉ SE PREGUNTA.
 *
 * Hubo tres opciones y dos de ellas —«La pongo yo» y «A ojo»— eran la misma:
 * en las dos la escribe la persona. Ahora son dos y se nombran por lo único
 * que las distingue de verdad, que es si la fecha viene impresa o no.
 *
 * El chip dejó de ser una etiqueta al final del formulario. Con «lo pone el
 * envase» se copia la fecha impresa; con «la calculo yo» se piden DÍAS, que
 * es lo que una persona sabe de verdad de sus sobras —«esto aguanta una
 * semana»— y no un día concreto del calendario. Antes se elegía «la calculo
 * yo» y el formulario seguía exigiendo la fecha exacta: el chip no cambiaba
 * nada y la queja era justa.
 *
 * `estimate` sigue en el esquema, pero es lo que dice el comentario de su
 * migración: «calculada por la app». La pondrá el catálogo o la asistente,
 * nunca este formulario. Los días los pone una persona, así que lo que se
 * guarda es `user`.
 */
const SOURCE_OPTIONS: ChipOption<DateSource>[] = [
  { value: 'package', label: 'Lo pone el envase' },
  { value: 'user', label: 'La calculo yo' },
];

/** Los atajos escriben DÍAS, no una fecha: son la respuesta rápida al campo. */
const ATAJOS: [string, number][] = [
  ['3 días', 3],
  ['1 semana', 7],
  ['2 semanas', 14],
  ['1 mes', 30],
];

export default function AltaManual() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Dónde va a caer lo que se guarde. Ya no hay «mi hogar»: es una elección con
  // consecuencias, y se enseña en la propia pantalla.
  const { activa } = useNeveraActual();

  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState<MeasurementUnit>('unit');
  const [location, setLocation] = useState<StorageLocation>('pantry');

  // La categoría se propone a partir del nombre y solo se «fija» cuando el
  // usuario toca una. Así escribir «merluza» la pone en Pescado sin pedir
  // nada, pero si él elige otra, escribir más no se la vuelve a cambiar.
  const [categoriaFijada, setCategoriaFijada] = useState<Categoria | null>(null);
  const categoriaSugerida = adivinarCategoria(name);
  const category = categoriaFijada ?? categoriaSugerida;

  // La fecha es opcional a propósito. «Sin fecha» es una respuesta legítima y
  // tiene su propio grupo en la lista: obligar a inventarse una sería
  // exactamente lo que el proyecto se niega a hacer.
  const [hasDate, setHasDate] = useState(false);
  const [dateText, setDateText] = useState('');
  // Los días del modo «la calculo yo». Es otro estado y no el mismo campo
  // porque son otra cosa: «7» ahí significa una semana, no el día 7.
  const [diasText, setDiasText] = useState('');
  const [kind, setKind] = useState<DateKind>('best_before');
  const [source, setSource] = useState<DateSource>('package');

  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: createItem,
    // La nevera sale de lo que se mandó, no de la activa de este momento: es la
    // que hay que refrescar aunque algo la cambiara mientras se guardaba.
    async onSuccess(_creado, guardado) {
      await queryClient.invalidateQueries({ queryKey: queryKeys.priorityList(guardado.householdId) });
      router.back();
    },
    onError(caught: unknown) {
      setError(describeDbError(caught));
    },
  });

  // El formulario tiene dos modos y cada uno valida lo suyo. Mezclarlos sería
  // el bug de antes al revés: pedir una fecha donde se escriben días.
  const porDias = source === 'user';
  const avisoFecha = hasDate && !porDias ? problemaFecha(dateText) : null;
  const avisoDias = hasDate && porDias ? problemaDias(diasText) : null;
  const fechaCalculada =
    hasDate && porDias && avisoDias === null ? fechaLegible(enDias(Number(diasText))) : null;

  function onSubmit() {
    setError(null);

    const amount = Number(quantity.replace(',', '.'));
    if (!name.trim()) return setError('Ponle un nombre, aunque sea «eso verde del cajón».');
    if (!Number.isFinite(amount) || amount <= 0) {
      return setError('Pon una cantidad mayor que cero.');
    }

    let limitDate: string | null = null;
    if (hasDate) {
      if (porDias) {
        const problema = problemaDias(diasText);
        if (problema) return setError(problema);
        limitDate = isoEnDias(Number(diasText));
      } else {
        const problema = problemaFecha(dateText);
        if (problema) return setError(problema);
        limitDate = aIso(dateText);
      }
    }

    mutation.mutate({
      householdId: activa.id,
      name: name.trim(),
      // La familia sale de la unidad, no se elige aparte: así es imposible
      // pedir «2 kg» de algo medido en volumen (D-07).
      unitFamily: familyOf(unit),
      displayUnit: unit,
      quantity: toBase(amount, unit),
      location,
      category,
      limitDate,
      dateKind: hasDate ? kind : null,
      dateSource: hasDate ? source : null,
    });
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
            onPress={() => router.back()}
            style={styles.back}
          >
            <Text style={styles.backText}>Cancelar</Text>
          </Pressable>
          <Text style={t.title}>¿Qué has traído?</Text>
          {/* Dónde va a caer. Es texto y no un botón: cambiar de nevera se hace
              desde el inventario, y aquí solo hace falta saber a cuál se guarda. */}
          <View style={styles.destino}>
            <IconoNevera icono={activa.icon} size={16} color={c.brand} />
            <Text style={styles.destinoText} numberOfLines={1}>
              Se guarda en «{activa.name}»
            </Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* ── El nombre, con su icono en vivo ─────────────────────────── */}
          {/*
            El icono cambia mientras escribes. No es un adorno: es la prueba de
            que la app ha entendido qué es, y llega antes de guardar nada.
          */}
          <View style={styles.nombreFila}>
            <View
              style={[
                styles.avatar,
                { backgroundColor: name.trim() ? c.brandSoft : c.surfaceAlt },
              ]}
            >
              <IconoComida
                nombre={name}
                size={26}
                color={name.trim() ? c.brand : c.inkFaint}
                weight="duotone"
              />
            </View>
            <View style={styles.nombreCampo}>
              <TextField
                label="Qué es"
                value={name}
                onChangeText={setName}
                placeholder="Leche entera"
                autoFocus
                returnKeyType="next"
              />
            </View>
          </View>

          {/* ── Cuánto: cantidad y unidad en la misma línea ─────────────── */}
          <Seccion icono={<Scales size={15} color={c.inkMuted} weight="duotone" />} titulo="Cuánto">
            <View style={styles.cantidadFila}>
              <View style={styles.cantidadCampo}>
                <TextField
                  label="Cantidad"
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="decimal-pad"
                  inputMode="decimal"
                  maxLength={7}
                />
              </View>
              <View style={styles.unidades}>
                {UNIT_OPTIONS.map((opcion) => {
                  const on = opcion.value === unit;
                  return (
                    <Pressable
                      key={opcion.value}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={opcion.label}
                      onPress={() => setUnit(opcion.value)}
                      style={[styles.unidad, on && styles.unidadOn]}
                    >
                      <Text style={[styles.unidadText, on && styles.unidadTextOn]}>
                        {opcion.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </Seccion>

          {/* ── Categoría, ya propuesta ─────────────────────────────────── */}
          <Seccion
            icono={<Tag size={15} color={c.inkMuted} weight="duotone" />}
            titulo="Qué pasillo"
            nota={
              categoriaFijada === null && name.trim() && categoriaSugerida !== 'otros'
                ? 'Esta la he adivinado yo por el nombre. Si no he acertado, tócala.'
                : undefined
            }
          >
            <View style={styles.categorias}>
              {CATEGORIAS.map((cat) => {
                const on = cat.valor === category;
                const propuesta = on && categoriaFijada === null && categoriaSugerida !== 'otros';
                return (
                  <Pressable
                    key={cat.valor}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={cat.etiqueta}
                    onPress={() => setCategoriaFijada(cat.valor)}
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
                    {propuesta ? <Sparkle size={11} color={c.brand} weight="fill" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Seccion>

          {/* ── Dónde ───────────────────────────────────────────────────── */}
          <Seccion
            icono={<MapPin size={15} color={c.inkMuted} weight="duotone" />}
            titulo="Dónde lo guardas"
          >
            <Chips options={LOCATION_OPTIONS} value={location} onChange={setLocation} />
          </Seccion>

          {/* ── Fecha ───────────────────────────────────────────────────── */}
          <Seccion
            icono={<CalendarBlank size={15} color={c.inkMuted} weight="duotone" />}
            titulo="Hasta cuándo"
          >
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
                <Text style={styles.toggleTitle}>Ponerle fecha</Text>
                <Text style={t.caption}>
                  Si no la lleva o no te suena, déjalo sin marcar. «Sin fecha» también es una
                  respuesta y tiene su grupo en la lista.
                </Text>
              </View>
            </Pressable>

            {hasDate ? (
              <View style={styles.dateFields}>
                {/*
                  El origen va PRIMERO porque manda sobre el resto del bloque:
                  decide si se copia una fecha o se cuentan días.
                */}
                <Chips
                  label="De dónde sale"
                  options={SOURCE_OPTIONS}
                  value={source}
                  onChange={setSource}
                  hint={
                    source === 'package'
                      ? 'La que viene impresa. Se guarda con su origen, para que luego se vea de dónde salió.'
                      : 'Para sobras, granel o lo que viene desnudo. Tú pones los días; el calendario lo hago yo.'
                  }
                />

                {porDias ? (
                  <View style={styles.dias}>
                    {/*
                      Los atajos van ANTES del campo a propósito: cubren la
                      mayoría de los casos de un toque, y quien los use no
                      llega a teclear. Ahora escriben días, no una fecha.
                    */}
                    <View style={styles.atajos}>
                      {ATAJOS.map(([etiqueta, dias]) => {
                        const on = diasText === `${dias}`;
                        return (
                          <Pressable
                            key={etiqueta}
                            accessibilityRole="button"
                            accessibilityLabel={`Ponerle ${etiqueta}`}
                            onPress={() => setDiasText(`${dias}`)}
                            style={[styles.atajo, on && styles.atajoOn]}
                          >
                            <Text style={[styles.atajoText, on && styles.atajoTextOn]}>
                              {etiqueta}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <TextField
                      label="¿Cuánto le das de vida?"
                      hint={avisoDias ?? 'Se cuentan desde hoy.'}
                      value={diasText}
                      onChangeText={(texto) => setDiasText(texto.replace(/\D/g, '').slice(0, 4))}
                      placeholder="7"
                      keyboardType="number-pad"
                      inputMode="numeric"
                      maxLength={4}
                    />

                    {/*
                      La cuenta, ya hecha y a la vista. Un número de días se
                      teclea en un segundo y se equivoca con un cero de más:
                      ver el día que sale es lo que lo caza antes de guardar.
                    */}
                    {fechaCalculada ? (
                      <Text style={styles.calculo}>Se guardará el {fechaCalculada}.</Text>
                    ) : null}
                  </View>
                ) : (
                  <TextField
                    label="La fecha del envase"
                    hint={
                      avisoFecha ?? 'Solo números: las barras se ponen solas. El año, de 2 o 4 cifras.'
                    }
                    value={dateText}
                    onChangeText={(texto) => setDateText(formatearMientrasEscribe(texto))}
                    placeholder="31/12/2026"
                    keyboardType="number-pad"
                    inputMode="numeric"
                    maxLength={10}
                  />
                )}

                <Chips
                  label="De qué tipo"
                  options={KIND_OPTIONS}
                  value={kind}
                  onChange={setKind}
                  hint={
                    kind === 'expiry'
                      ? 'Pasada la fecha no se come. Es seguridad, no calidad.'
                      : 'Pasada la fecha es cuestión de calidad, no de seguridad. Lo que baja es el sabor.'
                  }
                />
              </View>
            ) : null}
          </Seccion>

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
 * Un bloque del formulario, con su icono.
 *
 * Siete campos seguidos en una tarjeta blanca se leen como un impreso de
 * Hacienda. Partirlos en bloques con un icono cada uno da algo a lo que
 * agarrarse al bajar, y cuesta una línea por bloque.
 */
function Seccion({
  icono,
  titulo,
  nota,
  children,
}: {
  icono: React.ReactNode;
  titulo: string;
  nota?: string;
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
      {nota ? <Text style={styles.seccionNota}>{nota}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.xs,
  },
  back: { minHeight: touchTarget, justifyContent: 'center', marginLeft: -2, alignSelf: 'flex-start' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
  destino: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  destinoText: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 13, color: c.inkMuted },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.lg },

  nombreFila: { flexDirection: 'row', gap: space.md, alignItems: 'flex-end' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  seccionNota: { fontSize: 11.5, color: c.inkFaint, paddingHorizontal: 2 },

  cantidadFila: { flexDirection: 'row', gap: space.md, alignItems: 'flex-end' },
  cantidadCampo: { width: 96 },
  unidades: { flex: 1, flexDirection: 'row', gap: 5, justifyContent: 'flex-end' },
  unidad: {
    flex: 1,
    maxWidth: 52,
    minHeight: touchTarget + 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  unidadOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  unidadText: { fontFamily: fonts.semibold, fontSize: 13, color: c.inkMuted },
  unidadTextOn: { color: c.brandInk },

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

  toggle: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', minHeight: touchTarget },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: c.brand, borderColor: c.brand },
  check: { color: c.ground, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  toggleText: { flex: 1, gap: 2 },
  toggleTitle: { fontSize: 15, fontWeight: '600', color: c.ink },
  dateFields: { gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md },

  dias: { gap: space.md },
  calculo: {
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: c.brandInk,
    backgroundColor: c.brandSoft,
    borderRadius: radius.sm,
    paddingVertical: space.sm - 2,
    paddingHorizontal: space.md - 2,
    overflow: 'hidden',
  },

  atajos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm - 2 },
  atajo: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.brandSoft,
    backgroundColor: c.brandSoft,
  },
  atajoOn: { borderColor: c.brand, borderWidth: 1.5 },
  atajoText: { fontFamily: fonts.semibold, fontSize: 12.5, color: c.brandInk },
  atajoTextOn: { color: c.brandInk },
}));
