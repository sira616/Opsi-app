import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CaretDown, CaretUp, CircleHalf, Clock, Moon, Sun } from 'phosphor-react-native';

import { fetchSettings, updateSettings, type UserSettings } from '@/api/settings';
import { describeDbError } from '@/shared/lib/db-errors';
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
  const { session, signOut } = useSession();
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

  function patch(next: Partial<UserSettings>) {
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
              <Row title="Sesión" subtitle={session?.user.email ?? '—'} />
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
        ) : null}
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
