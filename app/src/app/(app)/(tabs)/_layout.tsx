import { BlurView } from 'expo-blur';
import { Tabs } from 'expo-router';
import { Basket, ChatCircleDots, GearSix, ListChecks } from 'phosphor-react-native';
import { Platform, StyleSheet, View } from 'react-native';
import { fonts, useAspecto } from '@/shared/theme/tokens';

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
 * El fondo de la barra.
 *
 * Cristal suave SOLO en iOS. En Android el desenfoque en tiempo real es caro y
 * se nota en gama media, así que ahí va un color casi opaco: la barra se ve
 * igual de bien y no cuesta fotogramas.
 *
 * Y una regla que no se salta: el desenfoque va DETRÁS de los iconos, nunca
 * sobre texto. La translucidez baja el contraste, y en esta app el contraste
 * no se negocia.
 */
function FondoBarra({ esquema, ground }: { esquema: 'light' | 'dark'; ground: string }) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView
        intensity={70}
        tint={esquema === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: ground, opacity: 0.97 }]} />
  );
}

export default function TabsLayout() {
  const { colores: c, esquema } = useAspecto();
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
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: c.border,
          backgroundColor: 'transparent',
          elevation: 0,
        },
        tabBarBackground: () => <FondoBarra esquema={esquema} ground={c.ground} />,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
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
