import { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { fonts, makeStyles, radius, tabular } from '@/shared/theme/tokens';

const ALTO = 44;
const VISIBLES = 5;
/** Lo que tarda en darse por parada una rueda que ya no se mueve. */
const REPOSO_MS = 140;

type Props = {
  hora: number;
  minuto: number;
  onCambio: (hora: number, minuto: number) => void;
};

/**
 * Un reloj de ruedas, como el de iOS: horas y minutos que se arrastran y se
 * quedan clavados bajo un marco.
 *
 * Antes la hora del aviso eran 24 cuadros en una fila que se desplazaba: había
 * que buscar el número, no había minutos y ocupaba una línea entera para elegir
 * una sola cosa. Las ruedas hacen lo que la gente ya sabe hacer con un reloj.
 *
 * Está hecho con `ScrollView` y no con el selector nativo (`@react-native-community/
 * datetimepicker`) por una razón práctica: ese solo existe en el móvil, y la app se
 * mira también en el navegador. Esto se ve igual y se maneja igual en los tres
 * sitios, y no añade ningún módulo nativo.
 *
 * Accesibilidad: un lector de pantalla no arrastra ruedas. Cada una se anuncia como
 * ajustable (subir y bajar de uno en uno), que es lo que hace el selector de iOS.
 */
export function SelectorHora({ hora, minuto, onCambio }: Props) {
  const styles = useStyles();

  return (
    <View style={styles.reloj}>
      {/* El marco de la selección, detrás de las dos ruedas. */}
      <View style={styles.marco} />
      <Rueda
        etiqueta="Horas"
        valores={HORAS}
        seleccionado={hora}
        onSeleccionar={(h) => onCambio(h, minuto)}
      />
      <Text style={styles.dosPuntos}>:</Text>
      <Rueda
        etiqueta="Minutos"
        valores={MINUTOS}
        seleccionado={minuto}
        onSeleccionar={(m) => onCambio(hora, m)}
      />
    </View>
  );
}

const dosCifras = (n: number) => `${n}`.padStart(2, '0');
const HORAS = Array.from({ length: 24 }, (_, i) => dosCifras(i));
const MINUTOS = Array.from({ length: 60 }, (_, i) => dosCifras(i));

function Rueda({
  etiqueta,
  valores,
  seleccionado,
  onSeleccionar,
}: {
  etiqueta: string;
  valores: string[];
  seleccionado: number;
  onSeleccionar: (indice: number) => void;
}) {
  const styles = useStyles();
  const ref = useRef<ScrollView>(null);
  const reposo = useRef<ReturnType<typeof setTimeout> | null>(null);
  // El número que está bajo el marco AHORA, mientras se arrastra. Es lo que pinta
  // grande; lo que se guarda (`seleccionado`) solo cambia cuando la rueda se para.
  const [bajoElMarco, setBajoElMarco] = useState(seleccionado);

  useEffect(
    () => () => {
      if (reposo.current) clearTimeout(reposo.current);
    },
    [],
  );

  const limitar = (i: number) => Math.max(0, Math.min(valores.length - 1, i));

  function irA(indice: number, animado = true) {
    ref.current?.scrollTo({ y: indice * ALTO, animated: animado });
  }

  function alDesplazar(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const indice = limitar(Math.round(e.nativeEvent.contentOffset.y / ALTO));
    setBajoElMarco(indice);
    // Se da por elegido cuando deja de moverse. Hace falta un temporizador y no
    // solo `onMomentumScrollEnd`: en el navegador una rueda de ratón no lo dispara,
    // y sin esto quedaría la rueda parada entre dos números.
    if (reposo.current) clearTimeout(reposo.current);
    reposo.current = setTimeout(() => {
      onSeleccionar(indice);
      irA(indice);
    }, REPOSO_MS);
  }

  function mover(delta: number) {
    const indice = limitar(bajoElMarco + delta);
    setBajoElMarco(indice);
    onSeleccionar(indice);
    irA(indice);
  }

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={etiqueta}
      accessibilityValue={{ text: valores[bajoElMarco] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => mover(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={styles.rueda}
    >
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ALTO}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={alDesplazar}
        contentOffset={{ x: 0, y: seleccionado * ALTO }}
        // En Android `contentOffset` no siempre se respeta al montar: se recoloca
        // cuando ya hay medidas.
        onLayout={() => irA(seleccionado, false)}
        contentContainerStyle={{ paddingVertical: ALTO * Math.floor(VISIBLES / 2) }}
      >
        {valores.map((valor, i) => {
          const distancia = Math.abs(i - bajoElMarco);
          return (
            <Pressable
              key={valor}
              accessible={false}
              onPress={() => {
                setBajoElMarco(i);
                onSeleccionar(i);
                irA(i);
              }}
              style={styles.item}
            >
              <Text
                style={[
                  styles.valor,
                  distancia === 0 && styles.valorActual,
                  { opacity: distancia === 0 ? 1 : distancia === 1 ? 0.5 : distancia === 2 ? 0.25 : 0.12 },
                ]}
              >
                {valor}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  reloj: {
    height: ALTO * VISIBLES,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  marco: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ALTO * Math.floor(VISIBLES / 2),
    height: ALTO,
    borderRadius: radius.md,
    backgroundColor: c.surfaceAlt,
    // No recibe toques: deja pasar los de las ruedas que tiene encima.
    pointerEvents: 'none',
  },
  rueda: { width: 84, height: ALTO * VISIBLES },
  item: { height: ALTO, alignItems: 'center', justifyContent: 'center' },
  valor: { ...tabular, fontFamily: fonts.medium, fontSize: 22, color: c.ink },
  valorActual: { fontFamily: fonts.semibold, fontSize: 26 },
  dosPuntos: { fontFamily: fonts.semibold, fontSize: 26, color: c.ink, paddingBottom: 3 },
}));
