import { useRouter } from 'expo-router';
import { Check, PencilSimple, Plus } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Nota } from '@/features/ajustes/ui';
import { IconoNevera } from '@/shared/lib/iconos-nevera';
import { fonts, makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';
import { describirNevera, textoTope, useLimiteNeveras } from './datos';
import { useNeveraActual } from './NeveraActiva';

/**
 * Lo que mide la hoja, para que su detent sea el de la lista y no un número a
 * ojo. La hoja no puede saberlo sola: el detent lo fija el navegador de
 * `(app)/_layout.tsx`, que solo conoce cuántas neveras hay.
 *
 * Es una ESTIMACIÓN, y por eso lo de dentro es un `ScrollView`: si se queda
 * corta —una fuente del sistema más grande, por ejemplo—, se desplaza en vez de
 * cortar la última fila.
 */
const ALTO_FILA = 64;
const HUECO = space.sm;
const ALTO_CABECERA = 24 /* el asa */ + 56;
const ALTO_CREAR = touchTarget + 8;
/** El aviso de tope, que aparece al pulsar «Crear» y no debe empujar nada fuera. */
const ALTO_AVISO = 84;
const MARGEN_INFERIOR = 34 /* área segura de un iPhone con barra */ + space.lg;

/** Alto en píxeles que necesita la hoja para `filas` neveras. */
export function alturaHojaSelector(filas: number): number {
  return (
    ALTO_CABECERA +
    filas * ALTO_FILA +
    Math.max(0, filas - 1) * HUECO +
    space.md +
    ALTO_CREAR +
    ALTO_AVISO +
    MARGEN_INFERIOR
  );
}

/**
 * La lista de neveras: cambiar de una a otra y crear una compartida.
 *
 * Es el contenido de una hoja modal (`app/(app)/cambiar-nevera.tsx`). Elegir
 * una cierra la hoja: el efecto se ve al instante detrás, en el inventario, y
 * dejarla abierta obligaría a cerrarla a mano para comprobar que ha funcionado.
 *
 * ── «Crear» cuando ya no cabe ─────────────────────────────────────────────
 *
 * El botón NO se esconde ni se desactiva. Un botón que desaparece deja a la
 * persona buscando dónde se crean las neveras; uno desactivado sin explicación
 * es peor, porque no dice por qué. Se queda visible, más apagado, y al pulsarlo
 * explica el tope en vez de navegar. El servidor lo comprueba igualmente: esto
 * solo ahorra el viaje.
 */
export function SelectorNevera() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const { neveras, activa, cambiar } = useNeveraActual();
  const { limite, enElMaximo, hayCompartidas } = useLimiteNeveras();
  const [explicarTope, setExplicarTope] = useState(false);

  function elegir(id: string) {
    // Volver a tocar la que ya está activa solo cierra: no hay nada que cambiar
    // ni, por tanto, nada que marcar como rancio.
    if (id !== activa.id) cambiar(id);
    router.back();
  }

  function crear() {
    if (enElMaximo) {
      setExplicarTope(true);
      return;
    }
    router.push('/nevera/nueva');
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.cabecera}>
          <Text accessibilityRole="header" style={t.heading}>
            ¿Qué nevera miras?
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar sin cambiar de nevera"
            onPress={() => router.back()}
            style={styles.cerrar}
          >
            <Text style={styles.cerrarTexto}>Cerrar</Text>
          </Pressable>
        </View>

        <View style={styles.lista} accessibilityRole="radiogroup">
          {neveras.map((nevera) => {
            const es = nevera.id === activa.id;
            return (
              <View key={nevera.id} style={[styles.fila, es && styles.filaOn]}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ selected: es }}
                  accessibilityLabel={
                    es ? `Seguir en la nevera ${nevera.name}` : `Cambiar a la nevera ${nevera.name}`
                  }
                  accessibilityHint={describirNevera(nevera)}
                  onPress={() => elegir(nevera.id)}
                  style={({ pressed }) => [styles.principal, pressed && styles.pressed]}
                >
                  <View style={[styles.icono, es && styles.iconoOn]}>
                    <IconoNevera icono={nevera.icon} size={24} color={es ? c.brandInk : c.inkMuted} />
                  </View>
                  <View style={styles.texto}>
                    <Text style={[styles.nombre, es && styles.textoOn]} numberOfLines={1}>
                      {nevera.name}
                    </Text>
                    <Text style={[styles.detalle, es && styles.textoOn]} numberOfLines={1}>
                      {describirNevera(nevera)}
                    </Text>
                  </View>
                  {/* La activa se marca con algo más que el color: un tic. */}
                  {es ? <Check size={18} color={c.brandInk} weight="bold" /> : null}
                </Pressable>

                {/* Solo quien lleva la nevera puede cambiarle el nombre y el
                    icono: el servidor lo exige, y un lápiz que siempre da error
                    enseña a no leer los errores. La privada la llevas tú. */}
                {nevera.role === 'owner' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Editar la nevera ${nevera.name}`}
                    onPress={() =>
                      router.push({ pathname: '/nevera/[id]/editar', params: { id: nevera.id } })
                    }
                    style={({ pressed }) => [styles.editar, pressed && styles.pressed]}
                  >
                    <PencilSimple size={18} color={es ? c.brandInk : c.inkMuted} weight="bold" />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Crear nevera compartida"
          accessibilityHint={enElMaximo ? 'Ya tienes todas las neveras que permite tu plan' : undefined}
          onPress={crear}
          style={({ pressed }) => [
            styles.crear,
            enElMaximo && styles.crearApagado,
            pressed && styles.pressed,
          ]}
        >
          <Plus size={18} color={enElMaximo ? c.inkMuted : c.brand} weight="bold" />
          <Text style={[styles.crearTexto, enElMaximo && styles.crearTextoApagado]}>
            Crear nevera compartida
          </Text>
        </Pressable>

        {enElMaximo && explicarTope && limite !== null ? (
          <Nota alerta tono="aviso" texto={textoTope(limite, hayCompartidas)} />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  content: { paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.xl, gap: space.md },

  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touchTarget,
  },
  cerrar: { minHeight: touchTarget, justifyContent: 'center', paddingLeft: space.md },
  cerrarTexto: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },

  lista: { gap: HUECO },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: ALTO_FILA,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  // El realce lo dan el borde y el relleno de marca, y además un tic: el color
  // solo no basta para quien no lo distingue.
  filaOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  principal: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: ALTO_FILA - 2,
    paddingLeft: space.md,
    paddingRight: space.sm,
  },
  icono: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.surfaceAlt,
  },
  iconoOn: { backgroundColor: c.surface },
  texto: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.semibold, fontSize: 15.5, color: c.ink },
  detalle: { fontFamily: fonts.body, fontSize: 12.5, color: c.inkMuted },
  textoOn: { color: c.brandInk },
  editar: {
    width: touchTarget,
    height: touchTarget,
    marginRight: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },

  crear: {
    minHeight: ALTO_CREAR,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.xs,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.brand,
    backgroundColor: c.surface,
  },
  crearApagado: { borderColor: c.border, backgroundColor: c.surfaceAlt },
  crearTexto: { fontFamily: fonts.semibold, fontSize: 15, color: c.brand },
  crearTextoApagado: { color: c.inkMuted },

  pressed: { opacity: 0.7 },
}));
