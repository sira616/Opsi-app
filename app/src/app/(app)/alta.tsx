import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
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

import { Barcode, CalendarBlank, MapPin, Scales, Sparkle, Tag } from 'phosphor-react-native';

import { codigoDeRuta, crearProductoPrivado, idDeRuta } from '@/api/catalogo';
import { fetchLinea, type LineaLista } from '@/api/lista';
import {
  createItem,
  fetchProducto,
  type DateKind,
  type NewItem,
  type ProductoCatalogo,
  type StorageLocation,
} from '@/api/inventory';
import {
  cantidadInicial,
  diasDeRuta,
  nombreDeRuta,
  ubicacionDeRuta,
  ubicacionSugerida,
} from '@/features/alta/valores';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { AvisoDeFicha } from '@/features/salud/AvisoDeFicha';
import { AccesoIngredientes } from '@/features/salud/Ingredientes';
import { FRESCURA_FICHA_MS } from '@/features/salud/useSalud';
import { adivinarCategoria, CATEGORIAS, type Categoria } from '@/shared/lib/categorias';
import { IconoCategoria } from '@/shared/lib/categorias-iconos';
import { describeDbError } from '@/shared/lib/db-errors';
import { hoyIso, sumarDias } from '@/shared/lib/calendario';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { IconoNevera } from '@/shared/lib/iconos-nevera';
import { queryKeys } from '@/shared/lib/query';
import { recordarGuardado } from '@/shared/lib/ultimo-guardado';
import { familyOf, toBase, type MeasurementUnit } from '@/shared/lib/units';
import { Button } from '@/shared/ui/Button';
import { CampoFecha } from '@/shared/ui/CampoFecha';
import { Chips, type ChipOption } from '@/shared/ui/Chips';
import { AVISO_NO_COMIDA, nombreEsNoComida } from '@/shared/lib/no-comida';
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

/**
 * La cáscara: averigua QUÉ se va a dar de alta y le pasa el formulario ya servido.
 *
 * Lo que trae el escáner llega por la ruta, que es entrada de fuera (un enlace
 * puede abrir esta pantalla): se acepta solo con la forma exacta de un código de
 * barras válido y de un uuid, y NADA más se lee de ahí. El nombre y la cantidad
 * no viajan por la ruta: se piden a la base de datos por el id, de modo que lo que
 * se rellena es siempre lo que la RLS deja ver.
 *
 * Esperar a la ficha ANTES de montar el formulario (y no rellenarlo después con un
 * efecto) es lo que evita pisar lo que la persona ya haya escrito, y deja el
 * formulario con un estado inicial en lugar de corregirlo al segundo render.
 *
 * Lo mismo vale para una línea de la lista de la compra (`lista`): se pide por su
 * id, y de ella salen el nombre, la cantidad y, si lo lleva, el producto. Al
 * guardar, el servidor da de alta el elemento Y marca la línea como comprada en una
 * sola transacción.
 */
export default function AltaManual() {
  const c = useTheme();
  const params = useLocalSearchParams<{
    codigo?: string;
    producto?: string;
    lista?: string;
    donde?: string;
    dias?: string;
    nombre?: string;
    nevera?: string;
  }>();
  const codigo = codigoDeRuta(params.codigo);
  const listaId = idDeRuta(params.lista);

  const lineaQ = useQuery({
    queryKey: queryKeys.linea(listaId ?? ''),
    queryFn: () => fetchLinea(listaId as string),
    enabled: listaId !== null,
  });
  const linea = lineaQ.data ?? null;

  // El producto de la ruta manda; si no hay, el de la línea de la lista.
  const productoId = idDeRuta(params.producto) ?? linea?.product_id ?? null;

  const fichaQ = useQuery({
    // La clave del producto, la misma que usan el detalle y la hoja de ingredientes.
    queryKey: queryKeys.producto(productoId ?? ''),
    queryFn: () => fetchProducto(productoId as string),
    enabled: productoId !== null,
    // Una ficha del catálogo casi no cambia: no se vuelve a pedir en cada apertura.
    staleTime: FRESCURA_FICHA_MS,
  });

  if ((listaId !== null && lineaQ.isPending) || (productoId !== null && fichaQ.isPending)) {
    return (
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.ground, justifyContent: 'center' }}>
        <ActivityIndicator color={c.brand} />
      </SafeAreaView>
    );
  }

  return (
    <Formulario
      codigo={codigo}
      productoId={productoId}
      ficha={fichaQ.data ?? null}
      fichaFallo={fichaQ.isError}
      linea={linea}
      listaId={listaId}
      nombreInicial={nombreDeRuta(params.nombre)}
      inicialDonde={ubicacionDeRuta(params.donde)}
      inicialDias={diasDeRuta(params.dias)}
      neveraId={idDeRuta(params.nevera)}
    />
  );
}

