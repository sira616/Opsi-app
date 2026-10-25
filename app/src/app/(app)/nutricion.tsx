import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaretLeft, Lock, MagnifyingGlass, Star } from 'phosphor-react-native';

import { fetchProductosConocidos, type ProductoConocido } from '@/api/premium';
import { fetchSettings } from '@/api/settings';
import { Nota } from '@/features/ajustes/ui';
import { FilaNutricion, type EstadoNutricion } from '@/features/nutricion/FilaNutricion';
import { esFalloDePlan, useNutricionDeLista } from '@/features/nutricion/useNutricion';
import { describeDbError } from '@/shared/lib/db-errors';
import { ORIGEN_LISTA, coincideConBusqueda, normalizarBusqueda } from '@/shared/lib/nutricion';
import { queryKeys } from '@/shared/lib/query';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { fonts, makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

/**
 * Nutrición: la de «Tus productos», con buscador. En cada fila, el Nutri-Score en pequeño si
 * lo hay y el grupo NOVA; tocar uno abre su detalle completo (`/nutricion/[id]`).
 *
 * Es de Premium ⭐ y lo decide el SERVIDOR: `my_known_products` y `nutrition_of_products`
 * rechazan a quien no tiene el plan. Aquí el candado solo evita pedir lo que se va a
 * rechazar. Y si aun así el servidor dice que esto es de Premium (un plan que caducó), se
 * enseña su mensaje tal cual, en una nota de aviso y no en rojo (docs/VOZ.md §7).
 *
 * LISTAR NO GASTA CUOTA: la nutrición se lee de lo que ya está guardado. Renovar una ficha
 * antigua en Open Food Facts es cosa del detalle, cuando la persona abre un producto.
 *
 * Los productos son los mismos que enseña «Tus productos» (los de tu cuenta, de todas tus
 * neveras), con la misma consulta. Lo que se leyó de Open Food Facts vive solo en la caché en memoria: no se guarda
 * en ningún disco.
 */
export default function NutricionLista() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();

  const [busca, setBusca] = useState('');

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });
  const premium = settings.data?.plan === 'premium';

  const conocidos = useQuery({
    queryKey: queryKeys.productosConocidos,
    queryFn: fetchProductosConocidos,
    enabled: premium,
  });

  const todos = useMemo(() => conocidos.data ?? [], [conocidos.data]);
  // Solo lo escaneado tiene ficha de catálogo y, con ella, algo que consultar.
  const ids = useMemo(() => todos.flatMap((p) => (p.productoId ? [p.productoId] : [])), [todos]);
  const nutricion = useNutricionDeLista(ids, premium);

  const estado: EstadoNutricion = nutricion.isError ? 'error' : nutricion.isSuccess ? 'listo' : 'cargando';

  // Se normaliza una vez por pulsación y no una por fila.
  const busqueda = normalizarBusqueda(busca);
  const visibles = todos.filter((p) => coincideConBusqueda(busqueda, p.nombre, p.marca));

  function abrir(p: ProductoConocido) {
    if (!p.productoId) return;
    router.push({ pathname: '/nutricion/[id]', params: { id: p.productoId } });
  }

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
          <Text style={t.title}>Nutrición</Text>
          <Star size={24} color={c.brandBright} weight="fill" />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {settings.isPending ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={settings.error ? describeDbError(settings.error) : null} />

        {!settings.isPending && !premium ? (
          <View style={styles.bloqueo}>
            <Lock size={22} color={c.inkMuted} weight="duotone" />
            <Text style={styles.texto}>
              Con Opsi Premium ⭐ ves el Nutri-Score y el grupo NOVA de tus productos.
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
                placeholder="Buscar por nombre o marca"
                placeholderTextColor={c.inkFaint}
                returnKeyType="search"
                autoCorrect={false}
                maxLength={80}
                style={styles.buscaInput}
              />
            </View>

            {conocidos.isPending ? <ActivityIndicator color={c.brand} /> : null}
            <AvisoDeError error={conocidos.error} />
            <AvisoDeError error={nutricion.error} />

            {!conocidos.isPending && !conocidos.error && todos.length === 0 ? (
              <View style={styles.vacio}>
                <Text style={styles.vacioTitulo}>Ni una etiqueta que leer</Text>
                <Text style={t.bodySmall}>
                  Escanea algo y guárdalo en tu nevera. Aquí verás su Nutri-Score y su grupo NOVA.
                </Text>
                <Pressable accessibilityRole="button" onPress={() => router.push('/alta')} style={styles.vacioBoton}>
                  <Text style={styles.vacioBotonTexto}>Añadir alimento</Text>
                </Pressable>
              </View>
            ) : null}

            {todos.length > 0 && visibles.length === 0 ? (
              <View style={styles.vacio}>
                <Text style={styles.vacioTitulo}>Nada coincide con tu búsqueda</Text>
                <Text style={t.bodySmall}>Prueba con otro nombre o con la marca.</Text>
                <Pressable accessibilityRole="button" onPress={() => setBusca('')} style={styles.vacioBoton}>
                  <Text style={styles.vacioBotonTexto}>Borrar búsqueda</Text>
                </Pressable>
              </View>
            ) : null}

            {visibles.map((p) => (
              <FilaNutricion
                key={p.productoId ?? p.nombre.toLowerCase()}
                producto={p}
                nutricion={p.productoId ? nutricion.data?.[p.productoId.toLowerCase()] : undefined}
                estado={estado}
                onPress={abrir}
              />
            ))}

            {visibles.length > 0 ? <Text style={styles.origen}>{ORIGEN_LISTA}</Text> : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Un fallo de una consulta. Si es que el plan no llega (caducó), es un aviso con las
 * palabras del servidor, sin rojo: el rojo es de la caducidad. Cualquier otro fallo es un
 * error de los de siempre.
 */
function AvisoDeError({ error }: { error: unknown }) {
  if (!error) return null;
  return esFalloDePlan(error) ? (
    <Nota texto={describeDbError(error)} tono="aviso" alerta />
  ) : (
    <ErrorNote message={describeDbError(error)} />
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm, gap: space.xs },
  back: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
  titulo: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.md },
  texto: { flex: 1, fontSize: 13.5, lineHeight: 19, color: c.inkMuted },
  origen: { fontSize: 12, lineHeight: 17, color: c.inkMuted },
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

  vacio: { gap: space.md, paddingVertical: space.xl, alignItems: 'flex-start' },
  vacioTitulo: { fontFamily: fonts.semibold, fontSize: 18, color: c.ink },
  vacioBoton: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
    backgroundColor: c.brand,
    marginTop: space.xs,
  },
  vacioBotonTexto: { color: c.ground, fontSize: 15, fontWeight: '600' },
}));
