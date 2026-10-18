import { useQuery } from '@tanstack/react-query';
import { Text, View } from 'react-native';

import { Snowflake } from 'phosphor-react-native';

import { fetchConservacion, type ItemDetail } from '@/api/inventory';
import { etiquetaFecha } from '@/shared/lib/calendario';
import { describeOrigenConservacion, diasTexto, enUbicacion } from '@/shared/lib/conservacion';
import {
  describeDateSource,
  describeDaysLeft,
  describeDesde,
  diasDesde,
} from '@/shared/lib/dates';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { Info } from '@/shared/ui/Info';
import { makeStyles, radius, space, tabular, useTheme } from '@/shared/theme/tokens';

/**
 * La fecha límite y lo que aguanta una vez abierto, en UNA tarjeta.
 *
 * Antes eran dos («Fecha límite» y «Una vez abierto · orientativo») que se pisaban:
 * una decía cuándo vence y la otra cuánto dura abierto, y a menudo la segunda solo
 * repetía o explicaba la primera. Ahora la tarjeta dice lo que hace falta y nada más:
 *
 *   · **Cuándo vence**, grande, con el día debajo.
 *   · **Una vez abierto, cuánto dura** (y dónde guardarlo si no es donde lo tienes), en
 *     una línea, y solo si todavía sirve: sin abrir y sin vencer. Abierto, la fecha de
 *     arriba YA lleva ese plazo dentro, y repetirlo sería contar lo mismo dos veces.
 *   · **De dónde sale cada dato**, detrás de UNA «i»: la fecha de partida, que un plazo
 *     de después de abrir es orientativo, y la nota de la categoría.
 *
 * Lo que no se esconde, porque protege a alguien: «No te lo comas» cuando algo está
 * caducado (y no es consumo preferente, que es calidad y no seguridad).
 *
 * Congelado es otra cosa y tiene la suya: la cuenta atrás está parada y aconsejar dónde
 * guardarlo sonaría a sacarlo.
 */
