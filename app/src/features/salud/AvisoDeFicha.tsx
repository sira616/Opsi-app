import type { SaludProducto } from '@/shared/lib/salud';
import { AvisoSalud } from '@/shared/ui/AvisoSalud';
import { ErrorNote } from '@/shared/ui/ErrorNote';

import { useAvisoSalud } from './useSalud';

/**
 * El aviso de salud de un producto a partir de su ficha, con las preferencias de la
 * persona ya cruzadas. `undefined` es «aún cargando»: no se pinta nada.
 *
 * Si las preferencias no se pudieron leer, se dice con el mensaje del servidor: una
 * pantalla sin marcas porque falló la lectura no puede parecer una pantalla sin avisos.
 *
 * Es el aviso de antes de guardar y del detalle. Las filas del inventario no pasan por
 * aquí: la pantalla calcula todas de una vez (ver `inventario.tsx`).
 */
export function AvisoDeFicha({
  ficha,
  atribuir,
}: {
  ficha: SaludProducto | null | undefined;
  atribuir?: boolean;
}) {
  const { evaluacion, error } = useAvisoSalud(ficha);
  return (
    <>
      <ErrorNote message={error} />
      {evaluacion ? <AvisoSalud evaluacion={evaluacion} atribuir={atribuir} /> : null}
    </>
  );
}
