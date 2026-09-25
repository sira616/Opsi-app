import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createSharedHousehold, updateHousehold, type Nevera } from '@/api/household';
import { Nota } from '@/features/ajustes/ui';
import { describeDbError, PISTAS, pistaDeError } from '@/shared/lib/db-errors';
import {
  ICONO_COMPARTIDA,
  ICONOS_NEVERA,
  IconoNevera,
} from '@/shared/lib/iconos-nevera';
import { queryKeys } from '@/shared/lib/query';
import { makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { TextField } from '@/shared/ui/TextField';
import { useNeveraActual } from './NeveraActiva';

const POR_FILA = 4;

/** La cuadrícula, ya troceada: 16 iconos son 4 filas de 4, no un `wrap` que deje una huérfana. */
const FILAS_DE_ICONOS = Array.from({ length: Math.ceil(ICONOS_NEVERA.length / POR_FILA) }, (_, i) =>
  ICONOS_NEVERA.slice(i * POR_FILA, (i + 1) * POR_FILA),
);

type Fallo = { mensaje: string; esTope: boolean };

type Props = {
  /** Sin nevera se CREA una compartida; con ella se EDITA esa. */
  nevera?: Nevera;
};

/**
 * Crear una nevera compartida o cambiarle el nombre y el icono a una existente.
 *
 * Es un solo formulario porque es la misma cosa vista dos veces —un nombre y un
 * dibujo—, y dos copias acabarían distintas. Lo único que cambia es a qué RPC
 * llama y qué hace después.
 *
 * ── Al crear ──────────────────────────────────────────────────────────────
 *
 * La nueva pasa a ser la ACTIVA: quien la crea es porque va a meter cosas, y
 * dejarle en la anterior obligaría a ir al selector a buscarla. Se mete en la
 * caché antes de cambiar, sin esperar a que se recargue la lista: si esa
 * recarga fallase, la nevera estaría creada y la persona seguiría en la de
 * antes sin saber por qué. Después se vuelve a pedir la lista de verdad.
 *
 * ── Al editar ─────────────────────────────────────────────────────────────
 *
 * Se manda solo lo que ha cambiado —el servidor lee `null` como «no lo
 * toques»— y el cambio se ve al momento en el selector y en la píldora, sin
 * recargar nada, por la misma razón. Solo quien lleva la nevera puede editar: a
 * quien no, no se le enseña un formulario que va a rechazar el servidor.
 *
 * ── El tope de neveras ────────────────────────────────────────────────────
 *
 * Si el servidor dice que no cabe otra (`limite_neveras`), el mensaje se
 * enseña TAL CUAL —ya viene escrito, y con qué hacer— pero en un recuadro de
 * aviso y no en el rojo de los errores: no es que algo haya salido mal, es que
 * se ha llegado al máximo. La pista solo decide el color y que se refresque la
 * lista, para que el selector deje de ofrecer lo que ya no cabe.
 */
export function FormularioNevera({ nevera }: Props) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { cambiar } = useNeveraActual();

  const editando = nevera !== undefined;
  const [nombre, setNombre] = useState(nevera?.name ?? '');
  const [icono, setIcono] = useState(nevera?.icon ?? ICONO_COMPARTIDA);
  const [fallo, setFallo] = useState<Fallo | null>(null);

  const limpio = nombre.trim();
  const sinCambios = editando && limpio === nevera.name && icono === nevera.icon;

  const guardar = useMutation({
    mutationFn: () =>
      nevera
        ? updateHousehold({
            householdId: nevera.id,
            // Solo lo tocado: un campo sin definir viaja como `null`.
            name: limpio !== nevera.name ? limpio : undefined,
            icon: icono !== nevera.icon ? icono : undefined,
          })
        : createSharedHousehold({ name: limpio, icon: icono }),

    onSuccess(fila) {
      if (nevera) {
        queryClient.setQueryData<Nevera[]>(queryKeys.neveras, (previas) =>
          previas?.map((n) => (n.id === fila.id ? { ...n, name: fila.name, icon: fila.icon } : n)),
        );
        void queryClient.invalidateQueries({ queryKey: queryKeys.neveras });
        router.back();
        return;
      }

      // Quien crea una nevera es su dueño y está solo dentro: es lo que el
      // servidor acaba de hacer, y la recarga de abajo lo confirma.
      const nueva: Nevera = { ...fila, role: 'owner', member_count: 1 };
      queryClient.setQueryData<Nevera[]>(queryKeys.neveras, (previas = []) => [
        ...previas.filter((n) => n.id !== nueva.id),
        nueva,
      ]);
      cambiar(nueva.id);
      void queryClient.invalidateQueries({ queryKey: queryKeys.neveras });
      // Se cierra TODA la pila de hojas: el formulario puede haberse abierto
      // desde el selector o desde Ajustes, y en los dos casos lo que se quiere
      // ver ahora es la nevera nueva, no la hoja de la que se venía.
      router.dismissAll();
    },

    // Sin texto propio: el mensaje sale del servidor, tal cual. Lo único que
    // se decide aquí es CÓMO se enseña.
    onError(caught: unknown) {
      const esTope = pistaDeError(caught) === PISTAS.limiteNeveras;
      setFallo({ mensaje: describeDbError(caught), esTope });
      // El tope no lo sabía la lista que se estaba mirando: se refresca para
      // que el selector deje de ofrecer una nevera que no cabe.
      if (esTope) void queryClient.invalidateQueries({ queryKey: queryKeys.neveras });
    },
  });

  function alGuardar() {
    setFallo(null);
    guardar.mutate();
  }

  // Un formulario que el servidor va a rechazar no se enseña.
  const puedeEditar = !editando || nevera.role === 'owner';

  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
            onPress={() => router.back()}
            style={styles.back}
          >
            <Text style={styles.backText}>Cancelar</Text>
          </Pressable>
          <Text accessibilityRole="header" style={t.title}>
            {editando ? 'Editar nevera' : 'Nueva nevera'}
          </Text>
          <Text style={t.bodySmall}>
            {!editando
              ? 'Es compartida: tú la llevas y decides quién entra.'
              : nevera.kind === 'personal'
                ? 'Es la tuya y no la ve nadie más. Ponle el nombre que quieras.'
                : 'Lo que cambies lo ve toda la gente de esta nevera.'}
          </Text>
        </View>

        {puedeEditar ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* El icono elegido, en grande y en vivo: es la respuesta a tocar la
                cuadrícula de abajo, y llega antes de guardar nada. */}
            <View style={styles.nombreFila}>
              <View style={[styles.avatar, { backgroundColor: c.brandSoft }]}>
                <IconoNevera icono={icono} size={26} color={c.brandInk} />
              </View>
              <View style={styles.nombreCampo}>
                <TextField
                  label="Nombre"
                  hint="Hasta 80 caracteres."
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="La nevera del piso"
                  maxLength={80}
                  autoFocus={!editando}
                  returnKeyType="done"
                />
              </View>
            </View>

            <View style={styles.iconos}>
              <Text style={t.label}>Icono</Text>
              <View accessibilityRole="radiogroup" style={styles.cuadricula}>
                {FILAS_DE_ICONOS.map((fila, i) => (
                  <View key={i} style={styles.filaIconos}>
                    {fila.map(({ clave, etiqueta }) => {
                      const on = clave === icono;
                      return (
                        <Pressable
                          key={clave}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`Elegir el icono ${etiqueta.toLowerCase()}`}
                          onPress={() => setIcono(clave)}
                          style={[styles.icono, on && styles.iconoOn]}
                        >
                          <IconoNevera
                            icono={clave}
                            size={26}
                            color={on ? c.brandInk : c.inkMuted}
                            weight={on ? 'fill' : 'duotone'}
                          />
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>

            {fallo?.esTope ? (
              <Nota alerta tono="aviso" texto={fallo.mensaje} />
            ) : (
              <ErrorNote message={fallo?.mensaje ?? null} />
            )}

            <Button
              label={editando ? 'Guardar' : 'Crear nevera'}
              onPress={alGuardar}
              loading={guardar.isPending}
              disabled={!limpio || sinCambios}
            />
          </ScrollView>
        ) : (
          <View style={styles.content}>
            <Nota texto="Solo quien lleva la nevera puede cambiarle el nombre o el icono. Pídeselo a esa persona." />
            <Button label="Volver" variant="quiet" onPress={() => router.back()} />
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  flex: { flex: 1 },
  header: {
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    paddingBottom: space.sm,
    gap: space.xs,
  },
  back: { minHeight: touchTarget, justifyContent: 'center', marginLeft: -2, alignSelf: 'flex-start' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl, gap: space.lg },

  nombreFila: { flexDirection: 'row', gap: space.md, alignItems: 'flex-end' },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nombreCampo: { flex: 1, minWidth: 0 },

  iconos: { gap: space.sm },
  cuadricula: { gap: space.sm },
  filaIconos: { flexDirection: 'row', gap: space.sm },
  // `flex: 1` reparte el ancho entre las cuatro y la altura fija las deja a
  // 56, bien por encima de los 44 que pide la accesibilidad.
  icono: {
    flex: 1,
    height: touchTarget + 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  iconoOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
}));
