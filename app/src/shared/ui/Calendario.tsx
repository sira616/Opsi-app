import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CaretLeft, CaretRight } from 'phosphor-react-native';

import {
  fechaHablada,
  hoyIso,
  limites,
  mesDesplazado,
  nombreDelMes,
  partes,
  semanasDelMes,
} from '@/shared/lib/calendario';
import { fonts, makeStyles, radius, space, tabular, touchTarget, useTheme } from '@/shared/theme/tokens';

import { Button } from './Button';
import { HojaInferior } from './HojaInferior';

const SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

type Props = {
  /** El día que está elegido ahora. */
  fecha: string;
  onElegir: (iso: string) => void;
  onClose: () => void;
};

/**
 * Un calendario para elegir un día, en una hoja que sube desde abajo.
 *
 * Es propio y no el del sistema a propósito: se ve igual en iOS, en Android y en el
 * navegador (donde el del sistema no existe para React Native), sigue el color de la
 * app, y se puede probar en el navegador donde se desarrolla. El día se elige de un
 * toque y la hoja se cierra sola.
 *
 * Se monta solo mientras está abierta, así que el mes que enseña empieza SIEMPRE en el
 * del día elegido. Los días fuera de lo que cabe (de hace un año a dentro de cinco) se
 * ven apagados y no se tocan.
 */
export function Calendario({ fecha, onElegir, onClose }: Props) {
  const styles = useStyles();
  const c = useTheme();

  const hoy = hoyIso();
  const { min, max } = limites(hoy);
  const elegida = partes(fecha);
  const [mes, setMes] = useState({ y: elegida.y, m: elegida.m });

  const semanas = semanasDelMes(mes.y, mes.m);
  const anterior = mesDesplazado(mes.y, mes.m, -1);
  const siguiente = mesDesplazado(mes.y, mes.m, 1);

  return (
    <HojaInferior visible onClose={onClose} titulo="Elegir el día">
      <View style={styles.cabecera}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          onPress={() => setMes(anterior)}
          style={({ pressed }) => [styles.mes, pressed && styles.pulsado]}
        >
          <CaretLeft size={20} color={c.ink} weight="bold" />
        </Pressable>
        <Text style={styles.titulo} accessibilityRole="header">
          {nombreDelMes(mes.m).charAt(0).toUpperCase()}{nombreDelMes(mes.m).slice(1)} de {mes.y}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          onPress={() => setMes(siguiente)}
          style={({ pressed }) => [styles.mes, pressed && styles.pulsado]}
        >
          <CaretRight size={20} color={c.ink} weight="bold" />
        </Pressable>
      </View>

      <View style={styles.fila}>
        {SEMANA.map((dia) => (
          <Text key={dia} style={styles.diaSemana} accessibilityElementsHidden importantForAccessibility="no">
            {dia}
          </Text>
        ))}
      </View>

      {semanas.map((fila, i) => (
        <View key={i} style={styles.fila}>
          {fila.map((iso, j) => {
            if (iso === null) return <View key={j} style={styles.celda} />;
            const fuera = iso < min || iso > max;
            const on = iso === fecha;
            const esHoy = iso === hoy;
            return (
              <Pressable
                key={j}
                accessibilityRole="button"
                accessibilityLabel={`${fechaHablada(iso)}${esHoy ? ', hoy' : ''}`}
                accessibilityState={{ selected: on, disabled: fuera }}
                disabled={fuera}
                onPress={() => onElegir(iso)}
                style={[styles.celda, esHoy && !on && styles.celdaHoy, on && styles.celdaOn, fuera && styles.celdaFuera]}
              >
                <Text style={[styles.numero, on && styles.numeroOn]}>{partes(iso).d}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}

      <Button label="Hoy" variant="quiet" onPress={() => onElegir(hoy)} />
    </HojaInferior>
  );
}

const useStyles = makeStyles((c) => ({
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mes: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center' },
  pulsado: { opacity: 0.6 },
  titulo: { fontFamily: fonts.semibold, fontSize: 16, color: c.ink },

  fila: { flexDirection: 'row' },
  diaSemana: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.semibold,
    fontSize: 12,
    color: c.inkMuted,
    paddingBottom: space.xs,
  },
  celda: {
    flex: 1,
    height: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    margin: 1,
  },
  celdaHoy: { borderWidth: 1.5, borderColor: c.brand },
  celdaOn: { backgroundColor: c.brand },
  celdaFuera: { opacity: 0.3 },
  numero: { ...tabular, fontFamily: fonts.medium, fontSize: 15, color: c.ink },
  numeroOn: { fontFamily: fonts.bold, color: c.onBrand },
}));
