import { Feather } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, font, radius, space } from '@/shared/theme/tokens';

type Props = {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  phase: string;
  what: string;
  /** Lo que YA está hecho por debajo. No es relleno: lo hay de verdad. */
  ready?: string;
};

/**
 * Pantalla de una sección que todavía no existe.
 *
 * Dice qué hará y en qué fase, en vez de un «próximamente» vacío. Y cuando el
 * backend ya está listo, lo dice: en este proyecto varias piezas llevan hechas
 * y probadas desde hace fases, y no se ven por ningún sitio.
 */
export function Proximamente({ icon, title, phase, what, ready }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.iconBox}>
          <Feather name={icon} size={26} color={colors.inkFaint} />
        </View>
        <Text style={font.title}>{title}</Text>
        <Text style={styles.phase}>{phase}</Text>
        <Text style={styles.what}>{what}</Text>
        {ready ? (
          <View style={styles.readyBox}>
            <Feather name="check" size={15} color={colors.brand} />
            <Text style={styles.readyText}>{ready}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  content: { flex: 1, padding: space.xl, gap: space.md, justifyContent: 'center', alignItems: 'flex-start' },
  iconBox: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  phase: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: colors.inkFaint,
  },
  what: { ...font.body, lineHeight: 22, color: colors.inkMuted },
  readyBox: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.brandSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
  },
  readyText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#245540' },
});
