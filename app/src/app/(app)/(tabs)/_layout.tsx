import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '@/shared/theme/tokens';

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
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.inkMuted,
        tabBarStyle: {
          backgroundColor: colors.ground,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="inventario"
        options={{
          title: 'Inventario',
          tabBarIcon: ({ color, size }) => <Feather name="box" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="lista"
        options={{
          title: 'Lista',
          tabBarIcon: ({ color, size }) => <Feather name="list" size={size - 2} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Opsi',
          tabBarIcon: ({ color, size }) => (
            <Feather name="message-circle" size={size - 2} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ajustes"
        options={{
          title: 'Ajustes',
          tabBarIcon: ({ color, size }) => <Feather name="settings" size={size - 2} color={color} />,
        }}
      />
    </Tabs>
  );
}
