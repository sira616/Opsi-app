import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Basket, ChatCircleDots, GearSix, ListChecks } from 'phosphor-react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  barra,
  conAlpha,
  fonts,
  sombraFlotante,
  useAspecto,
  type Palette,
} from '@/shared/theme/tokens';

/**
 * Las cuatro secciones de Opsi.
 *
 * Dos de ellas están vacías a propósito: la lista de la compra es la fase 4 y
 * el chat la fase 5. Se dejan visibles desde ya porque la forma de la app no
 * debería cambiar cuando lleguen —mover una sección de sitio a mitad de
 * proyecto desorienta a quien ya se había acostumbrado—, y porque enseñan de
 * un vistazo hacia dónde va esto.
 *
 * El alta y el detalle NO son pestañas: se apilan encima, en el Stack del
 * layout de arriba. Son cosas que se abren y se cierran, no sitios donde estar.
 *
 * El `color as string` de abajo: el navegador tipa ese color como ColorValue,
 * que admite formas opacas de plataforma, y Phosphor espera una cadena. Aquí
 * siempre es un hex nuestro, de los screenOptions de más abajo.
 *
 * Los iconos van RELLENOS en la pestaña activa y en contorno en las demás. Es
 * el patrón de iOS de toda la vida, y solo se puede hacer con el mismo icono
 * —sin buscar un sustituto— porque Phosphor trae seis pesos del mismo dibujo.
 */
/**
 * El cuerpo de la píldora.
 *
 * Son dos capas, y cada una está donde está por un motivo:
 *
 *   · **Abajo, el color y la sombra.** La sombra tiene que ir en una vista con
 *     fondo —iOS no sabe calcularla sobre una transparente— y no puede llevar
 *     `overflow: hidden`, que la recortaría contra el borde de la píldora.
 *   · **Arriba, el desenfoque**, y ese sí se recorta a la forma.
 *
 * La translucidez es corta a propósito: el velo ya tapa la mayor parte de lo
 * que hay detrás, así que la barra se lee sólida y el desenfoque solo se nota
 * cuando algo pasa por debajo. Con más transparencia, el contraste de los
 * iconos pasaría a depender de lo que hubiera en la lista en ese momento, y
 * eso en esta app no se negocia.
 *
 * En Android no hay desenfoque: en tiempo real es caro y se nota en gama
 * media. Allí el velo sube a casi opaco y la barra se ve igual de bien.
 */
function FondoBarra({ c, oscuro }: { c: Palette; oscuro: boolean }) {
  const conDesenfoque = Platform.OS !== 'android';
  const velo = conDesenfoque ? (oscuro ? 0.68 : 0.7) : 0.97;

  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        estilos.cuerpo,
        { backgroundColor: conAlpha(c.surface, velo), borderColor: c.border },
        sombraFlotante(oscuro),
      ]}
    >
      {conDesenfoque ? (
        <BlurView
          intensity={oscuro ? 40 : 28}
          tint={oscuro ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFill, estilos.desenfoque]}
        />
      ) : null}
    </View>
  );
}

export default function TabsLayout() {
  const { colores: c, esquema } = useAspecto();
  const insets = useSafeAreaInsets();
  const oscuro = esquema === 'dark';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.inkMuted,
        // La barra flota sobre el contenido: es lo que permite que el
        // inventario se vea correr por debajo al desplazar.
        tabBarStyle: {
          position: 'absolute',
          // `start`/`end` mandan sobre `left`/`right` en React Native, y el
          // navegador ya los deja a 0. Hay que sobrescribir ESOS; poner solo
          // `left`/`right` deja la barra pegada a los bordes.
          start: barra.margen,
          end: barra.margen,
          left: barra.margen,
          right: barra.margen,
          bottom: insets.bottom + barra.margen,
          height: barra.alto,
          // El navegador mete el área segura DENTRO de la barra. Aquí ya está
          // contada en `bottom`, y sumarla otra vez empujaría los iconos hacia
          // arriba dentro de la píldora, descentrados.
          paddingTop: 0,
          paddingBottom: 0,
          paddingHorizontal: 0,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          // La sombra la pinta el fondo, que sí tiene color. Dejar aquí la
          // elevación de Android dibujaría un rectángulo bajo la píldora.
          elevation: 0,
        },
        tabBarBackground: () => <FondoBarra c={c} oscuro={oscuro} />,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
        // El realce del toque también es una píldora: cuadrado, se sale por
        // las esquinas redondas de la barra.
        tabBarItemStyle: { borderRadius: barra.radio },
      }}
    >
      <Tabs.Screen
        name="inventario"
        options={{
          title: 'Inventario',
            tabBarIcon: ({ color, size, focused }) => (
            <Basket size={size} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="lista"
        options={{
          title: 'Lista',
            tabBarIcon: ({ color, size, focused }) => (
            <ListChecks size={size} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Opsi',
            tabBarIcon: ({ color, size, focused }) => (
            <ChatCircleDots size={size} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: 'Ajustes',
            tabBarIcon: ({ color, size, focused }) => (
            <GearSix size={size} color={color as string} weight={focused ? 'fill' : 'regular'} />
          ),
        }}
      />
    </Tabs>
  );
}

const estilos = StyleSheet.create({
  cuerpo: {
    borderRadius: barra.radio,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // El desenfoque va recortado a la píldora; la capa de abajo NO puede
  // llevar este recorte porque se llevaría por delante la sombra.
  desenfoque: { borderRadius: barra.radio, overflow: 'hidden' },
});
