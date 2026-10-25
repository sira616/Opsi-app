import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DotsThree, Plus, Star, Trash, UsersThree, User } from 'phosphor-react-native';

import type { Nevera } from '@/api/household';
import { borrarLista, crearLista, renombrarLista, type Lista, type TipoLista } from '@/api/lista';
import type { Plan } from '@/api/settings';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { useSession } from '@/shared/lib/session';
import { Button } from '@/shared/ui/Button';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { TextField } from '@/shared/ui/TextField';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

import { cabeAlguna, cabeOtra, cupoDe, describirLista } from './listas';

type Props = {
  /** Las listas que se enseñan: las individuales y las compartidas de la nevera que se mira. */
  listas: Lista[];
  /** TODAS las de la cuenta, para contar cuántas ha creado la persona y si caben más. */
  todas: Lista[];
  /** La nevera que se mira: es donde se crea una lista compartida. */
  nevera: Nevera;
  activaId: string;
  onElegir: (id: string) => void;
  plan: Plan;
};

/**
 * Las listas que se ven al mirar una nevera, como píldoras, con «Nueva lista» y el menú de la
 * elegida.
 *
 * Hay dos clases: las **individuales**, que son tuyas y van contigo a cualquier nevera, y las
 * **compartidas**, que son de esta nevera y las ven todos sus miembros. Al crear una se elige
 * cuál. El tope es por cuenta (básico: una de cada; premium: cinco en total) y lo impone el
 * servidor; aquí solo se evita ofrecer lo que va a fallar y se explica el porqué.
 *
 * «Nueva lista» está siempre: llegado el tope no desaparece sino que explica qué hay (con la
 * estrella de premium), en lugar de dejar a la gente sin saber por qué no puede.
 */
