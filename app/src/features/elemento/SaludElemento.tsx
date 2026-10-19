import { View } from 'react-native';

import type { ItemDetail } from '@/api/inventory';
import { AccesoIngredientes } from '@/features/salud/Ingredientes';
import { useAvisoSalud, useFichaSalud } from '@/features/salud/useSalud';
import { lineasDeAviso } from '@/shared/lib/salud';
import { AvisoSalud } from '@/shared/ui/AvisoSalud';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { space } from '@/shared/theme/tokens';

/**
 * Lo que este elemento lleva de lo que la persona evita, en el detalle.
 *
 * Aviso completo —con «Según Open Food Facts» cuando lo hay— y, debajo, el acceso a los
 * ingredientes para comprobarlo. Sale antes de las acciones: es lo que conviene saber
 * antes de usar el alimento. Solo avisa; ninguna acción de abajo se toca por esto.
 *
 * Sin preferencias, o con la ficha completa y nada que avisar, no pinta nada (ni un hueco):
 * la ausencia de marca no se anuncia como «todo bien». Algo escrito a mano no tiene ficha
 * y cuenta como «sin datos», que es lo que dice. Un elemento ya cerrado ni se mira: no se
 * va a comer.
 *
 * La ficha se pide con la misma consulta que `FichaProducto` (misma clave): una sola ida
 * y vuelta para las dos.
 */
export function SaludElemento({ item }: { item: ItemDetail }) {
  const productoId = item.product_id;
  const ficha = useFichaSalud(productoId);
  const { evaluacion, error } = useAvisoSalud(ficha);

  const hayAviso = evaluacion !== null && lineasDeAviso(evaluacion).length > 0;
  const conIngredientes = ficha?.deOff === true && productoId !== null;

  return (
    <>
      <ErrorNote message={error} />
      {hayAviso ? (
        <View style={{ gap: space.xs }}>
          <AvisoSalud evaluacion={evaluacion} />
          {conIngredientes ? <AccesoIngredientes productoId={productoId} /> : null}
        </View>
      ) : null}
    </>
  );
}
