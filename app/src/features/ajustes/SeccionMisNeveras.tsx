import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { CaretRight } from 'phosphor-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { fetchInvitacionesRecibidas, type Nevera } from '@/api/household';
import { describirNevera, textoTope, useLimiteNeveras } from '@/features/neveras/datos';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { IconoNevera } from '@/shared/lib/iconos-nevera';
import { queryKeys } from '@/shared/lib/query';
import { fonts, makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';
import { InvitacionesRecibidas } from './nevera/InvitacionesRecibidas';
import { Accion, Bloque, Nota, Section } from './ui';

/**
 * Mis neveras: la privada y las compartidas, cada una a un toque de su gestión.
 *
 * Antes esto era «Nevera compartida», una sola sección que trabajaba sobre la
 * nevera que se estaba mirando. Con varias neveras por persona esa sección no
 * decía a cuál se refería, y ofrecía invitar sobre una privada, que no se
 * comparte. Ahora Ajustes solo LISTA: qué hay, de quién, cuánta gente, y a qué
 * pantalla ir para tocar cada una (`nevera/[id]`), donde las acciones ya saben
 * de cuál hablan.
 *
 * Las invitaciones recibidas van ARRIBA de la lista, antes que las neveras que
 * ya tienes: es lo único de la sección que espera una respuesta.
 */
export function SeccionMisNeveras() {
  const router = useRouter();
  const t = useType();
  const { neveras } = useNeveraActual();
  const { limite, enElMaximo, hayCompartidas } = useLimiteNeveras();
  const [explicarTope, setExplicarTope] = useState(false);

  const recibidas = useQuery({
    queryKey: queryKeys.invitacionesRecibidas,
    queryFn: fetchInvitacionesRecibidas,
  });

  function crear() {
    if (enElMaximo) {
      setExplicarTope(true);
      return;
    }
    router.push('/nevera/nueva');
  }

  return (
    <Section title="Mis neveras">
      {recibidas.data && recibidas.data.length > 0 ? (
        <Bloque>
          <InvitacionesRecibidas recibidas={recibidas.data} />
        </Bloque>
      ) : null}

      <Bloque>
        {neveras.map((nevera, i) => (
          <Fila key={nevera.id} nevera={nevera} primera={i === 0} />
        ))}
      </Bloque>

      <Bloque>
        {limite !== null ? (
          <Text style={t.caption}>
            Tienes {neveras.length} de {limite}.
          </Text>
        ) : null}
        {/*
          Como en el selector, el botón NO se esconde cuando ya no cabe otra: uno
          que desaparece deja a la persona buscando dónde se crean, y uno
          desactivado sin explicación no dice por qué. Se queda, y al pulsarlo
          cuenta el tope.
        */}
        <Accion label="Crear nevera compartida" onPress={crear} />
        {explicarTope && limite !== null ? (
          <Nota alerta tono="aviso" texto={textoTope(limite, hayCompartidas)} />
        ) : null}
      </Bloque>
    </Section>
  );
}

function Fila({ nevera, primera }: { nevera: Nevera; primera: boolean }) {
  const router = useRouter();
  const styles = useStyles();
  const c = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Gestionar la nevera ${nevera.name}`}
      accessibilityHint={describirNevera(nevera)}
      onPress={() => router.push({ pathname: '/nevera/[id]', params: { id: nevera.id } })}
      style={({ pressed }) => [styles.fila, !primera && styles.separada, pressed && styles.pressed]}
    >
      <View style={styles.icono}>
        <IconoNevera icono={nevera.icon} size={22} color={c.brandInk} />
      </View>
      <View style={styles.texto}>
        <Text style={styles.nombre} numberOfLines={1}>
          {nevera.name}
        </Text>
        <Text style={styles.detalle} numberOfLines={1}>
          {describirNevera(nevera)}
        </Text>
      </View>
      <CaretRight size={18} color={c.inkFaint} weight="bold" />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touchTarget + 8,
    paddingVertical: space.sm,
  },
  // La línea entre filas, y no un borde en cada una: la primera no tiene nada
  // encima con lo que separarse.
  separada: { borderTopWidth: 1, borderTopColor: c.border },
  pressed: { opacity: 0.6 },
  icono: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: c.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { flex: 1, minWidth: 0, gap: 1 },
  nombre: { fontFamily: fonts.semibold, fontSize: 16, color: c.ink },
  detalle: { fontSize: 13, color: c.inkMuted },
}));
