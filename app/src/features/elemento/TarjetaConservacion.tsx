import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Text, View } from 'react-native';

import { Package } from 'phosphor-react-native';

import { fetchConservacion, type Conservacion, type ItemDetail } from '@/api/inventory';
import {
  UBICACION,
  describeOrigenConservacion,
  diasTexto,
  enUbicacion,
  fechaTrasAbrir,
  formatFechaLarga,
  posteriorALimite,
} from '@/shared/lib/conservacion';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Info } from '@/shared/ui/Info';
import { makeStyles, radius, space, tabular, useTheme, useType } from '@/shared/theme/tokens';

/**
 * «Una vez abierto, consúmelo antes de…» y «Guárdalo en…».
 *
 * Tres reglas mandan sobre todo lo que se pinta aquí, y ninguna es de diseño:
 *
 *   1. **Esto es orientativo y lo dice.** Los dos orígenes posibles —el
 *      catálogo para ese alimento y la referencia por categoría— lo son. La
 *      etiqueta lleva la palabra y la «i» dice de cuál de los dos sale.
 *   2. **No puede regalar días.** Si el plazo cae después de la fecha límite
 *      del elemento, no se enseña la fecha: manda la límite. Y si el elemento
 *      está caducado, aquí no hay consejo, hay instrucción.
 *   3. **«No lo sé» es una respuesta.** Cero filas de `shelf_life_for_item` se
 *      pinta como lo que es, no como un cero ni como un hueco. Y un fallo de
 *      consulta se ve DISTINTO de «no lo sé»: lo primero se arregla
 *      reintentando y lo segundo no.
 *
 * ── Qué se ve y qué está detrás de la «i» ─────────────────────────────────
 *
 * La tarjeta enseña lo que hace falta de un vistazo: el plazo y dónde guardarlo.
 * Las frases que lo explican —de dónde sale el dato, la nota de la categoría,
 * por qué manda otra fecha— están todas, pero detrás de la «i». Antes era una
 * tarjeta naranja con cinco líneas de texto, y la mayoría de las veces lo único
 * que se buscaba era el día.
 *
 * Lo que NO se esconde: la instrucción cuando está caducado. Eso protege a
 * alguien y va a la vista, en rojo.
 */
