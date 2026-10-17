import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Minus, Plus } from 'phosphor-react-native';

import type { DateKind, DateSource } from '@/api/inventory';
import {
  ATAJOS,
  DIAS_MAX,
  deIso,
  diasHasta,
  enDias,
  fechaLegible,
  formatearMientrasEscribe,
  problemaDias,
  problemaFecha,
} from '@/shared/lib/fecha-input';
import {
  fonts,
  makeStyles,
  radius,
  space,
  tabular,
  touchTarget,
  useTheme,
} from '@/shared/theme/tokens';

import { Chips, type ChipOption } from './Chips';
import { TextField } from './TextField';

// El rojo del chip de caducidad no es decoración: es seguridad frente a calidad,
// y quien elige tiene que verlo.
const KIND_OPTIONS: ChipOption<DateKind>[] = [
  { value: 'best_before', label: 'Consumo preferente' },
  { value: 'expiry', label: 'Caducidad', danger: true },
];

/**
 * De dónde sale la fecha, y con ello QUÉ SE PREGUNTA.
 *
 * Son dos y se nombran por lo único que las distingue: si la fecha viene impresa o
 * no. Con «lo pone el envase» se copia la fecha impresa; con «la calculo yo» se
 * piden DÍAS, que es lo que una persona sabe de verdad de sus sobras —«esto aguanta
 * una semana»— y no un día concreto del calendario. Los días los pone una persona,
 * así que lo que se guarda es `user`; `estimate` es «calculada por la app» y no la
 * pone ningún formulario.
 */
const SOURCE_OPTIONS: ChipOption<DateSource>[] = [
  { value: 'package', label: 'Lo pone el envase' },
  { value: 'user', label: 'La calculo yo' },
];

/**
 * La unidad del plazo. Casi todo lo que se guarda dura días o semanas, así que se
 * cuenta en DÍAS y es lo que sale por omisión; meses y años están a un toque para lo
 * poco que dura más (una conserva, un congelado). Se cuenta en el calendario —«2 meses»
 * es el mismo día dos meses después, no 60 días—.
 */
type Unidad = 'dias' | 'meses' | 'anios';

const UNIDADES: ChipOption<Unidad>[] = [
  { value: 'dias', label: 'Días' },
  { value: 'meses', label: 'Meses' },
  { value: 'anios', label: 'Años' },
];

const MAXIMO: Record<Unidad, number> = { dias: DIAS_MAX, meses: 60, anios: 5 };

function nombreDeUnidad(unidad: Unidad, n: number): string {
  if (unidad === 'dias') return n === 1 ? 'día' : 'días';
  if (unidad === 'meses') return n === 1 ? 'mes' : 'meses';
  return n === 1 ? 'año' : 'años';
}

type Props = {
  source: DateSource;
  onSource: (source: DateSource) => void;
  dateText: string;
  onDateText: (texto: string) => void;
  /** El plazo en DÍAS, siempre: es lo que valida y guarda quien usa este campo. */
  diasText: string;
  onDiasText: (texto: string) => void;
  kind: DateKind;
  onKind: (kind: DateKind) => void;
  /**
   * La fecha que el elemento ya tiene (ISO), cuando se está editando. En «la calculo
   * yo» se enseña mientras no se hayan tecleado días: tocar «La calculo yo» no debe
   * parecer que se ha borrado la fecha que había.
   */
  actual?: string | null;
};

/**
 * Los campos de una fecha de caducidad o de consumo preferente, para el alta y para
 * editar. Los dos tienen que preguntar lo mismo y con los mismos atajos; antes eran
 * dos copias y una de ellas olvidó los atajos.
 *
 * En «la calculo yo» el plazo se pone con un − y un + a los lados (un toque por día),
 * con los atajos arriba para lo corriente y con la unidad (días, meses o años) a mano.
 * Sea cual sea la unidad, hacia fuera sale SIEMPRE un número de días (`onDiasText`):
 * así quien lo usa no se entera de que existen los meses.
 *
 * Quien lo usa decide cuándo enseñarlo (el «Ponerle fecha») y valida al guardar con
 * `problemaFecha` / `problemaDias`: aquí solo se pregunta y se avisa.
 */
