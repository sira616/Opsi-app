import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { sacarMiembro, traspasarHogar, type Miembro } from '@/api/household';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { fonts, makeStyles, space, useType } from '@/shared/theme/tokens';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Etiqueta } from '../ui';

type Props = {
  neveraId: string;
  miembros: Miembro[];
  miId: string | null;
  soyQuienLleva: boolean;
};

/**
 * Quién está dentro, con su papel.
 *
 * Las acciones de mando —traspasar y sacar— solo se pintan si de verdad las
 * tienes: el servidor las rechaza con un 42501 y ese código es el único que la
 * app traduce por un texto genérico, así que un botón de más aquí se convierte
 * en un error que no explica nada.
 */
export function Miembros({ neveraId, miembros, miId, soyQuienLleva }: Props) {
  const styles = useStyles();
  const t = useType();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  async function recargarMiembros() {
    setError(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.miembros(neveraId) });
  }

  const sacar = useMutation({
    mutationFn: (userId: string) => sacarMiembro(neveraId, userId),
    onSuccess: recargarMiembros,
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  const traspasar = useMutation({
    mutationFn: (userId: string) => traspasarHogar(neveraId, userId),
    onSuccess: recargarMiembros,
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  const ocupado = sacar.isPending || traspasar.isPending;

  return (
    <View style={styles.lista}>
      {miembros.map((miembro) => {
        const soyYo = miembro.user_id === miId;
        const mandaEsta = miembro.role === 'owner';
        const puedoActuarSobreElla = soyQuienLleva && !soyYo;

        return (
          <View key={miembro.user_id} style={styles.miembro}>
            <View style={styles.nombreFila}>
              <Text style={styles.nombre} numberOfLines={1}>
                {miembro.username}
              </Text>
              {soyYo ? <Etiqueta texto="Tú" fuerte /> : null}
              {mandaEsta ? <Etiqueta texto="Lleva la nevera" /> : null}
            </View>

            {puedoActuarSobreElla ? (
              <View style={styles.acciones}>
                <ConfirmAction
                  label="Pasarle la nevera"
                  confirmLabel="Sí, pasársela"
                  question={`¿Pasarle la nevera a ${miembro.username}? A partir de ahí invita y saca gente esa persona, no tú.`}
                  busy={ocupado}
                  onConfirm={() => traspasar.mutate(miembro.user_id)}
                />
                <ConfirmAction
                  label="Sacar de la nevera"
                  confirmLabel={`Sí, sacar a ${miembro.username}`}
                  question={`¿Sacar a ${miembro.username}? Empezará con una nevera vacía y lo que hay guardado aquí se queda aquí.`}
                  busy={ocupado}
                  danger
                  onConfirm={() => sacar.mutate(miembro.user_id)}
                />
              </View>
            ) : null}
          </View>
        );
      })}

      {miembros.length === 1 ? (
        <Text style={t.caption}>Ahora mismo estás tú y nadie más.</Text>
      ) : null}

      <ErrorNote message={error} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  lista: { gap: space.md },
  miembro: { gap: space.sm },
  nombreFila: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  nombre: { fontFamily: fonts.semibold, fontSize: 15, color: c.ink },
  acciones: { gap: space.sm },
}));
