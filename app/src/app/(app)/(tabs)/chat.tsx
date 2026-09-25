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
      what="Preguntarme qué cenas hoy con lo que hay, y que te lo tache cuando lo termines. Miro tu inventario de verdad: no me invento lo que no hay."
      ready="Ya está hecho y probado lo que usará por debajo. Hará lo mismo que puedes hacer tú a mano, con tu sesión: no podrá tocar nada que tú no puedas."
    />
  );
}
