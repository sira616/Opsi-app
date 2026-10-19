import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Check } from 'phosphor-react-native';

import { guardarPreferenciasSalud } from '@/api/salud';
import { usePreferenciasSalud } from '@/features/salud/useSalud';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { CLAVES_SALUD, PREFERENCIAS_SALUD, type ClaveSalud } from '@/shared/lib/salud';
import { useSession } from '@/shared/lib/session';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Accion, Nota, Section, useAjustesStyles } from './ui';

/**
 * Qué alérgenos e intolerancias evitas, para que Opsi te lo marque en la nevera.
 *
 * Marca, no prohíbe: no hay ningún botón que se apague por lo que elijas aquí, y así se
 * dice. El cruce con cada producto se hace en el móvil (`shared/lib/salud.ts`).
 *
 * ── Un dato de salud ──────────────────────────────────────────────────────
 *
 * Lo que se marca aquí es un dato de salud, y se trata como tal: se guarda en
 * `user_health_preferences` (solo lo lee su dueña), vive en la caché en memoria y no
 * va a ningún otro sitio. Por eso esta sección no escribe nada en el dispositivo y el
 * error de guardado se enseña sin sus detalles (`guardarPreferenciasSalud`).
 *
 * ── Cada toque se guarda ──────────────────────────────────────────────────
 *
 * No hay botón de guardar: un toque, una escritura, como el resto de ajustes. Con un
 * cambio detrás de otro los guardados van en cola (`scope`) y el marcado enseña ya la
 * última lista, no la que devolvió el servidor la vez anterior: si no, un toque rápido
 * parecería no hacer nada. Si falla, se enseña el mensaje del servidor tal cual y se
 * vuelve a lo guardado de verdad.
 *
 * ── La honestidad sobre el límite va a la vista ───────────────────────────
 *
 * Opsi solo avisa de lo que Open Food Facts declara, y eso a veces está incompleto. Lo
 * que protege a alguien no se esconde detrás de una «i» (ver `Info`): la nota de
 * abajo es visible siempre.
 */
export function SeccionSalud() {
  const styles = useStyles();
  const compartidos = useAjustesStyles();
  const c = useTheme();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const { preferencias, cargando, error: errorCarga, recargar } = usePreferenciasSalud();
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    scope: { id: 'preferencias-salud' },
    mutationFn: (avoid: ClaveSalud[]) => {
      if (!userId) {
        throw Object.assign(new Error('Tu sesión ha caducado. Vuelve a entrar.'), { code: '28000' });
      }
      return guardarPreferenciasSalud(userId, avoid);
    },
    onSuccess(guardadas) {
      setError(null);
      // Lo que quedó guardado manda. Nada más depende del valor de estas preferencias.
      queryClient.setQueryData(queryKeys.preferenciasSalud, guardadas);
    },
    onError(caught: unknown) {
      setError(describeDbError(caught));
      // Se vuelve a lo guardado de verdad. El texto del error se queda como lo dio el servidor.
      void queryClient.invalidateQueries({ queryKey: queryKeys.preferenciasSalud });
    },
  });

  const elegidas: readonly ClaveSalud[] =
    guardar.isPending && guardar.variables ? guardar.variables : preferencias;

  function alternar(clave: ClaveSalud) {
    const siguiente = CLAVES_SALUD.filter((k) =>
      k === clave ? !elegidas.includes(k) : elegidas.includes(k),
    );
    setError(null);
    guardar.mutate(siguiente);
  }

  return (
    <Section title="Alérgenos e intolerancias">
      <View style={styles.intro}>
        <Text style={compartidos.rowSubtitle}>
          Marco en tu nevera lo que lleve esto. Nunca te impido añadir nada.
        </Text>
        <Text style={compartidos.rowSubtitle}>
          Solo lo ves tú, ni siquiera quien comparte nevera contigo.
        </Text>
      </View>

      {cargando ? <ActivityIndicator color={c.brand} /> : null}

      {errorCarga ? (
        <>
          <ErrorNote message={errorCarga} />
          <Accion label="Reintentar" onPress={() => void recargar()} />
        </>
      ) : null}

      {/* Sin la lista cargada no se enseñan las casillas: guardar a ciegas pisaría lo que ya había. */}
      {!cargando && !errorCarga ? (
        <View style={styles.casillas}>
          {PREFERENCIAS_SALUD.map((p) => {
            const marcada = elegidas.includes(p.clave);
            return (
              <Pressable
                key={p.clave}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: marcada }}
                accessibilityLabel={p.etiqueta}
                onPress={() => alternar(p.clave)}
                style={({ pressed }) => [
                  styles.casilla,
                  marcada && styles.casillaOn,
                  pressed && compartidos.pressed,
                ]}
              >
                {marcada ? <Check size={14} color={c.brandInk} weight="bold" /> : null}
                <Text style={[styles.casillaTexto, marcada && styles.casillaTextoOn]}>{p.etiqueta}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <ErrorNote message={error} />

      <Nota
        tono="aviso"
        texto="Solo aviso de lo que declara Open Food Facts, y a veces está incompleto. No cubro otras intolerancias, como la histamina o la fructosa. Mira siempre la etiqueta."
      />
    </Section>
  );
}

const useStyles = makeStyles((c) => ({
  intro: { gap: space.xs },
  casillas: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm - 2 },
  casilla: {
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
  casillaOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  casillaTexto: { fontFamily: fonts.semibold, fontSize: 13, color: c.inkMuted, flexShrink: 1 },
  casillaTextoOn: { color: c.brandInk },
}));
