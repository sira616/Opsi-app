import { BowlSteam } from 'phosphor-react-native';

import { Proximamente } from '@/shared/ui/Proximamente';
import { useTheme } from '@/shared/theme/tokens';

export default function Chat() {
  const c = useTheme();
  return (
    <Proximamente
      icon={<BowlSteam size={28} color={c.brand} weight="duotone" />}
      title="Opsi"
      phase="Fase 5"
      what="Preguntarle qué cenar con lo que hay, y que te lo marque como gastado cuando lo termines. Con acceso real al inventario, no adivinando."
      ready="Las seis acciones que usará ya están hechas y probadas. Opsi llamará a las mismas funciones que tú, con tu sesión, así que no podrá tocar nada que tú no puedas."
    />
  );
}
