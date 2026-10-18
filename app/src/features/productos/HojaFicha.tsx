import { useState } from 'react';
import { Text, View } from 'react-native';

import { Barcode, PencilSimple } from 'phosphor-react-native';

import type { ProductoConocido } from '@/api/premium';
import { CargandoListas, ElegirListas, useListasElegidas } from '@/features/lista/ElegirListas';
import { etiquetaCategoria } from '@/shared/lib/categorias';
import { IconoCategoria } from '@/shared/lib/categorias-iconos';
import { describeDesde } from '@/shared/lib/dates';
import { describeDbError } from '@/shared/lib/db-errors';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { formatQuantity } from '@/shared/lib/units';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { fonts, makeStyles, radius, space, tabular, useTheme } from '@/shared/theme/tokens';

type Props = {
  producto: ProductoConocido;
  householdId: string;
  /** Guardarlo en la nevera: el padre cierra esta hoja y abre la rápida. */
  onGuardar: (producto: ProductoConocido) => void;
  /** Apuntarlo en las listas elegidas. Si falla, lanza. */
  onApuntar: (producto: ProductoConocido, listaIds: string[]) => Promise<void>;
  onClose: () => void;
};

/** De dónde sale el producto, dicho para leerse. */
export function describirOrigen(p: ProductoConocido): string {
  if (!p.escaneado) return 'Lo añadiste a mano';
  return p.origen === 'openfoodfacts'
    ? 'Escaneado · ficha de Open Food Facts'
    : 'Escaneado · ficha guardada en tu nevera';
}

/**
 * La ficha de un producto de «tus productos»: lo que se sabe de él y qué hacer con él.
 *
 * Los datos son los de verdad (`my_known_products`): de dónde salió, su código si lo
 * tiene, su pasillo, cuántas veces lo has añadido y cuánto hay ahora en la nevera. Nada
 * de lo que sale aquí es inventado, y lo que no se sabe (el código de algo escrito a
 * mano) no se enseña como un hueco sino que no sale.
 *
 * Dos acciones, en la misma hoja: guardarlo en la nevera (con la hoja rápida) o apuntarlo
 * en la lista. Para apuntarlo la hoja pasa a elegir la lista (o las listas) sin abrir otra
 * encima: en iOS dos hojas a la vez no se presentan.
 */
export function HojaFicha({ producto: p, householdId, onGuardar, onApuntar, onClose }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const { listas, elegidas, alternar, cargando, error: errorListas } = useListasElegidas(householdId);
  const [eligiendo, setEligiendo] = useState(false);
  const [apuntando, setApuntando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variasListas = listas.length > 1;

  async function apuntar(ids: string[]) {
    setApuntando(true);
    setError(null);
    try {
      await onApuntar(p, ids);
    } catch (caught) {
      setError(describeDbError(caught));
      setApuntando(false);
    }
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
            <ElegirListas listas={listas} elegidas={elegidas} onAlternar={alternar} />
          ) : (
            <Text style={styles.valor}>Se apunta en la lista de la compra.</Text>
          )}
          <ErrorNote message={error ?? errorListas} />
          <View style={styles.botones}>
            <Button
              label={elegidas.length > 1 ? `Apuntarlo en ${elegidas.length} listas` : 'Apuntarlo'}
              onPress={() => void apuntar(elegidas)}
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
            <Dato etiqueta="Cantidad de la última vez">
              <Text style={styles.valor}>{formatQuantity(p.cantidad, p.displayUnit)}</Text>
            </Dato>
            {p.codigo ? (
              <Dato etiqueta="Código de barras">
                <Text style={[styles.valor, styles.codigo]}>{p.codigo}</Text>
              </Dato>
            ) : null}
            <Dato etiqueta="Ahora en la nevera">
              <Text style={styles.valor}>
                {p.enLaNevera === 0 ? 'Nada' : p.enLaNevera === 1 ? '1' : String(p.enLaNevera)}
              </Text>
            </Dato>
            <Dato etiqueta="Lo has añadido">
              <Text style={styles.valor}>
                {p.veces === 1 ? 'Una vez' : `${p.veces} veces`}
                {describeDesde(p.ultimaVez) ? ` · la última, ${describeDesde(p.ultimaVez)}` : ''}
              </Text>
            </Dato>
          </View>

          <View style={styles.botones}>
            <Button label="Guardarlo en la nevera" onPress={() => onGuardar(p)} />
            <Button
              label="Apuntarlo en la lista"
              variant="quiet"
              // Con una sola lista no hay nada que elegir: se apunta en ella directamente.
              onPress={() => (variasListas ? setEligiendo(true) : void apuntar(elegidas))}
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
}));
