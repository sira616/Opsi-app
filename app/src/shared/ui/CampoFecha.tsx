import { Pressable, Text, View } from 'react-native';

import type { DateKind, DateSource } from '@/api/inventory';
import {
  ATAJOS,
  deIso,
  enDias,
  fechaLegible,
  formatearMientrasEscribe,
  problemaDias,
  problemaFecha,
} from '@/shared/lib/fecha-input';
import { fonts, makeStyles, radius, space } from '@/shared/theme/tokens';

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

type Props = {
  source: DateSource;
  onSource: (source: DateSource) => void;
  dateText: string;
  onDateText: (texto: string) => void;
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

  const porDias = source === 'user';
  const avisoFecha = problemaFecha(dateText);
  const sinTocar = porDias && diasText === '' && actual !== null;
  const avisoDias = sinTocar ? null : problemaDias(diasText);
  const fechaCalculada = porDias && avisoDias === null && diasText !== '' ? fechaLegible(enDias(Number(diasText))) : null;
  const fechaActual = sinTocar ? fechaLegible(deIso(actual)) : null;

  return (
    <View style={styles.campos}>
      {/* El origen va PRIMERO porque manda sobre el resto del bloque: decide si se
          copia una fecha o se cuentan días. */}
      <Chips label="De dónde sale" options={SOURCE_OPTIONS} value={source} onChange={onSource} />

      {porDias ? (
        <View style={styles.dias}>
          {/* Los atajos van ANTES del campo a propósito: cubren la mayoría de los
              casos de un toque, y quien los use no llega a teclear. */}
          <View style={styles.atajos}>
            {ATAJOS.map(([etiqueta, dias]) => {
              const on = diasText === `${dias}`;
              return (
                <Pressable
                  key={etiqueta}
                  accessibilityRole="button"
                  accessibilityLabel={`Ponerle ${etiqueta}`}
                  onPress={() => onDiasText(`${dias}`)}
                  style={[styles.atajo, on && styles.atajoOn]}
                >
                  <Text style={styles.atajoText}>{etiqueta}</Text>
                </Pressable>
              );
            })}
          </View>

          <TextField
            label="¿Cuánto le das de vida?"
            hint={avisoDias ?? undefined}
            value={diasText}
            onChangeText={(texto) => onDiasText(texto.replace(/\D/g, '').slice(0, 4))}
            placeholder="7"
            keyboardType="number-pad"
            inputMode="numeric"
            maxLength={4}
          />

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

const useStyles = makeStyles((c) => ({
  campos: { gap: space.md, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.md },
  dias: { gap: space.md },
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
