import { ShoppingCart } from 'phosphor-react-native';

import { Proximamente } from '@/shared/ui/Proximamente';
import { useTheme } from '@/shared/theme/tokens';

export default function Lista() {
  const c = useTheme();
  return (
    <Proximamente
      icon={<ShoppingCart size={28} color={c.brand} weight="duotone" />}
      title="Lista de la compra"
      phase="Fase 4"
      what="Apuntar lo que falta, marcarlo como comprado y que entre al inventario de una vez. Cuando algo se acabe te preguntaré si lo apunto; nunca lo haré por mi cuenta."
      ready="Los permisos ya están puestos desde la fase 0, así que cuando llegue no hay que volver a tocar la seguridad."
    />
  );
}
