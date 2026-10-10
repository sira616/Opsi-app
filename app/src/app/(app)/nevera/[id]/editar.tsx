import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormularioNevera } from '@/features/neveras/FormularioNevera';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { Button } from '@/shared/ui/Button';
import { makeStyles, space, useType } from '@/shared/theme/tokens';

/**
 * Editar el nombre y el icono de una nevera. Una hoja modal declarada en
 * `(app)/_layout.tsx`.
 *
 * La nevera se busca en la lista de MIS neveras y no se pide por id al
 * servidor: si el id de la ruta no está ahí, no es una nevera mía —se salió
 * de ella, la echaron, el enlace es viejo— y no hay nada que editar. Quién
 * puede tocarla de verdad lo decide el servidor; el formulario solo evita
 * enseñar lo que va a rechazar.
 */
export default function EditarNevera() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { neveras } = useNeveraActual();
  const router = useRouter();
  const styles = useStyles();
  const t = useType();

  const nevera = neveras.find((n) => n.id === id);
  if (nevera) return <FormularioNevera nevera={nevera} />;

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <Text style={t.body}>Esa nevera ya no es tuya.</Text>
      <Button label="Volver" variant="quiet" onPress={() => router.back()} />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground, padding: space.xl, gap: space.md, justifyContent: 'center' },
}));
