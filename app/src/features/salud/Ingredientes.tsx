import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ListBullets } from 'phosphor-react-native';

import { buscarPorCodigo, ErrorBusqueda } from '@/api/catalogo';
import { fetchProducto, type ProductoCatalogo } from '@/api/inventory';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import {
  nombresDeEtiquetas,
  TEXTO_ETIQUETA_SALUD,
  unir,
  type SaludProducto,
} from '@/shared/lib/salud';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { fonts, makeStyles, space, touchTarget, useTheme } from '@/shared/theme/tokens';

import { FRESCURA_FICHA_MS } from './useSalud';

/**
 * Lo que Open Food Facts (OFF) declara de un producto: ingredientes, alérgenos, trazas y
 * las etiquetas de sin gluten y sin lactosa. Se lee de la ficha del catálogo.
 *
 * ── Una ficha antigua se renueva al abrir ─────────────────────────────────
 *
 * Las fichas anteriores a estos datos no traen nada de salud (`consta` falso). Abrir
 * esta hoja las renueva: llama a `lookup-barcode`, que es quien habla con OFF —el móvil
 * nunca llama a un tercero— y GASTA CUOTA de consultas. Por eso es una acción de la
 * persona (pulsar «Ver ingredientes») y no algo que se haga solo al listar. La consulta
 * se hace sin reintento automático: si el servidor dice «espera un momento», repetirla
 * a los pocos segundos sería gastar otra, y el botón «Reintentar» es de la persona.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────
 *
 *   · No deduce nada: ni alérgenos del nombre, ni ingredientes de la categoría. Si OFF
 *     no tiene los ingredientes, lo dice.
 *   · No dice que algo sea apto ni seguro. Las etiquetas de sin gluten y sin lactosa se
 *     enseñan atribuidas («según Open Food Facts») y sin ningún icono de visto bueno.
 *   · No interpreta el texto: los ingredientes son de un wiki público, así que van en un
 *     `<Text>` plano —sin marcado, sin enlaces, sin abrir nada— y ya pasaron por
 *     `leerSalud`, que tira lo que trae caracteres de marcado o de control.
 */

/** Hay algo que consultar: el producto es de OFF y su código es el que se renueva. */
async function cargar(
  productoId: string,
  alRenovar: (producto: ProductoCatalogo | null) => void,
): Promise<ProductoCatalogo | null> {
  const producto = await fetchProducto(productoId);
  const antigua = producto !== null && producto.salud.deOff && !producto.salud.consta;
  if (!producto || !antigua || !producto.barcode) return producto;

  // Gasta cuota. Lanza con el mensaje del servidor si falla (demasiadas consultas, sin red…).
  await buscarPorCodigo(producto.barcode);
  const renovado = await fetchProducto(productoId);
  alRenovar(renovado);
  return renovado;
}

function mensajeDeError(error: unknown): string {
  // El mensaje de la función ya viene escrito en español y dice qué hacer: tal cual.
  return error instanceof ErrorBusqueda ? error.message : describeDbError(error);
}

