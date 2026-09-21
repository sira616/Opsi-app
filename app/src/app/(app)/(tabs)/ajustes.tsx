import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  At,
  CaretDown,
  CaretUp,
  CheckCircle,
  CircleHalf,
  Clock,
  Key,
  Moon,
  PaperPlaneTilt,
  Sun,
  UserCircle,
} from 'phosphor-react-native';

import {
  cambiarContrasena,
  cambiarCorreo,
  fetchMiCorreo,
  reenviarConfirmacion,
} from '@/api/cuenta';
import { fetchSettings, updateSettings, type SettingsPatch } from '@/api/settings';
import { describeAuthError } from '@/shared/lib/auth-errors';
import { describeDbError } from '@/shared/lib/db-errors';
import { CONTRASENA_MIN } from '@/shared/lib/usuario';
import { Button } from '@/shared/ui/Button';
import { TextField } from '@/shared/ui/TextField';
import { fonts,useAspecto, type Aspecto } from '@/shared/theme/tokens';
import { queryKeys } from '@/shared/lib/query';
import { useSession } from '@/shared/lib/session';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { tabBarClearance,makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

/**
 * La zona horaria del dispositivo, si el sistema la sabe.
 *
 * Es lo que quiere el 99 % de la gente, así que se ofrece primero en vez de
 * obligar a buscarla en una lista.
 */
function deviceTimezone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz && tz.includes('/') ? tz : null;
  } catch {
    return null;
  }
}

const COMMON_ZONES = [
  'Europe/Madrid',
  'Atlantic/Canary',
  'Europe/Lisbon',
  'Europe/London',
  'America/Mexico_City',
  'America/Argentina/Buenos_Aires',
];

