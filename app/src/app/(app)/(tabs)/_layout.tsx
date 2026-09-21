import { Tabs } from 'expo-router';
import { Basket, ChatCircleDots, GearSix, ListChecks } from 'phosphor-react-native';
import { useTheme } from '@/shared/theme/tokens';

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
export default function TabsLayout() {
  const c = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.inkMuted,
        tabBarStyle: {
          backgroundColor: c.ground,
          borderTopColor: c.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
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
