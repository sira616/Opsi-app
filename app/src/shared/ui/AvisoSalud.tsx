import { Text, View } from 'react-native';

import { Info, Question, Warning, WarningCircle } from 'phosphor-react-native';

import {
  ATRIBUCION_SALUD,
  lineasDeAviso,
  necesitaAtribucion,
  textoDeAviso,
  type Evaluacion,
  type NivelLinea,
} from '@/shared/lib/salud';
import { fonts, makeStyles, radius, space, useTheme } from '@/shared/theme/tokens';

/**
 * El aviso de salud de un producto, completo: una línea por nivel, con su icono.
 *
 * Es un AVISO, no un bloqueo: nada de lo que hay alrededor se desactiva por lo que diga
 * esto. Los textos salen de `lineasDeAviso` (escalón 4 de `docs/VOZ.md`) y aquí solo se
 * pintan. Tres cosas que no son adorno:
 *
 *   · **Icono y texto, no solo color.** Cada nivel tiene su forma —triángulo, círculo,
 *     «i», interrogación—, y el color de aviso sale de los mismos tokens del resto de la
 *     app (el rojo es de la caducidad).
 *   · **Ningún icono de visto bueno.** Ni siquiera para lo de la lactosa: la etiqueta de
 *     «sin lactosa» se cuenta, no se celebra.
 *   · **Con datos completos y sin avisos no hay nada que pintar** y no se pinta nada: la
 *     ausencia de marca no se anuncia como «todo bien».
 *
 * `atribuir` añade «Según Open Food Facts.» cuando hay un «contiene» o unas trazas, que
 * no lo dicen por sí solos. Se apaga solo donde ya se ha dicho en la pantalla.
 */
export function AvisoSalud({
  evaluacion,
  atribuir = true,
}: {
  evaluacion: Evaluacion;
  atribuir?: boolean;
}) {
  const styles = useStyles();
  const lineas = lineasDeAviso(evaluacion);
  if (lineas.length === 0) return null;

  const fuerte = lineas.some((l) => l.nivel === 'contiene' || l.nivel === 'trazas');

  return (
    <View
      accessible
      accessibilityLabel={textoDeAviso(evaluacion, atribuir)}
      style={[styles.caja, fuerte ? styles.cajaFuerte : styles.cajaSuave]}
    >
      {lineas.map((linea) => (
        <View key={linea.nivel} style={styles.linea}>
          <IconoNivel nivel={linea.nivel} tamano={17} />
          <Text style={[styles.texto, estiloLinea(styles, linea.nivel)]}>{linea.texto}</Text>
        </View>
      ))}
      {atribuir && necesitaAtribucion(evaluacion) ? (
        <Text style={styles.atribucion}>{ATRIBUCION_SALUD}</Text>
      ) : null}
    </View>
  );
}

/**
 * La marca pequeña de una fila del inventario: una línea de texto y su icono.
 *
 * Va debajo del resto de la fila sin hacerla mucho más alta. Junta los niveles en el
 * mismo párrafo («Contiene gluten · Trazas de huevo»), sin el punto final de cada frase,
 * y deja hasta tres líneas: cortarla del todo escondería justo lo que se vino a buscar.
 * La fila ya lee el aviso completo en su etiqueta de accesibilidad.
 */
export function MarcaSalud({ evaluacion }: { evaluacion: Evaluacion }) {
  const styles = useStyles();
  const lineas = lineasDeAviso(evaluacion);
  const primera = lineas[0];
  if (!primera) return null;

  return (
    <View style={styles.marca}>
      <IconoNivel nivel={primera.nivel} tamano={12} />
      <Text style={styles.marcaTexto} numberOfLines={3}>
        {lineas.map((linea, i) => (
          <Text key={linea.nivel} style={estiloMarca(styles, linea.nivel)}>
            {i > 0 ? ' · ' : ''}
            {linea.texto.replace(/\.$/, '')}
          </Text>
        ))}
      </Text>
    </View>
  );
}

function IconoNivel({ nivel, tamano }: { nivel: NivelLinea; tamano: number }) {
  const c = useTheme();
  switch (nivel) {
    case 'contiene':
      return <Warning size={tamano} color={c.warning} weight="fill" />;
    case 'trazas':
      return <WarningCircle size={tamano} color={c.warning} weight="bold" />;
    case 'etiqueta':
      return <Info size={tamano} color={c.inkMuted} weight="regular" />;
    case 'sin_datos':
      return <Question size={tamano} color={c.inkMuted} weight="regular" />;
  }
}

type Estilos = ReturnType<typeof useStyles>;

// El peso baja con el nivel: lo que el producto lleva, en negrita; lo que no se sabe, en suave.
function estiloLinea(s: Estilos, nivel: NivelLinea) {
  switch (nivel) {
    case 'contiene':
      return s.contiene;
    case 'trazas':
      return s.trazas;
    case 'etiqueta':
      return s.etiqueta;
    case 'sin_datos':
      return s.sinDatos;
  }
}

function estiloMarca(s: Estilos, nivel: NivelLinea) {
  switch (nivel) {
    case 'contiene':
      return s.marcaContiene;
    case 'trazas':
      return s.marcaTrazas;
    case 'etiqueta':
      return s.marcaEtiqueta;
    case 'sin_datos':
      return s.marcaSinDatos;
  }
}

const useStyles = makeStyles((c) => ({
  caja: { gap: space.xs + 2, borderRadius: radius.md, padding: space.md },
  // Con algo que el producto lleva, el fondo de aviso; con solo matices o «sin datos», el neutro.
  cajaFuerte: { backgroundColor: c.warningSoft },
  cajaSuave: { backgroundColor: c.surfaceAlt },
  linea: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  texto: { flex: 1, minWidth: 0 },
  contiene: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: c.ink },
  trazas: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20, color: c.ink },
  etiqueta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: c.inkMuted },
  sinDatos: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: c.inkMuted },
  atribucion: { fontFamily: fonts.body, fontSize: 11.5, lineHeight: 16, color: c.inkMuted },

  marca: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 1 },
  marcaTexto: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: 16 },
  marcaContiene: { fontFamily: fonts.bold, color: c.warning },
  marcaTrazas: { fontFamily: fonts.semibold, color: c.warning },
  marcaEtiqueta: { fontFamily: fonts.body, color: c.inkMuted },
  marcaSinDatos: { fontFamily: fonts.body, fontSize: 11, color: c.inkFaint },
}));
