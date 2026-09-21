import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { useSession } from '@/shared/lib/session';
import { makeStyles, useTheme } from '@/shared/theme/tokens';

/**
 * La puerta de entrada: decide adónde va el usuario según tenga sesión o no.
 *
 * Que exista esta pantalla intermedia, en vez de redirigir desde el layout
 * raíz, es a propósito: leer la sesión guardada del disco tarda, y redirigir
 * antes de saber si hay sesión manda a login a alguien que ya estaba dentro y
 * le hace ver un parpadeo. Mientras `loading` es true, aquí no se decide nada.
 */
export default function Index() {
  const styles = useStyles();
  const c = useTheme();
  const { session, loading } = useSession();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  return <Redirect href={session ? '/inventario' : '/entrar'} />;
}

const useStyles = makeStyles((c) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ground },
}));
