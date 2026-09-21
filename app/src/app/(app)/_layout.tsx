import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/lib/session';

/**
 * La protección de verdad no está aquí: está en la RLS de la base de datos.
 * Esto solo evita enseñar pantallas vacías a quien no ha entrado. Si alguien
 * se saltara este layout, seguiría sin poder leer una sola fila.
 */
export default function AppLayout() {
  const { session, loading } = useSession();

  if (loading) return null;
  if (!session) return <Redirect href="/entrar" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
