import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CaretDown,
  CaretUp,
  Check,
  CheckCircle,
  Confetti,
  Package,
  Plus,
  ShoppingCart,
  Trash,
} from 'phosphor-react-native';

import type { Nevera } from '@/api/household';
import {
  agregarLinea,
  fetchLista,
  fetchListas,
  fetchSugerencias,
  marcarComprada,
  quitarLinea,
  vaciarCompradas,
  type LineaLista,
  type Sugerencia,
} from '@/api/lista';
import { HojaAltaRapida } from '@/features/alta/HojaAltaRapida';
import { fetchSettings } from '@/api/settings';
import { SelectorListas } from '@/features/lista/SelectorListas';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { PildoraNevera } from '@/features/neveras/PildoraNevera';
import { adivinarCategoria, CATEGORIAS, type Categoria } from '@/shared/lib/categorias';
import { IconoCategoria } from '@/shared/lib/categorias-iconos';
import { describeDbError } from '@/shared/lib/db-errors';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { queryKeys } from '@/shared/lib/query';
import { formatQuantity } from '@/shared/lib/units';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import {
  conAlpha,
  fonts,
  makeStyles,
  radius,
  space,
  tabBarClearance,
  tabular,
  touchTarget,
  useTheme,
  useType,
} from '@/shared/theme/tokens';

/**
 * La lista de la compra de la nevera activa.
 *
 * Como «Consumir primero», la pantalla de verdad está en `ListaDe` y esta cáscara
 * solo le da la nevera con `key` por su id: al cambiar de nevera se monta de cero y
 * no arrastra lo que se estaba escribiendo en la anterior.
 */
export default function Lista() {
  const { activa } = useNeveraActual();
  return <ListaDe key={activa.id} nevera={activa} />;
}

/**
 * Lo pendiente, agrupado por pasillo y en el orden en que se recorre un
 * supermercado. Una lista plana de cuarenta nombres obliga a ir y volver; agrupada
 * se compra de una pasada, y el agrupado sale gratis del nombre (el mismo
 * `adivinarCategoria` que usa el alta).
 */
function agruparPorPasillo(lineas: LineaLista[]): { categoria: Categoria; lineas: LineaLista[] }[] {
  const grupos = new Map<Categoria, LineaLista[]>();
  for (const l of lineas) {
    const cat = adivinarCategoria(l.name);
    grupos.set(cat, [...(grupos.get(cat) ?? []), l]);
  }
  return CATEGORIAS.filter((d) => grupos.has(d.valor)).map((d) => ({
    categoria: d.valor,
    lineas: grupos.get(d.valor) ?? [],
  }));
}

function etiquetaDe(categoria: Categoria): string {
  return CATEGORIAS.find((d) => d.valor === categoria)?.etiqueta ?? '';
}

