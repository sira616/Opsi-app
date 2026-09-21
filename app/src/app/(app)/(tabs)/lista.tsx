import { ShoppingCart } from 'phosphor-react-native';

import { colors } from '@/shared/theme/tokens';
import { Proximamente } from '@/shared/ui/Proximamente';

export default function Lista() {
  return (
    <Proximamente
      icon={<ShoppingCart size={28} color={colors.brand} weight="duotone" />}
      title="Lista de la compra"
      phase="Fase 4"
      what="Apuntar lo que falta, marcarlo como comprado y pasarlo al inventario de una vez. Al agotar algo, Opsi te preguntará si lo añade — preguntar, no añadirlo sola."
      ready="La tabla y sus permisos existen desde la fase 0, así que cuando llegue no hay que volver a tocar la seguridad."
    />
  );
}
