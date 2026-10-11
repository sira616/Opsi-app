import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PaperPlaneTilt, UserPlus } from 'phosphor-react-native';

import { invitar, type ResultadoInvitacion } from '@/api/household';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { esUsuarioValido, motivoUsuarioInvalido, normalizarUsuario } from '@/shared/lib/usuario';
import { fonts, makeStyles, space, useTheme } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Info } from '@/shared/ui/Info';
import { TextField } from '@/shared/ui/TextField';
import { Nota, useAjustesStyles } from '../ui';

type Props = {
  neveraId: string;
  hayPlaza: boolean;
  limite: number | null;
  miNombre: string | null;
};

/**
 * Invitar a alguien escribiendo su nombre de usuario.
 *
 * ── Por qué el mensaje sale tal cual del servidor ─────────────────────────
 *
 * `invite_to_household` no lanza excepción cuando el fallo depende de la otra
 * cuenta: devuelve un `outcome` y una frase ya escrita en español. Esa frase se
 * pinta SIN TOCARLA. Está redactada para no delatar más de la cuenta, y en este
 * proyecto ya hay tres casos documentados de un mensaje útil del servidor
 * sustituido por un texto genérico de la app. Aquí lo único que decide la app
 * es el icono que la acompaña.
 *
 * ── Y por qué se valida el formato antes de enviar ────────────────────────
 *
 * No es desconfiar del servidor —también lo comprueba—, es que solo hay cinco
 * intentos por hora. Gastar uno en un nombre con un espacio de más es tirar el
 * 20 % del margen de esa hora.
 *
 * ── Qué es lo que se ve ───────────────────────────────────────────────────
 *
 * Una cabecera con su icono, el campo y un botón con su avión de papel. Lo que
 * explica cómo funciona —cuánta gente cabe, qué le llega a la otra persona— está
 * detrás de la «i» de la cabecera, no en un párrafo encima del campo.
 */
export function Invitar({ neveraId, hayPlaza, limite, miNombre }: Props) {
  const compartidos = useAjustesStyles();
  const styles = useStyles();
  const c = useTheme();
  const queryClient = useQueryClient();

  const [nombre, setNombre] = useState('');
  const [resultado, setResultado] = useState<ResultadoInvitacion | null>(null);
  const [error, setError] = useState<string | null>(null);

  const limpio = normalizarUsuario(nombre);
  const esMio = miNombre !== null && limpio === miNombre;
  const motivo = motivoUsuarioInvalido(limpio);
  const puede = esUsuarioValido(limpio) && !esMio;

  const enviar = useMutation({
    mutationFn: (usuario: string) => invitar(neveraId, usuario),
    async onSuccess(res) {
      setError(null);
      setResultado(res);
      if (res.outcome === 'creada') setNombre('');
      // Aunque no se haya creado nada, alguna puede haber caducado por el
      // camino: `invite_to_household` pasa el trapo a las vencidas.
      await queryClient.invalidateQueries({ queryKey: queryKeys.invitacionesEnviadas(neveraId) });
    },
    onError(caught: unknown) {
      setResultado(null);
      setError(describeDbError(caught));
    },
  });

  if (!hayPlaza) {
    return (
      <Nota
        tono="aviso"
        texto={
          limite === null
            ? 'No sé cuántas plazas tiene esta nevera. Sal de Ajustes y vuelve a entrar.'
            : `No queda plaza: caben ${limite}, contando las invitaciones sin responder. Cancela una o saca a alguien.`
        }
      />
    );
  }

  return (
    <View style={compartidos.form}>
      <View style={styles.cabecera}>
        <View style={styles.icono}>
          <UserPlus size={20} color={c.brandInk} weight="duotone" />
        </View>
        <Text style={styles.titulo}>Invita a alguien</Text>
        <Info
          titulo="Invitar"
          texto={[
            'Escribe su nombre de usuario. Le llegará un aviso en el inicio y podrá aceptar o rechazar.',
            limite !== null
              ? `Caben ${limite} personas en esta nevera, contando las invitaciones que aún no han contestado.`
              : 'Las invitaciones sin responder también ocupan plaza.',
          ]}
        />
      </View>

      <TextField
        label="Su nombre de usuario"
        hint={esMio ? 'Ese es tu nombre: ya estás dentro.' : (motivo ?? undefined)}
        value={nombre}
        onChangeText={(texto) => {
          setNombre(texto);
          setResultado(null);
          setError(null);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        maxLength={20}
        returnKeyType="send"
        onSubmitEditing={() => {
          if (puede && !enviar.isPending) enviar.mutate(limpio);
        }}
      />

      <Button
        label="Invitar"
        icon={<PaperPlaneTilt size={18} color={c.onBrand} weight="fill" />}
        onPress={() => enviar.mutate(limpio)}
        loading={enviar.isPending}
        disabled={!puede}
      />

      {resultado ? (
        <Nota alerta tono={resultado.outcome === 'creada' ? 'bien' : 'aviso'} texto={resultado.message} />
      ) : null}
      <ErrorNote message={error} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  icono: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  titulo: { flex: 1, fontFamily: fonts.semibold, fontSize: 16, color: c.ink },
}));
