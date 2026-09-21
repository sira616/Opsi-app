import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { ErrorNote } from '@/components/ErrorNote';
import { TextField } from '@/components/TextField';
import { describeAuthError } from '@/lib/auth-errors';
import { useSession } from '@/lib/session';
import { colors, font, space } from '@/theme/tokens';

/** Fijado en supabase/config.toml (auth.minimum_password_length). */
const MIN_PASSWORD = 10;

export default function CrearCuenta() {
  const { signUp } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  async function onSubmit() {
    setError(null);

    // Se comprueba aquí además de en el servidor para no gastar un viaje de
    // red en decir algo que ya se sabe. El servidor sigue mandando.
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña necesita al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }

    setBusy(true);
    try {
      await signUp(email, password);
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
            <Text style={font.title}>Crear cuenta</Text>
            <Text style={styles.tagline}>
              Se crea tu casa automáticamente. Nadie más ve lo que guardes en ella.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Correo"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
              inputMode="email"
              textContentType="emailAddress"
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
              disabled={!email || !password}
            />
          </View>

          <View style={styles.footer}>
            <Text style={font.bodySmall}>¿Ya tienes cuenta?</Text>
            <Link href="/entrar" style={styles.link}>
              Entrar
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space.xl, gap: space.xxl, justifyContent: 'center' },
  header: { gap: space.sm },
  wordmark: { fontSize: 21, fontWeight: '600', color: colors.brand },
  tagline: { ...font.bodySmall, maxWidth: 300 },
  form: { gap: space.lg },
  footer: { flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 13, fontWeight: '600', color: colors.brand },
});
