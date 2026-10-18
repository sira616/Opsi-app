import { useState } from 'react';
import { Text, View } from 'react-native';

import type { ItemDetail } from '@/api/inventory';
import { CargandoListas, ElegirListas, useListasElegidas } from '@/features/lista/ElegirListas';
import { describeDbError } from '@/shared/lib/db-errors';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { makeStyles } from '@/shared/theme/tokens';

/** Lo que pasó al apuntar: cuántas listas, y en cuántas era nuevo. */
export type ResultadoApuntar = { listas: number; nuevas: number };

type Props = {
  item: ItemDetail;
  /** Si ya se apuntó, lo que pasó; si no, se pregunta. */
  resultado: ResultadoApuntar | null;
  /** Apunta en las listas elegidas. Si falla, lanza: el error se enseña aquí. */
  onApuntar: (listaIds: string[]) => Promise<void>;
  onClose: () => void;
};

/**
 * «Se te ha acabado X»: apuntarlo en la lista, o en las listas, que se elijan.
 *
 * Con una sola lista no hay nada que elegir y se pregunta como siempre; con varias
 * salen todas con su casilla y la principal marcada, de modo que quien no toca nada
 * apunta donde siempre. Apuntar AÑADE la línea a cada lista elegida: no es una
 * recomendación (eso son las sugerencias de «Se te acabó», dentro de la lista).
 */
export function HojaApuntar({ item, resultado, onApuntar, onClose }: Props) {
  const styles = useStyles();
  const { listas, elegidas, alternar, cargando, error: errorListas } = useListasElegidas(item.household_id);
  const [apuntando, setApuntando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const variasListas = listas.length > 1;

  async function apuntar() {
    setApuntando(true);
    setError(null);
    try {
      await onApuntar(elegidas);
    } catch (caught) {
      setError(describeDbError(caught));
    } finally {
      setApuntando(false);
    }
  }

  const titulo = resultado
    ? resultado.nuevas > 0
      ? resultado.listas === 1
        ? 'Apuntado en la lista'
        : `Apuntado en ${resultado.listas} listas`
      : resultado.listas === 1
        ? 'Ya estaba en la lista'
        : 'Ya estaba en esas listas'
    : variasListas
      ? '¿En qué lista lo apunto?'
      : '¿Lo apunto en la lista?';

  return (
    <HojaInferior visible onClose={onClose} titulo={titulo}>
      <Text style={styles.texto}>
        {resultado
          ? `«${item.name}» está en ${resultado.listas === 1 ? 'la lista' : 'las listas'} de la compra.`
          : `Se te ha acabado «${item.name}».${variasListas ? ' Elige dónde apuntarlo.' : ''}`}
      </Text>

      {resultado ? (
        <Button label="Vale" onPress={onClose} />
      ) : (
        <>
          {cargando ? <CargandoListas /> : null}
          {variasListas ? <ElegirListas listas={listas} elegidas={elegidas} onAlternar={alternar} /> : null}
          <ErrorNote message={error ?? errorListas} />
          <View style={styles.botones}>
            <Button
              label={elegidas.length > 1 ? `Apuntarlo en ${elegidas.length} listas` : 'Apuntarlo'}
              onPress={() => void apuntar()}
              loading={apuntando}
              disabled={cargando || elegidas.length === 0}
            />
            <Button label="Ahora no" variant="quiet" onPress={onClose} disabled={apuntando} />
          </View>
        </>
      )}
    </HojaInferior>
  );
}

const useStyles = makeStyles((c) => ({
  texto: { fontSize: 15, lineHeight: 22, color: c.inkMuted },
  botones: { gap: 4 },
}));
