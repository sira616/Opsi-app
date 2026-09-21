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

export default function Entrar() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      // Sin navegación aquí: onAuthStateChange actualiza la sesión y el layout
      // de (auth) redirige solo. Navegar a mano dispararía dos veces.
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
            <Text style={font.title}>Entrar</Text>
            <Text style={styles.tagline}>
              Sabe lo que tienes. Sabe cuándo usarlo.
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
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              onSubmitEditing={onSubmit}
              returnKeyType="go"
            />

            <ErrorNote message={error} />

            <Button
              label="Entrar"
              onPress={onSubmit}
              loading={busy}
              disabled={!email || !password}
            />
          </View>

          <View style={styles.footer}>
            <Text style={font.bodySmall}>¿Todavía no tienes cuenta?</Text>
            <Link href="/crear-cuenta" style={styles.link}>
              Crear una
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
  tagline: { ...font.bodySmall, maxWidth: 280 },
  form: { gap: space.lg },
  footer: { flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 13, fontWeight: '600', color: colors.brand },
});
