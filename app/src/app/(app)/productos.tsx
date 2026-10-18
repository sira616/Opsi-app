import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Barcode, CaretLeft, Lock, MagnifyingGlass, PencilSimple, Star } from 'phosphor-react-native';

import { agregarLineaEnListas } from '@/api/lista';
import { fetchProductosConocidos, type ProductoConocido } from '@/api/premium';
import { fetchSettings } from '@/api/settings';
import { HojaAltaRapida } from '@/features/alta/HojaAltaRapida';
import { Nota } from '@/features/ajustes/ui';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { HojaFicha } from '@/features/productos/HojaFicha';
import { describeDbError } from '@/shared/lib/db-errors';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { queryKeys } from '@/shared/lib/query';
import { formatQuantity } from '@/shared/lib/units';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { fonts, makeStyles, radius, space, tabular, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

type Filtro = 'todos' | 'escaneados' | 'a_mano';

/**
 * Tus productos: un inventario de lo que has añadido, con su ficha.
 *
 * Distingue lo **escaneado** (tiene código de barras y ficha de catálogo) de lo **añadido
 * a mano** (solo un nombre), con un filtro y una etiqueta en cada fila. Tocar uno abre su
 * ficha —de dónde sale, su código, cuántas veces lo has añadido y cuánto hay ahora— desde
 * la que se guarda en la nevera o se apunta en una o en varias listas.
 *
 * Es de Premium ⭐ y lo comprueba el servidor (`my_known_products`); aquí el candado solo
 * evita pedir lo que se va a rechazar. No hay una tabla: sale de los elementos que ya
 * añadiste, y lo que se escaneó sin guardar no sale.
 */
export default function Productos() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activa } = useNeveraActual();

  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [elegido, setElegido] = useState<ProductoConocido | null>(null);
  const [rapida, setRapida] = useState<ProductoConocido | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const premium = settings.data?.plan === 'premium';

  const consulta = useQuery({
    queryKey: queryKeys.productosConocidos(activa.id),
    queryFn: () => fetchProductosConocidos(activa.id),
    enabled: premium,
  });

  const todos = consulta.data ?? [];
  const escaneados = todos.filter((p) => p.escaneado).length;
  const aMano = todos.length - escaneados;

  const texto = busca.trim().toLowerCase();
  const visibles = todos.filter(
    (p) =>
      (filtro === 'todos' || (filtro === 'escaneados' ? p.escaneado : !p.escaneado)) &&
      (texto === '' ||
        p.nombre.toLowerCase().includes(texto) ||
        (p.marca ?? '').toLowerCase().includes(texto) ||
        (p.codigo ?? '').includes(texto)),
  );

  const apuntar = useMutation({
    mutationFn: ({ p, listaIds }: { p: ProductoConocido; listaIds: string[] }) =>
      agregarLineaEnListas(
        {
          householdId: activa.id,
          name: p.nombre,
          productId: p.productoId,
          cantidad: { unitFamily: p.unitFamily, displayUnit: p.displayUnit, quantity: p.cantidad },
        },
        listaIds,
      ),
    async onSuccess(resultados, { p }) {
      setError(null);
      const nuevas = resultados.filter(Boolean).length;
      setResultado(
        nuevas === 0
          ? `${p.nombre} ya estaba apuntado.`
          : resultados.length === 1
            ? `${p.nombre}: apuntado en la lista.`
            : `${p.nombre}: apuntado en ${nuevas} ${nuevas === 1 ? 'lista' : 'listas'}.`,
      );
      setElegido(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.listaDe(activa.id) });
    },
  });

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={styles.back}
        >
          <CaretLeft size={16} color={c.inkMuted} weight="bold" />
          <Text style={styles.backText}>Premium</Text>
        </Pressable>
        <View style={styles.titulo}>
          <Text style={t.title}>Tus productos</Text>
          <Star size={24} color={c.brandBright} weight="fill" />
        </View>
        {premium && todos.length > 0 ? (
          <Text style={t.bodySmall}>
            {todos.length} {todos.length === 1 ? 'producto' : 'productos'} en {activa.name}
          </Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {settings.isPending ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={error ?? (settings.error ? describeDbError(settings.error) : null)} />

        {!settings.isPending && !premium ? (
          <View style={styles.bloqueo}>
            <Lock size={22} color={c.inkMuted} weight="duotone" />
            <Text style={styles.texto}>
              Con Opsi Premium ⭐ tienes aquí un inventario de todo lo que has añadido, con su ficha, para
              guardarlo en la nevera o apuntarlo en la lista de un toque.
            </Text>
          </View>
        ) : null}

        {premium ? (
          <>
            <View style={styles.busca}>
              <MagnifyingGlass size={18} color={c.inkMuted} weight="bold" />
              <TextInput
                accessibilityLabel="Buscar un producto"
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar por nombre, marca o código"
                placeholderTextColor={c.inkFaint}
                returnKeyType="search"
                autoCorrect={false}
                style={styles.buscaInput}
              />
            </View>

            <View style={styles.filtros}>
              <Filtrar valor="todos" actual={filtro} onElegir={setFiltro} etiqueta={`Todos ${todos.length}`} />
              <Filtrar
                valor="escaneados"
                actual={filtro}
                onElegir={setFiltro}
                etiqueta={`Escaneados ${escaneados}`}
              />
              <Filtrar valor="a_mano" actual={filtro} onElegir={setFiltro} etiqueta={`A mano ${aMano}`} />
            </View>

            {resultado ? <Nota texto={resultado} tono="bien" alerta /> : null}

            {consulta.isPending ? <ActivityIndicator color={c.brand} /> : null}
            {consulta.error ? <ErrorNote message={describeDbError(consulta.error)} /> : null}

            {!consulta.isPending && !consulta.error && todos.length === 0 ? (
              <Text style={styles.texto}>
                Aquí saldrá lo que añadas a {activa.name}, escaneado o a mano, con su ficha.
              </Text>
            ) : null}
            {todos.length > 0 && visibles.length === 0 ? (
              <Text style={styles.texto}>No hay nada que coincida.</Text>
            ) : null}

            {visibles.map((p) => (
              <Pressable
                key={p.productoId ?? p.nombre.toLowerCase()}
                accessibilityRole="button"
                accessibilityLabel={`${p.nombre}, ${p.escaneado ? 'escaneado' : 'añadido a mano'}. Abrir su ficha`}
                onPress={() => {
                  setResultado(null);
                  setElegido(p);
                }}
                style={({ pressed }) => [styles.fila, pressed && styles.pulsado]}
              >
                <View style={styles.avatar}>
                  <IconoComida nombre={p.nombre} size={22} color={c.brand} weight="duotone" />
                </View>
                <View style={styles.filaTexto}>
                  <Text style={styles.nombre} numberOfLines={1}>
                    {p.nombre}
                  </Text>
                  <Text style={styles.detalle} numberOfLines={1}>
                    {[p.marca, formatQuantity(p.cantidad, p.displayUnit)].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={styles.etiquetas}>
                    <View style={[styles.etiqueta, p.escaneado && styles.etiquetaEscaneado]}>
                      {p.escaneado ? (
                        <Barcode size={12} color={c.brandInk} weight="bold" />
                      ) : (
                        <PencilSimple size={12} color={c.inkMuted} weight="bold" />
                      )}
                      <Text style={[styles.etiquetaTexto, p.escaneado && styles.etiquetaTextoEscaneado]}>
                        {p.escaneado ? 'Escaneado' : 'A mano'}
                      </Text>
                    </View>
                    {p.enLaNevera > 0 ? (
                      <Text style={styles.stock}>Tienes {p.enLaNevera}</Text>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.veces}>×{p.veces}</Text>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      {elegido ? (
        <HojaFicha
          key={elegido.productoId ?? elegido.nombre}
          producto={elegido}
          householdId={activa.id}
          onClose={() => setElegido(null)}
          onApuntar={async (p, listaIds) => {
            await apuntar.mutateAsync({ p, listaIds });
          }}
          onGuardar={(p) => {
            setElegido(null);
            // Una hoja detrás de otra: se espera a que la primera acabe de bajar
            // (en iOS, dos `Modal` a la vez no se presentan).
            setTimeout(() => setRapida(p), 300);
          }}
        />
      ) : null}

      {rapida ? (
        <HojaAltaRapida
          key={rapida.productoId ?? rapida.nombre}
          onClose={() => setRapida(null)}
          nombre={rapida.nombre}
          marca={rapida.marca}
          productoId={rapida.productoId}
          unitFamily={rapida.unitFamily}
          netQuantity={rapida.cantidad}
          onEditar={(e) => {
            const p = rapida;
            setRapida(null);
            router.push({
              pathname: '/alta',
              params: {
                ...(p.productoId ? { producto: p.productoId } : { nombre: p.nombre }),
                donde: e.location,
                ...(e.dias !== null ? { dias: String(e.dias) } : {}),
              },
            });
          }}
          onGuardado={(nombre) => {
            setRapida(null);
            setResultado(`${nombre}: guardado en la nevera.`);
          }}
        />
      ) : null}
    </SafeAreaView>
  );
}

function Filtrar({
  valor,
  actual,
  onElegir,
  etiqueta,
}: {
  valor: Filtro;
  actual: Filtro;
  onElegir: (f: Filtro) => void;
  etiqueta: string;
}) {
  const styles = useStyles();
  const on = valor === actual;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={etiqueta}
      onPress={() => onElegir(valor)}
      style={[styles.filtro, on && styles.filtroOn]}
    >
      <Text style={[styles.filtroTexto, on && styles.filtroTextoOn]}>{etiqueta}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm, gap: space.xs },
  back: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.md },
  texto: { fontSize: 13.5, lineHeight: 19, color: c.inkMuted },
  bloqueo: {
    flexDirection: 'row',
    gap: space.md,
    alignItems: 'flex-start',
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },

  busca: {
    minHeight: touchTarget + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  buscaInput: { flex: 1, fontSize: 15, color: c.ink, paddingVertical: space.sm },
  filtros: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  filtro: {
    minHeight: touchTarget - 6,
    justifyContent: 'center',
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  filtroOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  filtroTexto: { ...tabular, fontFamily: fonts.semibold, fontSize: 13, color: c.inkMuted },
  filtroTextoOn: { color: c.brandInk },

  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  pulsado: { opacity: 0.75 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  filaTexto: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.semibold, fontSize: 15, color: c.ink },
  detalle: { fontSize: 12.5, color: c.inkMuted },
  etiquetas: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 },
  etiqueta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
  },
  etiquetaEscaneado: { backgroundColor: c.brandSoft },
  etiquetaTexto: { fontFamily: fonts.semibold, fontSize: 11, color: c.inkMuted },
  etiquetaTextoEscaneado: { color: c.brandInk },
  stock: { fontSize: 11.5, fontWeight: '600', color: c.inkMuted },
  veces: { ...tabular, fontFamily: fonts.semibold, fontSize: 13.5, color: c.brandInk },
}));
