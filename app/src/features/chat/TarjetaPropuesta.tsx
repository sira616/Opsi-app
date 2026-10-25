import { Text, View } from 'react-native';

import { Check, X } from 'phosphor-react-native';

import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { fonts, makeStyles, radius, space, useTheme } from '@/shared/theme/tokens';

import { lineasDe, tituloDe, type EstadoPropuesta, type PropuestaChat } from './propuestas';

type Props = {
  propuesta: PropuestaChat;
  estado: EstadoPropuesta;
  /** El nombre de la nevera donde se guardaría (solo lo usa «Guardar»). */
  nevera: string;
  onConfirmar: () => void;
  onRechazar: () => void;
};

/**
 * Lo que Opsi propone hacer, para que la persona diga que sí o que no.
 *
 * El chat nunca cambia nada por su cuenta: esto es lo que hay entre «te propongo guardar 2 l de
 * leche» y que se guarde. Enseña TODO lo que se va a hacer, línea a línea y con las cantidades, y
 * no hace nada hasta el «Sí». Una vez contestada se queda como constancia (qué se hizo, o que se
 * dejó como estaba) y ya no se puede volver a pulsar: confirmar dos veces apuntaría dos veces.
 *
 * Si el servidor rechaza algo, el error sale tal cual y los botones vuelven, porque lo que no se
 * hizo se puede volver a intentar.
 */
export function TarjetaPropuesta({ propuesta, estado, nevera, onConfirmar, onRechazar }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const lineas = lineasDe(propuesta);
  const abierta = estado.fase === 'pendiente' || estado.fase === 'ejecutando' || estado.fase === 'error';

  return (
    <View style={[styles.tarjeta, estado.fase === 'hecha' && styles.hecha]}>
      <Text style={styles.titulo} accessibilityRole="header">
        {tituloDe(propuesta, nevera)}
      </Text>
      <View style={styles.lineas}>
        {lineas.map((linea, i) => (
          <Text key={`${i}:${linea}`} style={styles.linea}>
            · {linea}
          </Text>
        ))}
      </View>

      {estado.fase === 'error' ? <ErrorNote message={estado.mensaje} /> : null}

      {abierta ? (
        <View style={styles.botones}>
          <Button
            label="Sí, hazlo"
            onPress={onConfirmar}
            loading={estado.fase === 'ejecutando'}
            icon={<Check size={18} color={c.ground} weight="bold" />}
          />
          <Button
            label="No"
            variant="quiet"
            onPress={onRechazar}
            disabled={estado.fase === 'ejecutando'}
            icon={<X size={18} color={c.inkMuted} weight="bold" />}
          />
        </View>
      ) : null}

      {estado.fase === 'hecha' ? (
        <View style={styles.constancia}>
          <Check size={16} color={c.brandInk} weight="bold" />
          <Text style={styles.constanciaTexto}>{estado.resumen}</Text>
        </View>
      ) : null}
      {estado.fase === 'rechazada' ? <Text style={styles.rechazada}>Lo dejo como está.</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  tarjeta: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.brand,
    backgroundColor: c.surface,
  },
  hecha: { borderColor: c.border, backgroundColor: c.brandSoft },
  titulo: { fontFamily: fonts.semibold, fontSize: 14.5, color: c.ink },
  lineas: { gap: 2 },
  linea: { fontSize: 14, lineHeight: 20, color: c.ink },
  botones: { gap: space.xs },
  constancia: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  constanciaTexto: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5, color: c.brandInk },
  rechazada: { fontSize: 13.5, color: c.inkMuted },
}));
