import { useRouter } from 'expo-router';
import { useRef } from 'react';
import { View } from 'react-native';

import { Barcode, PencilSimple, Receipt } from 'phosphor-react-native';

import { Button } from '@/shared/ui/Button';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { space, useTheme } from '@/shared/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
};

/**
 * «Añadir producto»: las formas de hacerlo, cada una en su botón: escanear, leer un ticket
 * (Premium) o escribirlo a mano.
 *
 * Escanear y escribir a mano eran dos botones sueltos en la cabecera del inventario; ahora
 * hay uno solo, que abre esta hoja. Cada opción cierra la hoja y abre su pantalla un
 * momento después: en iOS un `Modal` que baja y una pantalla que sube a la vez no se
 * presentan (el mismo motivo por el que `productos.tsx` espera entre sus dos hojas).
 */
export function HojaAnadir({ visible, onClose }: Props) {
  const router = useRouter();
  const c = useTheme();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);

  function ir(ruta: '/escanear' | '/alta' | '/ticket') {
    onClose();
    if (espera.current) clearTimeout(espera.current);
    espera.current = setTimeout(() => router.push(ruta), 300);
  }

  return (
    <HojaInferior visible={visible} onClose={onClose} titulo="Añadir producto">
      <View style={{ gap: space.sm }}>
        <Button
          label="Escanear producto"
          onPress={() => ir('/escanear')}
          icon={<Barcode size={20} color={c.ground} weight="bold" />}
        />
        <Button
          label="Leer un ticket ⭐"
          variant="quiet"
          onPress={() => ir('/ticket')}
          icon={<Receipt size={20} color={c.inkMuted} weight="bold" />}
        />
        <Button
          label="Añadir a mano"
          variant="quiet"
          onPress={() => ir('/alta')}
          icon={<PencilSimple size={20} color={c.inkMuted} weight="bold" />}
        />
      </View>
    </HojaInferior>
  );
}
