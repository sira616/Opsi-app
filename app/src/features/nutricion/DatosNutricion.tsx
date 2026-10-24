import { Text, View } from 'react-native';

import {
  AVISO_INCOMPLETO,
  LICENCIA_ODBL,
  ORIGEN_NOVA,
  ORIGEN_NUTRISCORE,
  SIN_DATO,
  SIN_NOVA,
  SIN_NUTRISCORE,
  etiquetaBase,
  etiquetaNova,
  filasNutricionales,
  nombreNova,
  textoAditivos,
  textoRacion,
  type FilaNutricional,
  type Nutricion,
} from '@/shared/lib/nutricion';
import { fonts, makeStyles, radius, space, tabular } from '@/shared/theme/tokens';

import { EscalaNutriScore } from './SelloNutriScore';

/**
 * Lo que Open Food Facts declara de un producto, ya limpio (`leerNutricion`): Nutri-Score,
 * grupo NOVA, la tabla por 100 g o 100 ml, ración y aditivos.
 *
 * Opsi no opina (docs/VOZ.md): ni «sano», ni «cuidado», ni cuánto conviene comer. Cada dato
 * lleva su origen a la vista, el NOVA y los niveles van en neutro —sin escala de color ni
 * iconos de alarma— y todo se pinta como texto plano, sin marcado ni enlaces.
 *
 * Un dato que no consta es «—», nunca un cero. El caso de que no conste NADA no pasa por
 * aquí: lo resuelve quien lo llama con «Sin datos nutricionales».
 */
export function DatosNutricion({ nutricion: n }: { nutricion: Nutricion }) {
  const styles = useStyles();

  const filas = filasNutricionales(n);
  // La tabla solo si algo consta: ocho guiones seguidos no informan de nada.
  const hayTabla = filas.some((f) => f.valor !== SIN_DATO || f.nivel !== null);
  const racion = textoRacion(n.racion);
  const aditivos = textoAditivos(n.aditivos);
  const hayNiveles = filas.some((f) => f.nivel !== null);

  return (
    <View style={styles.bloque}>
      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>Nutri-Score</Text>
        {n.nutriscore !== null ? (
          <>
            <EscalaNutriScore grado={n.nutriscore} />
            <Text style={styles.origen}>{ORIGEN_NUTRISCORE}</Text>
          </>
        ) : (
          <Text style={styles.texto}>{SIN_NUTRISCORE}</Text>
        )}

        <View style={styles.separador} />

        <Text style={styles.titulo}>NOVA</Text>
        {n.nova !== null ? (
          <>
            <View
              accessible
              accessibilityRole="text"
              accessibilityLabel={etiquetaNova(n.nova)}
              style={styles.nova}
            >
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.novaNumero}
              >
                <Text maxFontSizeMultiplier={1.2} style={styles.novaCifra}>
                  {n.nova}
                </Text>
              </View>
              <Text
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.novaNombre}
              >
                {nombreNova(n.nova)}
              </Text>
            </View>
            <Text style={styles.origen}>{ORIGEN_NOVA}</Text>
          </>
        ) : (
          <Text style={styles.texto}>{SIN_NOVA}</Text>
        )}
      </View>

      {hayTabla ? (
        <View style={styles.tarjeta}>
          <View style={styles.cabeceraTabla}>
            <Text style={styles.titulo}>Información nutricional</Text>
            <Text style={styles.base}>{etiquetaBase(n.base)}</Text>
          </View>
          <View>
            {filas.map((f, i) => (
              <Fila key={f.clave} fila={f} ultima={i === filas.length - 1} />
            ))}
          </View>
          {hayNiveles ? <Text style={styles.origen}>Niveles calculados por Open Food Facts.</Text> : null}
          {racion ? <Text style={styles.dato}>{racion}</Text> : null}
        </View>
      ) : racion ? (
        <Text style={styles.dato}>{racion}</Text>
      ) : null}

      {aditivos ? (
        <View style={styles.grupo}>
          <Text style={styles.titulo}>Aditivos</Text>
          <Text style={styles.texto}>{aditivos}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Fila({ fila, ultima }: { fila: FilaNutricional; ultima: boolean }) {
  const styles = useStyles();
  const sinDato = fila.valor === SIN_DATO;

  return (
    <View
      accessible
      accessibilityLabel={fila.lectura}
      style={[styles.fila, !ultima && styles.filaSeparada, fila.subfila && styles.subfila]}
    >
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.filaTexto}
      >
        <Text style={[styles.filaEtiqueta, fila.subfila && styles.filaEtiquetaSub]}>{fila.etiqueta}</Text>
        {fila.nivel !== null ? <Text style={styles.filaNivel}>{fila.nivel}</Text> : null}
      </View>
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.valor, sinDato && styles.valorSinDato]}
      >
        {fila.valor}
      </Text>
    </View>
  );
}

/**
 * La línea que SIEMPRE se ve, haya datos o no: Open Food Facts es un wiki y se equivoca o se
 * queda atrás. Y su licencia (ODbL), que pide citar el origen.
 */
export function PieNutricion() {
  const styles = useStyles();
  return (
    <View style={styles.pie}>
      <Text style={styles.pieTexto}>{AVISO_INCOMPLETO}</Text>
      <Text style={styles.pieTexto}>{LICENCIA_ODBL}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  bloque: { gap: space.lg },
  tarjeta: {
    gap: space.sm + 2,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  titulo: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  separador: { height: 1, backgroundColor: c.border, marginVertical: space.xs },
  texto: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.inkMuted },
  origen: { fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: c.inkMuted },
  dato: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: c.ink },
  grupo: { gap: space.xs },

  // NOVA: un cuadrado neutro con el número y el nombre de su clasificación. Sin color:
  // los grupos son una clasificación, no un semáforo.
  nova: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  novaNumero: {
    width: 44,
    height: 44,
    borderRadius: radius.md - 2,
    backgroundColor: c.surfaceAlt,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  novaCifra: { fontFamily: fonts.display, fontSize: 22, lineHeight: 26, color: c.ink },
  novaNombre: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: c.ink },

  cabeceraTabla: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  base: { ...tabular, fontFamily: fonts.medium, fontSize: 12.5, color: c.inkMuted },
  fila: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    paddingVertical: space.sm,
  },
  filaSeparada: { borderBottomWidth: 1, borderBottomColor: c.border },
  subfila: { paddingLeft: space.lg },
  filaTexto: { flex: 1, minWidth: 0, gap: 1 },
  filaEtiqueta: { fontFamily: fonts.medium, fontSize: 14.5, lineHeight: 20, color: c.ink },
  filaEtiquetaSub: { fontFamily: fonts.body, color: c.inkMuted },
  filaNivel: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16, color: c.inkMuted },
  valor: { ...tabular, fontFamily: fonts.semibold, fontSize: 15, color: c.ink, textAlign: 'right' },
  valorSinDato: { fontFamily: fonts.body, color: c.inkMuted },

  pie: { gap: space.xs },
  pieTexto: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: c.inkMuted },
}));
