import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { actions, type PriorityItem } from '@/api/inventory';
import { describeDbError } from '@/shared/lib/db-errors';
import { hoyIso } from '@/shared/lib/calendario';
import { recomendarCongelar } from '@/shared/lib/congelar';
import { guardarDiaAviso, leerAvisosActivos, leerDiaAviso } from '@/shared/lib/avisos-locales';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { queryKeys } from '@/shared/lib/query';
import { fonts, makeStyles, radius, space, useTheme } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';

import { avisosDe, preguntaDeReceta, tocaAvisar, type Aviso } from './avisos';

type Props = {
  /** Lo que hay en la nevera que se está mirando. */
  items: readonly PriorityItem[];
  householdId: string;
  /** La lista ya llegó: antes de eso no se sabe qué avisar, y no se decide nada. */
  listo: boolean;
};

/**
 * El pop-up de avisos al abrir la nevera: «esto vence pronto: congélalo o úsalo».
 *
 * Qué avisar y cuándo lo decide `avisos.ts` (con tests). Aquí solo se pinta y se actúa:
 *
 *   · **Congelarlo** hace la acción de verdad (`freeze_item`, con su evento) y quita el
 *     aviso. Congelar se deshace descongelando, así que no pide confirmación.
 *   · **Hacer una receta** abre el chat con la pregunta ya escrita (sin enviarla). El chat
 *     todavía no contesta (la IA no está conectada), y lo dice él, no este pop-up.
 *   · **Ahora no** lo cierra. Salga o no, hoy no vuelve: el día se anota al ENSEÑARLO, no al
 *     cerrarlo, para que cerrar la app con el aviso abierto tampoco lo repita.
 *
 * Se decide UNA vez por apertura de la pantalla, cuando llega la lista. Un `refetch`
 * posterior no vuelve a lanzarlo, y cambiar de nevera tampoco: es un aviso al abrir, no un
 * avisador que salta en mitad de lo que se hace.
 */
export function PopupAvisos({ items, householdId, listo }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [congelando, setCongelando] = useState<string | null>(null);
  const decidido = useRef(false);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    if (!listo || decidido.current) return;
    decidido.current = true;

    const candidatos = avisosDe(items, recomendarCongelar);
    if (candidatos.length === 0) return;

    void (async () => {
      const [activos, ultimoDia] = await Promise.all([leerAvisosActivos(), leerDiaAviso()]);
      const hoy = hoyIso();
      if (!montado.current || !tocaAvisar({ activos, avisos: candidatos, ultimoDia, hoy })) return;
      await guardarDiaAviso(hoy);
      if (!montado.current) return;
      setAvisos(candidatos);
      setVisible(true);
    })();
  }, [listo, items]);

  function cerrar() {
    setVisible(false);
    setError(null);
  }

  async function congelar(aviso: Aviso) {
    setError(null);
    setCongelando(aviso.itemId);
    try {
      await actions.freeze(aviso.itemId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.priorityList(householdId) });
      const quedan = avisos.filter((a) => a.itemId !== aviso.itemId);
      setAvisos(quedan);
      if (quedan.length === 0) setVisible(false);
    } catch (caught) {
      setError(describeDbError(caught));
    } finally {
      setCongelando(null);
    }
  }

  function receta(aviso: Aviso) {
    cerrar();
    // Una hoja detrás de otra pantalla: se espera a que la primera acabe de bajar (en iOS,
    // un `Modal` y una navegación a la vez no se llevan bien).
    setTimeout(() => {
      router.push({ pathname: '/chat', params: { mensaje: preguntaDeReceta(aviso.nombre) } });
    }, 300);
  }

  return (
    <HojaInferior visible={visible} onClose={cerrar} titulo="Para hoy">
      {avisos.map((a) => (
        <View key={a.itemId} style={styles.aviso}>
          <View style={styles.cabecera}>
            <View style={styles.icono}>
              <IconoComida nombre={a.nombre} size={22} color={c.brand} weight="duotone" />
            </View>
            <View style={styles.texto}>
              <Text style={styles.nombre} numberOfLines={2}>
                {a.nombre}
              </Text>
              <Text style={styles.detalle}>{a.texto}</Text>
            </View>
          </View>
          <View style={styles.acciones}>
            {a.tipo === 'congelar' ? (
              <Button
                label="Congelarlo"
                onPress={() => void congelar(a)}
                loading={congelando === a.itemId}
                disabled={congelando !== null}
              />
            ) : null}
            <Button
              label="Hacer una receta"
              variant={a.tipo === 'congelar' ? 'quiet' : 'primary'}
              onPress={() => receta(a)}
              disabled={congelando !== null}
            />
          </View>
        </View>
      ))}
      <ErrorNote message={error} />
      <Button label="Ahora no" variant="quiet" onPress={cerrar} disabled={congelando !== null} />
    </HojaInferior>
  );
}

const useStyles = makeStyles((c) => ({
  aviso: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  icono: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.brandSoft,
  },
  texto: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.semibold, fontSize: 16, color: c.ink },
  detalle: { fontSize: 13.5, lineHeight: 19, color: c.inkMuted },
  acciones: { gap: space.xs },
}));
