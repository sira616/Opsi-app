import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Crown, DotsThree, UserMinus } from 'phosphor-react-native';

import { sacarMiembro, traspasarHogar, type Miembro } from '@/api/household';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { fonts, makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { Etiqueta, Inicial } from '../ui';

type Props = {
  neveraId: string;
  miembros: Miembro[];
  miId: string | null;
  soyQuienLleva: boolean;
};

/** Lo que se está a punto de hacerle a alguien. `null` es «todavía eligiendo». */
type Paso = 'traspasar' | 'sacar' | null;

/**
 * Quién está dentro, con su papel.
 *
 * Las acciones de mando —traspasar y sacar— no están a la vista: cada persona lleva
 * unos puntos («⋯») que abren una hoja con lo que se puede hacer con ella. Antes
 * eran dos botones por cada compañero, y una nevera de cinco personas era una
 * pared de botones donde lo único que se buscaba era saber quién está.
 *
 * Los puntos solo se pintan si de verdad se tiene el mando: el servidor rechaza
 * esas acciones con un 42501 y ese código es el único que la app traduce por un
 * texto genérico, así que un botón de más aquí se convierte en un error que no
 * explica nada.
 *
 * La confirmación va DENTRO de la hoja y no en una segunda: tocar una opción
 * cambia el contenido por la pregunta, y la acción no se hace hasta el «Sí».
 */
export function Miembros({ neveraId, miembros, miId, soyQuienLleva }: Props) {
  const styles = useStyles();
  const t = useType();
  const c = useTheme();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<Miembro | null>(null);
  const [paso, setPaso] = useState<Paso>(null);

  async function recargarMiembros() {
    setError(null);
    await queryClient.invalidateQueries({ queryKey: queryKeys.miembros(neveraId) });
  }

  function cerrarHoja() {
    setElegido(null);
    setPaso(null);
  }

  const sacar = useMutation({
    mutationFn: (userId: string) => sacarMiembro(neveraId, userId),
    onSuccess: async () => {
      cerrarHoja();
      await recargarMiembros();
    },
    onError: (caught: unknown) => {
      cerrarHoja();
      setError(describeDbError(caught));
    },
  });

  const traspasar = useMutation({
    mutationFn: (userId: string) => traspasarHogar(neveraId, userId),
    onSuccess: async () => {
      cerrarHoja();
      await recargarMiembros();
    },
    onError: (caught: unknown) => {
      cerrarHoja();
      setError(describeDbError(caught));
    },
  });

  const ocupado = sacar.isPending || traspasar.isPending;

  return (
    <View style={styles.lista}>
      {miembros.map((miembro) => {
        const soyYo = miembro.user_id === miId;
        const mandaEsta = miembro.role === 'owner';
        const puedoActuarSobreElla = soyQuienLleva && !soyYo;

        return (
          <View key={miembro.user_id} style={styles.miembro}>
            <Inicial nombre={miembro.username} />
            <View style={styles.nombreFila}>
              <Text style={styles.nombre} numberOfLines={1}>
                {miembro.username}
              </Text>
              {soyYo ? <Etiqueta texto="Tú" fuerte /> : null}
              {mandaEsta ? <Etiqueta texto="Lleva la nevera" /> : null}
            </View>

            {puedoActuarSobreElla ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Opciones de ${miembro.username}`}
                onPress={() => {
                  setPaso(null);
                  setElegido(miembro);
                }}
                hitSlop={6}
                style={({ pressed }) => [styles.puntos, pressed && styles.pulsado]}
              >
                <DotsThree size={26} color={c.inkMuted} weight="bold" />
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {miembros.length === 1 ? (
        <Text style={t.caption}>Ahora mismo estás tú y nadie más.</Text>
      ) : null}

      <ErrorNote message={error} />

      <HojaInferior
        visible={elegido !== null}
        onClose={cerrarHoja}
        titulo={elegido ? elegido.username : undefined}
      >
        {elegido && paso === null ? (
          <View style={styles.opciones}>
            <Opcion
              icono={<Crown size={22} color={c.brand} weight="duotone" />}
              etiqueta="Pasarle la nevera"
              onPress={() => setPaso('traspasar')}
            />
            <Opcion
              icono={<UserMinus size={22} color={c.expiry} weight="duotone" />}
              etiqueta="Sacar de la nevera"
              peligro
              onPress={() => setPaso('sacar')}
            />
          </View>
        ) : null}

        {elegido && paso !== null ? (
          <View style={styles.confirmar}>
            <Text style={styles.pregunta}>
              {paso === 'traspasar'
                ? `¿Pasarle la nevera a ${elegido.username}? A partir de ahí invita y saca gente esa persona, no tú.`
                : `¿Sacar a ${elegido.username}? Empezará con una nevera vacía y lo que hay guardado aquí se queda aquí.`}
            </Text>
            <View style={styles.botones}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: ocupado }}
                disabled={ocupado}
                onPress={() =>
                  paso === 'traspasar'
                    ? traspasar.mutate(elegido.user_id)
                    : sacar.mutate(elegido.user_id)
                }
                style={({ pressed }) => [
                  styles.si,
                  paso === 'sacar' && styles.siPeligro,
                  (pressed || ocupado) && styles.pulsado,
                ]}
              >
                <Text style={styles.siTexto}>
                  {paso === 'traspasar' ? 'Sí, pasársela' : `Sí, sacar a ${elegido.username}`}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPaso(null)}
                style={({ pressed }) => [styles.no, pressed && styles.pulsado]}
              >
                <Text style={styles.noTexto}>Atrás</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </HojaInferior>
    </View>
  );
}

function Opcion({
  icono,
  etiqueta,
  peligro,
  onPress,
}: {
  icono: React.ReactNode;
  etiqueta: string;
  peligro?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.opcion, peligro && styles.opcionPeligro, pressed && styles.pulsado]}
    >
      {icono}
      <Text style={[styles.opcionTexto, peligro && styles.opcionTextoPeligro]}>{etiqueta}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  lista: { gap: space.md },
  miembro: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  nombreFila: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  nombre: { fontFamily: fonts.semibold, fontSize: 15, color: c.ink, flexShrink: 1 },
  puntos: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsado: { opacity: 0.6 },

  opciones: { gap: space.sm },
  opcion: {
    minHeight: touchTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  opcionPeligro: { borderColor: c.expiryLine },
  opcionTexto: { fontFamily: fonts.semibold, fontSize: 15.5, color: c.ink },
  opcionTextoPeligro: { color: c.expiry },

  confirmar: { gap: space.lg },
  pregunta: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 23, color: c.ink },
  botones: { gap: space.sm },
  si: {
    minHeight: touchTarget + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: c.ink,
  },
  siPeligro: { backgroundColor: c.expiry },
  siTexto: { fontFamily: fonts.semibold, fontSize: 15, color: c.ground },
  no: {
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  noTexto: { fontFamily: fonts.semibold, fontSize: 15, color: c.inkMuted },
}));
