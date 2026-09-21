import {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
} from '@expo-google-fonts/bricolage-grotesque';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/shared/lib/query';
import { SessionProvider } from '@/shared/lib/session';
import { ThemeProvider, useAspecto } from '@/shared/theme/tokens';

// La pantalla de carga se queda hasta que las fuentes están listas. Sin esto
// la app aparece con la tipografía del sistema y salta a la suya medio segundo
// después, que se ve como un parpadeo y parece un fallo.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });

  useEffect(() => {
    // También se esconde si las fuentes fallan: quedarse en la pantalla de
    // carga para siempre es peor que enseñar la app con la tipografía del
    // sistema.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <SessionProvider>
            <Navegacion />
          </SessionProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * La navegación va en su propio componente porque necesita el tema, y el tema
 * lo sirve un proveedor que está por encima: un hook no se puede llamar desde
 * el mismo componente que monta su proveedor.
 *
 * Aquí NO se declaran `alta` ni `elemento`. Desde la raíz solo existen tres
 * rutas —`index`, `(app)` y `(auth)`—, porque `(app)` tiene su propio layout y
 * se presenta como una sola. Declararlas aquí no daba error: simplemente no
 * hacía nada, y las hojas modales nunca llegaron a ser hojas. El aviso
 * «No route named … exists in nested children» decía exactamente eso.
 */
function Navegacion() {
  const { colores: c, esquema } = useAspecto();

  return (
    <>
      <StatusBar style={esquema === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.ground },
        }}
      />
    </>
  );
}
