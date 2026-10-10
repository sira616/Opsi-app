import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { EnvelopeSimple } from 'phosphor-react-native';
import { Pressable, Text, View } from 'react-native';

import { fetchInvitacionesRecibidas } from '@/api/household';
import { queryKeys } from '@/shared/lib/query';
import { fonts, makeStyles, radius, space, touchTarget, useTheme, useType } from '@/shared/theme/tokens';

/**
 * «Te han invitado», en el inicio.
 *
 * Existe porque todavía no hay avisos push: sin esto, la única forma de enterarse
 * de que alguien te ha invitado a su nevera sería entrar en Ajustes por si
 * acaso, y nadie lo hace. Es un aviso, no un botón de aceptar: aceptar está en
 * Ajustes, con su confirmación, y esto solo te lleva allí.
 *
 * Comparte consulta con la lista de Ajustes (misma clave): son UNA petición y
 * las dos pantallas se enteran a la vez de que ya la has contestado.
 *
 * Si la consulta falla, no se enseña nada. Es un aviso de cortesía: un error
 * aquí, en la pantalla principal, sería ruido por algo que no ha pedido nadie.
 */
export function AvisoInvitaciones() {
  const router = useRouter();
  const styles = useStyles();
  const t = useType();
  const c = useTheme();

  const recibidas = useQuery({
    queryKey: queryKeys.invitacionesRecibidas,
    queryFn: fetchInvitacionesRecibidas,
  });

  const lista = recibidas.data ?? [];
  const primera = lista[0];
  if (!primera) return null;

  const resto = lista.length - 1;
  const titulo =
    resto > 0
      ? `Te han invitado a «${primera.household_name}» y a ${resto} más`
      : `Te han invitado a «${primera.household_name}»`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titulo}. Ver las invitaciones`}
      onPress={() => router.push('/ajustes')}
      style={({ pressed }) => [styles.tarjeta, pressed && styles.pressed]}
    >
      <View style={styles.icono}>
        <EnvelopeSimple size={22} color={c.brandInk} weight="duotone" />
      </View>
      <View style={styles.texto}>
        <Text style={styles.titulo} numberOfLines={2}>
          {titulo}
        </Text>
        <Text style={t.bodySmall} numberOfLines={2}>
          {primera.inviter_username} quiere compartir nevera contigo. Tú decides.
        </Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touchTarget + 16,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: c.brand,
    backgroundColor: c.brandSoft,
  },
  pressed: { opacity: 0.7 },
  icono: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { flex: 1, minWidth: 0, gap: 2 },
  titulo: { fontFamily: fonts.displaySemi, fontSize: 16, color: c.brandInk },
}));