export function TarjetaFecha({ item }: { item: ItemDetail }) {
  const styles = useStyles();
  const c = useTheme();

  const cerrado = item.state === 'finished' || item.state === 'discarded';
  const congelado = item.state === 'frozen';
  const urgente = item.priority === 'high';
  const vencido = item.days_left !== null && item.days_left <= 0;
  const caducado = vencido && item.date_kind === 'expiry';
  const sinAbrir = item.opened_at === null;

  // Cuánto aguanta abierto solo hace falta para aconsejar: con algo cerrado del todo
  // (agotado, tirado) o congelado no se pide.
  const aconseja = !cerrado && !congelado;
  const consulta = useQuery({
    queryKey: queryKeys.itemConservacion(item.id),
    queryFn: () => fetchConservacion(item.id, item.category),
    enabled: aconseja,
  });
  const datos = consulta.data ?? null;

  // Lo agotado o tirado ya no vence: una tarjeta que dijera «No sé cuándo vence» de algo
  // que ya no está sería ruido. El historial dice qué pasó y cuándo.
  if (cerrado) return null;

  if (congelado) {
    // Dos cuentas distintas, y confundirlas sería mentir: `dentro` son los días del
    // tramo EN CURSO, y frozen_days los de tramos anteriores ya cerrados.
    const dentro = diasDesde(item.frozen_at);
    const desde = describeDesde(item.frozen_at);

    return (
      <View style={[styles.card, styles.cardCongelado]}>
        <View style={styles.cabecera}>
          <Snowflake size={15} color={c.frost} weight="fill" />
          <Text style={[styles.etiqueta, styles.etiquetaCongelado, styles.etiquetaTexto]}>
            En el congelador
          </Text>
        </View>

        <Text style={styles.valor}>
          {dentro === null
            ? 'Sin cuenta atrás'
            : dentro === 0
              ? 'Desde hoy'
              : `${dentro} ${dentro === 1 ? 'día' : 'días'}`}
        </Text>

        {desde && dentro !== null && dentro > 0 ? (
          <Text style={styles.congeladoDesde}>Lo congelaste {desde}.</Text>
        ) : null}
      </View>
    );
  }

  // De dónde salió la fecha de partida. Decir «la que trae el envase» de una fecha que
  // puso el usuario es inventarse el dato justo que este proyecto se comprometió a
  // enseñar tal cual.
  const departida = item.effective_date_source === 'user' ? 'La que pusiste tú' : 'La del envase';
  const explicacion =
    item.effective_date_reason === 'after_thawing'
      ? 'Se descongeló, y lo descongelado se consume en 24 horas: eso manda sobre cualquier otra fecha.'
      : item.effective_date_reason === 'after_opening'
        ? 'Está abierto, y lo que aguanta abierto se acaba antes que la fecha que tenía puesta.'
        : item.frozen_days > 0
          ? `${departida}, retrasada los ${item.frozen_days} días que pasó congelado.`
          : `${departida}.`;

  // Una vez abierto: solo si aún sirve (sin abrir y sin vencer) y hay plazo para esto.
  const tras = aconseja && !vencido && sinAbrir && datos ? diasTexto(datos.dias) : null;
  // Dónde guardarlo, solo si NO es donde lo tienes (si coincide, no hay nada que decir).
  const guardarEn =
    aconseja && !caducado && datos && datos.ubicacionRecomendada !== item.location
      ? enUbicacion(datos.ubicacionRecomendada)
      : null;

  const detalles: string[] = [explicacion];
  if (datos && (tras || guardarEn)) {
    detalles.push(describeOrigenConservacion(datos.origen, item.category));
    // La nota viene escrita en español desde el servidor para leerse tal cual.
    if (datos.nota) detalles.push(datos.nota);
  }

  const sinFecha = item.effective_limit_date === null;
  const peligro = urgente || caducado;

  return (
    <View style={[styles.card, peligro ? styles.cardUrgente : styles.cardNeutro]}>
      <View style={styles.cabecera}>
        <Text style={[styles.etiqueta, styles.etiquetaTexto, peligro && styles.etiquetaUrgente]}>
          {sinFecha
            ? 'Sin fecha'
            : `${
                item.date_kind === 'expiry' && item.effective_date_reason === 'label'
                  ? 'Caduca'
                  : 'Fecha límite'
              } · ${describeDateSource(item.effective_date_source)}`}
        </Text>
        <Info titulo="De dónde sale esto" texto={detalles} />
      </View>

      <Text style={[styles.valor, peligro && styles.valorUrgente]}>
        {sinFecha ? 'No sé cuándo vence' : describeDaysLeft(item.days_left)}
      </Text>
      {!sinFecha && item.effective_limit_date ? (
        <Text style={styles.dia}>{etiquetaFecha(item.effective_limit_date)}</Text>
      ) : null}

      {/* Lo único que protege a alguien y va a la vista: no se come. */}
      {caducado ? <Text style={styles.noTeLoComas}>No te lo comas.</Text> : null}

      {tras || guardarEn ? (
        <View style={styles.abierto}>
          <Text style={styles.abiertoTexto}>
            {tras ? `Una vez abierto: ${tras}` : 'Una vez abierto'}
            {guardarEn ? `${tras ? ', ' : ': '}mejor ${guardarEn}` : ''}
          </Text>
        </View>
      ) : consulta.isError ? (
        <Text style={styles.dia}>{describeDbError(consulta.error)}</Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.xs + 2 },
  cardNeutro: { backgroundColor: c.surface, borderColor: c.border },
  cardCongelado: { backgroundColor: c.frostSoft, borderColor: c.frost },
  cardUrgente: { backgroundColor: c.expirySoft, borderColor: c.expiryLine },

  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  etiqueta: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  etiquetaTexto: { flex: 1 },
  etiquetaUrgente: { color: c.expiry },
  etiquetaCongelado: { color: c.frostInk },

  valor: { ...tabular, fontSize: 22, fontWeight: '600', color: c.ink },
  valorUrgente: { color: c.expiry },
  dia: { ...tabular, fontSize: 12.5, color: c.inkMuted },
  noTeLoComas: { fontSize: 14, fontWeight: '700', color: c.expiry },
  congeladoDesde: { fontSize: 13, fontWeight: '600', color: c.frostInk },

  abierto: {
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
  abiertoTexto: { fontSize: 13.5, fontWeight: '600', color: c.inkMuted },
}));
