import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChartPie, ChartPieSlice, CircleHalf, type IconProps } from 'phosphor-react-native';

import { formatQuantity, toBase, type MeasurementUnit } from '@/shared/lib/units';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { TextField } from '@/shared/ui/TextField';
import { fonts, makeStyles, radius, space, tabular, useTheme } from '@/shared/theme/tokens';

/**
 * Las fracciones de «usar cantidad».
 *
 * Son de lo QUE QUEDA, no de lo inicial: «me he bebido la mitad» dicho sobre
 * un brick por la mitad significa la mitad de lo que había, no la mitad del
 * litro original.
 *
 * No hay un botón de «todo»: llegar a cero cierra el elemento, y para eso está
 * «Terminar», que pregunta antes. Una fracción nunca llega a cero, así que
 * ninguna de estas tres puede cerrar nada por accidente.
 */
const FRACCIONES: { glifo: string; valor: number; icono: (p: IconProps) => React.ReactElement }[] = [
  { glifo: '½', valor: 1 / 2, icono: (p) => <CircleHalf {...p} /> },
  { glifo: '⅓', valor: 1 / 3, icono: (p) => <ChartPieSlice {...p} /> },
  { glifo: '¼', valor: 1 / 4, icono: (p) => <ChartPie {...p} /> },
];

/**
 * Lo que descuenta una fracción, en unidad base.
 *
 * Se redondea a dos decimales y NO se ajusta al resto exacto. Cuadrar el
 * último tercio con lo que queda parece amable hasta que se ve lo que
 * implica: llegar a cero cierra el elemento, así que un toque en «⅓» lo daría
 * por terminado sin preguntar. Mejor que sobre un poco.
 */
function cantidadFraccion(restante: number, fraccion: number): number {
  return Math.round(restante * fraccion * 100) / 100;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  restante: number;
  unidad: MeasurementUnit;
  ocupado: boolean;
  /** El error de la última acción, para verlo AQUÍ y no tapado por la hoja. */
  error: string | null;
  /** Lo que se gasta, en unidad base. La pantalla decide si es válido. */
  onUsar: (cantidadBase: number) => void;
  /** Para avisar de un valor mal escrito sin llamar al servidor. */
  onAviso: (mensaje: string) => void;
};

/**
 * Lo que sube al tocar «Usar»: las fracciones y una cantidad exacta.
 *
 * Antes estaban siempre a la vista, y con ellas un bloque entero que ocupaba más
 * que la propia cantidad que queda. Ahora la pantalla tiene un solo botón y esto
 * aparece solo cuando se va a usar algo.
 */
export function HojaUsar({ visible, onClose, restante, unidad, ocupado, error, onUsar, onAviso }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const [cantidad, setCantidad] = useState('');

  function descontar() {
    const valor = Number(cantidad.replace(',', '.'));
    if (!Number.isFinite(valor) || valor <= 0) {
      onAviso('Pon una cantidad mayor que cero.');
      return;
    }
    const base = toBase(valor, unidad);
    if (base > restante) {
      onAviso(`Solo quedan ${formatQuantity(restante, unidad)}.`);
      return;
    }
    onUsar(base);
  }

  return (
    <HojaInferior visible={visible} onClose={onClose} titulo={`Usar · quedan ${formatQuantity(restante, unidad)}`}>
      <View style={styles.fracciones}>
        {FRACCIONES.map(({ glifo, valor, icono }) => {
          const base = cantidadFraccion(restante, valor);
          const vacio = base <= 0;
          const apagada = vacio || ocupado;
          return (
            <Pressable
              key={glifo}
              accessibilityRole="button"
              accessibilityLabel={`Usar ${glifo}, ${formatQuantity(base, unidad)}`}
              accessibilityState={{ disabled: apagada }}
              disabled={apagada}
              onPress={() => onUsar(base)}
              style={({ pressed }) => [styles.fraccion, pressed && styles.pulsada, apagada && styles.apagada]}
            >
              {icono({ size: 20, color: c.brand, weight: 'duotone' })}
              <Text style={styles.glifo}>{glifo}</Text>
              <Text style={styles.cantidad} numberOfLines={1}>
                {formatQuantity(base, unidad)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TextField
        label={`Otra cantidad, en ${unidad === 'unit' ? 'unidades' : unidad}`}
        value={cantidad}
        onChangeText={setCantidad}
        keyboardType="decimal-pad"
        inputMode="decimal"
        returnKeyType="done"
        onSubmitEditing={descontar}
      />
      <ErrorNote message={error} />
      <Button
        label="Descontar"
        onPress={descontar}
        loading={ocupado}
        disabled={cantidad.trim() === ''}
      />
    </HojaInferior>
  );
}

const useStyles = makeStyles((c) => ({
  fracciones: { flexDirection: 'row', gap: space.sm },
  fraccion: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: space.lg,
    borderRadius: radius.lg,
    backgroundColor: c.brandSoft,
  },
  apagada: { opacity: 0.4 },
  pulsada: { opacity: 0.75 },
  glifo: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 34, color: c.brandInk },
  cantidad: { ...tabular, fontSize: 12, color: c.brandInk },
}));