export function CampoFecha({
  source,
  onSource,
  dateText,
  onDateText,
  diasText,
  onDiasText,
  kind,
  onKind,
  actual = null,
}: Props) {
  const styles = useStyles();
  const c = useTheme();

  // En meses o años, cuántos son. En días no hace falta: es el propio `diasText`.
  const [unidad, setUnidad] = useState<Unidad>('dias');
  const [cuenta, setCuenta] = useState(0);

  const porDias = source === 'user';
  const avisoFecha = problemaFecha(dateText);
  const sinTocar = porDias && diasText === '' && actual !== null;
  const avisoDias = sinTocar ? null : problemaDias(diasText);
  const fechaCalculada =
    porDias && avisoDias === null && diasText !== ''
      ? fechaLegible(enDias(Number(diasText)))
      : null;
  const fechaActual = sinTocar ? fechaLegible(deIso(actual)) : null;

  const valor = unidad === 'dias' ? Number(diasText || 0) : cuenta;

  /** Pone el plazo en la unidad dada, dentro de sus límites, y avisa en días. */
  function poner(n: number, en: Unidad = unidad) {
    const limpio = Math.min(MAXIMO[en], Math.max(1, Math.round(n)));
    if (en === 'dias') {
      onDiasText(String(limpio));
      return;
    }
    setCuenta(limpio);
    onDiasText(String(Math.min(DIAS_MAX, diasHasta(en, limpio))));
  }

  function cambiarUnidad(nueva: Unidad) {
    if (nueva === unidad) return;
    setUnidad(nueva);
    // A meses o años se empieza en 1; a días se queda el total que ya había.
    if (nueva !== 'dias') poner(1, nueva);
  }

  function escribir(texto: string) {
    const digitos = texto.replace(/\D/g, '').slice(0, 4);
    if (digitos === '') {
      setCuenta(0);
      onDiasText('');
      return;
    }
    if (unidad === 'dias') onDiasText(digitos);
    else poner(Number(digitos));
  }

  return (
    <View style={styles.campos}>
      {/* El origen va PRIMERO porque manda sobre el resto del bloque: decide si se
          copia una fecha o se cuentan días. */}
      <Chips label="De dónde sale" options={SOURCE_OPTIONS} value={source} onChange={onSource} />

      {porDias ? (
        <View style={styles.dias}>
          {/* Los atajos van ANTES del contador a propósito: cubren la mayoría de los
              casos de un toque, y quien los use no llega a tocar el + ni el −. */}
          <View style={styles.atajos}>
            {ATAJOS.map(([etiqueta, dias]) => {
              const on = unidad === 'dias' && diasText === `${dias}`;
              return (
                <Pressable
                  key={etiqueta}
                  accessibilityRole="button"
                  accessibilityLabel={`Ponerle ${etiqueta}`}
                  onPress={() => {
                    setUnidad('dias');
                    onDiasText(`${dias}`);
                  }}
                  style={[styles.atajo, on && styles.atajoOn]}
                >
                  <Text style={styles.atajoText}>{etiqueta}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.etiqueta}>¿Cuánto le das de vida?</Text>

          {/* El − a la izquierda y el + a la derecha, grandes: se toca sin mirar. */}
          <View style={styles.contador}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Un ${nombreDeUnidad(unidad, 1)} menos`}
              accessibilityState={{ disabled: valor <= 1 }}
              disabled={valor <= 1}
              onPress={() => poner(valor - 1)}
              style={({ pressed }) => [
                styles.paso,
                valor <= 1 && styles.pasoApagado,
                pressed && styles.pulsado,
              ]}
            >
              <Minus size={22} color={c.brandInk} weight="bold" />
            </Pressable>

            <View style={styles.cifra}>
              <TextInput
                accessibilityLabel={`Plazo en ${nombreDeUnidad(unidad, 2)}`}
                value={valor > 0 ? String(valor) : ''}
                onChangeText={escribir}
                placeholder="—"
                placeholderTextColor={c.inkFaint}
                keyboardType="number-pad"
                inputMode="numeric"
                maxLength={4}
                selectTextOnFocus
                style={styles.cifraInput}
              />
              <Text style={styles.cifraUnidad}>{nombreDeUnidad(unidad, valor)}</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Un ${nombreDeUnidad(unidad, 1)} más`}
              accessibilityState={{ disabled: valor >= MAXIMO[unidad] }}
              disabled={valor >= MAXIMO[unidad]}
              onPress={() => poner(valor + 1)}
              style={({ pressed }) => [
                styles.paso,
                valor >= MAXIMO[unidad] && styles.pasoApagado,
                pressed && styles.pulsado,
              ]}
            >
              <Plus size={22} color={c.brandInk} weight="bold" />
            </Pressable>
          </View>

          <Chips options={UNIDADES} value={unidad} onChange={cambiarUnidad} />

          {avisoDias ? <Text style={styles.aviso}>{avisoDias}</Text> : null}

          {/* La cuenta, ya hecha y a la vista. Un número de días se teclea en un
              segundo y se equivoca con un cero de más: ver el día que sale es lo que
              lo caza antes de guardar. */}
          {fechaCalculada ? <Text style={styles.calculo}>Se guardará el {fechaCalculada}.</Text> : null}
          {fechaActual ? <Text style={styles.actual}>Ahora: {fechaActual}.</Text> : null}
        </View>
      ) : (
        <TextField
          label="La fecha del envase"
          hint={avisoFecha ?? undefined}
          value={dateText}
          onChangeText={(texto) => onDateText(formatearMientrasEscribe(texto))}
          placeholder="31/12/2026"
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={10}
        />
      )}

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
    </View>
  );
}

const PASO = touchTarget + 8;

const useStyles = makeStyles((c) => ({
  campos: { gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md },
  dias: { gap: space.md },
  etiqueta: { fontSize: 12.5, color: c.inkMuted },

  contador: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  paso: {
    width: PASO,
    height: PASO,
    borderRadius: PASO / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  pasoApagado: { opacity: 0.4 },
  pulsado: { opacity: 0.75 },
  cifra: { flex: 1, alignItems: 'center', minWidth: 0 },
  cifraInput: {
    ...tabular,
    minWidth: 96,
    textAlign: 'center',
    fontFamily: fonts.displaySemi,
    fontSize: 34,
    lineHeight: 40,
    color: c.ink,
    paddingVertical: 0,
  },
  cifraUnidad: { fontFamily: fonts.medium, fontSize: 13, color: c.inkMuted },

  aviso: { fontSize: 11.5, color: c.inkFaint },
  calculo: {
    fontFamily: fonts.semibold,
    fontSize: 12.5,
    lineHeight: 17,
    color: c.brandInk,
    backgroundColor: c.brandSoft,
    borderRadius: radius.sm,
    paddingVertical: space.sm - 2,
    paddingHorizontal: space.md - 2,
    overflow: 'hidden',
  },
  actual: { fontSize: 12.5, lineHeight: 17, color: c.inkMuted },

  atajos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm - 2 },
  atajo: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.brandSoft,
    backgroundColor: c.brandSoft,
  },
  atajoOn: { borderColor: c.brand, borderWidth: 1.5 },
  atajoText: { fontFamily: fonts.semibold, fontSize: 12.5, color: c.brandInk },
}));
