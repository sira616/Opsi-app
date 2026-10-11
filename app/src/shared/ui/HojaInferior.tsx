import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fonts, makeStyles, radius, space } from '@/shared/theme/tokens';

type Props = {
  visible: boolean;
  onClose: () => void;
  titulo?: string;
  children: ReactNode;
};

/**
 * Una hoja que sube desde abajo, encima de lo que haya.
 *
 * Es lo que se usa cuando una opción necesita varias opciones propias y no
 * merece ocupar sitio en la pantalla hasta que se toca: las fracciones de
 * «Usar», el menú de «⋯» de una persona, la ayuda de un «ⓘ», el reloj del
 * aviso. Una pantalla con todo eso a la vista es una pantalla que nadie lee.
 *
 * Va con `Modal` de React Native y no con una ruta de Expo Router (como las
 * hojas de `alta` o `cambiar-nevera`) porque aquí hay estado vivo: lo que se
 * elige en la hoja lo usa la pantalla que la abrió, y una ruta nueva obligaría
 * a pasarlo por parámetros. `Modal` además funciona igual en el navegador.
 *
 * Se cierra tocando fuera, con el botón de atrás de Android y con la propia
 * cruz de la cabecera, que es la única vía que un lector de pantalla alcanza.
 */
export function HojaInferior({ visible, onClose, titulo, children }: Props) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.raiz}
      >
        {/* El fondo oscuro es un botón: tocar fuera cierra. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={onClose}
          style={styles.fondo}
        />
        <View style={[styles.hoja, { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}>
          <View style={styles.agarre} />
          {titulo ? (
            <View style={styles.cabecera}>
              <Text style={styles.titulo} accessibilityRole="header">
                {titulo}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cerrar"
                onPress={onClose}
                hitSlop={10}
                style={styles.cerrar}
              >
                <Text style={styles.cerrarTexto}>Cerrar</Text>
              </Pressable>
            </View>
          ) : null}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            contentContainerStyle={styles.cuerpo}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  raiz: { flex: 1, justifyContent: 'flex-end' },
  fondo: { ...absoluto, backgroundColor: 'rgba(0,0,0,0.42)' },
  hoja: {
    maxHeight: '85%',
    backgroundColor: c.ground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: c.border,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    gap: space.md,
  },
  agarre: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: radius.pill,
    backgroundColor: c.borderStrong,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  titulo: { flex: 1, fontFamily: fonts.semibold, fontSize: 18, color: c.ink },
  cerrar: { minHeight: 44, justifyContent: 'center' },
  cerrarTexto: { fontFamily: fonts.semibold, fontSize: 14, color: c.brand },
  cuerpo: { gap: space.md, paddingBottom: space.sm },
}));

const absoluto = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;
