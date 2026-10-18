import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CalendarBlank, Minus, Plus } from 'phosphor-react-native';

import type { DateKind } from '@/api/inventory';
import {
  acotar,
  diasEntre,
  distancia,
  etiquetaFecha,
  fechaHablada,
  hoyIso,
  sumarDias,
} from '@/shared/lib/calendario';
import { fonts, makeStyles, radius, space, tabular, touchTarget, useTheme } from '@/shared/theme/tokens';

import { Calendario } from './Calendario';
import { Chips, type ChipOption } from './Chips';

// El rojo del chip de caducidad no es decoración: es seguridad frente a calidad,
// y quien elige tiene que verlo.
const KIND_OPTIONS: ChipOption<DateKind>[] = [
  { value: 'best_before', label: 'Consumo preferente' },
  { value: 'expiry', label: 'Caducidad', danger: true },
];

/** Lo que se mantiene el botón antes de que empiece a repetir, y cada cuánto repite después. */
const ESPERA_MS = 420;
const REPETICION_MS = 90;

type Props = {
  /** El día, como «2026-10-24». Siempre hay uno: el campo nace con el de hoy. */
  fecha: string;
  /** Acepta también una función, como el `set` de un `useState`: así el botón mantenido no usa una fecha vieja. */
  onFecha: (valor: string | ((previo: string) => string)) => void;
  kind: DateKind;
  onKind: (kind: DateKind) => void;
};

/**
 * La fecha de caducidad o de consumo preferente, para el alta y para editar.
 *
 * Un solo campo, sin preguntar de dónde sale la fecha: nace con el día de hoy, se toca
 * para elegir otro en un calendario, y un − a la izquierda y un + a la derecha mueven
 * el día de uno en uno (mantenidos, corren). Es como se usa de verdad: o se copia la
 * fecha del envase —que casi siempre está lejos, y el calendario salta a ella— o se
 * cuenta «esto aguanta unos días» —que son unos toques de +—.
 *
 * Quien lo usa decide cuándo enseñarlo (el «Ponerle fecha»): una fecha es opcional y no
 * se inventa. Aquí no hay nada que validar: todo lo que se puede elegir es una fecha
 * real dentro de lo razonable.
 */
export function CampoFecha({ fecha, onFecha, kind, onKind }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const [abierto, setAbierto] = useState(false);

  const repite = useRef<ReturnType<typeof setInterval> | null>(null);

  function parar() {
    if (repite.current) clearInterval(repite.current);
    repite.current = null;
  }

  // Si la pantalla se cierra con el botón pulsado, no se queda un temporizador vivo.
  useEffect(
    () => () => {
      if (repite.current) clearInterval(repite.current);
    },
    [],
  );

  function mover(delta: number) {
    onFecha((previo) => acotar(sumarDias(previo, delta)));
  }

  function mantener(delta: number) {
    parar();
    mover(delta);
    repite.current = setInterval(() => mover(delta), REPETICION_MS);
  }

  const pasado = diasEntre(hoyIso(), fecha) < 0;

  return (
    <View style={styles.campos}>
      <View style={styles.fila}>
        <Paso delta={-1} onPaso={mover} onMantener={mantener} onSoltar={parar} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${fechaHablada(fecha)}. Toca para elegir otro día`}
          onPress={() => setAbierto(true)}
          style={({ pressed }) => [styles.fecha, pressed && styles.pulsado]}
        >
          <View style={styles.fechaTexto}>
            <CalendarBlank size={17} color={c.brandInk} weight="duotone" />
            <Text style={styles.fechaEtiqueta} numberOfLines={1}>
              {etiquetaFecha(fecha)}
            </Text>
          </View>
          <Text style={[styles.distancia, pasado && styles.distanciaPasada]}>{distancia(fecha)}</Text>
        </Pressable>

        <Paso delta={1} onPaso={mover} onMantener={mantener} onSoltar={parar} />
      </View>

      <Chips
        label="De qué tipo"
        options={KIND_OPTIONS}
        value={kind}
        onChange={onKind}
        info={{
          titulo: 'De qué tipo',
          texto: [
            'Caducidad: pasada la fecha no se come. Es seguridad, no calidad.',
            'Consumo preferente: pasada la fecha es cuestión de calidad, no de seguridad. Lo que baja es el sabor.',
          ],
        }}
      />

      {abierto ? (
        <Calendario
          fecha={fecha}
          onClose={() => setAbierto(false)}
          onElegir={(iso) => {
            onFecha(iso);
            setAbierto(false);
          }}
        />
      ) : null}
    </View>
  );
}

/** El − o el +: un toque mueve un día; mantenido, sigue moviéndolos. */
function Paso({
  delta,
  onPaso,
  onMantener,
  onSoltar,
}: {
  delta: 1 | -1;
  onPaso: (delta: number) => void;
  onMantener: (delta: number) => void;
  onSoltar: () => void;
}) {
  const styles = useStyles();
  const c = useTheme();
  const Icono = delta === 1 ? Plus : Minus;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta === 1 ? 'Un día más' : 'Un día menos'}
      // Un toque normal cae en `onPress`, que es también lo que dispara un lector de
      // pantalla; mantenido, `onLongPress` empieza a repetir hasta soltar.
      onPress={() => onPaso(delta)}
      onLongPress={() => onMantener(delta)}
      delayLongPress={ESPERA_MS}
      onPressOut={onSoltar}
      style={({ pressed }) => [styles.paso, pressed && styles.pulsado]}
    >
      <Icono size={22} color={c.brandInk} weight="bold" />
    </Pressable>
  );
}

const PASO = touchTarget + 8;

const useStyles = makeStyles((c) => ({
  campos: { gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  paso: {
    width: PASO,
    height: PASO,
    borderRadius: PASO / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  pulsado: { opacity: 0.7 },

  // El día, grande, entre los dos botones: es lo que se mira y lo que se toca.
  fecha: {
    flex: 1,
    minWidth: 0,
    minHeight: PASO,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm - 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  fechaTexto: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  fechaEtiqueta: { ...tabular, flexShrink: 1, fontFamily: fonts.semibold, fontSize: 16, color: c.ink },
  distancia: { fontSize: 12.5, color: c.inkMuted },
  // Una fecha que ya pasó se dice con el color de la caducidad: es seguridad, no adorno.
  distanciaPasada: { color: c.expiry, fontFamily: fonts.semibold },
}));
