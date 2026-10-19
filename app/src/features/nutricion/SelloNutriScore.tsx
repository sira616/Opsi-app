import { Text, View } from 'react-native';

import {
  GRADOS_NUTRISCORE,
  etiquetaNutriScore,
  type GradoNutriScore,
} from '@/shared/lib/nutricion';
import { fonts, makeStyles, radius, type Palette, useTheme } from '@/shared/theme/tokens';

/**
 * El Nutri-Score tal y como lo conoce quien lo ha visto en un envase: cinco fichas de la A a
 * la E en fila. La que toca va más grande, con su color y un borde grueso; las otras cuatro
 * quedan apagadas, en neutro.
 *
 * Tres reglas que no se tocan (docs/DISENO.md, «Nutri-Score y NOVA»):
 *
 *   · **La letra se ve siempre.** El color solo ayuda: nadie tiene que distinguir un verde de
 *     un naranja para saber que es una C. Por eso las apagadas también llevan su letra.
 *   · **Un sello, una frase.** Para el lector de pantalla todo el sello es UN elemento con su
 *     etiqueta («Nutri-Score C, calculado por Open Food Facts») y sus fichas quedan ocultas:
 *     oír «A, B, C, D, E» no dice cuál es la buena.
 *   · **El color es de la escala.** Sus tokens (`nutriA`…`nutriE`) no se usan en ningún otro
 *     sitio, y la E es un naranja a propósito, lejos del rojo de la caducidad.
 */

function coloresDe(c: Palette, grado: GradoNutriScore): { fondo: string; tinta: string } {
  switch (grado) {
    case 'a':
      return { fondo: c.nutriA, tinta: c.nutriAInk };
    case 'b':
      return { fondo: c.nutriB, tinta: c.nutriBInk };
    case 'c':
      return { fondo: c.nutriC, tinta: c.nutriCInk };
    case 'd':
      return { fondo: c.nutriD, tinta: c.nutriDInk };
    case 'e':
      return { fondo: c.nutriE, tinta: c.nutriEInk };
  }
}

/** Las cinco fichas, con la del `grado` resaltada. Para el detalle. */
export function EscalaNutriScore({ grado }: { grado: GradoNutriScore }) {
  const styles = useStyles();
  const c = useTheme();

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={etiquetaNutriScore(grado)}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.escala}
      >
        {GRADOS_NUTRISCORE.map((g) => {
          const letra = g.toUpperCase();
          if (g !== grado) {
            return (
              <View key={g} style={styles.apagada}>
                <Text maxFontSizeMultiplier={1.2} style={styles.letraApagada}>
                  {letra}
                </Text>
              </View>
            );
          }
          const { fondo, tinta } = coloresDe(c, g);
          return (
            <View key={g} style={[styles.activa, { backgroundColor: fondo }]}>
              <Text maxFontSizeMultiplier={1.2} style={[styles.letraActiva, { color: tinta }]}>
                {letra}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Una sola ficha pequeña, la del grado. Para una fila de la lista. */
export function FichaNutriScore({ grado }: { grado: GradoNutriScore }) {
  const styles = useStyles();
  const c = useTheme();
  const { fondo, tinta } = coloresDe(c, grado);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={etiquetaNutriScore(grado)}
      style={[styles.ficha, { backgroundColor: fondo }]}
    >
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        maxFontSizeMultiplier={1.2}
        style={[styles.letraFicha, { color: tinta }]}
      >
        {grado.toUpperCase()}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  escala: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // La activa: más grande y con borde grueso. El borde es lo que le da la forma contra el
  // fondo (un amarillo o un lima sobre blanco no llegan a 3:1 por sí solos).
  activa: {
    width: 54,
    height: 66,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: c.nutriBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letraActiva: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38 },
  apagada: {
    width: 38,
    height: 46,
    borderRadius: radius.md - 2,
    backgroundColor: c.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letraApagada: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: c.inkMuted },
  ficha: {
    width: 34,
    height: 34,
    borderRadius: radius.md - 2,
    borderWidth: 2,
    borderColor: c.nutriBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letraFicha: { fontFamily: fonts.display, fontSize: 17, lineHeight: 21 },
}));