export function TarjetaConservacion({ item }: { item: ItemDetail }) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();

  const consulta = useQuery({
    queryKey: queryKeys.itemConservacion(item.id),
    queryFn: () => fetchConservacion(item.id, item.category),
  });

  // Caducidad y consumo preferente NO se tratan igual: una es seguridad y la
  // otra calidad. Es el principio 2 del proyecto y aquí decide si la tarjeta
  // da un consejo o da una orden.
  const vencido = item.days_left !== null && item.days_left <= 0;
  const caducado = vencido && item.date_kind === 'expiry';

  const datos = consulta.data ?? null;
  const resumen = datos && !caducado ? resumir(item, datos, vencido) : null;

  // Lo que va detrás de la «i». Sin nada que explicar, no hay «i».
  const detalles: string[] = resumen
    ? resumen.detalles
    : !consulta.isPending && !consulta.isError && datos === null
      ? ['No tengo plazo para esto. Si el envase lo trae, hazle caso.']
      : [];

  return (
    <View style={[styles.card, caducado && styles.cardCaducado]}>
      <View style={styles.head}>
        <Package size={15} color={caducado ? c.expiry : c.inkMuted} weight="fill" />
        <Text style={[t.section, styles.titulo, caducado && styles.labelCaducado]}>
          {caducado ? 'Una vez abierto' : 'Una vez abierto · orientativo'}
        </Text>
        {detalles.length > 0 ? <Info titulo="Una vez abierto" texto={detalles} /> : null}
      </View>

      {consulta.isPending ? (
        <ActivityIndicator color={caducado ? c.expiry : c.brand} />
      ) : consulta.isError ? (
        // Un fallo de red no es «no lo sé». El mensaje es el del servidor, sin
        // envolver ni traducir.
        <ErrorNote message={describeDbError(consulta.error)} />
      ) : datos === null ? (
        <Text style={styles.valor}>No sé cuánto aguanta abierto</Text>
      ) : caducado ? (
        // Escalón 4 de la guía de voz: sin tono, sin atenuadores y sin nada que
        // suene a que todavía vale. La tarjeta de la fecha ya dice cuándo caducó;
        // esta solo se asegura de no contradecirla.
        <>
          <Text style={[styles.valor, styles.valorCaducado]}>Caducado</Text>
          <Text style={[styles.explica, styles.explicaCaducado]}>
            No te lo comas. El plazo de después de abrir no cuenta aquí.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.valor}>{resumen?.valor}</Text>
          {resumen?.guardarEn ? (
            <View style={styles.ubicacion}>
              <Text style={styles.subLabel}>Guárdalo en</Text>
              <Text style={styles.valorMedio}>{resumen.guardarEn}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

/**
 * Lo que dice la tarjeta, separado en lo que se ve y lo que va en la «i».
 *
 * Es una función aparte, y no un puñado de condiciones en el JSX, porque las dos
 * mitades salen de las MISMAS comprobaciones —¿pasa de la fecha límite?, ¿ya
 * venció?— y repetirlas en dos sitios es como acaba una diciendo una cosa y la
 * otra la contraria.
 */
function resumir(
  item: ItemDetail,
  datos: Conservacion,
  vencido: boolean,
): { valor: string; guardarEn: string | null; detalles: string[] } {
  const detalles: string[] = [];

  // Consumo preferente pasado: es calidad, no seguridad, así que el consejo de
  // dónde guardarlo sigue valiendo. Lo que no vale es la fecha: sumarle días a
  // algo que ya venció lo enseñaría como un plazo nuevo.
  let valor: string;
  if (vencido) {
    valor = 'Ya venció';
    detalles.push('El plazo de después de abrir no le suma días.');
  } else {
    const fecha = fechaTrasAbrir(item.opened_at, datos.dias);
    const pasaDeLaLimite = fecha !== null && posteriorALimite(fecha, item.effective_limit_date);
    const conFecha = fecha !== null && !pasaDeLaLimite;

    valor =
      conFecha && fecha
        ? `Antes del ${formatFechaLarga(fecha)}`
        : `${diasTexto(datos.dias)} ${item.opened_at ? 'desde que lo abriste' : 'desde que lo abras'}`;

    if (conFecha) detalles.push(`${diasTexto(datos.dias)} desde que lo abriste.`);
    if (pasaDeLaLimite) detalles.push('Su fecha límite cae antes. Manda esa.');
  }

  // El origen va SIEMPRE, aunque la tarjeta ya diga «orientativo»: saber que es
  // orientativo y saber de dónde sale no son lo mismo, y el proyecto se
  // comprometió a enseñar las dos cosas.
  detalles.push(describeOrigenConservacion(datos.origen, item.category));
  // La nota viene escrita en español desde el servidor para leerse tal cual. No
  // se reescribe aquí ni se le añade puntuación.
  if (datos.nota) detalles.push(datos.nota);

  // «Guárdalo en…» es un consejo y se nota que lo es: el elemento tiene su
  // propia ubicación y el usuario manda. Cuando no coinciden se dice el dato y se
  // calla la opinión; aquí no se regaña a nadie por tener el pan en la nevera.
  if (!vencido || item.date_kind !== 'expiry') {
    detalles.push(
      item.location === datos.ubicacionRecomendada
        ? 'Es donde lo tienes.'
        : `Lo tienes ${enUbicacion(item.location)}. Tú decides.`,
    );
  }

  return { valor, guardarEn: UBICACION[datos.ubicacionRecomendada], detalles };
}

const useStyles = makeStyles((c) => ({
  // Neutra: lo orientativo ya no se pinta de naranja. El naranja es de
  // «prioridad media» en la lista, y aquí solo hacía ruido.
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    padding: space.lg,
    gap: space.xs + 2,
  },
  cardCaducado: { backgroundColor: c.expirySoft, borderColor: c.expiryLine },

  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  titulo: { flex: 1 },
  labelCaducado: { color: c.expiry },

  valor: { ...tabular, fontSize: 20, fontWeight: '600', color: c.ink },
  valorCaducado: { color: c.expiry },
  valorMedio: { ...tabular, fontSize: 16, fontWeight: '600', color: c.ink },

  explica: { fontSize: 12.5, lineHeight: 18, color: c.inkMuted },
  explicaCaducado: { color: c.expiryInk },

  subLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  ubicacion: {
    gap: 2,
    marginTop: space.sm,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: c.border,
  },
}));
