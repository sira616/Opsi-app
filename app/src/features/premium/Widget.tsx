import type { ComponentType, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { CaretRight, Lock, type IconProps } from 'phosphor-react-native';

import { fonts, makeStyles, radius, space, useTheme } from '@/shared/theme/tokens';

type Props = {
  icono: ComponentType<IconProps>;
  titulo: string;
  /** Una línea con lo que hay dentro, para no tener que abrirlo. */
  resumen?: string;
  /** Ocupa el ancho entero. Sin esto, dos por fila. */
  ancho?: boolean;
  /** Es de Premium y esta persona no lo tiene: se ve apagado, con candado. Tocarlo lo explica. */
  bloqueado?: boolean;
  /** Sin esto el widget no es pulsable: lo que lleva dentro (un selector) lo es. */
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: ReactNode;
};

/**
 * Un widget de la pantalla de Premium: icono, título, una línea de resumen y, si hace falta,
 * un control dentro. Premium es un conjunto de funciones sueltas y cada una cabe en uno, en
 * vez de una lista larga de secciones.
 *
 * Con `bloqueado` se ve igual pero apagado y con candado: es lo que se lee a primera vista
 * como «esto es de Premium». Que esté bloqueado no protege nada: el servidor rechaza a quien
 * no tiene el plan aunque se llegara a la pantalla de dentro.
 */
export function Widget({
  icono: Icono,
  titulo,
  resumen,
  ancho,
  bloqueado,
  onPress,
  accessibilityLabel,
  children,
}: Props) {
  const styles = useStyles();
  const c = useTheme();

  const contenido = (
    <>
      <View style={styles.cabecera}>
        <View style={[styles.icono, bloqueado && styles.iconoBloqueado]}>
          <Icono size={22} color={bloqueado ? c.inkMuted : c.brand} weight="duotone" />
        </View>
        {bloqueado ? (
          <Lock size={16} color={c.inkMuted} weight="bold" />
        ) : onPress ? (
          <CaretRight size={16} color={c.inkMuted} weight="bold" />
        ) : null}
      </View>
      <View style={styles.texto}>
        <Text style={[styles.titulo, bloqueado && styles.tituloBloqueado]} numberOfLines={2}>
          {titulo}
        </Text>
        {resumen ? (
          <Text style={styles.resumen} numberOfLines={2}>
            {bloqueado ? 'Opsi Premium ⭐' : resumen}
          </Text>
        ) : null}
      </View>
      {children}
    </>
  );

  const estilo = [styles.widget, ancho ? styles.ancho : styles.mitad, bloqueado && styles.apagado];

  if (!onPress) return <View style={estilo}>{contenido}</View>;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        accessibilityLabel ?? (bloqueado ? `${titulo}, de Opsi Premium` : `${titulo}${resumen ? `. ${resumen}` : ''}`)
      }
      onPress={onPress}
      style={({ pressed }) => [...estilo, pressed && styles.pulsado]}
    >
      {contenido}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  widget: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  // Dos por fila: cada una ocupa casi la mitad y la fila reparte lo que sobra.
  mitad: { flexBasis: '47%', flexGrow: 1, minHeight: 124 },
  ancho: { flexBasis: '100%' },
  apagado: { backgroundColor: c.surfaceAlt },
  pulsado: { opacity: 0.75 },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icono: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  iconoBloqueado: { backgroundColor: c.surface },
  texto: { gap: 2 },
  titulo: { fontFamily: fonts.semibold, fontSize: 15.5, lineHeight: 20, color: c.ink },
  tituloBloqueado: { color: c.inkMuted },
  resumen: { fontSize: 13, lineHeight: 18, color: c.inkMuted },
}));
