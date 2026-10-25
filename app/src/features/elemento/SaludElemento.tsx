import { View } from 'react-native';

import type { ItemDetail } from '@/api/inventory';
import { AccesoIngredientes } from '@/features/salud/Ingredientes';
import { useAvisoSalud, useFichaSalud } from '@/features/salud/useSalud';
import { lineasDeAviso } from '@/shared/lib/salud';
import { AvisoSalud } from '@/shared/ui/AvisoSalud';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { space } from '@/shared/theme/tokens';

/**
 * Lo que este elemento lleva de lo que la persona evita, y si hay aviso que enseñar.
 *
 * La ficha se pide con la misma consulta que `FichaProducto` (misma clave): una sola ida
 * y vuelta para los dos. Un elemento ya cerrado ni se mira: no se va a comer.
 */
function useSaludElemento(item: ItemDetail) {
  const productoId = item.product_id;
  const ficha = useFichaSalud(productoId);
  const { evaluacion, error } = useAvisoSalud(ficha);

  const abierto = item.state !== 'finished' && item.state !== 'discarded';
  const hayAviso = abierto && evaluacion !== null && lineasDeAviso(evaluacion).length > 0;
  const conIngredientes = ficha?.deOff === true && productoId !== null;

  return { productoId, evaluacion, error, hayAviso, conIngredientes };
}

/**
 * Si `SaludElemento` ya ofrece «Ver ingredientes» (hay aviso y el producto tiene ficha de
 * Open Food Facts). `FichaProducto` lo consulta para no poner el mismo botón otra vez más
 * abajo: con un aviso de alérgenos salía dos veces en la misma pantalla.
 */
export function useIngredientesEnAviso(item: ItemDetail): boolean {
  const { hayAviso, conIngredientes } = useSaludElemento(item);
  return hayAviso && conIngredientes;
}

/**
 * Lo que este elemento lleva de lo que la persona evita, en el detalle.
 *
 * Aviso completo —con «Según Open Food Facts» cuando lo hay— y, debajo, el acceso a los
 * ingredientes para comprobarlo. Sale antes de las acciones: es lo que conviene saber
 * antes de usar el alimento. Solo avisa; ninguna acción de abajo se toca por esto.
 *
 * Sin preferencias, o con la ficha completa y nada que avisar, no pinta nada (ni un hueco):
 * la ausencia de marca no se anuncia como «todo bien». Algo escrito a mano no tiene ficha
 * y cuenta como «sin datos», que es lo que dice.
 */
export function SaludElemento({ item }: { item: ItemDetail }) {
  const { productoId, evaluacion, error, hayAviso, conIngredientes } = useSaludElemento(item);

  return (
    <>
      <ErrorNote message={error} />
      {hayAviso && evaluacion ? (
        <View style={{ gap: space.xs }}>
          <AvisoSalud evaluacion={evaluacion} />
          {conIngredientes && productoId ? <AccesoIngredientes productoId={productoId} /> : null}
        </View>
      ) : null}
    </>
  );
}
