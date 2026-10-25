import { useState } from 'react';
import { Text, View } from 'react-native';

import { Barcode, PencilSimple } from 'phosphor-react-native';

import type { Nevera } from '@/api/household';
import type { ListaDestino } from '@/api/lista';
import type { ProductoConocido } from '@/api/premium';
import { CargandoListas, ElegirListas, useListasElegidas } from '@/features/lista/ElegirListas';
import { ElegirNevera } from '@/features/neveras/ElegirNevera';
import { BotonNutricion, ContenidoNutricion } from '@/features/nutricion/ContenidoNutricion';
import { BotonIngredientes, ContenidoIngredientes } from '@/features/salud/Ingredientes';
import { etiquetaCategoria } from '@/shared/lib/categorias';
import { IconoCategoria } from '@/shared/lib/categorias-iconos';
import { describeDbError } from '@/shared/lib/db-errors';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { formatQuantity } from '@/shared/lib/units';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { fonts, makeStyles, radius, space, tabular, useTheme } from '@/shared/theme/tokens';

type Props = {
  producto: ProductoConocido;
  /** Las neveras entre las que elegir adónde va, y la que se está mirando (la de salida). */
  neveras: Nevera[];
  activaId: string;
  /** Guardarlo en la nevera elegida: el padre cierra esta hoja y abre la rápida. */
  onGuardar: (producto: ProductoConocido, neveraId: string) => void;
  /** Apuntarlo en las listas elegidas (individuales o de cualquier nevera). Si falla, lanza. */
  onApuntar: (producto: ProductoConocido, listas: ListaDestino[]) => Promise<void>;
  onClose: () => void;
};

/** De dónde sale el producto, dicho para leerse. */
export function describirOrigen(p: ProductoConocido): string {
  if (!p.escaneado) return 'Añadido a mano';
  return p.origen === 'openfoodfacts' ? 'Escaneado · Open Food Facts' : 'Escaneado';
}

/**
 * La ficha de un producto del almacén: lo que se sabe de él y qué hacer con él.
 *
 * Solo datos del producto: de dónde sale, su código si lo tiene, su pasillo y su cantidad.
 * Sin recuentos (cuántas veces se ha comprado, cuánto hay): esto es un almacén de lo
 * registrado, no un historial. Lo que no se sabe (el código de algo escrito a mano) no sale.
 *
 * Dos acciones. Guardarlo puede ir a **otra nevera** que la que se está mirando: si hay más
 * de una, se elige adónde. Apuntarlo no depende de la nevera: las listas son de la cuenta, y
 * se elige entre TODAS (individuales y compartidas de cualquier nevera); la hoja pasa a
 * elegir la lista (o las listas) sin abrir otra encima: en iOS dos hojas a la vez no se
 * presentan. Con los ingredientes pasa lo mismo: se enseñan en esta misma hoja, y solo de un producto de Open Food Facts
 * (en uno escrito a mano no hay nada que consultar y no se pinta ningún hueco). Y con la
 * nutrición también: «Ver nutrición» sustituye el contenido, con su «Atrás», en vez de abrir
 * otra hoja encima.
 */
