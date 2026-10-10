import { Pressable, Text, View } from 'react-native';
import { CircleHalf, Moon, Sun } from 'phosphor-react-native';

import { fonts, makeStyles, radius, space, touchTarget, useAspecto, useTheme, useType, type Aspecto } from '@/shared/theme/tokens';
import { Section } from './ui';

const ASPECTOS: { valor: Aspecto; etiqueta: string }[] = [
  { valor: 'system', etiqueta: 'Automático' },
  { valor: 'light', etiqueta: 'Claro' },
  { valor: 'dark', etiqueta: 'Oscuro' },
];

/**
 * Claro, oscuro o lo que diga el teléfono.
 *
 * No toca el servidor: la preferencia se guarda en el dispositivo (ver
 * `theme/tokens.tsx`), y por eso esta sección se pinta aunque los ajustes de
 * la cuenta no hayan cargado. Es también el ejemplo que usa «Privacidad y
 * datos» para explicar qué no sale de aquí.
 */
export function SeccionAspecto() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const { aspecto, setAspecto } = useAspecto();

  return (
    <Section title="Aspecto">
      <View style={styles.aspectos}>
        {ASPECTOS.map(({ valor, etiqueta }) => {
          const activo = aspecto === valor;
          return (
            <Pressable
              key={valor}
              accessibilityRole="radio"
              accessibilityState={{ selected: activo }}
              accessibilityLabel={etiqueta}
              onPress={() => setAspecto(valor)}
              style={[styles.aspecto, activo && styles.aspectoOn]}
            >
              <IconoAspecto valor={valor} color={activo ? c.brand : c.inkMuted} />
              <Text style={[styles.aspectoText, activo && styles.aspectoTextOn]}>{etiqueta}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={t.caption}>
        {aspecto === 'system'
          ? 'Sigue el ajuste de tu teléfono.'
          : 'Fijo, aunque tu teléfono cambie.'}
      </Text>
    </Section>
  );
}

function IconoAspecto({ valor, color }: { valor: Aspecto; color: string }) {
  const peso = 'duotone' as const;
  if (valor === 'light') return <Sun size={19} color={color} weight={peso} />;
  if (valor === 'dark') return <Moon size={19} color={color} weight={peso} />;
  // «Automático» no tiene icono propio: un círculo mitad claro mitad oscuro
  // dice «depende» mejor que un engranaje, que ya significa «ajustes».
  return <CircleHalf size={19} color={color} weight="fill" />;
}

const useStyles = makeStyles((c) => ({
  aspectos: { flexDirection: 'row', gap: space.sm },
  aspecto: {
    flex: 1,
    minHeight: touchTarget + 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  aspectoOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  aspectoText: { fontFamily: fonts.semibold, fontSize: 12.5, color: c.inkMuted },
  aspectoTextOn: { color: c.brandInk },
}));
