import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { At, CheckCircle, Key, PaperPlaneTilt, UserCircle } from 'phosphor-react-native';

import {
  cambiarContrasena,
  cambiarCorreo,
  fetchMiCorreo,
  reenviarConfirmacion,
} from '@/api/cuenta';
import { describeAuthError } from '@/shared/lib/auth-errors';
import { queryKeys } from '@/shared/lib/query';
import { useSession } from '@/shared/lib/session';
import { CONTRASENA_MIN } from '@/shared/lib/usuario';
import {
  fonts,
  makeStyles,
  radius,
  space,
  touchTarget,
  useTheme,
  useType,
} from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Info } from '@/shared/ui/Info';
import { TextField } from '@/shared/ui/TextField';
import { Accion, Bloque, Row, Section, useAjustesStyles } from './ui';

/**
 * Con qué entras: usuario, correo y contraseña. Y la puerta de salida.
 *
 * Borrar la cuenta NO está aquí: vive en «Privacidad y datos», junto a lo demás
 * que decide qué pasa con tus datos. Aquí solo está lo que sirve para entrar.
 */
export function SeccionCuenta({ username }: { username: string }) {
  const styles = useStyles();
  const compartidos = useAjustesStyles();
  const c = useTheme();
  const { signOut } = useSession();

  return (
    <Section title="Cuenta">
      <Row
        title="Usuario"
        subtitle="Es con lo que entras y no se puede cambiar."
        right={
          <View style={styles.usuario}>
            <UserCircle size={17} color={c.brand} weight="duotone" />
            <Text style={styles.usuarioText}>{username}</Text>
          </View>
        }
      />

      <BloqueCorreo />
      <BloqueContrasena />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cerrar sesión"
        onPress={() => void signOut()}
        style={({ pressed }) => [styles.salir, pressed && compartidos.pressed]}
      >
        <Text style={styles.salirText}>Cerrar sesión</Text>
      </Pressable>
    </Section>
  );
}

/**
 * El correo, que aquí es opcional y sirve para una sola cosa: poder recuperar
 * la contraseña. Al registrarse no se pide, así que esta es la única puerta.
 */
function BloqueCorreo() {
  const styles = useStyles();
  const compartidos = useAjustesStyles();
  const t = useType();
  const c = useTheme();
  const queryClient = useQueryClient();
  const { session } = useSession();

  const [abierto, setAbierto] = useState(false);
  const [correo, setCorreo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actual = useQuery({ queryKey: queryKeys.correo, queryFn: fetchMiCorreo });

  // Un cambio pedido y aún sin confirmar vive en el token, no en auth.users:
  // por eso sale de la sesión y no de mi_correo().
  const pendiente = session?.user.new_email ?? null;

  const guardar = useMutation({
    mutationFn: cambiarCorreo,
    async onSuccess(_void, enviado: string) {
      setError(null);
      setAbierto(false);
      setCorreo('');
      setAviso(
        `Te he mandado un enlace a ${enviado}. Hasta que lo abras sigues entrando con tu usuario.`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.correo });
    },
    onError(caught: unknown) {
      setError(describeAuthError(caught));
    },
  });

  const reenviar = useMutation({
    mutationFn: reenviarConfirmacion,
    onSuccess() {
      setError(null);
      setAviso('Enlace reenviado. Mira también en spam.');
    },
    onError(caught: unknown) {
      setError(describeAuthError(caught));
    },
  });

  const confirmado = actual.data ?? null;
  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());

  return (
    <Bloque>
      <Row
        title="Correo"
        subtitle={
          confirmado
            ? 'Confirmado. Con él puedes recuperar la contraseña si la olvidas.'
            : 'Sin correo no hay forma de recuperar la contraseña. Es lo único para lo que se usa.'
        }
        right={
          confirmado ? (
            <CheckCircle size={19} color={c.brand} weight="fill" />
          ) : (
            <At size={19} color={c.inkFaint} weight="duotone" />
          )
        }
      />

      {confirmado ? <Text style={compartidos.valor}>{confirmado}</Text> : null}

      {pendiente ? (
        <View style={styles.pendiente}>
          <PaperPlaneTilt size={15} color={c.inkMuted} weight="duotone" />
          <Text style={styles.pendienteText}>Falta confirmar {pendiente}</Text>
          <Info
            titulo="Falta confirmar"
            texto="El correo anterior sigue valiendo hasta que confirmes el nuevo."
          />
        </View>
      ) : null}

      {abierto ? (
        <View style={compartidos.form}>
          <TextField
            label={confirmado ? 'Correo nuevo' : 'Tu correo'}
            value={correo}
            onChangeText={setCorreo}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
          />
          <Button
            label="Mandar el enlace"
            onPress={() => guardar.mutate(correo)}
            loading={guardar.isPending}
            disabled={!valido}
          />
        </View>
      ) : (
        <View style={compartidos.acciones}>
          <Accion
            label={confirmado ? 'Cambiar el correo' : 'Añadir un correo'}
            onPress={() => {
              setAviso(null);
              setError(null);
              setAbierto(true);
            }}
          />
          {pendiente ? (
            <Accion
              label={reenviar.isPending ? 'Reenviando…' : 'Reenviar el enlace'}
              onPress={() => reenviar.mutate(pendiente)}
            />
          ) : null}
        </View>
      )}

      {aviso ? <Text style={t.caption}>{aviso}</Text> : null}
      <ErrorNote message={error} />
    </Bloque>
  );
}

