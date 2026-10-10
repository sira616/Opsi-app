import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TextField } from '@/shared/ui/TextField';
import { describeAuthError } from '@/shared/lib/auth-errors';
import { useSession } from '@/shared/lib/session';
import { normalizarUsuario } from '@/shared/lib/usuario';
import { fonts,makeStyles, space, useType } from '@/shared/theme/tokens';

export default function Entrar() {
  const styles = useStyles();
  const t = useType();
  const { signIn } = useSession();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(usuario, password);
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
            <Text style={t.title}>Entrar</Text>
            <Text style={styles.tagline}>
              Sé lo que tienes. Y cuándo usarlo.
            </Text>
          </View>

          <View style={styles.form}>
            <TextField
              label="Usuario"
              value={usuario}
              onChangeText={(v) => setUsuario(normalizarUsuario(v))}
              autoCapitalize="none"
              autoComplete="username"
              autoCorrect={false}
              textContentType="username"
              returnKeyType="next"
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
              disabled={!usuario || !password}
            />
          </View>

          <View style={styles.footer}>
            <Text style={t.bodySmall}>¿Todavía no tienes cuenta?</Text>
            <Link href="/crear-cuenta" style={styles.link}>
              Crear una
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
  tagline: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: c.inkMuted, maxWidth: 280 },
  form: { gap: space.lg },
  footer: { flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'center' },
  link: { fontSize: 13, fontWeight: '600', color: c.brand },
}));
