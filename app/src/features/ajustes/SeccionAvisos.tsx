import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { CaretDown, CaretRight, CaretUp, Clock } from 'phosphor-react-native';

import type { SettingsPatch, UserSettings } from '@/api/settings';
import { fonts, makeStyles, space, tabular, touchTarget, useTheme } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { Info } from '@/shared/ui/Info';
import { NotaProximamente } from '@/shared/ui/Proximamente';
import { SelectorHora } from '@/shared/ui/SelectorHora';
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
 * La hora se elige con un reloj de ruedas que sube desde abajo, como el de iOS, y
 * no con una fila de 24 cuadros: ahí no había minutos, y había que buscar el número
 * entre los demás. La fila de aquí enseña la hora elegida; tocarla abre el reloj.
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
  const c = useTheme();
  const [zonasAbiertas, setZonasAbiertas] = useState(false);
  const [relojAbierto, setRelojAbierto] = useState(false);
  // Lo que se ve en las ruedas mientras se elige. No se guarda hasta «Listo»: cada
  // vez que una rueda se para sería un UPDATE, y se acabaría guardando «las 7:12»
  // por pasar por ahí de camino a las 8.
  const [borrador, setBorrador] = useState({ hora: data.digest_hour, minuto: data.digest_minute });

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
        <Bloque>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`A qué hora: ${hora(data.digest_hour, data.digest_minute)}. Cambiar`}
            onPress={() => {
              setBorrador({ hora: data.digest_hour, minuto: data.digest_minute });
              setRelojAbierto(true);
            }}
            style={({ pressed }) => [styles.horaFila, pressed && styles.pulsada]}
          >
            <Clock size={20} color={c.brand} weight="duotone" />
            <Text style={compartidos.rowTitle}>A qué hora</Text>
            <View style={styles.horaValor}>
              <Text style={styles.horaTexto}>{hora(data.digest_hour, data.digest_minute)}</Text>
              <CaretRight size={15} color={c.inkFaint} weight="bold" />
            </View>
          </Pressable>
        </Bloque>
      ) : null}

      <HojaInferior
        visible={relojAbierto}
        onClose={() => setRelojAbierto(false)}
        titulo="¿A qué hora te aviso?"
      >
        <SelectorHora
          hora={borrador.hora}
          minuto={borrador.minuto}
          onCambio={(h, m) => setBorrador({ hora: h, minuto: m })}
        />
        <Button
          label={`Listo · ${hora(borrador.hora, borrador.minuto)}`}
          onPress={() => {
            onPatch({ digest_hour: borrador.hora, digest_minute: borrador.minuto });
            setRelojAbierto(false);
          }}
        />
      </HojaInferior>

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
            <View style={styles.zonaTitulo}>
              <Text style={compartidos.rowTitle}>Zona horaria</Text>
              <Info
                titulo="Zona horaria"
                texto="Con esta se cuenta la hora del aviso y qué es «hoy» en tu inventario."
              />
            </View>
            <Text style={styles.zonaValor}>{data.timezone}</Text>
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

/** «08:05»: la hora con dos cifras en cada parte, como en un reloj. */
function hora(h: number, m: number): string {
  return `${`${h}`.padStart(2, '0')}:${`${m}`.padStart(2, '0')}`;
}

const useStyles = makeStyles((c) => ({
  horaFila: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touchTarget },
  horaValor: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.xs },
  horaTexto: { ...tabular, fontFamily: fonts.semibold, fontSize: 18, color: c.brandInk },
  pulsada: { opacity: 0.7 },
  zonaTitulo: { flexDirection: 'row', alignItems: 'center', gap: space.xs },

  zonaActual: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: touchTarget },
  zonaTexto: { flex: 1, gap: 3 },
  zonaValor: { fontSize: 14.5, color: c.ink },
  zonaLista: { borderTopWidth: 1, borderTopColor: c.border, paddingTop: space.sm },
}));
