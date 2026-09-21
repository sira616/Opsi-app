import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ErrorNote } from '@/components/ErrorNote';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, font, radius, space } from '@/theme/tokens';

type Household = { id: string; name: string };

/**
 * Pantalla de aterrizaje provisional.
 *
 * Todavía no es «Consumir primero» (eso es la fase 1), pero no es un cartel
 * vacío a propósito: lee de verdad de la base de datos, y con eso comprueba de
 * una vez toda la cadena — que la sesión llega, que el trigger creó el hogar
 * al registrarse, y que la RLS deja ver lo tuyo. Si esto pinta un hogar con tu
 * nombre, la fase 0 funciona de punta a punta.
 */
export default function Inventario() {
  const { session, signOut } = useSession();
  const [household, setHousehold] = useState<Household | null>(null);
  const [itemCount, setItemCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Un contador en vez de llamar a una función: cambiarlo vuelve a disparar el
  // efecto, y así todas las escrituras de estado ocurren DESPUÉS de un await.
  // Hacerlas antes provoca renders en cascada, que es justo lo que avisa la
  // regla react-hooks/set-state-in-effect.
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    void (async () => {
      // Sin filtrar por hogar: la RLS ya limita la consulta a lo tuyo. Repetir
      // aquí un .eq('household_id', ...) sería poner la regla en un segundo
      // sitio donde puede quedar desactualizada.
      const { data, error: queryError } = await supabase
        .from('households')
        .select('id, name')
        .limit(1)
        .maybeSingle();

      if (!active) return;
      if (queryError) {
        setError(queryError.message);
        setLoading(false);
        return;
      }
      setHousehold(data);

      const { count, error: countError } = await supabase
        .from('inventory_with_priority')
        .select('id', { count: 'exact', head: true });

      if (!active) return;
      if (countError) {
        setError(countError.message);
      } else {
        setItemCount(count ?? 0);
        setError(null);
      }
      setLoading(false);
    })();

    // Si la pantalla se desmonta a mitad de la consulta, no se escribe estado
    // en un componente que ya no está.
    return () => {
      active = false;
    };
  }, [reloadToken]);

  // Esto sí puede tocar el estado de inmediato: es un manejador de evento, no
  // el cuerpo de un efecto.
  function reload() {
    setError(null);
    setLoading(true);
    setReloadToken((n) => n + 1);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.wordmark}>Opsi</Text>
          <Text style={font.title}>Tu casa</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} />
        ) : (
          <View style={styles.card}>
            <Row label="Sesión" value={session?.user.email ?? '—'} />
            <Row label="Hogar" value={household?.name ?? 'sin hogar (¿falló el trigger?)'} />
            <Row
              label="En el inventario"
              value={itemCount === null ? '—' : `${itemCount} alimentos`}
            />
          </View>
        )}

        <ErrorNote message={error} />

        <View style={styles.note}>
          <Text style={font.bodySmall}>
            «Consumir primero» llega en la fase 1. El backend que la alimenta —las seis
            acciones y la vista de prioridad— ya está listo.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button label="Recargar" onPress={reload} variant="quiet" />
          <Button label="Cerrar sesión" onPress={() => void signOut()} variant="quiet" />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={font.label}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  content: { padding: space.xl, gap: space.xl },
  header: { gap: space.xs },
  wordmark: { fontSize: 21, fontWeight: '600', color: colors.brand },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  row: { gap: 2 },
  rowValue: { fontSize: 15.5, fontWeight: '600', color: colors.ink },
  note: {
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
    padding: space.md,
  },
  actions: { gap: space.sm },
});
