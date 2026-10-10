import { useRouter } from 'expo-router';
import { CaretDown } from 'phosphor-react-native';
import { Pressable, Text } from 'react-native';

import { IconoNevera } from '@/shared/lib/iconos-nevera';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';
import { useNeveraActual } from './NeveraActiva';

/**
 * La nevera activa, en una píldora: icono, nombre y una flecha que dice «esto
 * se despliega». Al tocarla se abre el selector.
 *
 * Es lo primero que se ve en el inventario porque es lo que da sentido a todo
 * lo de debajo: una lista de alimentos sin decir DE QUÉ nevera son se lee como
 * si fueran los de siempre, y ahora ya no hay «los de siempre».
 *
 * Con una sola nevera —lo normal hoy— sigue siendo un botón que abre el
 * selector, porque es también por donde se crea la primera compartida. Un
 * nombre suelto sin flecha parecería una etiqueta y nadie pensaría en tocarlo.
 *
 * El nombre se corta con puntos suspensivos: puede tener hasta 80 caracteres y
 * la píldora comparte fila con el logo y con el botón de añadir.
 */
export function PildoraNevera() {
  const styles = useStyles();
  const c = useTheme();
  const router = useRouter();
  const { activa } = useNeveraActual();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Nevera activa: ${activa.name}. Abrir selector`}
      onPress={() => router.push('/cambiar-nevera')}
      style={({ pressed }) => [styles.pildora, pressed && styles.pressed]}
    >
      <IconoNevera icono={activa.icon} size={18} color={c.brand} />
      <Text style={styles.nombre} numberOfLines={1}>
        {activa.name}
      </Text>
      <CaretDown size={14} color={c.inkMuted} weight="bold" />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  pildora: {
    // Tope al ancho del hueco que le da el inventario, y no un ancho fijo: el
    // nombre largo cede ante el logo y el «+» en lugar de empujarlos fuera de
    // la pantalla.
    maxWidth: '100%',
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  nombre: { flexShrink: 1, fontFamily: fonts.semibold, fontSize: 14.5, color: c.ink },
  pressed: { opacity: 0.7 },
}));