/** La primera letra en mayúscula: «gluten y leche» → «Gluten y leche». */
function enFrase(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * El contenido, sin hoja alrededor. Existe aparte porque las hojas rápidas (la del
 * escáner y la del almacén) ya son una hoja, y en iOS dos a la vez no se presentan:
 * enseñan esto en su lugar, con su propio «Atrás».
 */
export function ContenidoIngredientes({
  productoId,
  onRenovada,
}: {
  productoId: string;
  /**
   * Avisa de la ficha de salud nueva cuando esta consulta renueva una antigua. Es para quien
   * ya tenía la vieja a la vista (la hoja del escáner) y no la lee de la caché.
   */
  onRenovada?: (salud: SaludProducto) => void;
}) {
  const styles = useStyles();
  const c = useTheme();
  const queryClient = useQueryClient();

  const consulta = useQuery({
    queryKey: queryKeys.ingredientes(productoId),
    queryFn: () =>
      cargar(productoId, (renovado) => {
        // Quien ya tiene esta ficha a la vista (el aviso, el detalle) se actualiza sin
        // volver a pedirla, y las marcas del inventario se recalculan.
        queryClient.setQueryData(queryKeys.producto(productoId), renovado);
        void queryClient.invalidateQueries({ queryKey: queryKeys.fichasSalud });
        if (renovado) onRenovada?.(renovado.salud);
      }),
    retry: false,
    staleTime: FRESCURA_FICHA_MS,
  });

  if (consulta.isPending) {
    return <ActivityIndicator color={c.brand} style={styles.cargando} />;
  }

  if (consulta.isError) {
    return (
      <View style={styles.bloque}>
        <ErrorNote message={mensajeDeError(consulta.error)} />
        <Button label="Reintentar" onPress={() => void consulta.refetch()} loading={consulta.isFetching} />
      </View>
    );
  }

  const producto = consulta.data;
  if (!producto) return <Text style={styles.texto}>Su ficha ya no está.</Text>;

  const { salud } = producto;
  if (!salud.deOff) {
    return <Text style={styles.texto}>No hay ficha de Open Food Facts de este producto.</Text>;
  }

  // Una ficha que sigue sin datos tras intentar renovarla: Open Food Facts no contestó con
  // ellos. No se inventa nada en su lugar.
  if (!salud.consta) {
    return (
      <View style={styles.bloque}>
        <Cabecera producto={producto} />
        <Text style={styles.texto}>No he podido traer los datos de este producto. Prueba otra vez más tarde.</Text>
        <Button label="Reintentar" onPress={() => void consulta.refetch()} loading={consulta.isFetching} />
      </View>
    );
  }

  return (
    <View style={styles.bloque}>
      <Cabecera producto={producto} />
      <Datos salud={salud} />
      <Text style={styles.pie}>
        Ficha de Open Food Facts, bajo licencia ODbL. A veces está incompleta. Mira siempre la
        etiqueta del envase.
      </Text>
    </View>
  );
}

function Cabecera({ producto }: { producto: ProductoCatalogo }) {
  const styles = useStyles();
  return (
    <View style={styles.cabecera}>
      <Text style={styles.nombre}>{producto.name}</Text>
      {producto.brand ? <Text style={styles.marca}>{producto.brand}</Text> : null}
    </View>
  );
}

function Datos({ salud }: { salud: SaludProducto }) {
  const styles = useStyles();
  // Solo lo que Opsi sabe nombrar: una etiqueta rara de OFF no se enseña.
  const alergenos = nombresDeEtiquetas(salud.alergenos);
  const trazas = nombresDeEtiquetas(salud.trazas);
  const etiquetas = salud.etiquetas.map((e) => TEXTO_ETIQUETA_SALUD[e]);

  return (
    <>
      <View style={styles.grupo}>
        <Text style={styles.titulo}>Ingredientes</Text>
        {salud.ingredientes ? (
          // Texto plano. `dataDetectorType` queda sin poner: nada de enlaces ni teléfonos.
          <Text style={styles.ingredientes}>{salud.ingredientes}</Text>
        ) : (
          <Text style={styles.texto}>Open Food Facts no tiene los ingredientes de este producto.</Text>
        )}
      </View>

      {alergenos.length > 0 ? (
        <View style={styles.grupo}>
          <Text style={styles.titulo}>Alérgenos declarados</Text>
          <Text style={styles.dato}>{enFrase(unir(alergenos))}</Text>
        </View>
      ) : null}

      {trazas.length > 0 ? (
        <View style={styles.grupo}>
          <Text style={styles.titulo}>Trazas declaradas</Text>
          <Text style={styles.dato}>{enFrase(unir(trazas))}</Text>
        </View>
      ) : null}

      {etiquetas.length > 0 ? (
        <View style={styles.grupo}>
          <Text style={styles.titulo}>Etiquetas</Text>
          <Text style={styles.texto}>{enFrase(etiquetas.join(', '))}. Según Open Food Facts.</Text>
        </View>
      ) : null}
    </>
  );
}

/** La hoja de ingredientes de un producto. Se monta solo cuando se abre: la consulta empieza entonces. */
export function HojaIngredientes({ productoId, onClose }: { productoId: string; onClose: () => void }) {
  return (
    <HojaInferior visible onClose={onClose} titulo="Ingredientes">
      <ContenidoIngredientes productoId={productoId} />
    </HojaInferior>
  );
}

/** El botón de «Ver ingredientes», solo, para quien lo pone dentro de una hoja. */
export function BotonIngredientes({ onPress }: { onPress: () => void }) {
  const styles = useStyles();
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ver ingredientes"
      onPress={onPress}
      style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
    >
      <ListBullets size={18} color={c.brand} weight="bold" />
      <Text style={styles.botonTexto}>Ver ingredientes</Text>
    </Pressable>
  );
}

/**
 * «Ver ingredientes» con su hoja, para una pantalla. Quien lo use decide antes si hay algo
 * que ofrecer: solo un producto de Open Food Facts tiene ingredientes que consultar, y
 * en uno escrito a mano no se pinta ni un hueco.
 */
export function AccesoIngredientes({ productoId }: { productoId: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <BotonIngredientes onPress={() => setAbierta(true)} />
      {abierta ? <HojaIngredientes productoId={productoId} onClose={() => setAbierta(false)} /> : null}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  cargando: { paddingVertical: space.xl },
  bloque: { gap: space.lg },
  cabecera: { gap: 2 },
  nombre: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: c.ink },
  marca: { fontSize: 13, color: c.inkMuted },
  grupo: { gap: space.xs },
  titulo: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  ingredientes: { fontFamily: fonts.body, fontSize: 14.5, lineHeight: 22, color: c.ink },
  dato: { fontFamily: fonts.semibold, fontSize: 14.5, lineHeight: 21, color: c.ink },
  texto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  pie: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: c.inkMuted },

  boton: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.sm - 2,
  },
  pulsado: { opacity: 0.7 },
  botonTexto: { fontSize: 14.5, fontWeight: '600', color: c.brand },
}));
