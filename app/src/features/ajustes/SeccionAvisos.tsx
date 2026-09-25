import { useState } from 'react';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { CaretDown, CaretUp } from 'phosphor-react-native';

import type { SettingsPatch, UserSettings } from '@/api/settings';
import { makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';
import { NotaProximamente } from '@/shared/ui/Proximamente';
import { Accion, Bloque, Row, Section, useAjustesStyles } from './ui';

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

type Props = {
  data: UserSettings;
  onPatch: (next: SettingsPatch) => void;
  guardando: boolean;
};

/**
 * Cuándo te aviso, y con qué reloj.
 *
 * La zona horaria era una sección aparte y ahora vive aquí dentro. No es solo
 * orden: la zona existe para decidir a qué hora cae el aviso, así que separarla
 * obligaba a leer dos bloques para entender uno. Sigue haciendo la otra cosa
 * que hacía —decidir qué cuenta como «hoy» en el inventario— y eso se dice en
 * su propia línea.
 *
 * Nada de esto manda todavía ninguna notificación: eso es fase 3. Lo que se
 * elige aquí se guarda de verdad, y la nota del final lo dice con esas
 * palabras en vez de dejar que el interruptor lo insinúe.
 */
export function SeccionAvisos({ data, onPatch, guardando }: Props) {
  const styles = useStyles();
  const compartidos = useAjustesStyles();
  const t = useType();
  const c = useTheme();
  const [zonasAbiertas, setZonasAbiertas] = useState(false);

  const device = deviceTimezone();

  return (
    <Section title="Avisos">
      <Row
        title="Resumen diario"
        subtitle="Un solo aviso al día con lo que conviene gastar. Si no hay nada urgente, no te molesto."
        right={
          <Switch
            value={data.digest_enabled}
            onValueChange={(v) => onPatch({ digest_enabled: v })}
            trackColor={{ true: c.brand, false: c.borderStrong }}
            disabled={guardando}
          />
        }
      />

      {data.digest_enabled ? (
        <View style={styles.horas}>
          <Text style={t.label}>A qué hora</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horaFila}
          >
            {Array.from({ length: 24 }, (_, h) => h).map((hora) => {
              const on = data.digest_hour === hora;
              const dosCifras = `${hora}`.padStart(2, '0');
              return (
                <Pressable
                  key={hora}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  // El número suelto se lee «cero siete» y no dice qué hace al
                  // pulsarlo. La etiqueta describe la acción, como el resto.
                  accessibilityLabel={`Avisarme a las ${hora}:00`}
                  onPress={() => onPatch({ digest_hour: hora })}
                  style={[styles.hora, on && styles.horaOn]}
                >
                  <Text style={[styles.horaText, on && styles.horaTextOn]}>{dosCifras}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      {/* ── Zona horaria ───────────────────────────────────────────────── */}
      <Bloque>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            zonasAbiertas ? 'Cerrar la lista de zonas horarias' : 'Cambiar la zona horaria'
          }
          accessibilityState={{ expanded: zonasAbiertas }}
          onPress={() => setZonasAbiertas((v) => !v)}
          style={styles.zonaActual}
        >
          <View style={styles.zonaTexto}>
            <Text style={compartidos.rowTitle}>Zona horaria</Text>
            <Text style={styles.zonaValor}>{data.timezone}</Text>
            <Text style={t.caption}>
              Con esta se cuenta la hora del aviso y qué es «hoy» en tu inventario.
            </Text>
          </View>
          {zonasAbiertas ? (
            <CaretUp size={17} color={c.inkMuted} weight="bold" />
          ) : (
            <CaretDown size={17} color={c.inkMuted} weight="bold" />
          )}
        </Pressable>

        {zonasAbiertas ? (
          <View style={styles.zonaLista}>
            {device && device !== data.timezone ? (
              <Accion
                label={`${device} · la de este dispositivo`}
                onPress={() => {
                  onPatch({ timezone: device });
                  setZonasAbiertas(false);
                }}
              />
            ) : null}
            {COMMON_ZONES.filter((z) => z !== data.timezone).map((zona) => (
              <Accion
                key={zona}
                label={zona}
                onPress={() => {
                  onPatch({ timezone: zona });
                  setZonasAbiertas(false);
                }}
              />
            ))}
          </View>
        ) : null}
      </Bloque>

      <NotaProximamente
        fase="Fase 3"
        que="Los avisos llegan en la fase 3. Lo que elijas aquí se guarda desde ya."
      />
    </Section>
  );
}

const useStyles = makeStyles((c) => ({
  horas: { gap: space.sm, borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.lg },
  horaFila: { gap: space.sm - 2, paddingRight: space.lg },
  hora: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 2,
    borderWidth: 1,
    borderColor: c.border,
  },
  horaOn: { backgroundColor: c.brandSoft, borderColor: c.brand, borderWidth: 1.5 },
  horaText: { fontSize: 14, fontWeight: '600', color: c.inkMuted },
  horaTextOn: { color: c.brand },

  zonaActual: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touchTarget },
  zonaTexto: { flex: 1, gap: 3 },
  zonaValor: { fontSize: 14.5, color: c.ink },
  zonaLista: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm },
}));
