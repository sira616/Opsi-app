import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  cancelarInvitacion,
  type EstadoInvitacion,
  type InvitacionEnviada,
} from '@/api/household';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { fonts, makeStyles, space, useType } from '@/shared/theme/tokens';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Accion, Inicial } from '../ui';
import { estaViva, plazoCorto } from './datos';

/**
 * En qué quedó cada invitación.
 *
 * «Sin responder a tiempo» y «Rechazada» son cosas distintas y se dicen
 * distintas: a una no le contestó nadie y a la otra le dijeron que no. Ese
 * matiz es justo el que el historial existe para contar.
 */
function comoQuedo(estado: EstadoInvitacion): string {
  switch (estado) {
    case 'pending':
      return 'Sin responder';
    case 'accepted':
      return 'Aceptada';
    case 'rejected':
      return 'Rechazada';
    case 'cancelled':
      return 'Cancelada';
    case 'expired':
      return 'Sin responder a tiempo';
  }
}

type Props = {
  neveraId: string;
  enviadas: InvitacionEnviada[];
  /** Cancelar es cosa de quien lleva la nevera; el resto solo mira. */
  soyQuienLleva: boolean;
};

export function InvitacionesEnviadas({ neveraId, enviadas, soyQuienLleva }: Props) {
  const styles = useStyles();
  const t = useType();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const cancelar = useMutation({
    mutationFn: cancelarInvitacion,
    async onSuccess() {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.invitacionesEnviadas(neveraId) });
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  if (enviadas.length === 0) return null;

  return (
    <View style={styles.lista}>
      <Text style={t.label}>Invitaciones de esta nevera</Text>

      {enviadas.map((inv) => {
        const viva = estaViva(inv);
        return (
          <View key={inv.id} style={styles.fila}>
            <Inicial nombre={inv.invitee_username} size={34} />
            <View style={styles.texto}>
              <Text style={styles.nombre} numberOfLines={1}>
                {inv.invitee_username}
              </Text>
              <Text style={t.caption}>
                {viva
                  ? `Sin responder · ${plazoCorto(inv.expires_at)}`
                  : // Una pendiente con el plazo vencido sigue diciendo
                    // 'pending' hasta que alguien vuelve a invitar: el
                    // servidor las marca de pasada, no con un reloj. Aquí se
                    // llama por lo que es, no por lo que dice la columna.
                    comoQuedo(inv.status === 'pending' ? 'expired' : inv.status)}
              </Text>
            </View>
            {viva && soyQuienLleva ? (
              <Accion
                label="Cancelar"
                disabled={cancelar.isPending}
                onPress={() => cancelar.mutate(inv.id)}
              />
            ) : null}
          </View>
        );
      })}

      <ErrorNote message={error} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  lista: { gap: space.sm },
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  texto: { flex: 1, gap: 2 },
  nombre: { fontFamily: fonts.semibold, fontSize: 14.5, color: c.ink },
}));
