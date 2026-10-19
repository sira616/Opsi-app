import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaretLeft, Check, X } from 'phosphor-react-native';

import {
  borrarPerfil,
  darPermisoPerfil,
  guardarPerfil,
  type CambiosPerfil,
} from '@/api/perfil';
import { Accion } from '@/features/ajustes/ui';
import { usePerfil } from '@/features/perfil/usePerfil';
import { fechaHablada, hoyIso } from '@/shared/lib/calendario';
import { describeDbError } from '@/shared/lib/db-errors';
import {
  ALIMENTOS,
  DIETAS,
  MAX_LONGITUD_OTRO,
  MAX_OTROS,
  NIVELES_ACTIVIDAD,
  alternarDisgusto,
  alternarGusto,
  conProductoAnadido,
  limpiarProducto,
  type ClaveActividad,
  type ClaveDieta,
  type Perfil,
  type PerfilGuardado,
} from '@/shared/lib/perfil';
import { queryKeys } from '@/shared/lib/query';
import { useSession } from '@/shared/lib/session';
import { fonts, makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';

const SIN_PERFIL: PerfilGuardado = { perfil: { actividad: null, dieta: null, gustos: [], disgustos: [], otros: [] }, consentimiento: null };

/** Lo que se está guardando, puesto sobre el perfil para que el toque se vea al instante. */
function conCambios(perfil: Perfil, c: CambiosPerfil | undefined): Perfil {
  if (!c) return perfil;
  return {
    actividad: c.activity_level !== undefined ? c.activity_level : perfil.actividad,
    dieta: c.diet !== undefined ? c.diet : perfil.dieta,
    gustos: c.likes ?? perfil.gustos,
    disgustos: c.dislikes ?? perfil.disgustos,
    otros: c.dislikes_custom ?? perfil.otros,
  };
}

/**
 * El perfil personal: cuánto te mueves, cómo comes, qué te gusta y qué no.
 *
 * TODO es opcional y se puede dejar en blanco: tocar otra vez lo elegido lo quita. Y es un
 * dato sensible, así que se trata como tal (`shared/lib/perfil.ts`): no se guarda sin tu
 * permiso, solo lo ves tú, se borra entero cuando quieras. Hasta aceptar el aviso no hay
 * nada que rellenar.
 *
 * Hoy NADA recomienda con él: se guarda para cuando lo haga, y el aviso lo dice. Cuando algo
 * lo use —los avisos, la asistente—, hará falta además un permiso propio para mandárselo al
 * proveedor del modelo (docs/PRIVACIDAD.md): tenerlo guardado no es permiso para enviarlo.
 *
 * Cada toque se guarda (sin botón de guardar), como el resto de ajustes, con los guardados en
 * cola (`scope`) y el cambio ya a la vista. Si falla, se enseña el mensaje del servidor tal
 * cual y se vuelve a lo guardado de verdad.
 */
export default function PerfilPantalla() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { guardado, permiso, cargando, error: errorCarga, recargar } = usePerfil();

  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [otro, setOtro] = useState('');
  const [errorOtro, setErrorOtro] = useState<string | null>(null);

  function exigirSesion(): string {
    if (!userId) {
      throw Object.assign(new Error('Tu sesión ha caducado. Vuelve a entrar.'), { code: '28000' });
    }
    return userId;
  }

  function alGuardar(nuevo: PerfilGuardado) {
    setError(null);
    queryClient.setQueryData<PerfilGuardado>(queryKeys.perfil, nuevo);
  }

  function alFallar(caught: unknown) {
    setError(describeDbError(caught));
    void queryClient.invalidateQueries({ queryKey: queryKeys.perfil });
  }

  const guardar = useMutation({
    scope: { id: 'perfil' },
    mutationFn: (cambios: Omit<CambiosPerfil, 'consent_version'>) => guardarPerfil(exigirSesion(), cambios),
    onSuccess: alGuardar,
    onError: alFallar,
  });
  const aceptar = useMutation({
    scope: { id: 'perfil' },
    mutationFn: () => darPermisoPerfil(exigirSesion()),
    onSuccess: alGuardar,
    onError: alFallar,
  });
  const borrar = useMutation({
    scope: { id: 'perfil' },
    mutationFn: () => borrarPerfil(exigirSesion()),
    onSuccess() {
      setConfirmando(false);
      setOtro('');
      alGuardar(SIN_PERFIL);
    },
    onError: alFallar,
  });

  const perfil = conCambios(guardado.perfil, guardar.isPending ? guardar.variables : undefined);

  function cambiar(cambios: Omit<CambiosPerfil, 'consent_version'>) {
    setError(null);
    guardar.mutate(cambios);
  }

  /** Gustos y disgustos se guardan siempre juntos: tocar uno puede sacar algo del otro. */
  function cambiarAlimentos(r: Pick<Perfil, 'gustos' | 'disgustos'>) {
    cambiar({ likes: r.gustos, dislikes: r.disgustos });
  }

  function anadirOtro() {
    setErrorOtro(null);
    const r = limpiarProducto(otro);
    if (!r.ok) {
      setErrorOtro(`Escribe solo el nombre del producto, de 2 a ${MAX_LONGITUD_OTRO} caracteres.`);
      return;
    }
    if (r.valor === '') return;
    const siguiente = conProductoAnadido(perfil.otros, otro);
    if (siguiente === null) {
      setErrorOtro(`Con ${MAX_OTROS} basta. Quita alguno para añadir otro.`);
      return;
    }
    setOtro('');
    cambiar({ dislikes_custom: siguiente });
  }

  const listo = !cargando && !errorCarga;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          onPress={() => router.back()}
          style={styles.back}
        >
          <CaretLeft size={16} color={c.inkMuted} weight="bold" />
          <Text style={styles.backText}>Premium</Text>
        </Pressable>
        <Text style={t.title}>Tu perfil</Text>
        <Text style={t.bodySmall}>Opcional. Puedes dejar en blanco lo que no quieras contar.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {cargando ? <ActivityIndicator color={c.brand} /> : null}

        {errorCarga ? (
          <>
            <ErrorNote message={errorCarga} />
            <Accion label="Reintentar" onPress={() => void recargar()} />
          </>
        ) : null}

        {/* Sin permiso no hay nada que rellenar: guardar sin él lo rechaza el servidor, y ni se ofrece. */}
        {listo && !permiso ? (
          <View style={styles.permiso}>
            <Text style={styles.titulo}>Todo esto es opcional</Text>
            <Text style={styles.texto}>
              Si me lo cuentas, las recomendaciones se parecerán más a ti. Todavía no lo uso para
              recomendar nada: lo guardo para cuando lo haga.
            </Text>
            <Text style={styles.texto}>
              Lo guardo en tu cuenta. Solo lo ves tú, ni siquiera quien comparte nevera contigo.
            </Text>
            <Text style={styles.texto}>
              Puedes borrarlo cuando quieras y se va del todo. Sin tu permiso no guardo nada.
            </Text>
            <Button
              label="Aceptar y rellenar"
              onPress={() => {
                setError(null);
                aceptar.mutate();
              }}
              loading={aceptar.isPending}
            />
          </View>
        ) : null}

        {listo && permiso ? (
          <>
            <Bloque titulo="Cuánto te mueves" ayuda="Toca otra vez para quitarlo.">
              <View style={styles.fila}>
                {NIVELES_ACTIVIDAD.map((n) => (
                  <Opcion
                    key={n.clave}
                    etiqueta={n.etiqueta}
                    activa={perfil.actividad === n.clave}
                    onPress={() =>
                      cambiar({ activity_level: perfil.actividad === n.clave ? null : (n.clave as ClaveActividad) })
                    }
                  />
                ))}
              </View>
            </Bloque>

            <Bloque titulo="Cómo comes" ayuda="Toca otra vez para quitarlo.">
              <View style={styles.fila}>
                {DIETAS.map((d) => (
                  <Opcion
                    key={d.clave}
                    etiqueta={d.etiqueta}
                    activa={perfil.dieta === d.clave}
                    onPress={() => cambiar({ diet: perfil.dieta === d.clave ? null : (d.clave as ClaveDieta) })}
                  />
                ))}
              </View>
            </Bloque>

            <Bloque titulo="Lo que te gusta">
              <View style={styles.fila}>
                {ALIMENTOS.map((a) => (
                  <Opcion
                    key={a.clave}
                    etiqueta={a.etiqueta}
                    activa={perfil.gustos.includes(a.clave)}
                    onPress={() => cambiarAlimentos(alternarGusto(perfil, a.clave))}
                  />
                ))}
              </View>
            </Bloque>

            <Bloque titulo="Lo que no te gusta" ayuda="Si lo marcas aquí, sale de «Lo que te gusta».">
              <View style={styles.fila}>
                {ALIMENTOS.map((a) => (
                  <Opcion
                    key={a.clave}
                    etiqueta={a.etiqueta}
                    activa={perfil.disgustos.includes(a.clave)}
                    tachar
                    onPress={() => cambiarAlimentos(alternarDisgusto(perfil, a.clave))}
                  />
                ))}
              </View>
            </Bloque>

            <Bloque titulo="Otros que no te gusten" ayuda={`Hasta ${MAX_OTROS}. Solo el nombre del producto.`}>
              {perfil.otros.length > 0 ? (
                <View style={styles.fila}>
                  {perfil.otros.map((nombre) => (
                    <Pressable
                      key={nombre}
                      accessibilityRole="button"
                      accessibilityLabel={`Quitar ${nombre}`}
                      onPress={() => cambiar({ dislikes_custom: perfil.otros.filter((o) => o !== nombre) })}
                      style={({ pressed }) => [styles.opcion, styles.opcionOn, pressed && styles.pulsado]}
                    >
                      <X size={14} color={c.brandInk} weight="bold" />
                      <Text style={[styles.opcionTexto, styles.opcionTextoOn]} numberOfLines={1}>
                        {nombre}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.anadir}>
                <TextInput
                  accessibilityLabel="Un producto que no te gusta"
                  value={otro}
                  onChangeText={(v) => {
                    setOtro(v);
                    setErrorOtro(null);
                  }}
                  onSubmitEditing={anadirOtro}
                  placeholder="Por ejemplo, la remolacha encurtida"
                  placeholderTextColor={c.inkFaint}
                  maxLength={MAX_LONGITUD_OTRO + 20}
                  returnKeyType="done"
                  style={styles.entrada}
                />
                <Button label="Añadir" variant="quiet" onPress={anadirOtro} disabled={otro.trim() === ''} />
              </View>
              <ErrorNote message={errorOtro} />
            </Bloque>

            {guardado.consentimiento ? (
              <Text style={styles.texto}>
                Lo aceptaste el {fechaHablada(hoyIso(new Date(guardado.consentimiento.en)))}.
              </Text>
            ) : null}
          </>
        ) : null}

        <ErrorNote message={error} />

        {/* Borrar vale con y sin permiso. */}
        {listo && (permiso || guardado.consentimiento !== null) ? (
          confirmando ? (
            <View style={styles.confirmar}>
              <Text style={styles.texto}>¿Borrar tu perfil y tu permiso? No se puede deshacer.</Text>
              <Button label="Sí, borrarlo" onPress={() => borrar.mutate()} loading={borrar.isPending} />
              <Button
                label="Cancelar"
                variant="quiet"
                onPress={() => setConfirmando(false)}
                disabled={borrar.isPending}
              />
            </View>
          ) : (
            <Accion
              label="Borrar mi perfil"
              onPress={() => {
                setError(null);
                setConfirmando(true);
              }}
            />
          )
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Bloque({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.bloque}>
      <Text style={styles.bloqueTitulo}>{titulo}</Text>
      {ayuda ? <Text style={styles.ayuda}>{ayuda}</Text> : null}
      {children}
    </View>
  );
}

function Opcion({
  etiqueta,
  activa,
  onPress,
  tachar,
}: {
  etiqueta: string;
  activa: boolean;
  onPress: () => void;
  /** «No me gusta»: se marca con una X y no con un visto, y sin color de aviso (el rojo es de la caducidad). */
  tachar?: boolean;
}) {
  const styles = useStyles();
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: activa }}
      accessibilityLabel={tachar ? `No me gusta: ${etiqueta}` : etiqueta}
      onPress={onPress}
      style={({ pressed }) => [styles.opcion, activa && styles.opcionOn, pressed && styles.pulsado]}
    >
      {activa ? (
        tachar ? (
          <X size={14} color={c.brandInk} weight="bold" />
        ) : (
          <Check size={14} color={c.brandInk} weight="bold" />
        )
      ) : null}
      <Text style={[styles.opcionTexto, activa && styles.opcionTextoOn]}>{etiqueta}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  header: { paddingHorizontal: space.xl, paddingTop: space.sm, paddingBottom: space.sm, gap: space.xs },
  back: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
  content: { paddingHorizontal: space.xl, paddingBottom: space.xxl * 2, gap: space.xl },
  texto: { fontSize: 13.5, lineHeight: 19, color: c.inkMuted },
  titulo: { fontFamily: fonts.semibold, fontSize: 16, color: c.ink },
  permiso: {
    gap: space.sm,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  bloque: { gap: space.sm },
  bloqueTitulo: { fontFamily: fonts.semibold, fontSize: 15, color: c.ink },
  ayuda: { fontSize: 12.5, color: c.inkMuted },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm - 2 },
  opcion: {
    minHeight: touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs + 1,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  opcionOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  opcionTexto: { fontFamily: fonts.semibold, fontSize: 13, color: c.inkMuted, flexShrink: 1 },
  opcionTextoOn: { color: c.brandInk },
  pulsado: { opacity: 0.75 },
  anadir: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  entrada: {
    flex: 1,
    minHeight: touchTarget,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
    fontSize: 15,
    color: c.ink,
  },
  confirmar: { gap: space.xs },
}));
