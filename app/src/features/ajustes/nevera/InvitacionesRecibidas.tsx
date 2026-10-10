import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import {
  aceptarInvitacion,
  rechazarInvitacion,
  type InvitacionRecibida,
} from '@/api/household';
import { describeDbError } from '@/shared/lib/db-errors';
import { fonts, makeStyles, radius, space, useType } from '@/shared/theme/tokens';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Accion } from '../ui';
import { plazoLargo, useRecargarTodo } from './datos';

type Props = {
  recibidas: InvitacionRecibida[];
};

/**
 * Las invitaciones que me han mandado.
 *
 * Aceptar AÑADE una nevera a las tuyas: no te saca de ninguna y no toca lo que
 * tienes guardado. Lo único que lo frena es el tope de tu plan, y lo dice el
 * servidor con su propio mensaje, que aquí se enseña tal cual. Por eso la
 * confirmación cuenta lo que pasa de verdad —que aparece en tu selector— y no
 * un «¿Seguro?».
 *
 * Rechazar no pide confirmación: no cambia nada de lo tuyo, y quien invitó
 * puede volver a hacerlo.
 */
export function InvitacionesRecibidas({ recibidas }: Props) {
  const styles = useStyles();
  const t = useType();
  const recargarTodo = useRecargarTodo();
  const [error, setError] = useState<string | null>(null);

  const aceptar = useMutation({
    mutationFn: aceptarInvitacion,
    async onSuccess() {
      setError(null);
      await recargarTodo();
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  const rechazar = useMutation({
    mutationFn: rechazarInvitacion,
    async onSuccess() {
      setError(null);
      await recargarTodo();
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  if (recibidas.length === 0) return null;

  const ocupado = aceptar.isPending || rechazar.isPending;

  return (
    <View style={styles.lista}>
      <Text style={t.label}>Te han invitado</Text>

      {recibidas.map((inv) => (
        <View key={inv.id} style={styles.tarjeta}>
          <Text style={styles.titulo} numberOfLines={2}>
            {inv.household_name}
          </Text>
          <Text style={t.bodySmall}>
            Te invita {inv.inviter_username}. {plazoLargo(inv.expires_at)}
          </Text>

          <ConfirmAction
            label="Entrar"
            confirmLabel="Sí, entrar"
            question={`¿Entrar en «${inv.household_name}»? Se suma a tus neveras y puedes cambiar entre ellas cuando quieras. La tuya sigue como está.`}
            busy={ocupado}
            onConfirm={() => aceptar.mutate(inv.id)}
          />

          <Accion
            label="Rechazar"
            disabled={ocupado}
            onPress={() => rechazar.mutate(inv.id)}
          />
        </View>
      ))}

      <ErrorNote message={error} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  lista: { gap: space.sm },
  // El realce lo da el borde y no un relleno de marca: dentro va un
  // `ConfirmAction`, cuya caja de confirmación YA es de marca, y sobre un
  // fondo del mismo color desaparecería justo cuando hay que leerla.
  tarjeta: {
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.brand,
    backgroundColor: c.surface,
  },
  titulo: { fontFamily: fonts.displaySemi, fontSize: 17, color: c.brandInk },
}));
