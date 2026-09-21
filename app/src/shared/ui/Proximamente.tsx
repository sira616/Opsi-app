import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { ReactNode } from 'react';
import { fonts,makeStyles, radius, space, useType } from '@/shared/theme/tokens';

type Props = {
  icon: ReactNode;
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
  const styles = useStyles();
  const t = useType();
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.iconBox}>{icon}</View>
        <Text style={t.title}>{title}</Text>
        <Text style={styles.phase}>{phase}</Text>
        <Text style={styles.what}>{what}</Text>
        {ready ? (
          <View style={styles.readyBox}>
            <Text style={styles.readyText}>{ready}</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  content: { flex: 1, padding: space.xl, gap: space.md, justifyContent: 'center', alignItems: 'flex-start' },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: c.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.xs,
  },
  phase: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkFaint,
  },
  what: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.inkMuted },
  readyBox: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: c.brandSoft,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
  },
  readyText: { flex: 1, fontSize: 13, lineHeight: 19, color: c.brandInk },
}));
