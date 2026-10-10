import { Switch } from 'react-native';

import type { SettingsPatch, UserSettings } from '@/api/settings';
import { useTheme } from '@/shared/theme/tokens';
import { Row, Section } from './ui';

type Props = {
  data: UserSettings;
  onPatch: (next: SettingsPatch) => void;
  guardando: boolean;
};

/**
 * El único ajuste de la lista de la compra: si algo se apunta solo al agotarse.
 *
 * Viene apagado a propósito y es el principio 5 del proyecto: nada entra en tu
 * lista sin que tú digas que sí. El texto lo dice en ese orden —primero qué
 * pasa con el interruptor apagado, después que es deliberado— porque lo
 * primero es lo que alguien necesita saber y lo segundo solo lo justifica.
 */
export function SeccionListaCompra({ data, onPatch, guardando }: Props) {
  const c = useTheme();

  return (
    <Section title="Lista de la compra">
      <Row
        title="Apuntar automáticamente al agotar"
        subtitle="Con esto apagado te pregunto antes de apuntar nada. Viene así a propósito."
        right={
          <Switch
            value={data.auto_add_to_shopping_list}
            onValueChange={(v) => onPatch({ auto_add_to_shopping_list: v })}
            trackColor={{ true: c.brand, false: c.borderStrong }}
            disabled={guardando}
          />
        }
      />
    </Section>
  );
}