export function SelectorListas({ listas, todas, nevera, activaId, onElegir, plan }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session } = useSession();

  const [hoja, setHoja] = useState<'nueva' | 'gestionar' | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<TipoLista>('personal');
  const [error, setError] = useState<string | null>(null);

  // Quien lo monta solo lo hace con alguna lista (siempre hay una individual): nunca es undefined.
  const activa = (listas.find((l) => l.id === activaId) ?? listas[0]) as Lista;

  const cupo = cupoDe(todas, session?.user.id ?? null);
  // Una compartida en una nevera de una sola persona no se comparte con nadie.
  const puedeCompartir = nevera.kind === 'shared';
  const lleno = !cabeAlguna(plan, cupo);
  const veredicto = cabeOtra(plan, tipo, cupo);
  const individuales = todas.filter((l) => l.kind === 'personal').length;

  const refrescar = () => queryClient.invalidateQueries({ queryKey: queryKeys.lista });

  function cerrar() {
    setHoja(null);
    setError(null);
  }

  const crear = useMutation({
    mutationFn: () =>
      crearLista(tipo === 'shared' ? { tipo: 'shared', householdId: nevera.id } : { tipo: 'personal' }, nombre),
    async onSuccess(id) {
      await refrescar();
      onElegir(id);
      cerrar();
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  const renombrar = useMutation({
    mutationFn: () => renombrarLista(activa.id, nombre),
    async onSuccess() {
      await refrescar();
      cerrar();
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  const borrar = useMutation({
    mutationFn: () => borrarLista(activa.id),
    async onSuccess() {
      const otra = listas.find((l) => l.id !== activa.id);
      if (otra) onElegir(otra.id);
      await refrescar();
      cerrar();
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  function abrir(cual: 'nueva' | 'gestionar') {
    setError(null);
    setNombre(cual === 'gestionar' ? (activa.name ?? '') : '');
    if (cual === 'nueva') {
      // El tipo que cabe: la individual si cabe; si no, la compartida (donde se puede compartir).
      setTipo(cabeOtra(plan, 'personal', cupo).cabe || !puedeCompartir ? 'personal' : 'shared');
    }
    setHoja(cual);
  }

  // La última individual no se borra: es donde cae lo que se apunta sin elegir.
  const esUltimaIndividual = activa.kind === 'personal' && individuales <= 1;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.fila}
        keyboardShouldPersistTaps="handled"
      >
        {listas.map((lista) => {
          const on = lista.id === activa.id;
          return (
            <Pressable
              key={lista.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Lista ${lista.name}, ${describirLista(lista, [nevera])}`}
              onPress={() => onElegir(lista.id)}
              style={[styles.pildora, on && styles.pildoraOn]}
            >
              {lista.kind === 'shared' ? (
                <UsersThree size={14} color={on ? c.brandInk : c.inkMuted} weight="bold" />
              ) : null}
              <Text style={[styles.pildoraTexto, on && styles.pildoraTextoOn]} numberOfLines={1}>
                {lista.name}
              </Text>
            </Pressable>
          );
        })}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nueva lista"
          onPress={() => abrir('nueva')}
          style={({ pressed }) => [styles.pildora, styles.nueva, pressed && styles.pulsado]}
        >
          {lleno && plan === 'basic' ? (
            <Star size={14} color={c.brandInk} weight="fill" />
          ) : (
            <Plus size={14} color={c.brandInk} weight="bold" />
          )}
          <Text style={styles.nuevaTexto}>Nueva lista</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Opciones de la lista ${activa.name ?? ''}`}
          onPress={() => abrir('gestionar')}
          hitSlop={6}
          style={({ pressed }) => [styles.mas, pressed && styles.pulsado]}
        >
          <DotsThree size={22} color={c.inkMuted} weight="bold" />
        </Pressable>
      </ScrollView>

      {/* Nueva lista: el tipo, el nombre, o por qué no cabe. */}
      <HojaInferior visible={hoja === 'nueva'} onClose={cerrar} titulo="Nueva lista">
        <View style={styles.cuerpo}>
          <View style={styles.tipos} accessibilityRole="radiogroup">
            <Tipo
              icono={<User size={20} color={tipo === 'personal' ? c.brandInk : c.inkMuted} weight="duotone" />}
              titulo="Individual"
              texto="Solo la ves tú y sirve en todas tus neveras."
              elegido={tipo === 'personal'}
              onPress={() => setTipo('personal')}
            />
            <Tipo
              icono={<UsersThree size={20} color={tipo === 'shared' ? c.brandInk : c.inkMuted} weight="duotone" />}
              titulo="Compartida"
              texto={
                puedeCompartir
                  ? `La ven todos los de ${nevera.name}.`
                  : 'Para compartir una lista, entra primero en una nevera compartida.'
              }
              elegido={tipo === 'shared'}
              apagado={!puedeCompartir}
              onPress={() => puedeCompartir && setTipo('shared')}
            />
          </View>

          {veredicto.cabe ? (
            <>
              <TextField
                label="Cómo se llama"
                value={nombre}
                onChangeText={setNombre}
                placeholder="Cumpleaños, ferretería…"
                maxLength={40}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={() => nombre.trim() && crear.mutate()}
              />
              <ErrorNote message={error} />
              <Button
                label="Crear lista"
                onPress={() => crear.mutate()}
                loading={crear.isPending}
                disabled={!nombre.trim()}
              />
            </>
          ) : (
            <>
              <Text style={styles.texto}>{veredicto.motivo}</Text>
              {veredicto.conPremium ? (
                <Button
                  label="Ver Opsi Premium ⭐"
                  onPress={() => {
                    cerrar();
                    router.navigate('/premium');
                  }}
                />
              ) : null}
            </>
          )}
        </View>
      </HojaInferior>

      {/* Renombrar o borrar la lista elegida. */}
      <HojaInferior visible={hoja === 'gestionar'} onClose={cerrar} titulo={activa.name}>
        <View style={styles.cuerpo}>
          <Text style={styles.tipoTexto}>{describirLista(activa, [nevera])}</Text>
          <TextField
            label="Nombre"
            value={nombre}
            onChangeText={setNombre}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={() => nombre.trim() && renombrar.mutate()}
          />
          <Button
            label="Guardar nombre"
            onPress={() => renombrar.mutate()}
            loading={renombrar.isPending}
            disabled={!nombre.trim() || nombre.trim() === activa.name}
          />
          <ErrorNote message={error} />

          {esUltimaIndividual ? (
            <Text style={styles.texto}>
              Tiene que quedar al menos una lista individual, así que esta no se puede eliminar.
            </Text>
          ) : (
            <ConfirmAction
              label="Eliminar esta lista"
              icon={<Trash size={20} color={c.expiry} weight="duotone" />}
              confirmLabel="Sí, eliminarla"
              question={
                activa.kind === 'shared'
                  ? `¿Borrar «${activa.name}» con todo lo que tiene apuntado? Se borra para todos los de ${nevera.name}. No se puede deshacer.`
                  : `¿Borrar «${activa.name}» con todo lo que tiene apuntado? No se puede deshacer.`
              }
              busy={borrar.isPending}
              onConfirm={() => borrar.mutate()}
            />
          )}
        </View>
      </HojaInferior>
    </>
  );
}

/** Una de las dos clases de lista, como tarjeta que se elige. */
function Tipo({
  icono,
  titulo,
  texto,
  elegido,
  apagado,
  onPress,
}: {
  icono: React.ReactNode;
  titulo: string;
  texto: string;
  elegido: boolean;
  apagado?: boolean;
  onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: elegido, disabled: apagado }}
      accessibilityLabel={`${titulo}. ${texto}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tipo,
        elegido && styles.tipoOn,
        apagado && styles.tipoApagado,
        pressed && !apagado && styles.pulsado,
      ]}
    >
      {icono}
      <View style={styles.tipoCuerpo}>
        <Text style={[styles.tipoTitulo, elegido && styles.tipoTituloOn]}>{titulo}</Text>
        <Text style={styles.tipoTexto}>{texto}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  fila: { gap: space.sm, alignItems: 'center', paddingRight: space.lg },
  pildora: {
    minHeight: touchTarget - 6,
    maxWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  pildoraOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  pildoraTexto: { fontFamily: fonts.semibold, fontSize: 13.5, color: c.inkMuted },
  pildoraTextoOn: { color: c.brandInk },
  nueva: { borderStyle: 'dashed', backgroundColor: 'transparent', borderColor: c.borderStrong },
  nuevaTexto: { fontFamily: fonts.semibold, fontSize: 13, color: c.brandInk },
  mas: { width: touchTarget - 6, height: touchTarget - 6, alignItems: 'center', justifyContent: 'center' },
  pulsado: { opacity: 0.7 },
  cuerpo: { gap: space.md },
  texto: { fontSize: 14, lineHeight: 20, color: c.inkMuted },

  tipos: { gap: space.sm },
  tipo: {
    minHeight: touchTarget + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  tipoOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  tipoApagado: { opacity: 0.55 },
  tipoCuerpo: { flex: 1, minWidth: 0, gap: 1 },
  tipoTitulo: { fontFamily: fonts.semibold, fontSize: 15, color: c.ink },
  tipoTituloOn: { color: c.brandInk },
  tipoTexto: { fontSize: 12.5, lineHeight: 17, color: c.inkMuted },
}));