export default function Ajustes() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const { signOut } = useSession();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(false);

  const { aspecto, setAspecto } = useAspecto();

  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: fetchSettings });

  const save = useMutation({
    mutationFn: updateSettings,
    async onSuccess() {
      setError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
        // La zona horaria cambia lo que cuenta como «hoy», así que la lista de
        // prioridad puede quedar distinta. Sin esto seguiría mostrando los
        // días calculados con la zona anterior.
        queryClient.invalidateQueries({ queryKey: queryKeys.priorityList }),
      ]);
    },
    onError(caught: unknown) {
      setError(describeDbError(caught));
    },
  });

  function patch(next: SettingsPatch) {
    setError(null);
    save.mutate(next);
  }

  const data = settings.data;
  const device = deviceTimezone();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={t.title}>Ajustes</Text>

        {settings.isPending ? <ActivityIndicator color={c.brand} /> : null}
        <ErrorNote message={error ?? (settings.error ? describeDbError(settings.error) : null)} />

        {data ? (
          <>
            {/* ── Aspecto ────────────────────────────────────────────── */}
            <Section title="Aspecto">
              <View style={styles.aspectos}>
                {ASPECTOS.map(({ valor, etiqueta }) => {
                  const activo = aspecto === valor;
                  return (
                    <Pressable
                      key={valor}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: activo }}
                      accessibilityLabel={etiqueta}
                      onPress={() => setAspecto(valor)}
                      style={[styles.aspecto, activo && styles.aspectoOn]}
                    >
                      <IconoAspecto valor={valor} color={activo ? c.brand : c.inkMuted} />
                      <Text style={[styles.aspectoText, activo && styles.aspectoTextOn]}>
                        {etiqueta}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={t.caption}>
                {aspecto === 'system'
                  ? 'Sigue el ajuste de tu teléfono.'
                  : 'Fijo, aunque tu teléfono cambie.'}
              </Text>
            </Section>

            {/* ── Avisos ─────────────────────────────────────────────── */}
            <Section title="Avisos">
              <Row
                title="Resumen diario"
                subtitle="Un solo aviso al día con lo que conviene gastar. Si no hay nada urgente, no llega nada."
                right={
                  <Switch
                    value={data.digest_enabled}
                    onValueChange={(v) => patch({ digest_enabled: v })}
                    trackColor={{ true: c.brand, false: c.borderStrong }}
                    disabled={save.isPending}
                  />
                }
              />

              {data.digest_enabled ? (
                <View style={styles.hours}>
                  <Text style={t.label}>A qué hora</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourRow}>
                    {Array.from({ length: 24 }, (_, h) => h).map((hour) => {
                      const on = data.digest_hour === hour;
                      return (
                        <Pressable
                          key={hour}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          onPress={() => patch({ digest_hour: hour })}
                          style={[styles.hour, on && styles.hourOn]}
                        >
                          <Text style={[styles.hourText, on && styles.hourTextOn]}>
                            {`${hour}`.padStart(2, '0')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Text style={t.caption}>
                    Hora local: se calcula con tu zona horaria, no con la del servidor.
                  </Text>
                </View>
              ) : null}

              <View style={styles.note}>
                <Clock size={15} color={c.inkFaint} weight="duotone" />
                <Text style={styles.noteText}>
                  Los avisos llegan en la fase 3. Lo que elijas aquí se guarda desde ya.
                </Text>
              </View>
            </Section>

            {/* ── Zona horaria ───────────────────────────────────────── */}
            <Section title="Zona horaria">
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowZones((v) => !v)}
                style={styles.zoneCurrent}
              >
                <View style={styles.zoneText}>
                  <Text style={styles.zoneValue}>{data.timezone}</Text>
                  <Text style={t.caption}>Decide qué cuenta como «hoy» en tu inventario.</Text>
                </View>
                {showZones ? (
                  <CaretUp size={17} color={c.inkMuted} weight="bold" />
                ) : (
                  <CaretDown size={17} color={c.inkMuted} weight="bold" />
                )}
              </Pressable>

              {showZones ? (
                <View style={styles.zoneList}>
                  {device && device !== data.timezone ? (
                    <ZoneOption
                      label={`${device} · la de este dispositivo`}
                      onPress={() => {
                        patch({ timezone: device });
                        setShowZones(false);
                      }}
                    />
                  ) : null}
                  {COMMON_ZONES.filter((z) => z !== data.timezone).map((zone) => (
                    <ZoneOption
                      key={zone}
                      label={zone}
                      onPress={() => {
                        patch({ timezone: zone });
                        setShowZones(false);
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </Section>

            {/* ── Lista de la compra ─────────────────────────────────── */}
            <Section title="Lista de la compra">
              <Row
                title="Añadir automáticamente al agotar"
                subtitle="Desactivado a propósito. Con esto apagado, Opsi pregunta antes de añadir nada a tu lista."
                right={
                  <Switch
                    value={data.auto_add_to_shopping_list}
                    onValueChange={(v) => patch({ auto_add_to_shopping_list: v })}
                    trackColor={{ true: c.brand, false: c.borderStrong }}
                    disabled={save.isPending}
                  />
                }
              />
            </Section>

            {/* ── Cuenta ─────────────────────────────────────────────── */}
            <Section title="Cuenta">
              <Row
                title="Usuario"
                subtitle="Es con lo que entras. No se puede cambiar."
                right={
                  <View style={styles.usuario}>
                    <UserCircle size={17} color={c.brand} weight="duotone" />
                    <Text style={styles.usuarioText}>{data.username}</Text>
                  </View>
                }
              />

              <BloqueCorreo />
              <BloqueContrasena />

              <Pressable
                accessibilityRole="button"
                onPress={() => void signOut()}
                style={styles.signOut}
              >
                <Text style={styles.signOutText}>Cerrar sesión</Text>
              </Pressable>
              <Text style={t.caption}>
                Borrar la cuenta y sus datos todavía no es posible desde la app. Está pendiente.
              </Text>
            </Section>
          </>
        ) : settings.isPending ? null : (
          <View style={styles.card}>
            <Text style={t.body}>No encuentro tus ajustes.</Text>
            <Text style={t.bodySmall}>
              Suele significar que la sesión apunta a un usuario que ya no está en la base
              de datos. Cierra sesión y vuelve a entrar.
            </Text>
            <Pressable accessibilityRole="button" onPress={() => void signOut()} style={styles.signOut}>
              <Text style={styles.signOutText}>Cerrar sesión</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const ASPECTOS: { valor: Aspecto; etiqueta: string }[] = [
  { valor: 'system', etiqueta: 'Automático' },
  { valor: 'light', etiqueta: 'Claro' },
  { valor: 'dark', etiqueta: 'Oscuro' },
];

function IconoAspecto({ valor, color }: { valor: Aspecto; color: string }) {
  const peso = 'duotone' as const;
  if (valor === 'light') return <Sun size={19} color={color} weight={peso} />;
  if (valor === 'dark') return <Moon size={19} color={color} weight={peso} />;
  // «Automático» no tiene icono propio: un círculo mitad claro mitad oscuro
  // dice «depende» mejor que un engranaje, que ya significa «ajustes».
  return <CircleHalf size={19} color={color} weight="fill" />;
}

/**
 * El correo, que aquí es opcional y sirve para una sola cosa: poder recuperar
 * la contraseña. Al registrarse no se pide, así que esta es la única puerta.
 */
function BloqueCorreo() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const queryClient = useQueryClient();
  const { session } = useSession();

  const [abierto, setAbierto] = useState(false);
  const [correo, setCorreo] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const actual = useQuery({ queryKey: queryKeys.correo, queryFn: fetchMiCorreo });

  // Un cambio pedido y aún sin confirmar vive en el token, no en auth.users:
  // por eso sale de la sesión y no de mi_correo().
  const pendiente = session?.user.new_email ?? null;

  const guardar = useMutation({
    mutationFn: cambiarCorreo,
    async onSuccess(_void, enviado: string) {
      setError(null);
      setAbierto(false);
      setCorreo('');
      setAviso(
        `Te he mandado un enlace a ${enviado}. Hasta que lo abras sigues entrando con tu usuario.`,
      );
      await queryClient.invalidateQueries({ queryKey: queryKeys.correo });
    },
    onError(caught: unknown) {
      setError(describeAuthError(caught));
    },
  });

  const reenviar = useMutation({
    mutationFn: reenviarConfirmacion,
    onSuccess() {
      setError(null);
      setAviso('Enlace reenviado. Mira también en spam.');
    },
    onError(caught: unknown) {
      setError(describeAuthError(caught));
    },
  });

  const confirmado = actual.data ?? null;
  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());

  return (
    <View style={styles.bloque}>
      <Row
        title="Correo"
        subtitle={
          confirmado
            ? 'Confirmado. Con él puedes recuperar la contraseña si la olvidas.'
            : 'Sin correo no hay forma de recuperar la contraseña. Es lo único para lo que se usa.'
        }
        right={
          confirmado ? <CheckCircle size={19} color={c.brand} weight="fill" /> : (
            <At size={19} color={c.inkFaint} weight="duotone" />
          )
        }
      />

      {confirmado ? <Text style={styles.valor}>{confirmado}</Text> : null}

      {pendiente ? (
        <View style={styles.pendiente}>
          <PaperPlaneTilt size={15} color={c.warning} weight="duotone" />
          <Text style={styles.pendienteText}>
            Falta confirmar {pendiente}. El correo anterior sigue valiendo hasta entonces.
          </Text>
        </View>
      ) : null}

      {abierto ? (
        <View style={styles.form}>
          <TextField
            label={confirmado ? 'Correo nuevo' : 'Tu correo'}
            value={correo}
            onChangeText={setCorreo}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            inputMode="email"
            textContentType="emailAddress"
          />
          <Button
            label="Mandar el enlace"
            onPress={() => guardar.mutate(correo)}
            loading={guardar.isPending}
            disabled={!valido}
          />
        </View>
      ) : (
        <View style={styles.acciones}>
          <Accion
            label={confirmado ? 'Cambiar el correo' : 'Añadir un correo'}
            onPress={() => {
              setAviso(null);
              setError(null);
              setAbierto(true);
            }}
          />
          {pendiente ? (
            <Accion
              label={reenviar.isPending ? 'Reenviando…' : 'Reenviar el enlace'}
              onPress={() => reenviar.mutate(pendiente)}
            />
          ) : null}
        </View>
      )}

      {aviso ? <Text style={t.caption}>{aviso}</Text> : null}
      <ErrorNote message={error} />
    </View>
  );
}

/**
 * Cambiar la contraseña estando dentro.
 *
 * No se pide la actual: GoTrue no la comprueba en este camino, y un campo que
 * acepta cualquier cosa da una sensación de seguridad que no existe. Lo que
 * protege de verdad es hacer falta una sesión válida.
 */
function BloqueContrasena() {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();

  const [abierto, setAbierto] = useState(false);
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const corta = nueva.length > 0 && nueva.length < CONTRASENA_MIN;
  const distintas = repetida.length > 0 && nueva !== repetida;
  const puede = nueva.length >= CONTRASENA_MIN && nueva === repetida;

  const guardar = useMutation({
    mutationFn: cambiarContrasena,
    onSuccess() {
      setError(null);
      setAbierto(false);
      setNueva('');
      setRepetida('');
      setAviso('Contraseña cambiada. La sesión sigue abierta.');
    },
    onError(caught: unknown) {
      setError(describeAuthError(caught));
    },
  });

  return (
    <View style={styles.bloque}>
      <Row
        title="Contraseña"
        subtitle={`Mínimo ${CONTRASENA_MIN} caracteres. Larga vale más que complicada.`}
        right={<Key size={19} color={c.inkFaint} weight="duotone" />}
      />

      {abierto ? (
        <View style={styles.form}>
          <TextField
            label="Contraseña nueva"
            hint={corta ? `Te faltan ${CONTRASENA_MIN - nueva.length} caracteres` : undefined}
            value={nueva}
            onChangeText={setNueva}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <TextField
            label="Otra vez"
            hint={distintas ? 'No coinciden' : undefined}
            value={repetida}
            onChangeText={setRepetida}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Button
            label="Cambiar la contraseña"
            onPress={() => guardar.mutate(nueva)}
            loading={guardar.isPending}
            disabled={!puede}
          />
        </View>
      ) : (
        <View style={styles.acciones}>
          <Accion
            label="Cambiar la contraseña"
            onPress={() => {
              setAviso(null);
              setError(null);
              setAbierto(true);
            }}
          />
        </View>
      )}

      {aviso ? <Text style={t.caption}>{aviso}</Text> : null}
      <ErrorNote message={error} />
    </View>
  );
}

function Accion({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.accion, pressed && styles.pressed]}
    >
      <Text style={styles.accionText}>{label}</Text>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

function ZoneOption({ label, onPress }: { label: string; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.zoneOption, pressed && styles.pressed]}
    >
      <Text style={styles.zoneOptionText}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  safe: { flex: 1, backgroundColor: c.ground },
  content: { padding: space.xl, gap: space.xl, paddingBottom: tabBarClearance },

  section: { gap: space.sm },
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

  aspectos: { flexDirection: 'row', gap: space.sm },
  aspecto: {
    flex: 1,
    minHeight: touchTarget + 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceAlt,
  },
  aspectoOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  aspectoText: { fontFamily: fonts.semibold, fontSize: 12.5, color: c.inkMuted },
  aspectoTextOn: { color: c.brandInk },

  row: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: c.ink },
  rowSubtitle: { fontSize: 12.5, lineHeight: 18, color: c.inkMuted },

  hours: { gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.lg },
  hourRow: { gap: space.sm - 2, paddingRight: space.lg },
  hour: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: c.border,
  },
  hourOn: { backgroundColor: c.brandSoft, borderColor: c.brand, borderWidth: 1.5 },
  hourText: { fontSize: 14, fontWeight: '600', color: c.inkMuted },
  hourTextOn: { color: c.brand },

  note: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: c.inkFaint },

  zoneCurrent: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touchTarget },
  zoneText: { flex: 1, gap: 3 },
  zoneValue: { fontSize: 15, fontWeight: '600', color: c.ink },
  zoneList: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm },
  zoneOption: { minHeight: touchTarget, justifyContent: 'center' },
  zoneOptionText: { fontSize: 14.5, color: c.brand, fontWeight: '600' },

  usuario: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2 },
  usuarioText: { fontFamily: fonts.semibold, fontSize: 15, color: c.brandInk },

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

  pendiente: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-start',
    backgroundColor: c.warningSoft,
    borderRadius: radius.sm + 2,
    padding: space.sm,
  },
  pendienteText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: c.inkMuted },

  signOut: {
    minHeight: touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  signOutText: { fontSize: 14.5, fontWeight: '600', color: c.inkMuted },

  pressed: { opacity: 0.7 },
}));
