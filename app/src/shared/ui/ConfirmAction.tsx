import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { makeStyles, radius, space, touchTarget } from '@/shared/theme/tokens';

type Props = {
  label: string;
  /** El icono de la acción. Se pinta a la izquierda de la etiqueta. */
  icon?: ReactNode;
  /** Lo que se lee al confirmar: «Sí, tirarlo». Explícito, nunca «Aceptar». */
  confirmLabel: string;
  question: string;
  onConfirm: () => void;
  busy?: boolean;
  danger?: boolean;
};

/**
 * Acción que pide confirmación antes de hacerse.
 *
 * Para lo irreversible: tirar y terminar cierran el elemento, y a partir de
 * ahí el servidor rechaza cualquier acción sobre él. Un toque despistado
 * mientras miras la nevera borraba un alimento sin preguntar.
 *
 * La confirmación es EN LÍNEA y no un diálogo del sistema por una razón
 * práctica: `Alert.alert` de React Native no hace nada en la versión web, y la
 * app se mira también en el navegador. Un componente que solo funciona en la
 * mitad de los sitios donde corre la app no vale.
 *
 * Se descarta sola a los 6 segundos: dejar un «¿seguro?» colgado en pantalla
 * invita a confirmarlo sin leerlo cuando vuelves.
 */
export function ConfirmAction({
  label,
  icon,
  confirmLabel,
  question,
  onConfirm,
  busy,
  danger,
}: Props) {
  const styles = useStyles();
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (!asking) return;
    const timer = setTimeout(() => setAsking(false), 6000);
    return () => clearTimeout(timer);
  }, [asking]);

  if (!asking) {
    return (
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        onPress={() => setAsking(true)}
        style={({ pressed }) => [
          styles.button,
          danger && styles.buttonDanger,
          pressed && styles.pressed,
          busy && styles.busy,
        ]}
      >
        {icon}
        <Text style={[styles.label, danger && styles.labelDanger]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={[styles.confirmBox, danger && styles.confirmBoxDanger]}>
      <Text style={[styles.question, danger && styles.questionDanger]}>{question}</Text>
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => {
            setAsking(false);
            onConfirm();
          }}
          style={({ pressed }) => [
            styles.confirmButton,
            danger && styles.confirmButtonDanger,
            pressed && styles.pressed,
            busy && styles.busy,
          ]}
        >
          <Text style={styles.confirmText}>{confirmLabel}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setAsking(false)}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
        >
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  button: {
    minHeight: touchTarget + 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md - 2,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  buttonDanger: { borderColor: c.expiryLine },
  label: { fontSize: 15, fontWeight: '600', color: c.ink },
  labelDanger: { color: c.expiry },

  // El rojo es para lo que puede salir caro, no para cualquier pregunta.
  // «Terminar» pintado de alarma enseña al usuario a ignorar el color, y
  // entonces tampoco lo lee cuando sí es «Tirar».
  confirmBox: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.brand,
    backgroundColor: c.brandSoft,
  },
  confirmBoxDanger: { borderColor: c.expiry, backgroundColor: c.expirySoft },
  question: { fontSize: 14.5, fontWeight: '600', color: c.brandInk },
  questionDanger: { color: c.expiryInk },
  row: { flexDirection: 'row', gap: space.sm },
  confirmButton: {
    flex: 1,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 2,
    backgroundColor: c.ink,
  },
  confirmButtonDanger: { backgroundColor: c.expiry },
  confirmText: { fontSize: 14.5, fontWeight: '600', color: c.ground },
  cancelButton: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  cancelText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },

  pressed: { opacity: 0.85 },
  busy: { opacity: 0.5 },
}));
