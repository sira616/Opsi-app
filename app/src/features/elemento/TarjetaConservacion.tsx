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
import { makeStyles, radius, space, tabular, useTheme, useType } from '@/shared/theme/tokens';

/**
 * «Una vez abierto, consúmelo antes de…» y «Guárdalo en…».
 *
 * Tres reglas mandan sobre todo lo que se pinta aquí, y ninguna es de diseño:
 *
 *   1. **Esto es orientativo y lo dice.** Los dos orígenes posibles —el
 *      catálogo para ese alimento y la referencia por categoría— lo son. La
 *      etiqueta lleva la palabra y el cuerpo dice de cuál de los dos sale.
 *   2. **No puede regalar días.** Si el plazo cae después de la fecha límite
 *      del elemento, no se enseña la fecha: manda la límite. Y si el elemento
 *      está caducado, aquí no hay consejo, hay instrucción.
 *   3. **«No lo sé» es una respuesta.** Cero filas de `shelf_life_for_item` se
 *      pinta como lo que es, no como un cero ni como un hueco. Y un fallo de
 *      consulta se ve DISTINTO de «no lo sé»: lo primero se arregla
 *      reintentando y lo segundo no.
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

  return (
    <View style={[styles.card, caducado ? styles.cardCaducado : styles.cardOrientativo]}>
      <View style={styles.head}>
        <Package size={15} color={caducado ? c.expiry : c.warning} weight="fill" />
        <Text style={[t.section, caducado && styles.labelCaducado]}>
          {caducado ? 'Una vez abierto' : 'Una vez abierto · orientativo'}
        </Text>
      </View>

      {consulta.isPending ? (
        <ActivityIndicator color={caducado ? c.expiry : c.warning} />
      ) : consulta.isError ? (
        // Un fallo de red no es «no lo sé». El mensaje es el del servidor, sin
        // envolver ni traducir.
        <ErrorNote message={describeDbError(consulta.error)} />
      ) : datos === null ? (
        <>
          <Text style={styles.valor}>No sé cuánto aguanta abierto</Text>
          <Text style={styles.explica}>
            No tengo plazo para esto. Si el envase lo trae, hazle caso.
          </Text>
        </>
      ) : (
        <>
          <Plazo item={item} datos={datos} vencido={vencido} caducado={caducado} />
          {caducado ? null : <Ubicacion item={item} datos={datos} />}
        </>
      )}
    </View>
  );
}

/** El plazo: los días, y la fecha concreta cuando el elemento ya está abierto. */
function Plazo({
  item,
  datos,
  vencido,
  caducado,
}: {
  item: ItemDetail;
  datos: Conservacion;
  vencido: boolean;
  caducado: boolean;
}) {
  const styles = useStyles();

  // Escalón 4 de la guía de voz: sin tono, sin atenuadores y sin nada que
  // suene a que todavía vale. La tarjeta de la fecha ya dice cuándo caducó;
  // esta solo se asegura de no contradecirla.
  if (caducado) {
    return (
      <>
        <Text style={[styles.valor, styles.valorCaducado]}>Caducado</Text>
        <Text style={[styles.explica, styles.explicaCaducado]}>
          No te lo comas. El plazo de después de abrir no cuenta aquí.
        </Text>
      </>
    );
  }

  // Consumo preferente pasado: es calidad, no seguridad, así que el consejo de
  // dónde guardarlo sigue valiendo. Lo que no vale es la fecha: sumarle días a
  // algo que ya venció lo enseñaría como un plazo nuevo.
  if (vencido) {
    return (
      <>
        <Text style={styles.valor}>Ya venció</Text>
        <Text style={styles.explica}>El plazo de después de abrir no le suma días.</Text>
        <Notas item={item} datos={datos} />
      </>
    );
  }

  const fecha = fechaTrasAbrir(item.opened_at, datos.dias);
  const pasaDeLaLimite = fecha !== null && posteriorALimite(fecha, item.effective_limit_date);
  const conFecha = fecha !== null && !pasaDeLaLimite;

  return (
    <>
      <Text style={styles.valor}>
        {conFecha && fecha
          ? `Antes del ${formatFechaLarga(fecha)}`
          : `${diasTexto(datos.dias)} ${item.opened_at ? 'desde que lo abriste' : 'desde que lo abras'}`}
      </Text>

      {conFecha ? (
        <Text style={styles.explica}>{diasTexto(datos.dias)} desde que lo abriste.</Text>
      ) : null}

      {pasaDeLaLimite ? (
        <Text style={styles.explica}>Su fecha límite cae antes. Manda esa.</Text>
      ) : null}

      <Notas item={item} datos={datos} />
    </>
  );
}

/**
 * El origen y la nota de la categoría.
 *
 * El origen va SIEMPRE, aunque la tarjeta ya diga «orientativo»: saber que es
 * orientativo y saber de dónde sale no son lo mismo, y el proyecto se
 * comprometió a enseñar las dos cosas.
 */
function Notas({ item, datos }: { item: ItemDetail; datos: Conservacion }) {
  const styles = useStyles();

  return (
    <>
      <Text style={styles.origen}>{describeOrigenConservacion(datos.origen, item.category)}</Text>
      {/* La nota viene escrita en español desde el servidor para leerse tal
          cual. No se reescribe aquí ni se le añade puntuación. */}
      {datos.nota ? <Text style={styles.nota}>{datos.nota}</Text> : null}
    </>
  );
}

/**
 * «Guárdalo en…».
 *
 * Es un consejo y se nota que lo es: el elemento tiene su propia ubicación y
 * el usuario manda. Cuando no coinciden se dice el dato y se calla la
 * opinión; aquí no se regaña a nadie por tener el pan en la nevera.
 */
function Ubicacion({ item, datos }: { item: ItemDetail; datos: Conservacion }) {
  const styles = useStyles();
  const coincide = item.location === datos.ubicacionRecomendada;

  return (
    <View style={styles.ubicacion}>
      <Text style={styles.subLabel}>Guárdalo en</Text>
      <Text style={styles.valorMedio}>{UBICACION[datos.ubicacionRecomendada]}</Text>
      <Text style={styles.explica}>
        {coincide ? 'Es donde lo tienes.' : `Lo tienes ${enUbicacion(item.location)}. Tú decides.`}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.xs + 2 },

  // `warning` y `warningSoft` existen justo para esto: «prioridad media, y
  // todo lo orientativo». El texto NO va en `warning`: sobre `warningSoft` se
  // queda en 4.1:1, por debajo de AA. Va en la tinta normal, que sí pasa.
  cardOrientativo: { backgroundColor: c.warningSoft, borderColor: c.warning },
  cardCaducado: { backgroundColor: c.expirySoft, borderColor: c.expiryLine },

  head: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 1 },
  labelCaducado: { color: c.expiry },

  valor: { ...tabular, fontSize: 20, fontWeight: '600', color: c.ink },
  valorCaducado: { color: c.expiry },
  valorMedio: { ...tabular, fontSize: 16, fontWeight: '600', color: c.ink },

  explica: { fontSize: 12.5, lineHeight: 18, color: c.inkMuted },
  explicaCaducado: { color: c.expiryInk },
  origen: { fontSize: 12, lineHeight: 17, color: c.inkMuted },
  nota: { fontSize: 12.5, lineHeight: 18, fontStyle: 'italic', color: c.inkMuted },

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
