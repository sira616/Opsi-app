import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Image, Text, View } from 'react-native';

import { fetchProducto, type ItemDetail, type ProductoCatalogo } from '@/api/inventory';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { familyOf, formatQuantity, type MeasurementUnit } from '@/shared/lib/units';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { makeStyles, radius, space, tabular, useTheme, useType } from '@/shared/theme/tokens';

/**
 * Lo que el catálogo sabe del producto: marca, contenido y código de barras.
 *
 * Casi nunca se pinta, y eso está bien. El camino principal de hoy es el alta a
 * mano, que no crea producto: `product_id` es null y aquí no hay nada que
 * enseñar. Sin producto NO se pinta un vacío ni un «todavía no hay ficha»,
 * porque eso convertiría el caso normal en una carencia.
 *
 * Lo que sí se distingue es el fallo: si el producto existe y la consulta
 * revienta, se ve el error del servidor. Un elemento sin ficha y una ficha que
 * no se pudo leer no son la misma pantalla.
 */
export function FichaProducto({ item }: { item: ItemDetail }) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const productId = item.product_id;
  const [fotoRota, setFotoRota] = useState(false);

  const consulta = useQuery({
    // Cuelga de `item(id)`, así que cualquier invalidación del elemento la
    // arrastra. No hay clave propia en `queryKeys` y no hace falta: la ficha
    // no cambia por su cuenta.
    queryKey: [...queryKeys.item(item.id), 'producto'],
    queryFn: () => (productId ? fetchProducto(productId) : Promise.resolve(null)),
    enabled: Boolean(productId),
    // El catálogo es de lectura y prácticamente inmutable: recargarlo cada
    // minuto como el resto de consultas sería tráfico sin motivo.
    staleTime: 30 * 60_000,
  });

  if (!productId) return null;

  if (consulta.isPending) {
    return (
      <View style={styles.card}>
        <ActivityIndicator color={c.brand} />
      </View>
    );
  }

  if (consulta.isError) {
    return (
      <View style={styles.card}>
        <Text style={t.section}>Del catálogo</Text>
        <ErrorNote message={describeDbError(consulta.error)} />
      </View>
    );
  }

  const producto = consulta.data;
  if (!producto) {
    return (
      <View style={styles.card}>
        <Text style={t.section}>Del catálogo</Text>
        <Text style={styles.vacio}>Su ficha ya no está.</Text>
      </View>
    );
  }

  const filas = filasDe(producto, item);
  const foto = producto.image_url && !fotoRota ? producto.image_url : null;
  if (filas.length === 0 && !foto) return null;

  return (
    <View style={styles.card}>
      <Text style={t.section}>Del catálogo</Text>

      <View style={styles.cuerpo}>
        {foto ? (
          <Image
            source={{ uri: foto }}
            style={styles.foto}
            resizeMode="contain"
            // Una URL del catálogo puede estar caída o servir un 404. Si la
            // imagen no carga se quita el hueco; un recuadro gris permanente
            // parece un fallo de la app y no lo es.
            onError={() => setFotoRota(true)}
          />
        ) : null}

        <View style={styles.filas}>
          {filas.map((fila) => (
            <View key={fila.etiqueta} style={styles.fila}>
              <Text style={styles.etiqueta}>{fila.etiqueta}</Text>
              <Text style={[styles.valor, fila.cifra && styles.valorCifra]} numberOfLines={2}>
                {fila.valor}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.procedencia}>{describeProcedencia(producto.data_source)}</Text>
    </View>
  );
}

type Fila = { etiqueta: string; valor: string; cifra?: boolean };

/**
 * Las filas que hay de verdad.
 *
 * Solo se pinta lo que existe. Una fila «Marca: —» no informa de nada y
 * alarga la pantalla; que falte la fila ya dice que el catálogo no lo trae.
 */
function filasDe(producto: ProductoCatalogo, item: ItemDetail): Fila[] {
  const filas: Fila[] = [];

  if (producto.brand) filas.push({ etiqueta: 'Marca', valor: producto.brand });

  const contenido = describeContenido(producto, item.display_unit);
  if (contenido) filas.push({ etiqueta: 'Contenido', valor: contenido, cifra: true });

  if (producto.barcode) {
    filas.push({ etiqueta: 'Código de barras', valor: producto.barcode, cifra: true });
  }

  // El nombre del catálogo solo cuando NO es el que tú le pusiste: si son el
  // mismo, repetirlo debajo del título es ruido.
  if (producto.name && producto.name !== item.name) {
    filas.push({ etiqueta: 'Nombre en el catálogo', valor: producto.name });
  }

  return filas;
}

/**
 * El contenido del envase.
 *
 * `products.net_quantity` no lleva unidad propia: se guarda en unidad base
 * —gramos, mililitros o piezas— como todo lo demás, y la familia la dice
 * `unit_family`. Sin familia no se sabe si 500 son gramos o mililitros, y
 * entonces se enseña el número pelado antes que inventarse la unidad.
 *
 * Cuando la familia coincide con la unidad que el usuario eligió para el
 * elemento se usa esa, para que un brick medido en litros no diga «1000 ml».
 */
function describeContenido(
  producto: ProductoCatalogo,
  unidadDelElemento: MeasurementUnit,
): string | null {
  const cantidad = producto.net_quantity;
  if (cantidad === null) return null;

  const familia = producto.unit_family;
  if (!familia) return cantidad.toLocaleString('es-ES', { maximumFractionDigits: 2 });

  const unidad: MeasurementUnit =
    familyOf(unidadDelElemento) === familia
      ? unidadDelElemento
      : familia === 'mass'
        ? 'g'
        : familia === 'volume'
          ? 'ml'
          : 'unit';

  return formatQuantity(cantidad, unidad);
}

/** De dónde salió la ficha. El origen de un dato se enseña, también aquí. */
function describeProcedencia(fuente: string): string {
  return fuente === 'openfoodfacts' ? 'Ficha de Open Food Facts.' : 'Ficha creada a mano.';
}

const useStyles = makeStyles((c) => ({
  card: {
    gap: space.sm,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  cuerpo: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  foto: {
    width: 56,
    height: 56,
    borderRadius: radius.sm,
    backgroundColor: c.surfaceAlt,
  },
  filas: { flex: 1, minWidth: 0, gap: space.sm - 2 },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  etiqueta: { width: 118, fontSize: 12.5, color: c.inkMuted },
  valor: { flex: 1, minWidth: 0, fontSize: 14, fontWeight: '600', color: c.ink },
  valorCifra: tabular,
  procedencia: { fontSize: 11.5, lineHeight: 16, color: c.inkFaint },
  vacio: { fontSize: 13, lineHeight: 19, color: c.inkMuted },
}));
