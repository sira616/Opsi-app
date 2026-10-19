import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaretLeft, ChatCircleDots, PaperPlaneRight } from 'phosphor-react-native';

import { Nota } from '@/features/ajustes/ui';
import {
  MAX_LONGITUD_MENSAJE,
  SUGERENCIAS,
  borradorDeRuta,
  puedeEnviar,
  type Mensaje,
} from '@/features/chat/mensajes';
import { responder } from '@/features/chat/responder';
import { fonts, makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

/**
 * La pantalla base del chat de Opsi.
 *
 * Es la parte de pantalla: cabecera, conversación, sugerencias y cuadro de escribir. Quien
 * contesta es `features/chat/responder.ts`, que hoy solo dice que todavía no puede (la IA
 * no está conectada) y es lo único que habrá que cambiar cuando lo esté. Por eso no hay
 * nada inventado aquí: ni respuestas de relleno ni «escribiendo…», y el aviso de arriba
 * dice a la vista que está en construcción.
 *
 * La conversación vive solo en esta pantalla (estado en memoria): no se guarda y no sale
 * del móvil. Al cerrarla se pierde, y es lo que se dice.
 *
 * `?mensaje=…` abre el chat con ese texto YA ESCRITO en el cuadro, sin enviarlo: lo usan las
 * recomendaciones («hacer una receta con esto») para empezar la pregunta. Es un parámetro de
 * ruta, o sea entrada de fuera, y se limpia antes de usarlo (`borradorDeRuta`).
 *
 * El chat no es de Premium ni lleva candado: aún no hay nada que cobrar ni limitar.
 */
export default function Chat() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ mensaje?: string | string[] }>();

  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [texto, setTexto] = useState(() => borradorDeRuta(params.mensaje));
  const [respondiendo, setRespondiendo] = useState(false);
  const lista = useRef<ScrollView>(null);
  const contador = useRef(0);
  const nuevoId = () => String(++contador.current);

  async function enviar() {
    if (!puedeEnviar(texto) || respondiendo) return;
    const mio: Mensaje = { id: nuevoId(), de: 'persona', texto: texto.trim() };
    const conversacion = [...mensajes, mio];
    setMensajes(conversacion);
    setTexto('');
    setRespondiendo(true);
    let respuesta: string;
    try {
      respuesta = await responder(conversacion);
    } catch {
      respuesta = 'No he podido contestar. Prueba otra vez.';
    }
    setMensajes((actuales) => [...actuales, { id: nuevoId(), de: 'opsi', texto: respuesta }]);
    setRespondiendo(false);
  }

  const vacia = mensajes.length === 0;
  const puede = puedeEnviar(texto) && !respondiendo;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.cabecera}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/inventario'))}
          hitSlop={8}
          style={styles.volver}
        >
          <CaretLeft size={20} color={c.inkMuted} weight="bold" />
        </Pressable>
        <View style={styles.avatar}>
          <ChatCircleDots size={24} color={c.brand} weight="duotone" />
        </View>
        <View style={styles.cabeceraTexto}>
          <Text style={t.title}>Opsi</Text>
          <Text style={t.bodySmall}>Pregúntame por tu nevera</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.cuerpo}
      >
        <ScrollView
          ref={lista}
          contentContainerStyle={styles.conversacion}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => lista.current?.scrollToEnd({ animated: false })}
        >
          <Nota
            tono="aviso"
            texto="El chat está en construcción: todavía no contesta. Lo que escribas aquí no sale de tu móvil."
          />

          {vacia ? (
            <View style={styles.sugerencias}>
              <Text style={styles.sugerenciasTitulo}>Por ejemplo</Text>
              <View style={styles.sugerenciasFila}>
                {SUGERENCIAS.map((s) => (
                  <Pressable
                    key={s}
                    accessibilityRole="button"
                    accessibilityLabel={`Escribir: ${s}`}
                    onPress={() => setTexto(s)}
                    style={({ pressed }) => [styles.sugerencia, pressed && styles.pulsado]}
                  >
                    <Text style={styles.sugerenciaTexto}>{s}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {mensajes.map((m) => (
            <View
              key={m.id}
              style={[styles.burbuja, m.de === 'persona' ? styles.burbujaPersona : styles.burbujaOpsi]}
            >
              <Text
                selectable
                style={[styles.burbujaTexto, m.de === 'persona' && styles.burbujaTextoPersona]}
              >
                {m.texto}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.compositor}>
          <TextInput
            accessibilityLabel="Escribe tu pregunta"
            value={texto}
            onChangeText={setTexto}
            placeholder="Escribe tu pregunta"
            placeholderTextColor={c.inkFaint}
            multiline
            maxLength={MAX_LONGITUD_MENSAJE}
            style={styles.entrada}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Enviar"
            accessibilityState={{ disabled: !puede }}
            disabled={!puede}
            onPress={() => void enviar()}
            style={[styles.enviar, !puede && styles.enviarApagado]}
          >
            <PaperPlaneRight size={20} color={c.onBrand} weight="fill" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  volver: { width: touchTarget, height: touchTarget, alignItems: 'center', justifyContent: 'center', marginLeft: -space.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  cabeceraTexto: { flex: 1, minWidth: 0 },
  cuerpo: { flex: 1 },
  conversacion: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md },

  sugerencias: { gap: space.sm, paddingTop: space.sm },
  sugerenciasTitulo: { fontSize: 12.5, color: c.inkMuted },
  sugerenciasFila: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sugerencia: {
    minHeight: touchTarget,
    justifyContent: 'center',
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  sugerenciaTexto: { fontFamily: fonts.medium, fontSize: 14, color: c.ink },
  pulsado: { opacity: 0.7 },

  burbuja: { maxWidth: '85%', paddingHorizontal: space.md + 2, paddingVertical: space.sm + 2, borderRadius: 18 },
  burbujaPersona: { alignSelf: 'flex-end', backgroundColor: c.brand, borderBottomRightRadius: 6 },
  burbujaOpsi: {
    alignSelf: 'flex-start',
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    borderBottomLeftRadius: 6,
  },
  burbujaTexto: { fontSize: 15, lineHeight: 21, color: c.ink },
  burbujaTextoPersona: { color: c.onBrand },

  compositor: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.xl,
    paddingTop: space.sm,
    paddingBottom: space.sm,
  },
  entrada: {
    flex: 1,
    minHeight: touchTarget,
    maxHeight: 120,
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm + 2,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
    fontSize: 15,
    color: c.ink,
  },
  enviar: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brand,
  },
  enviarApagado: { opacity: 0.4 },
}));