function ListaDe({ nevera }: { nevera: Nevera }) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<LineaLista | null>(null);
  // La línea que se está guardando en la nevera, en la hoja rápida.
  const [rapida, setRapida] = useState<LineaLista | null>(null);
  const [compradasAbiertas, setCompradasAbiertas] = useState(false);
  const [listaElegida, setListaElegida] = useState<string | null>(null);

  // Las listas de la nevera, y cuál se está mirando: la elegida si sigue existiendo y,
  // si no (se acaba de borrar, o aún no se ha elegido), la principal.
  const listas = useQuery({
    queryKey: queryKeys.listasDe(nevera.id),
    queryFn: () => fetchListas(nevera.id),
  });
  const ajustes = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const listaId =
    listas.data?.find((l) => l.id === listaElegida)?.id ?? listas.data?.[0]?.id ?? null;

  const lista = useQuery({
    queryKey: queryKeys.listaDe(nevera.id, listaId ?? ''),
    queryFn: () => fetchLista(nevera.id, listaId as string),
    enabled: listaId !== null,
  });
  // Cuelga de la clave de la lista: cualquier cambio de la lista las refresca a las dos.
  const sugeridas = useQuery({
    queryKey: [...queryKeys.listaDe(nevera.id), 'sugerencias'],
    queryFn: () => fetchSugerencias(nevera.id),
  });

  const todas = lista.data ?? [];
  const pendientes = todas.filter((l) => !l.is_purchased);
  const compradas = todas.filter((l) => l.is_purchased);
  const grupos = agruparPorPasillo(pendientes);

  // Lo que ya está pendiente no se vuelve a sugerir.
  const yaApuntado = new Set(pendientes.map((l) => l.name.trim().toLowerCase()));
  const sugerencias = (sugeridas.data ?? []).filter((s) => !yaApuntado.has(s.name.trim().toLowerCase()));

  const hechas = compradas.length;
  const total = todas.length;
  const progreso = total === 0 ? 0 : hechas / total;
  const completa = total > 0 && pendientes.length === 0;

  // Una sola forma de ejecutar y refrescar: cualquier cambio vuelve a pedir la
  // lista de ESTA nevera, y el error del servidor sale tal cual (ya está en español).
  const cambiar = useMutation({
    mutationFn: (accion: () => Promise<unknown>) => accion(),
    async onSuccess() {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.listaDe(nevera.id) });
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  function apuntar() {
    const nombre = texto.trim();
    if (!nombre || cambiar.isPending) return;
    cambiar.mutate(
      () => agregarLinea({ householdId: nevera.id, listaId: listaId ?? undefined, name: nombre }),
      // El campo se vacía solo cuando salió bien: si falla, lo escrito se queda.
      { onSuccess: () => setTexto('') },
    );
  }

  function repetir(s: Sugerencia) {
    cambiar.mutate(() =>
      agregarLinea({
        householdId: nevera.id,
        listaId: listaId ?? undefined,
        name: s.name,
        productId: s.product_id,
        cantidad: { unitFamily: s.unit_family, displayUnit: s.display_unit, quantity: s.initial_quantity },
      }),
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.pildoraHueco}>
            <PildoraNevera />
          </View>
        </View>
        <Text style={t.title}>La compra</Text>

        {listas.data && listaId ? (
          <SelectorListas
            householdId={nevera.id}
            listas={listas.data}
            activaId={listaId}
            onElegir={setListaElegida}
            plan={ajustes.data?.plan ?? 'basic'}
          />
        ) : null}

        {/* El resumen: cuánto falta de un vistazo, y cuánto llevas. */}
        <View style={[styles.resumen, completa && styles.resumenCompleto]}>
          <View style={styles.resumenIcono}>
            {completa ? (
              <Confetti size={26} color={c.brandInk} weight="duotone" />
            ) : (
              <ShoppingCart size={26} color={c.brandInk} weight="duotone" />
            )}
          </View>
          <View style={styles.resumenTexto}>
            <Text style={styles.resumenTitulo}>
              {completa
                ? 'Lista completa'
                : pendientes.length === 0
                  ? 'Nada que comprar'
                  : `${pendientes.length} ${pendientes.length === 1 ? 'cosa' : 'cosas'} por comprar`}
            </Text>
            {total > 0 ? (
              <>
                <View style={styles.pista}>
                  <View style={[styles.pistaRelleno, { width: `${progreso * 100}%` }]} />
                </View>
                <Text style={styles.resumenDetalle}>
                  {hechas} de {total} en el carro
                </Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={styles.apuntar}>
          <TextInput
            accessibilityLabel="Apuntar algo en la lista"
            value={texto}
            onChangeText={setTexto}
            onSubmitEditing={apuntar}
            placeholder="Apunta algo…"
            placeholderTextColor={c.inkFaint}
            returnKeyType="done"
            maxLength={200}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Apuntar"
            accessibilityState={{ disabled: !texto.trim() || cambiar.isPending }}
            disabled={!texto.trim() || cambiar.isPending}
            onPress={apuntar}
            style={({ pressed }) => [
              styles.mas,
              (!texto.trim() || cambiar.isPending) && styles.masApagado,
              pressed && styles.pulsado,
            ]}
          >
            <Plus size={22} color={c.onBrand} weight="bold" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={lista.isFetching && !lista.isPending}
            onRefresh={() => void Promise.all([listas.refetch(), lista.refetch()])}
            tintColor={c.brand}
          />
        }
      >
        {listas.isPending || (listaId !== null && lista.isPending) ? (
          <ActivityIndicator color={c.brand} style={styles.loader} />
        ) : null}

        <ErrorNote
          message={
            error ??
            (listas.error ? describeDbError(listas.error) : lista.error ? describeDbError(lista.error) : null)
          }
        />

        {/* Lo que se acabó hace poco, a un toque de volver a la lista. */}
        {sugerencias.length > 0 ? (
          <View style={styles.sugerencias}>
            <Text style={styles.sugerenciasTitulo}>Se te acabó</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sugerenciasFila}>
              {sugerencias.map((s) => (
                <Pressable
                  key={s.name}
                  accessibilityRole="button"
                  accessibilityLabel={`Apuntar ${s.name} en la lista`}
                  onPress={() => repetir(s)}
                  style={({ pressed }) => [styles.sugerencia, pressed && styles.pulsado]}
                >
                  <IconoComida nombre={s.name} size={16} color={c.brandInk} weight="duotone" />
                  <Text style={styles.sugerenciaTexto} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Plus size={14} color={c.brandInk} weight="bold" />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {listaId !== null && !lista.isPending && !lista.error && todas.length === 0 ? (
          <View style={styles.vacio}>
            <View style={styles.vacioIcono}>
              <ShoppingCart size={30} color={c.brand} weight="duotone" />
            </View>
            <Text style={styles.vacioTitulo}>La lista está vacía</Text>
            <Text style={t.bodySmall}>Lo que apuntes aquí lo ven todas las personas de esta nevera.</Text>
          </View>
        ) : null}

        {grupos.map((grupo) => (
          <View key={grupo.categoria} style={styles.grupo}>
            <View style={styles.grupoCabecera}>
              <View style={styles.grupoIcono}>
                <IconoCategoria categoria={grupo.categoria} size={15} color={c.brandInk} weight="duotone" />
              </View>
              <Text style={styles.grupoTitulo}>{etiquetaDe(grupo.categoria)}</Text>
              <Text style={styles.grupoCuenta}>{grupo.lineas.length}</Text>
            </View>
            {grupo.lineas.map((linea) => (
              <Linea key={linea.id} linea={linea} onPress={() => setElegida(linea)} />
            ))}
          </View>
        ))}

        {compradas.length > 0 ? (
          <View style={styles.compradas}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: compradasAbiertas }}
              onPress={() => setCompradasAbiertas((v) => !v)}
              style={styles.compradasCabecera}
            >
              <CheckCircle size={18} color={c.brand} weight="fill" />
              <Text style={styles.compradasTitulo}>En el carro · {compradas.length}</Text>
              {compradasAbiertas ? (
                <CaretUp size={16} color={c.inkMuted} weight="bold" />
              ) : (
                <CaretDown size={16} color={c.inkMuted} weight="bold" />
              )}
            </Pressable>

            {compradasAbiertas ? (
              <>
                {compradas.map((linea) => (
                  <Linea
                    key={linea.id}
                    linea={linea}
                    // Tocar algo tachado lo destacha: es lo único que se puede querer.
                    onPress={() => cambiar.mutate(() => marcarComprada(linea.id, false))}
                  />
                ))}
                <ConfirmAction
                  label="Vaciar lo comprado"
                  icon={<Trash size={20} color={c.inkMuted} weight="duotone" />}
                  confirmLabel="Sí, vaciarlo"
                  question="¿Quitar de la lista todo lo ya comprado? No se puede deshacer."
                  busy={cambiar.isPending}
                  onConfirm={() => cambiar.mutate(() => vaciarCompradas(listaId as string))}
                />
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      {/* Lo que se puede hacer con una línea pendiente. Tocarla abre esto, y no
          tachar de golpe: casi siempre lo que se quiere es que entre en la nevera,
          y a veces —papel de cocina— solo tacharlo. */}
      <HojaInferior
        visible={elegida !== null}
        onClose={() => setElegida(null)}
        titulo={elegida?.name}
      >
        {elegida ? (
          <View style={styles.opciones}>
            <Opcion
              icono={<Package size={22} color={c.brand} weight="duotone" />}
              etiqueta="Ya lo tengo: guardarlo en la nevera"
              onPress={() => {
                const linea = elegida;
                setElegida(null);
                // Una hoja detrás de otra: se espera a que la primera acabe de bajar
                // (en iOS, dos `Modal` a la vez no se presentan).
                setTimeout(() => setRapida(linea), 300);
              }}
            />
            <Opcion
              icono={<Check size={22} color={c.inkMuted} weight="bold" />}
              etiqueta="Tacharlo sin guardarlo"
              onPress={() => {
                const id = elegida.id;
                setElegida(null);
                cambiar.mutate(() => marcarComprada(id, true));
              }}
            />
            <Opcion
              icono={<Trash size={22} color={c.expiry} weight="duotone" />}
              etiqueta="Quitar de la lista"
              peligro
              onPress={() => {
                const id = elegida.id;
                setElegida(null);
                cambiar.mutate(() => quitarLinea(id));
              }}
            />
          </View>
        ) : null}
      </HojaInferior>

      {/* Guardarlo en la nevera: la hoja pequeña, con lo que se apuntó ya puesto. */}
      {rapida ? (
        <HojaAltaRapida
          key={rapida.id}
          onClose={() => setRapida(null)}
          nombre={rapida.name}
          productoId={rapida.product_id}
          unitFamily={rapida.unit_family}
          netQuantity={null}
          linea={rapida}
          onEditar={(elegido) => {
            const id = rapida.id;
            setRapida(null);
            router.push({
              pathname: '/alta',
              params: {
                lista: id,
                donde: elegido.location,
                ...(elegido.dias !== null ? { dias: String(elegido.dias) } : {}),
              },
            });
          }}
          onGuardado={() => setRapida(null)}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Linea({ linea, onPress }: { linea: LineaLista; onPress: () => void }) {
  const styles = useStyles();
  const c = useTheme();
  const comprada = linea.is_purchased;
  const cantidad =
    linea.quantity !== null && linea.display_unit
      ? formatQuantity(linea.quantity, linea.display_unit)
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={comprada ? `${linea.name}, comprado. Quitar la tachadura` : linea.name}
      onPress={onPress}
      style={({ pressed }) => [styles.linea, comprada && styles.lineaComprada, pressed && styles.pulsado]}
    >
      <View style={[styles.avatar, comprada && styles.avatarApagado]}>
        <IconoComida
          nombre={linea.name}
          size={22}
          color={comprada ? c.inkFaint : c.brandInk}
          weight="duotone"
        />
      </View>
      <View style={styles.lineaTexto}>
        <Text style={[styles.lineaNombre, comprada && styles.lineaTachada]} numberOfLines={2}>
          {linea.name}
        </Text>
        {cantidad || linea.source === 'auto_restock' ? (
          <View style={styles.lineaDetalleFila}>
            {cantidad ? <Text style={styles.lineaCantidad}>{cantidad}</Text> : null}
            {linea.source === 'auto_restock' ? <Text style={styles.lineaEtiqueta}>se acabó</Text> : null}
          </View>
        ) : null}
      </View>
      {comprada ? (
        <CheckCircle size={26} color={c.brand} weight="fill" />
      ) : (
        <View style={styles.circulo} />
      )}
    </Pressable>
  );
}

function Opcion({
  icono,
  etiqueta,
  peligro,
  onPress,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  peligro?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.opcion, peligro && styles.opcionPeligro, pressed && styles.pulsado]}
    >
      {icono}
      <Text style={[styles.opcionTexto, peligro && styles.opcionTextoPeligro]}>{etiqueta}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, gap: space.sm },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pildoraHueco: { flex: 1, minWidth: 0, alignItems: 'flex-start' },

  // El resumen: una tarjeta con color de marca, para que la pantalla tenga un
  // punto de partida y no sea solo una columna de texto.
  resumen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    padding: space.lg,
    borderRadius: radius.lg + 4,
    backgroundColor: c.brandSoft,
  },
  resumenCompleto: { borderWidth: 1.5, borderColor: c.brand },
  resumenIcono: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: conAlpha(c.brand, 0.18),
  },
  resumenTexto: { flex: 1, gap: 6 },
  resumenTitulo: { fontFamily: fonts.displaySemi, fontSize: 20, color: c.brandInk },
  pista: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: conAlpha(c.brand, 0.22) },
  pistaRelleno: { height: 8, borderRadius: 4, backgroundColor: c.brand },
  resumenDetalle: { ...tabular, fontSize: 12.5, color: c.brandInk },

  apuntar: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  input: {
    flex: 1,
    minHeight: touchTarget + 4,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
    fontFamily: fonts.body,
    fontSize: 15,
    color: c.ink,
  },
  mas: {
    width: touchTarget + 4,
    height: touchTarget + 4,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brand,
  },
  masApagado: { opacity: 0.4 },
  pulsado: { opacity: 0.7 },

  content: { paddingHorizontal: space.xl, paddingBottom: tabBarClearance, gap: space.lg },
  loader: { marginTop: space.xl },

  sugerencias: { gap: space.sm },
  sugerenciasTitulo: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  sugerenciasFila: { gap: space.sm, paddingRight: space.lg },
  sugerencia: {
    maxWidth: 220,
    minHeight: touchTarget - 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 2,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    backgroundColor: c.brandSoft,
  },
  sugerenciaTexto: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 13.5, color: c.brandInk },

  vacio: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  vacioIcono: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  vacioTitulo: { fontFamily: fonts.semibold, fontSize: 17, color: c.ink },

  grupo: { gap: space.sm },
  grupoCabecera: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  grupoIcono: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  grupoTitulo: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  grupoCuenta: { ...tabular, fontFamily: fonts.semibold, fontSize: 12, color: c.inkFaint },

  // Cada línea es una tarjeta: se ve qué se toca y cuánto ocupa cada cosa.
  linea: {
    minHeight: touchTarget + 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  lineaComprada: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  avatarApagado: { backgroundColor: c.surfaceAlt },
  // El círculo vacío se dibuja: es un borde, y así mide lo mismo que el check.
  circulo: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: c.borderStrong },
  lineaTexto: { flex: 1, gap: 2 },
  lineaNombre: { fontFamily: fonts.medium, fontSize: 16, color: c.ink },
  lineaTachada: { color: c.inkFaint, textDecorationLine: 'line-through' },
  lineaDetalleFila: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  lineaCantidad: { ...tabular, fontFamily: fonts.semibold, fontSize: 12.5, color: c.inkMuted },
  lineaEtiqueta: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: c.brandInk,
    backgroundColor: c.brandSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 1,
    overflow: 'hidden',
  },

  compradas: { gap: space.sm },
  compradasCabecera: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  compradasTitulo: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },

  opciones: { gap: space.sm },
  opcion: {
    minHeight: touchTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  opcionPeligro: { borderColor: c.expiryLine },
  opcionTexto: { flex: 1, fontFamily: fonts.semibold, fontSize: 15.5, color: c.ink },
  opcionTextoPeligro: { color: c.expiry },
}));
