import { Redirect, Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { NeveraActivaProvider, useNeveraActiva } from '@/features/neveras/NeveraActiva';
import { alturaHojaSelector } from '@/features/neveras/SelectorNevera';
import { describeDbError } from '@/shared/lib/db-errors';
import { useSession } from '@/shared/lib/session';
import { Button } from '@/shared/ui/Button';
import { makeStyles, space, useTheme, useType } from '@/shared/theme/tokens';

/**
 * La protección de verdad no está aquí: está en la RLS de la base de datos.
 * Esto solo evita enseñar pantallas vacías a quien no ha entrado. Si alguien
 * se saltara este layout, seguiría sin poder leer una sola fila.
 *
 * El proveedor de la nevera activa envuelve al `Stack` y no al revés, porque
 * es lo que decide si hay algo que enseñar: sin lista de neveras no se sabe ni
 * qué inventario pedir. Va con `key` por persona, para que un cambio de cuenta
 * lo monte de cero en lugar de arrastrar la elección de la anterior.
 */
export default function AppLayout() {
  const { session, loading } = useSession();

  if (loading) return null;
  if (!session) return <Redirect href="/entrar" />;

  return (
    <NeveraActivaProvider key={session.user.id}>
      <Puerta />
    </NeveraActivaProvider>
  );
}

/**
 * Deja pasar solo cuando se sabe en qué nevera se está, y monta las pantallas.
 *
 * La comprobación es la misma de siempre, ahora con `my_households()` en lugar
 * del hogar único: si la lista llega vacía, la sesión apunta a alguien que ya
 * no existe (ver SesionHuerfana); si no llega, es un fallo de red (ver
 * NoConecta). Detrás de esta puerta, `useNeveraActual()` nunca devuelve null.
 *
 * Aquí SÍ se declaran las hojas modales, porque es este Stack el que tiene por
 * hijas a `(tabs)`, `alta`, `elemento/[id]`, `cambiar-nevera` y las de
 * `nevera/`. Declararlas en el layout raíz no hacía nada: desde allí solo
 * existe `(app)` entera.
 */
function Puerta() {
  const { neveras, activa, cargando, error, reintentar } = useNeveraActiva();
  const { height } = useWindowDimensions();

  if (cargando) return <Cargando />;

  // Un fallo de red NO es una sesión huérfana. Confundirlos mandaría a cerrar
  // sesión a quien solo tiene el servidor apagado, y perdería su sesión buena.
  if (error) return <NoConecta mensaje={describeDbError(error)} onReintentar={reintentar} />;

  if (!activa) return <SesionHuerfana />;

  // Sin `as const`: con él, el array de alturas queda de solo lectura y el
  // tipo de las opciones de navegación no lo admite.
  const hoja: ComponentProps<typeof Stack.Screen>['options'] = {
    presentation: 'formSheet',
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.92],
    sheetCornerRadius: 24,
  };

  // El selector no necesita casi toda la pantalla: mide lo que la lista pide,
  // con un mínimo para que una sola nevera no deje una hoja ridícula y un
  // máximo que es el de las demás hojas.
  const hojaSelector: ComponentProps<typeof Stack.Screen>['options'] = {
    ...hoja,
    sheetAllowedDetents: [Math.min(0.92, Math.max(0.4, alturaHojaSelector(neveras.length) / height))],
  };

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="alta" options={hoja} />
      <Stack.Screen name="elemento/[id]" options={hoja} />
      <Stack.Screen name="cambiar-nevera" options={hojaSelector} />
      <Stack.Screen name="nevera/nueva" options={hoja} />
      <Stack.Screen name="nevera/[id]/editar" options={hoja} />
    </Stack>
  );
}

function Cargando() {
  const c = useTheme();
  const styles = useStyles();

  return (
    <View style={styles.centro}>
      <ActivityIndicator color={c.brand} />
    </View>
  );
}

function NoConecta({ mensaje, onReintentar }: { mensaje: string; onReintentar: () => void }) {
  const t = useType();
  const styles = useStyles();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.contenido}>
        <Text style={t.title}>Sin conexión</Text>
        <Text style={t.body}>{mensaje}</Text>
        <Button label="Reintentar" onPress={onReintentar} />
      </View>
    </SafeAreaView>
  );
}

/**
 * Tienes sesión pero tu usuario ya no está en la base de datos.
 *
 * Pasa constantemente en desarrollo y despista muchísimo: `npm run db:reset`
 * vacía también la tabla de usuarios, pero el token guardado en el móvil sigue
 * siendo válido —en local la clave de firma es fija— así que la app cree que
 * sigues dentro. A partir de ahí no tienes hogar, y todo falla de formas que no
 * se parecen a la causa: añadir comida dice «no tienes ningún hogar» y los
 * ajustes se quedan en blanco porque su fila tampoco existe.
 *
 * Detectarlo aquí, una vez, evita que cada pantalla tenga que adivinarlo.
 */
function SesionHuerfana() {
  const { signOut } = useSession();
  const t = useType();
  const styles = useStyles();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.contenido}>
        <Text style={t.title}>Tu sesión ya no vale</Text>
        <Text style={t.body}>
          Habías entrado con una cuenta que ya no está en la base de datos. Suele pasar
          después de reiniciarla con <Text style={styles.codigo}>npm run db:reset</Text>,
          que borra también los usuarios.
        </Text>
        <Text style={t.bodySmall}>
          Cierra sesión y crea la cuenta otra vez. Tarda 10 segundos y no se pierde nada que
          no se hubiera borrado ya.
        </Text>
        <Button label="Cerrar sesión" onPress={() => void signOut()} />
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.ground },
  contenido: { flex: 1, padding: space.xl, gap: space.lg, justifyContent: 'center' },
  codigo: { fontFamily: 'monospace', fontSize: 14, color: c.brandInk },
}));
