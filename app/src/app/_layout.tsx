import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { queryClient } from '@/shared/lib/query';
import { SessionProvider } from '@/shared/lib/session';
import { colors } from '@/shared/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.ground },
            }}
          />
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
