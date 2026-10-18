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
import { productoParaNevera } from '@/features/productos/destino';
import { HojaFicha } from '@/features/productos/HojaFicha';
import { describeDbError } from '@/shared/lib/db-errors';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { queryKeys } from '@/shared/lib/query';
import { formatQuantity } from '@/shared/lib/units';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { fonts, makeStyles, radius, space, tabular, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

type Filtro = 'todos' | 'escaneados' | 'a_mano';

/**
 * Tus productos: el almacén de lo que has registrado, con su ficha.
 *
 * Distingue lo **escaneado** (tiene código de barras y ficha de catálogo) de lo **añadido
 * a mano** (solo un nombre), con un filtro y una etiqueta en cada fila. Tocar uno abre su
 * ficha —de dónde sale, su código, su pasillo y su cantidad— desde la que se guarda en una
 * nevera (la que se elija) o se apunta en una o en varias listas. No cuenta nada: ni cuántas
 * veces se ha comprado ni cuánto hay ahora; para eso está el inventario de la nevera.
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
  const { neveras, activa } = useNeveraActual();

  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [elegido, setElegido] = useState<ProductoConocido | null>(null);
  // El producto que se va a guardar y en qué nevera: la hoja rápida necesita las dos cosas.
  const [rapida, setRapida] = useState<{ p: ProductoConocido; neveraId: string } | null>(null);
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
    mutationFn: ({ p, neveraId, listaIds }: { p: ProductoConocido; neveraId: string; listaIds: string[] }) =>
      agregarLineaEnListas(
        {
          householdId: neveraId,
          name: p.nombre,
          productId: productoParaNevera(p, neveraId, activa.id),
          cantidad: { unitFamily: p.unitFamily, displayUnit: p.displayUnit, quantity: p.cantidad },
        },
        listaIds,
      ),
    async onSuccess(resultados, { p, neveraId }) {
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.listaDe(neveraId) });
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
        {premium && neveras.length > 1 ? <Text style={t.bodySmall}>{activa.name}</Text> : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {settings.isPending ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={error ?? (settings.error ? describeDbError(settings.error) : null)} />

        {!settings.isPending && !premium ? (
          <View style={styles.bloqueo}>
            <Lock size={22} color={c.inkMuted} weight="duotone" />
            <Text style={styles.texto}>
              Con Opsi Premium ⭐ tienes un almacén con los productos que has registrado y su ficha.
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
              <Filtrar valor="todos" actual={filtro} onElegir={setFiltro} etiqueta="Todos" />
              <Filtrar valor="escaneados" actual={filtro} onElegir={setFiltro} etiqueta="Escaneados" />
              <Filtrar valor="a_mano" actual={filtro} onElegir={setFiltro} etiqueta="A mano" />
            </View>

            {resultado ? <Nota texto={resultado} tono="bien" alerta /> : null}

            {consulta.isPending ? <ActivityIndicator color={c.brand} /> : null}
            {consulta.error ? <ErrorNote message={describeDbError(consulta.error)} /> : null}

            {!consulta.isPending && !consulta.error && todos.length === 0 ? (
              <Text style={styles.texto}>Aquí aparecerán los productos que guardes en {activa.name}.</Text>
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
                  </View>
                </View>
              </Pressable>
            ))}
          </>
        ) : null}
      </ScrollView>

      {elegido ? (
        <HojaFicha
          key={elegido.productoId ?? elegido.nombre}
          producto={elegido}
          neveras={neveras}
          activaId={activa.id}
          onClose={() => setElegido(null)}
          onApuntar={async (p, neveraId, listaIds) => {
            await apuntar.mutateAsync({ p, neveraId, listaIds });
          }}
          onGuardar={(p, neveraId) => {
            setElegido(null);
            // Una hoja detrás de otra: se espera a que la primera acabe de bajar
            // (en iOS, dos `Modal` a la vez no se presentan).
            setTimeout(() => setRapida({ p, neveraId }), 300);
          }}
        />
      ) : null}

      {rapida ? (
        <HojaAltaRapida
          key={`${rapida.neveraId}:${rapida.p.productoId ?? rapida.p.nombre}`}
          onClose={() => setRapida(null)}
          nombre={rapida.p.nombre}
          marca={rapida.p.marca}
          productoId={productoParaNevera(rapida.p, rapida.neveraId, activa.id)}
          unitFamily={rapida.p.unitFamily}
          netQuantity={rapida.p.cantidad}
          neveraId={rapida.neveraId}
          onEditar={(e) => {
            const { p, neveraId } = rapida;
            const productoId = productoParaNevera(p, neveraId, activa.id);
            setRapida(null);
            router.push({
              pathname: '/alta',
              params: {
                ...(productoId ? { producto: productoId } : { nombre: p.nombre }),
                nevera: neveraId,
                donde: e.location,
                ...(e.dias !== null ? { dias: String(e.dias) } : {}),
              },
            });
          }}
          onGuardado={(nombre) => {
            const destino = neveras.find((n) => n.id === rapida.neveraId) ?? activa;
            setRapida(null);
            setResultado(`${nombre}: guardado en ${destino.name}.`);
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
}));
