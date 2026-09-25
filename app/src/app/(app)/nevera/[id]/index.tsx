import { useLocalSearchParams } from 'expo-router';

import { GestionNevera } from '@/features/neveras/GestionNevera';

/**
 * Gestionar una nevera: quién está, invitar, salir, nombre e icono. Es una
 * pantalla normal (no una hoja) porque se llega a ella desde Ajustes y ahí se
 * vuelve, y porque encima se abre la hoja de editar.
 *
 * Todo lo que hace está en `features/neveras/GestionNevera.tsx`.
 */
export default function GestionDeUnaNevera() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GestionNevera neveraId={id} />;
}
