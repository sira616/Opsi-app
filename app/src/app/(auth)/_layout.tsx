import { Redirect, Stack } from 'expo-router';

import { useSession } from '@/lib/session';

/** Con sesión no se ve el login: te lleva al inventario. */
export default function AuthLayout() {
  const { session, loading } = useSession();

  if (loading) return null;
  if (session) return <Redirect href="/inventario" />;

  return <Stack screenOptions={{ headerShown: false }} />;
}
