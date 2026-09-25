import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { salirDelHogar } from '@/api/household';
import { describeDbError } from '@/shared/lib/db-errors';
import { makeStyles, space } from '@/shared/theme/tokens';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Nota } from '../ui';
import { useRecargarTodo } from './datos';

type Props = {
  neveraId: string;
  nombre: string;
  soyQuienLleva: boolean;
  cuantosSomos: number;
  /** Se llama en cuanto el servidor confirma, ANTES de recargar: la pantalla ya no tiene nevera. */
  onSalido: () => void;
};

/**
 * Salir de una nevera compartida. La privada no llega aquí: no se abandona.
 *
 * Tres situaciones, con su propio texto porque las consecuencias no se parecen:
 *
 *   · No la llevas → puedes salir. Lo guardado se queda ahí y tu privada sigue
 *     donde estaba: salir te quita ESTA nevera, no todas.
 *   · La llevas y hay más gente → no puedes: dejarla sin nadie al mando la
 *     dejaría sin dueño. Se explica aquí, en vez de dejar que el servidor
 *     rechace un botón que se ha pintado.
 *   · La llevas y estás solo → puedes salir, y es lo más serio de las tres. La
 *     nevera se queda sin nadie y su inventario deja de estar al alcance de
 *     nadie: no existe «borrar nevera», y sin esta salida una persona con una
 *     compartida que ya no usa no podría liberar su plaza del plan.
 *
 * Después de salir la pantalla vuelve atrás sin esperar a recargar: con la
 * nevera ya dejada, cualquier consulta sobre ella es un error que no
 * significa nada.
 */
export function SalirDeLaNevera({ neveraId, nombre, soyQuienLleva, cuantosSomos, onSalido }: Props) {
  const styles = useStyles();
  const recargarTodo = useRecargarTodo();
  const [error, setError] = useState<string | null>(null);

  const salir = useMutation({
    mutationFn: () => salirDelHogar(neveraId),
    async onSuccess() {
      setError(null);
      onSalido();
      await recargarTodo();
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  if (soyQuienLleva && cuantosSomos > 1) {
    return (
      <Nota texto="Llevas esta nevera, así que no puedes irte y dejarla sin nadie al mando. Pásasela antes a otra persona." />
    );
  }

  const sola = soyQuienLleva;

  return (
    <View style={styles.caja}>
      {sola ? (
        <Nota texto="Eres la única persona de esta nevera. Si ya no la usas, salir es la forma de liberar tu plaza." />
      ) : null}
      <ConfirmAction
        label={sola ? 'Salir y dejarla vacía' : 'Salir de la nevera'}
        confirmLabel="Sí, salir"
        question={
          sola
            ? `¿Salir de «${nombre}»? Se queda sin nadie y lo que hay guardado deja de estar a tu alcance. No se puede deshacer.`
            : `¿Salir de «${nombre}»? Lo guardado se queda ahí y dejas de verla. Tu nevera sigue como está. Para volver, tendrían que invitarte otra vez.`
        }
        danger
        busy={salir.isPending}
        onConfirm={() => salir.mutate()}
      />
      <ErrorNote message={error} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  caja: { gap: space.sm },
}));
