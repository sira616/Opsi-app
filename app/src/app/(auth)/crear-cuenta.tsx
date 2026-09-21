import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TextField } from '@/shared/ui/TextField';
import { describeAuthError } from '@/shared/lib/auth-errors';
import { useSession } from '@/shared/lib/session';
import {
  CONTRASENA_MIN,
  esUsuarioValido,
  motivoUsuarioInvalido,
  normalizarUsuario,
  USUARIO_MAX,
} from '@/shared/lib/usuario';
import { fonts,makeStyles, space, useType } from '@/shared/theme/tokens';

const MIN_PASSWORD = CONTRASENA_MIN;

export default function CrearCuenta() {
  const styles = useStyles();
  const t = useType();
  const { signUp } = useSession();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const problemaUsuario = motivoUsuarioInvalido(usuario);

  async function onSubmit() {
    setError(null);

    // Se comprueba aquí además de en el servidor para no gastar un viaje de
    // red en decir algo que ya se sabe. El servidor sigue mandando.
    if (!esUsuarioValido(usuario)) {
      setError(problemaUsuario ?? 'Ese usuario no vale.');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }

    setBusy(true);
    try {
      await signUp(usuario, password);
    } catch (caught) {
      setError(describeAuthError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.wordmark}>Opsi</Text>
            <Text style={t.title}>Crear cuenta</Text>
            <Text style={styles.tagline}>
              Solo usuario y contraseña. El correo lo añades luego, en ajustes, si
              quieres poder recuperarla.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Usuario"
              hint={problemaUsuario ?? 'Letras sin acentos, números y guion bajo.'}
              value={usuario}
              onChangeText={(v) => setUsuario(normalizarUsuario(v))}
              autoCapitalize="none"
              autoComplete="username-new"
              autoCorrect={false}
              maxLength={USUARIO_MAX}
              textContentType="username"
              returnKeyType="next"
            />
            <TextField
              label="Contraseña"
              hint={
                tooShort
                  ? `Te faltan ${MIN_PASSWORD - password.length} caracteres`
                  : `Mínimo ${MIN_PASSWORD} caracteres. Larga vale más que complicada.`
              }
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={onSubmit}
              returnKeyType="go"
            />

            <ErrorNote message={error} />

            <Button
              label="Crear cuenta"
              onPress={onSubmit}
              loading={busy}
              disabled={!usuario || !password}
            />
          </View>

          <View style={styles.footer}>
            <Text style={t.bodySmall}>¿Ya tienes cuenta?</Text>
            <Link href="/entrar" style={styles.link}>
              Entrar
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space.xl, gap: space.xxl, justifyContent: 'center' },
  header: { gap: space.sm },
  wordmark: { fontSize: 21, fontWeight: '600', color: c.brand },
  tagline: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: c.inkMuted, maxWidth: 300 },
  form: { gap: space.lg },
  footer: { flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 13, fontWeight: '600', color: c.brand },
}));
