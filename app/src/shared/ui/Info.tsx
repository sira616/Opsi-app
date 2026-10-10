import { useState } from 'react';
import { Pressable, Text } from 'react-native';

import { Info as IconoInfo } from 'phosphor-react-native';

import { fonts, makeStyles, space, useTheme } from '@/shared/theme/tokens';
import { HojaInferior } from './HojaInferior';

type Props = {
  /** Qué explica. Sale de título de la hoja y de etiqueta para el lector de pantalla. */
  titulo: string;
  /** Uno o varios párrafos. Cada elemento del array es un párrafo. */
  texto: string | string[];
};

/**
 * Una «i» pequeña que abre la explicación.
 *
 * Es el sitio al que se mudan los textos que explican pero no hacen falta a
 * primera vista: cómo se calcula una fecha, por qué algo dura menos abierto. El
 * dato sigue ahí para quien lo busca; lo que se quita es obligar a leerlo a
 * quien ya lo sabe cada vez que abre la pantalla.
 *
 * Lo que NO se muda aquí: errores, y lo que protege a alguien (la caducidad
 * pasada, no recongelar lo descongelado). Eso va a la vista y sin esconderse.
 */
export function Info({ titulo, texto }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const [abierta, setAbierta] = useState(false);
  const parrafos = Array.isArray(texto) ? texto : [texto];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Más información: ${titulo}`}
        onPress={() => setAbierta(true)}
        hitSlop={12}
        style={({ pressed }) => [styles.boton, pressed && styles.pulsado]}
      >
        <IconoInfo size={17} color={c.inkFaint} weight="regular" />
      </Pressable>

      <HojaInferior visible={abierta} onClose={() => setAbierta(false)} titulo={titulo}>
        {parrafos.map((p, i) => (
          <Text key={i} style={styles.parrafo}>
            {p}
          </Text>
        ))}
      </HojaInferior>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  boton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  pulsado: { opacity: 0.6 },
  parrafo: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.inkMuted, paddingBottom: space.xs },
}));
