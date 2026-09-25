import { useRouter } from 'expo-router';
import { CaretLeft } from 'phosphor-react-native';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Nevera } from '@/api/household';
import { Accion, Bloque, Nota, Section } from '@/features/ajustes/ui';
import { useNevera } from '@/features/ajustes/nevera/datos';
import { InvitacionesEnviadas } from '@/features/ajustes/nevera/InvitacionesEnviadas';
import { Invitar } from '@/features/ajustes/nevera/Invitar';
import { Miembros } from '@/features/ajustes/nevera/Miembros';
import { SalirDeLaNevera } from '@/features/ajustes/nevera/SalirDeLaNevera';
import { describeDbError } from '@/shared/lib/db-errors';
import { IconoNevera } from '@/shared/lib/iconos-nevera';
import { makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { describirNevera } from './datos';
import { useNeveraActual } from './NeveraActiva';

/**
 * Todo lo que se puede hacer con UNA nevera: quién está, invitar, salir, y
 * cambiarle el nombre y el icono.
 *
 * Es una pantalla por nevera y no una sección de Ajustes porque las acciones
 * dependen de CUÁL es. Con dos o tres neveras en la misma lista, «invitar»
 * junto a «Mi casa» y «Piso» no diría a cuál invita; y peor, ofrecería invitar
 * a una privada, que no se comparte. Aquí el botón solo existe donde el
 * servidor lo va a aceptar.
 *
 * La nevera se busca en la lista de MIS neveras y no se pide por id: si el id de
 * la ruta no está ahí, no es una nevera mía —salí de ella, me echaron, el enlace
 * es viejo— y no hay nada que gestionar.
 */
export function GestionNevera({ neveraId }: { neveraId: string }) {
  const { neveras } = useNeveraActual();
  const nevera = neveras.find((n) => n.id === neveraId);

  if (!nevera) return <YaNoEsTuya />;
  return <Gestion nevera={nevera} />;
}

/** Pasa con un enlace viejo o justo después de salir de ella. Corto y con salida. */
function YaNoEsTuya() {
  const router = useRouter();
  const styles = useStyles();
  const t = useType();

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.centrado}>
        <Text style={t.body}>Esa nevera ya no es tuya.</Text>
        <Button label="Volver" variant="quiet" onPress={() => router.back()} />
      </View>
    </SafeAreaView>
  );
}

function Gestion({ nevera }: { nevera: Nevera }) {
  const router = useRouter();
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const estado = useNevera(nevera.id);
  const { cargando, error, miId, miembros, enviadas, soyQuienLleva, limite, hayPlaza } = estado;

  const esCompartida = nevera.kind === 'shared';
  const miNombre = miembros.find((m) => m.user_id === miId)?.username ?? null;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver a Ajustes"
          onPress={() => router.back()}
          style={styles.volver}
        >
          <CaretLeft size={18} color={c.inkMuted} weight="bold" />
          <Text style={styles.volverTexto}>Ajustes</Text>
        </Pressable>

        <View style={styles.cabecera}>
          <View style={styles.icono}>
            <IconoNevera icono={nevera.icon} size={32} color={c.brandInk} />
          </View>
          <View style={styles.cabeceraTexto}>
            <Text accessibilityRole="header" style={t.title} numberOfLines={2}>
              {nevera.name}
            </Text>
            <Text style={t.bodySmall}>{describirNevera(nevera)}</Text>
          </View>
        </View>

        {soyQuienLleva ? (
          <Accion
            label="Cambiar nombre e icono"
            onPress={() =>
              router.push({ pathname: '/nevera/[id]/editar', params: { id: nevera.id } })
            }
          />
        ) : null}

        {cargando ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={error ? describeDbError(error) : null} />

        {!esCompartida ? (
          <Nota texto="Esta nevera es solo tuya: no se comparte ni se deja. Para compartir, crea una compartida y cambia entre las dos desde el inicio." />
        ) : (
          <>
            <Section title="Quién está">
              {miembros.length > 0 ? (
                <Miembros
                  neveraId={nevera.id}
                  miembros={miembros}
                  miId={miId}
                  soyQuienLleva={soyQuienLleva}
                />
              ) : null}
            </Section>

            <Section title="Invitar">
              <Bloque>
                {soyQuienLleva ? (
                  <Invitar
                    neveraId={nevera.id}
                    hayPlaza={hayPlaza}
                    limite={limite}
                    miNombre={miNombre}
                  />
                ) : (
                  <Text style={t.bodySmall}>
                    Invitar y sacar gente es cosa de quien lleva la nevera. Tú siempre puedes irte.
                  </Text>
                )}
                {limite !== null ? (
                  <Text style={t.caption}>
                    Caben {limite} personas en esta nevera, contando las invitaciones que aún no han
                    contestado.
                  </Text>
                ) : null}
              </Bloque>

              {enviadas.length > 0 ? (
                <Bloque>
                  <InvitacionesEnviadas
                    neveraId={nevera.id}
                    enviadas={enviadas}
                    soyQuienLleva={soyQuienLleva}
                  />
                </Bloque>
              ) : null}
            </Section>

            {/* Sin miembros cargados no se sabe si mandas: no se pinta salir a ciegas. */}
            {miembros.length > 0 ? (
              <Section title="Salir">
                <Bloque>
                  <SalirDeLaNevera
                    neveraId={nevera.id}
                    nombre={nevera.name}
                    soyQuienLleva={soyQuienLleva}
                    cuantosSomos={miembros.length}
                    onSalido={() => router.back()}
                  />
                </Bloque>
              </Section>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  content: { padding: space.xl, gap: space.lg, paddingBottom: space.xxl },
  centrado: { flex: 1, padding: space.xl, gap: space.md, justifyContent: 'center' },
  volver: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: touchTarget,
    alignSelf: 'flex-start',
    marginLeft: -space.xs,
  },
  volverTexto: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  cabeceraTexto: { flex: 1, minWidth: 0, gap: 2 },
  icono: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: c.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
