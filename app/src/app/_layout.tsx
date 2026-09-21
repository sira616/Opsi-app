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
 * El alta y el detalle se presentan como HOJA MODAL: suben desde abajo, dejan
 * ver el inventario detrás y se cierran arrastrando. Son cosas que se abren y
 * se cierran, no sitios donde estar, y esa diferencia se nota al usarlas.
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
      >
        <Stack.Screen name="(app)/(tabs)" />
        <Stack.Screen
          name="(app)/alta"
          options={{
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.92],
            sheetCornerRadius: 24,
          }}
        />
        <Stack.Screen
          name="(app)/elemento/[id]"
          options={{
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.92],
            sheetCornerRadius: 24,
          }}
        />
      </Stack>
    </>
  );
}
