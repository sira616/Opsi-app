import { useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { CaretRight, Star } from 'phosphor-react-native';

import type { Plan } from '@/api/settings';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

/**
 * La puerta a Opsi Premium ⭐, arriba de los ajustes.
 *
 * Se pinta aunque los ajustes de la cuenta no hayan cargado (`plan` es null): la
 * pantalla de destino lo pregunta por su cuenta, y aquí no hay nada que esperar.
 */
export function SeccionPremium({ plan }: { plan: Plan | null }) {
  const styles = useStyles();
  const c = useTheme();
  const router = useRouter();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Opsi Premium"
      onPress={() => router.push('/premium')}
      style={({ pressed }) => [styles.tarjeta, pressed && styles.pulsado]}
    >
      <View style={styles.icono}>
        <Star size={22} color={c.brandInk} weight="fill" />
      </View>
      <View style={styles.texto}>
        <Text style={styles.titulo}>Opsi Premium ⭐</Text>
        <Text style={styles.subtitulo}>
          {plan === 'premium' ? 'Activo' : 'Colores, lo que más gastas y más listas'}
        </Text>
      </View>
      <CaretRight size={18} color={c.inkMuted} weight="bold" />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  tarjeta: {
    minHeight: touchTarget + 16,
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
  icono: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  texto: { flex: 1, minWidth: 0, gap: 1 },
  titulo: { fontFamily: fonts.semibold, fontSize: 15, color: c.ink },
  subtitulo: { fontSize: 12.5, color: c.inkMuted },
}));
