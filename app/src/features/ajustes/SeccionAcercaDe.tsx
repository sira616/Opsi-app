import Constants from 'expo-constants';
import { Text } from 'react-native';

import { fonts, makeStyles, tabular } from '@/shared/theme/tokens';
import { Bloque, Row, Section } from './ui';

/**
 * Versión, de dónde salen los datos de producto y a quién hay que dar las
 * gracias.
 *
 * La versión sale de `expo-constants` y no de una constante escrita a mano: el
 * número vive en `app.json` y copiarlo aquí garantiza que un día digan cosas
 * distintas. Cuando no se puede leer —un contexto raro de web— se enseña una
 * raya, que es honesto; inventarse un «1.0» no lo sería.
 */
export function SeccionAcercaDe() {
  const styles = useStyles();
  const version = Constants.expoConfig?.version ?? null;

  return (
    <Section title="Acerca de">
      <Row
        title="Versión"
        right={<Text style={styles.version}>{version ?? '—'}</Text>}
      />

      <Bloque>
        <Row
          title="Open Food Facts"
          subtitle="Los nombres y las marcas de los productos salen de ahí: una base abierta que mantiene gente que sube lo que compra. Se usa bajo su licencia, la ODbL."
        />
      </Bloque>

      <Bloque>
        <Row
          title="Licencias"
          subtitle="Tipografías Bricolage Grotesque y Plus Jakarta Sans, con licencia SIL OFL. Iconos de Phosphor, con licencia MIT."
        />
      </Bloque>
    </Section>
  );
}

const useStyles = makeStyles((c) => ({
  version: { ...tabular, fontFamily: fonts.semibold, fontSize: 14.5, color: c.inkMuted },
}));
