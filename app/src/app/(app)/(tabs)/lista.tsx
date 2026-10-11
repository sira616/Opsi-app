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
  Package,
  Plus,
  ShoppingCart,
  Trash,
} from 'phosphor-react-native';

import type { Nevera } from '@/api/household';
import {
  agregarLinea,
  fetchLista,
  marcarComprada,
  quitarLinea,
  vaciarCompradas,
  type LineaLista,
} from '@/api/lista';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { PildoraNevera } from '@/features/neveras/PildoraNevera';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { formatQuantity } from '@/shared/lib/units';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import {
  fonts,
  makeStyles,
  radius,
  space,
  tabBarClearance,
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

function ListaDe({ nevera }: { nevera: Nevera }) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elegida, setElegida] = useState<LineaLista | null>(null);
  const [compradasAbiertas, setCompradasAbiertas] = useState(false);

  const lista = useQuery({
    queryKey: queryKeys.listaDe(nevera.id),
    queryFn: () => fetchLista(nevera.id),
  });

  const todas = lista.data ?? [];
  const pendientes = todas.filter((l) => !l.is_purchased);
  const compradas = todas.filter((l) => l.is_purchased);

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
      () => agregarLinea({ householdId: nevera.id, name: nombre }),
      // El campo se vacía solo cuando salió bien: si falla, lo escrito se queda.
      { onSuccess: () => setTexto('') },
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.wordmark}>Opsi</Text>
          <View style={styles.pildoraHueco}>
            <PildoraNevera />
          </View>
        </View>
        <Text style={t.title}>La compra</Text>
        <Text style={t.bodySmall}>
          {pendientes.length === 0
            ? 'Nada pendiente'
            : `${pendientes.length} ${pendientes.length === 1 ? 'cosa' : 'cosas'} por comprar`}
        </Text>

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
            onRefresh={() => void lista.refetch()}
            tintColor={c.brand}
          />
        }
      >
        {lista.isPending ? <ActivityIndicator color={c.brand} style={styles.loader} /> : null}

        <ErrorNote message={error ?? (lista.error ? describeDbError(lista.error) : null)} />

        {!lista.isPending && !lista.error && todas.length === 0 ? (
          <View style={styles.vacio}>
            <View style={styles.vacioIcono}>
              <ShoppingCart size={28} color={c.brand} weight="duotone" />
            </View>
            <Text style={styles.vacioTitulo}>La lista está vacía</Text>
            <Text style={t.bodySmall}>Lo que apuntes aquí lo ven todas las personas de esta nevera.</Text>
          </View>
        ) : null}

        {pendientes.map((linea) => (
          <Linea key={linea.id} linea={linea} onPress={() => setElegida(linea)} />
        ))}

        {compradas.length > 0 ? (
          <View style={styles.compradas}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: compradasAbiertas }}
              onPress={() => setCompradasAbiertas((v) => !v)}
              style={styles.compradasCabecera}
            >
              <Text style={styles.compradasTitulo}>Comprado · {compradas.length}</Text>
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
                  onConfirm={() => cambiar.mutate(() => vaciarCompradas(nevera.id))}
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
                const id = elegida.id;
                setElegida(null);
                router.push({ pathname: '/alta', params: { lista: id } });
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
      style={({ pressed }) => [styles.linea, pressed && styles.pulsado]}
    >
      {comprada ? (
        <CheckCircle size={26} color={c.brand} weight="fill" />
      ) : (
        <View style={styles.circulo} />
      )}
      <View style={styles.lineaTexto}>
        <Text style={[styles.lineaNombre, comprada && styles.lineaTachada]} numberOfLines={2}>
          {linea.name}
        </Text>
        {cantidad || linea.source === 'auto_restock' ? (
          <Text style={styles.lineaDetalle}>
            {[cantidad, linea.source === 'auto_restock' ? 'se acabó' : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
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
  header: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.sm, gap: space.xs },
  headerTop: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.sm },
  wordmark: { fontSize: 21, fontWeight: '600', color: c.brand },
  pildoraHueco: { flex: 1, minWidth: 0, alignItems: 'flex-start' },

  apuntar: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.md },
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

  content: { paddingHorizontal: space.xl, paddingBottom: tabBarClearance, gap: space.xs },
  loader: { marginTop: space.xl },

  vacio: { alignItems: 'center', gap: space.sm, paddingVertical: space.xxl },
  vacioIcono: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  vacioTitulo: { fontFamily: fonts.semibold, fontSize: 16, color: c.ink },

  linea: {
    minHeight: touchTarget + 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  // El círculo vacío se dibuja: es un borde, y así mide lo mismo que el check.
  circulo: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: c.borderStrong },
  lineaTexto: { flex: 1, gap: 1 },
  lineaNombre: { fontFamily: fonts.medium, fontSize: 16, color: c.ink },
  lineaTachada: { color: c.inkFaint, textDecorationLine: 'line-through' },
  lineaDetalle: { fontSize: 12.5, color: c.inkMuted },

  compradas: { marginTop: space.lg, gap: space.xs },
  compradasCabecera: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compradasTitulo: {
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