export function HojaFicha({ producto: p, neveras, activaId, onGuardar, onApuntar, onClose }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const [destino, setDestino] = useState(activaId);
  const { listas, elegidas, destinos, alternar, cargando, error: errorListas } = useListasElegidas(destino);
  const [eligiendo, setEligiendo] = useState(false);
  const [apuntando, setApuntando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Qué se ve dentro de la misma hoja: la ficha, sus ingredientes o su nutrición.
  const [vista, setVista] = useState<'ficha' | 'ingredientes' | 'nutricion'>('ficha');

  const variasListas = listas.length > 1;
  const variasNeveras = neveras.length > 1;
  const nombreDestino = neveras.find((n) => n.id === destino)?.name ?? '';

  async function apuntar(donde: ListaDestino[]) {
    setApuntando(true);
    setError(null);
    try {
      await onApuntar(p, donde);
    } catch (caught) {
      setError(describeDbError(caught));
      setApuntando(false);
    }
  }

  // El producto es de Open Food Facts y tiene código: lo único que se puede consultar.
  const productoOff = p.productoId !== null && p.origen === 'openfoodfacts' && p.codigo !== null ? p.productoId : null;

  if (vista === 'ingredientes' && productoOff) {
    return (
      <HojaInferior visible onClose={onClose} titulo="Ingredientes">
        <ContenidoIngredientes productoId={productoOff} />
        <Button label="Atrás" variant="quiet" onPress={() => setVista('ficha')} />
      </HojaInferior>
    );
  }

  if (vista === 'nutricion' && productoOff) {
    return (
      <HojaInferior visible onClose={onClose} titulo="Nutrición">
        <ContenidoNutricion productoId={productoOff} />
        <Button label="Atrás" variant="quiet" onPress={() => setVista('ficha')} />
      </HojaInferior>
    );
  }

  return (
    <HojaInferior visible onClose={onClose} titulo={eligiendo ? '¿En qué lista lo apunto?' : 'Ficha'}>
      <View style={styles.cabecera}>
        <View style={[styles.avatar, { backgroundColor: c.brandSoft }]}>
          <IconoComida nombre={p.nombre} size={28} color={c.brand} weight="duotone" />
        </View>
        <View style={styles.cabeceraTexto}>
          <Text style={styles.nombre} numberOfLines={2}>
            {p.nombre}
          </Text>
          {p.marca ? <Text style={styles.marca}>{p.marca}</Text> : null}
          <View style={styles.origen}>
            {p.escaneado ? (
              <Barcode size={14} color={c.brandInk} weight="bold" />
            ) : (
              <PencilSimple size={14} color={c.inkMuted} weight="bold" />
            )}
            <Text style={[styles.origenTexto, p.escaneado && styles.origenEscaneado]}>
              {describirOrigen(p)}
            </Text>
          </View>
        </View>
      </View>

      {eligiendo ? (
        <>
          {cargando ? <CargandoListas /> : null}
          {variasListas ? (
            <ElegirListas listas={listas} elegidas={elegidas} onAlternar={alternar} neveras={neveras} />
          ) : null}
          <ErrorNote message={error ?? errorListas} />
          <View style={styles.botones}>
            <Button
              label={elegidas.length > 1 ? `Apuntarlo en ${elegidas.length} listas` : 'Apuntarlo'}
              onPress={() => void apuntar(destinos)}
              loading={apuntando}
              disabled={cargando || elegidas.length === 0}
            />
            <Button label="Atrás" variant="quiet" onPress={() => setEligiendo(false)} disabled={apuntando} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.datos}>
            <Dato etiqueta="Pasillo">
              <View style={styles.pasillo}>
                <IconoCategoria categoria={p.categoria} size={16} color={c.inkMuted} weight="duotone" />
                <Text style={styles.valor}>{etiquetaCategoria(p.categoria)}</Text>
              </View>
            </Dato>
            <Dato etiqueta="Cantidad">
              <Text style={styles.valor}>{formatQuantity(p.cantidad, p.displayUnit)}</Text>
            </Dato>
            {p.codigo ? (
              <Dato etiqueta="Código de barras">
                <Text style={[styles.valor, styles.codigo]}>{p.codigo}</Text>
              </Dato>
            ) : null}
          </View>

          {productoOff ? (
            <View style={styles.accesos}>
              <BotonIngredientes onPress={() => setVista('ingredientes')} />
              <BotonNutricion onPress={() => setVista('nutricion')} />
            </View>
          ) : null}

          <ElegirNevera neveras={neveras} valor={destino} onValor={setDestino} />

          <View style={styles.botones}>
            <Button
              label={variasNeveras ? `Guardarlo en ${nombreDestino}` : 'Guardarlo en la nevera'}
              onPress={() => onGuardar(p, destino)}
            />
            <Button
              label="Apuntarlo en la lista"
              variant="quiet"
              // Con una sola lista no hay nada que elegir: se apunta en ella directamente.
              onPress={() => (variasListas ? setEligiendo(true) : void apuntar(destinos))}
              loading={apuntando}
              disabled={cargando}
            />
          </View>
          <ErrorNote message={error} />
        </>
      )}
    </HojaInferior>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.dato}>
      <Text style={styles.datoEtiqueta}>{etiqueta}</Text>
      {children}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cabeceraTexto: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.displaySemi, fontSize: 20, lineHeight: 25, color: c.ink },
  marca: { fontSize: 13.5, color: c.inkMuted },
  origen: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  origenTexto: { fontFamily: fonts.medium, fontSize: 12.5, color: c.inkMuted },
  origenEscaneado: { color: c.brandInk },

  datos: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
    paddingHorizontal: space.lg,
  },
  dato: {
    gap: 2,
    paddingVertical: space.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  datoEtiqueta: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  valor: { fontFamily: fonts.medium, fontSize: 15, color: c.ink },
  codigo: { ...tabular, letterSpacing: 0.5 },
  pasillo: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  botones: { gap: space.xs },
  accesos: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl },
}));
