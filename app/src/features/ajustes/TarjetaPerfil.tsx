import { Text, View } from 'react-native';
import { UserCircle } from 'phosphor-react-native';

import { fonts, makeStyles, radius, space, useTheme } from '@/shared/theme/tokens';

/**
 * Quién eres, arriba del todo.
 *
 * Solo el avatar y el nombre. El correo, la contraseña y cerrar sesión se
 * quedan en «Cuenta», que es donde se van a buscar: esta tarjeta no es un
 * menú, es una portada.
 *
 * Las medidas van FIJAS —el avatar, el alto de la línea del nombre— para que
 * el hueco esté hecho antes de que llegue la respuesta del servidor. Con el
 * alto en automático, la tarjeta crece al cargar y empuja media pantalla
 * hacia abajo justo cuando alguien iba a tocar un interruptor.
 */
export function TarjetaPerfil({
  username,
  cargando,
}: {
  username: string | null;
  cargando: boolean;
}) {
  const styles = useStyles();
  const c = useTheme();

  // La inicial hace de avatar. Es lo más parecido a una foto que tenemos sin
  // pedir una foto, y con dos usuarios en la misma casa ya distingue.
  const inicial = username?.trim().charAt(0).toUpperCase() ?? '';

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={username ? `Tu perfil, ${username}` : 'Tu perfil'}
      style={styles.perfil}
    >
      <View style={styles.perfilAvatar}>
        {inicial ? (
          <Text style={styles.perfilInicial}>{inicial}</Text>
        ) : (
          <UserCircle size={32} color={c.brandInk} weight="duotone" />
        )}
      </View>
      <View style={styles.perfilTexto}>
        {username ? (
          <Text style={styles.perfilNombre} numberOfLines={1}>
            {username}
          </Text>
        ) : cargando ? (
          <View style={styles.perfilHueco} />
        ) : (
          <Text style={styles.perfilAusente}>Sin nombre todavía</Text>
        )}
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  perfil: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  perfilAvatar: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
    borderWidth: 1.5,
    borderColor: c.brand,
  },
  perfilInicial: { fontFamily: fonts.display, fontSize: 26, lineHeight: 32, color: c.brandInk },
  // La altura mínima es la de la línea del nombre: así el sitio está
  // reservado tanto si llega el nombre como si no.
  perfilTexto: { flex: 1, minWidth: 0, minHeight: 30, justifyContent: 'center' },
  perfilNombre: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: c.ink },
  perfilAusente: { fontSize: 14.5, color: c.inkFaint },
  perfilHueco: { width: 132, height: 18, borderRadius: radius.sm, backgroundColor: c.surfaceAlt },
}));