function Formulario({
  codigo,
  productoId,
  ficha,
  fichaFallo,
  linea,
  listaId,
  nombreInicial,
  inicialDonde,
  inicialDias,
  neveraId,
}: {
  codigo: string | null;
  productoId: string | null;
  ficha: ProductoCatalogo | null;
  fichaFallo: boolean;
  /** La línea de la lista de la que se parte, si se viene de ahí. */
  linea: LineaLista | null;
  listaId: string | null;
  /** El nombre con el que se abre, si se viene de «tus productos» con algo escrito a mano. */
  nombreInicial: string | null;
  /** Lo que se llevaba elegido en la hoja rápida, si se viene de ahí. */
  inicialDonde: StorageLocation | null;
  inicialDias: number | null;
  /** La nevera elegida al llegar desde «tus productos»; si no se pasa o ya no existe, la activa. */
  neveraId: string | null;
}) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Dónde va a caer lo que se guarde. Ya no hay «mi hogar»: es una elección con
  // consecuencias, y se enseña en la propia pantalla. Solo vale una nevera que la
  // persona tenga: un id suelto de la ruta no manda a ninguna otra parte.
  const { neveras, activa: actual } = useNeveraActual();
  const activa = neveras.find((n) => n.id === neveraId) ?? actual;

  const inicial = cantidadInicial(ficha, linea);
  const [name, setName] = useState(ficha?.name ?? linea?.name ?? nombreInicial ?? '');
  const [quantity, setQuantity] = useState(inicial.quantity);
  const [unit, setUnit] = useState<MeasurementUnit>(inicial.unit);
  // Dónde se guarda se propone a partir del pasillo (un yogur, a la nevera) y solo
  // se «fija» cuando la persona toca uno, igual que la categoría.
  const [ubicacionFijada, setUbicacionFijada] = useState<StorageLocation | null>(inicialDonde);

  // La categoría se propone a partir del nombre y solo se «fija» cuando el
  // usuario toca una. Así escribir «merluza» la pone en Pescado sin pedir
  // nada, pero si él elige otra, escribir más no se la vuelve a cambiar.
  const [categoriaFijada, setCategoriaFijada] = useState<Categoria | null>(null);
  const categoriaSugerida = adivinarCategoria(name);
  const category = categoriaFijada ?? categoriaSugerida;
  const location = ubicacionFijada ?? ubicacionSugerida(category);

  // La fecha es opcional a propósito. «Sin fecha» es una respuesta legítima y
  // tiene su propio grupo en la lista: obligar a inventarse una sería
  // exactamente lo que el proyecto se niega a hacer.
  const [hasDate, setHasDate] = useState(inicialDias !== null);
  // El campo nace con el día de hoy, listo para moverlo con el − y el + o para elegir
  // otro en el calendario. Si se viene de la hoja rápida con un plazo elegido, nace ya
  // con él.
  const [fecha, setFecha] = useState(inicialDias !== null ? sumarDias(hoyIso(), inicialDias) : hoyIso());
  const [kind, setKind] = useState<DateKind>('best_before');

  const [error, setError] = useState<string | null>(null);

  // Si el alta falla DESPUÉS de crear el producto privado (red, validación), el
  // reintento reutiliza el que ya existe en lugar de crear otro igual.
  const privadoCreado = useRef<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (item: NewItem) => {
      let enlazado = productoId;
      // Un código que nadie conocía: se recuerda en ESTA nevera, para que la
      // próxima vez se reconozca sin teclear.
      if (!enlazado && codigo) {
        privadoCreado.current ??= await crearProductoPrivado({
          householdId: item.householdId,
          barcode: codigo,
          name: item.name,
        });
        enlazado = privadoCreado.current;
      }
      await createItem({ ...item, productId: enlazado, listaId });
    },
    // La nevera sale de lo que se mandó, no de la activa de este momento: es la
    // que hay que refrescar aunque algo la cambiara mientras se guardaba.
    async onSuccess(_creado, guardado) {
      // Si se llegó desde el escáner, que sepa qué se acaba de guardar.
      recordarGuardado(guardado.name);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.priorityList(guardado.householdId) }),
        // «Tus productos» y «lo que más gastas» cuentan lo que se añade.
        queryClient.invalidateQueries({ queryKey: queryKeys.premium }),
        // Si venía de la lista, esa línea acaba de quedar comprada.
        listaId ? queryClient.invalidateQueries({ queryKey: queryKeys.lista }) : Promise.resolve(),
      ]);
      router.back();
    },
    onError(caught: unknown) {
      setError(describeDbError(caught));
    },
  });

  function onSubmit() {
    setError(null);

    const amount = Number(quantity.replace(',', '.'));
    if (!name.trim()) return setError('Ponle un nombre, aunque sea «eso verde del cajón».');
    if (nombreEsNoComida(name)) return setError(AVISO_NO_COMIDA);
    if (!Number.isFinite(amount) || amount <= 0) {
      return setError('Pon una cantidad mayor que cero.');
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
      // La fecha que se ve en el campo, o ninguna: nunca una que nadie haya puesto.
      limitDate: hasDate ? fecha : null,
      dateKind: hasDate ? kind : null,
      // Ya no se pregunta de dónde sale: la puso la persona.
      dateSource: hasDate ? 'user' : null,
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
          {/* De dónde salen los datos. Tres casos y solo tres: un producto
              reconocido, un código que nadie conoce, o ningún código. */}
          {productoId ? (
            <View style={styles.escaneado}>
              <Barcode size={18} color={c.brandInk} weight="duotone" />
              <View style={styles.escaneadoTexto}>
                <Text style={styles.escaneadoTitulo} numberOfLines={2}>
                  {ficha
                    ? `${ficha.name}${ficha.brand ? ` · ${ficha.brand}` : ''}`
                    : 'No he podido leer la ficha'}
                </Text>
                {/* La procedencia se queda a la vista, corta: Open Food Facts pide
                    que se cite donde se usen sus datos. */}
                {ficha ? (
                  <Text style={t.caption}>
                    {ficha.data_source === 'openfoodfacts'
                      ? 'De Open Food Facts'
                      : 'Ya guardado en esta nevera'}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : codigo ? (
            <View style={styles.escaneado}>
              <Barcode size={18} color={c.brandInk} weight="duotone" />
              <View style={styles.escaneadoTexto}>
                <Text style={styles.escaneadoTitulo}>No conozco este código</Text>
              </View>
            </View>
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Escanear un código de barras"
              onPress={() => router.replace('/escanear')}
              style={styles.escanear}
            >
              <Barcode size={18} color={c.brandInk} weight="bold" />
              <Text style={styles.escanearTexto}>Escanear un código de barras</Text>
            </Pressable>
          )}
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
          {/* ── Lo que lleva de lo que evitas ───────────────────────────── */}
          {/*
            Antes de guardar, no después. Solo avisa: nada de abajo se apaga por esto. Sin
            ficha (algo a mano, un código que nadie conoce, o una ficha que no se pudo
            leer) cuenta como «sin datos», nunca como «sin alérgenos».
          */}
          <AvisoDeFicha ficha={ficha?.salud ?? null} />
          {productoId && ficha?.salud.deOff && ficha.barcode ? (
            <AccesoIngredientes productoId={productoId} />
          ) : null}

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
                autoFocus={!productoId}
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
            <Chips options={LOCATION_OPTIONS} value={location} onChange={setUbicacionFijada} />
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
              </View>
            </Pressable>

            {hasDate ? (
              <CampoFecha fecha={fecha} onFecha={setFecha} kind={kind} onKind={setKind} />
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

  escaneado: {
    flexDirection: 'row',
    gap: space.sm + 2,
    alignItems: 'flex-start',
    backgroundColor: c.brandSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  escaneadoTexto: { flex: 1, gap: 2 },
  escaneadoTitulo: { fontFamily: fonts.semibold, fontSize: 14, color: c.brandInk },
  escanear: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    alignSelf: 'flex-start',
    backgroundColor: c.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
  },
  escanearTexto: { fontFamily: fonts.semibold, fontSize: 14, color: c.brandInk },

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
}));
