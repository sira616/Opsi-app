/**
 * Las piezas de las que está hecha la pantalla de ajustes.
 *
 * Viven aquí y no repetidas en cada sección porque son justo lo que hace que
 * ocho bloques distintos se lean como una sola pantalla: el mismo título en
 * versalitas, la misma tarjeta, la misma altura de fila, el mismo separador
 * entre sub-bloques. En cuanto cada sección se dibuja su propia caja, dos de
 * ellas acaban con el padding distinto y se nota.
 *
 * No están en `shared/ui` a propósito: solo se usan aquí. Lo que sirve en más
 * de una pantalla —Button, TextField, ConfirmAction— sí vive allí.
 */

import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CheckCircle, Info as IconoInfo } from 'phosphor-react-native';

import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';
import { Info } from '@/shared/ui/Info';

/**
 * Un bloque de ajustes: su título en versalitas y su tarjeta.
 *
 * `info` es lo que explica el bloque, detrás de una «i» junto al título.
 */
export function Section({
  title,
  info,
  children,
}: {
  title: string;
  info?: string;
  children: ReactNode;
}) {
  const styles = useAjustesStyles();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {info ? <Info titulo={title} texto={info} /> : null}
      </View>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/**
 * La inicial de alguien en un círculo.
 *
 * Una lista de nombres a secas se lee como una tabla. Con la inicial delante cada
 * fila tiene a qué agarrarse, y no cuesta ni una imagen ni un dato más: sale del
 * propio nombre de usuario.
 */
export function Inicial({ nombre, size = 38 }: { nombre: string; size?: number }) {
  const styles = useAjustesStyles();
  return (
    <View
      accessible={false}
      style={[styles.inicial, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Text style={[styles.inicialText, { fontSize: size * 0.42 }]}>
        {nombre.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

/**
 * Una fila: nombre del ajuste, una «i» que lo explica y el control.
 *
 * El texto de apoyo no es decoración: casi todos estos ajustes tienen una
 * consecuencia que no se adivina por el nombre, y la frase es donde se cuenta.
 * Pero leída cada vez que se abre Ajustes, ocho frases seguidas hacen que nadie
 * lea ninguna. Por eso va detrás de una «i» pequeña junto al nombre: está, y se
 * lee cuando se busca.
 */
export function Row({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  const styles = useAjustesStyles();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <View style={styles.rowTitulo}>
          <Text style={styles.rowTitle}>{title}</Text>
          {subtitle ? <Info titulo={title} texto={subtitle} /> : null}
        </View>
      </View>
      {right}
    </View>
  );
}

/**
 * Un sub-bloque dentro de una tarjeta, separado por una línea.
 *
 * Existe porque hay secciones con dos o tres cosas que no son el mismo ajuste
 * —correo y contraseña, o los avisos y la zona horaria— y sin la línea se leen
 * como una sola lista larga.
 */
export function Bloque({ children }: { children: ReactNode }) {
  const styles = useAjustesStyles();
  return <View style={styles.bloque}>{children}</View>;
}

/** Enlace de acción: verbo corto, sin caja. Lo que no es un botón principal. */
export function Accion({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const styles = useAjustesStyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.accion,
        pressed && styles.pressed,
        disabled && styles.apagado,
      ]}
    >
      <Text style={styles.accionText}>{label}</Text>
    </Pressable>
  );
}

type Tono = 'neutro' | 'aviso' | 'bien';

/**
 * Un recuadro con una frase: el resultado de una acción, o por qué algo no se
 * puede hacer ahora mismo.
 *
 * El recuadro es SIEMPRE neutro. Antes el aviso era naranja y el éxito verde, y
 * una pantalla con cajas de colores se lee como una pantalla con alarmas. El tono
 * lo da ahora un icono pequeño: un check cuando salió bien, una «i» cuando no.
 * Y ninguno es rojo: el rojo es de `ErrorNote` y de la caducidad, y gastarlo en
 * «ese nombre no existe» enseña a ignorarlo donde sí importa.
 *
 * @param alerta Para lo que aparece DESPUÉS de pulsar algo. Sin esto un lector
 *   de pantalla no anuncia la respuesta y el usuario se queda sin saber si su
 *   acción hizo algo.
 */
export function Nota({
  texto,
  tono = 'neutro',
  alerta,
}: {
  texto: string;
  tono?: Tono;
  alerta?: boolean;
}) {
  const styles = useAjustesStyles();
  const c = useTheme();
  return (
    <View accessibilityRole={alerta ? 'alert' : undefined} style={styles.nota}>
      {tono === 'bien' ? (
        <CheckCircle size={17} color={c.brand} weight="fill" />
      ) : tono === 'aviso' ? (
        <IconoInfo size={17} color={c.inkMuted} weight="regular" />
      ) : null}
      <Text style={[styles.notaText, tono !== 'neutro' && styles.notaTextConIcono]}>{texto}</Text>
    </View>
  );
}

/** Una etiqueta pequeña al lado de un nombre: el rol, o «tú». */
export function Etiqueta({ texto, fuerte }: { texto: string; fuerte?: boolean }) {
  const styles = useAjustesStyles();
  return (
    <View style={[styles.etiqueta, fuerte && styles.etiquetaFuerte]}>
      <Text style={[styles.etiquetaText, fuerte && styles.etiquetaTextFuerte]}>{texto}</Text>
    </View>
  );
}

export const useAjustesStyles = makeStyles((c) => ({
  section: { gap: space.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  inicial: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.brandSoft },
  inicialText: { fontFamily: fonts.bold, color: c.brandInk },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: c.inkMuted,
  },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.lg,
  },

  row: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  rowText: { flex: 1, gap: 3 },
  rowTitulo: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  rowTitle: { fontSize: 15, fontWeight: '600', color: c.ink, flexShrink: 1 },

  bloque: {
    gap: space.md,
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: space.lg,
  },

  valor: { fontSize: 14.5, color: c.ink },
  form: { gap: space.md },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  accion: { minHeight: touchTarget, justifyContent: 'center' },
  accionText: { fontSize: 14.5, fontWeight: '600', color: c.brand },

  nota: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    backgroundColor: c.surfaceAlt,
    borderRadius: radius.sm + 2,
    padding: space.md,
  },
  notaText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: c.inkMuted },
  notaTextConIcono: { color: c.ink },

  etiqueta: {
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
  },
  etiquetaFuerte: { backgroundColor: c.brandSoft },
  etiquetaText: { fontFamily: fonts.semibold, fontSize: 11, color: c.inkFaint },
  etiquetaTextFuerte: { color: c.brandInk },

  pressed: { opacity: 0.7 },
  apagado: { opacity: 0.45 },
}));