/**
 * Cambiar la contraseña estando dentro.
 *
 * No se pide la actual: GoTrue no la comprueba en este camino, y un campo que
 * acepta cualquier cosa da una sensación de seguridad que no existe. Lo que
 * protege de verdad es hacer falta una sesión válida.
 */
function BloqueContrasena() {
  const compartidos = useAjustesStyles();
  const t = useType();
  const c = useTheme();

  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const corta = nueva.length > 0 && nueva.length < CONTRASENA_MIN;
  const distintas = repetida.length > 0 && nueva !== repetida;
  const puede = nueva.length >= CONTRASENA_MIN && nueva === repetida;

  const guardar = useMutation({
    mutationFn: cambiarContrasena,
    onSuccess() {
      setError(null);
      setAbierto(false);
      setNueva('');
      setRepetida('');
      setAviso('Contraseña cambiada. La sesión sigue abierta.');
    },
    onError(caught: unknown) {
      setError(describeAuthError(caught));
    },
  });

  return (
    <Bloque>
      <Row
        title="Contraseña"
        subtitle={`Mínimo ${CONTRASENA_MIN} caracteres. Larga vale más que complicada.`}
        right={<Key size={19} color={c.inkFaint} weight="duotone" />}
      />

      {abierto ? (
        <View style={compartidos.form}>
          <TextField
            label="Contraseña nueva"
            hint={corta ? `Te faltan ${CONTRASENA_MIN - nueva.length} caracteres` : undefined}
            value={nueva}
            onChangeText={setNueva}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <TextField
            label="Otra vez"
            hint={distintas ? 'No coinciden' : undefined}
            value={repetida}
            onChangeText={setRepetida}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Button
            label="Cambiar la contraseña"
            onPress={() => guardar.mutate(nueva)}
            loading={guardar.isPending}
            disabled={!puede}
          />
        </View>
      ) : (
        <View style={compartidos.acciones}>
          <Accion
            label="Cambiar la contraseña"
            onPress={() => {
              setAviso(null);
              setError(null);
              setAbierto(true);
            }}
          />
        </View>
      )}

      {aviso ? <Text style={t.caption}>{aviso}</Text> : null}
      <ErrorNote message={error} />
    </Bloque>
  );
}

const useStyles = makeStyles((c) => ({
  usuario: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  usuarioText: { fontFamily: fonts.semibold, fontSize: 15, color: c.brandInk },

  pendiente: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.sm + 2,
    padding: space.sm,
  },
  pendienteText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: c.ink },

  salir: {
    minHeight: touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  salirText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
}));
