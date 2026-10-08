import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { paletas, radius, space, touchTarget } from '@/shared/theme/tokens';

/**
 * Lo que se ve cuando una pantalla revienta al pintarse.
 *
 * Sin esto, un error de render en el cliente deja una pantalla en blanco (o, en
 * desarrollo, la caja roja de React Native, que enseña la pila entera): no hay
 * nada que hacer y no se sabe si se ha perdido algo. Aquí se dice qué ha pasado,
 * que lo guardado sigue en su sitio, y hay un botón que lo intenta de nuevo.
 *
 * ── Por qué no usa `useTheme()` ni `Button` ni las fuentes de la app ───────
 *
 * Es el último recurso, y tiene que funcionar justo cuando algo de lo demás ha
 * fallado: si lo que se rompió es el `ThemeProvider` o la carga de las fuentes,
 * un fallback que dependiera de ellos fallaría también y la persona volvería a la
 * pantalla en blanco. Por eso lee el esquema del sistema directamente, usa las
 * paletas como constantes (`paletas` no necesita proveedor) y la tipografía del
 * sistema, y pinta con `StyleSheet` sin hooks propios.
 *
 * ── Qué se enseña del error, y qué no ──────────────────────────────────────
 *
 * Al usuario, nada: ni el mensaje ni la pila. Eso es información sobre cómo está
 * hecha la app, y no le sirve a quien lo lee (§24 de la lista de seguridad:
 * «error genérico al cliente, detalle en logs»). En desarrollo (`__DEV__`) sí se
 * muestra el mensaje, porque quien programa lo necesita y no hay otro sitio donde
 * verlo cuando la app está en el móvil.
 *
 * Se engancha con `export { ErrorFatal as ErrorBoundary }` en el layout raíz, que
 * es como Expo Router busca el fallback de una ruta y de todo lo que cuelga de ella.
 */
export function ErrorFatal({ error, retry }: ErrorBoundaryProps) {
  const esquema = useColorScheme();
  const c = esquema === 'dark' ? paletas.oscuro : paletas.claro;

  return (
    <View style={[estilos.pantalla, { backgroundColor: c.ground }]}>
      <View style={estilos.contenido}>
        <Text accessibilityRole="header" style={[estilos.titulo, { color: c.ink }]}>
          Algo se ha roto
        </Text>
        <Text accessibilityRole="alert" style={[estilos.cuerpo, { color: c.inkMuted }]}>
          La app ha tenido un fallo y no ha podido seguir. Lo que tenías guardado sigue ahí.
        </Text>

        {__DEV__ ? (
          <View style={[estilos.dev, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Text style={[estilos.devEtiqueta, { color: c.inkMuted }]}>
              Solo en desarrollo
            </Text>
            <Text selectable style={[estilos.devTexto, { color: c.ink }]}>
              {error.message}
            </Text>
          </View>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reintentar"
          onPress={retry}
          style={({ pressed }) => [
            estilos.boton,
            { backgroundColor: c.brand },
            pressed && estilos.pulsado,
          ]}
        >
          <Text style={[estilos.botonTexto, { color: c.onBrand }]}>Reintentar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, justifyContent: 'center', padding: space.xl },
  contenido: { gap: space.md, maxWidth: 420, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 26, fontWeight: '700' },
  cuerpo: { fontSize: 16, lineHeight: 23 },
  dev: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.xs },
  devEtiqueta: { fontSize: 11.5, fontWeight: '600', textTransform: 'uppercase' },
  devTexto: { fontSize: 13, lineHeight: 18 },
  boton: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    marginTop: space.sm,
  },
  botonTexto: { fontSize: 16, fontWeight: '600' },
  pulsado: { opacity: 0.8 },
});
