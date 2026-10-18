import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DotsThree, Plus, Star, Trash } from 'phosphor-react-native';

import { borrarLista, crearLista, renombrarLista, type Lista } from '@/api/lista';
import type { Plan } from '@/api/settings';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { Button } from '@/shared/ui/Button';
import { ConfirmAction } from '@/shared/ui/ConfirmAction';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { TextField } from '@/shared/ui/TextField';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

/**
 * Cuántas listas caben. El servidor es quien manda (`check_shopping_list`: 3 en el plan
 * básico, 10 en premium); estos números solo sirven para no ofrecer un botón que va a
 * fallar y para decir el motivo. Si algún día cambian allí y no aquí, el servidor
 * rechaza igualmente y el mensaje sale tal cual.
 */
const LIMITE: Record<Plan, number> = { basic: 3, premium: 10 };

type Props = {
  householdId: string;
  listas: Lista[];
  activaId: string;
  onElegir: (id: string) => void;
  plan: Plan;
};

/**
 * Las listas de una nevera, como píldoras, con «Nueva lista» y el menú de la elegida.
 *
 * Una sola lista no necesita selector, pero sí necesita que se vea que hay más: por eso
 * «Nueva lista» está siempre, y llegado el tope del plan básico no desaparece sino que
 * explica qué hay (con la estrella de premium), en lugar de dejar a la gente sin saber
 * por qué no puede.
 */
export function SelectorListas({ householdId, listas, activaId, onElegir, plan }: Props) {
  const styles = useStyles();
  const c = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [hoja, setHoja] = useState<'nueva' | 'gestionar' | null>(null);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Quien lo monta solo lo hace con alguna lista (siempre hay una): nunca es undefined.
  const activa = (listas.find((l) => l.id === activaId) ?? listas[0]) as Lista;
  const lleno = listas.length >= LIMITE[plan];

  const refrescar = () => queryClient.invalidateQueries({ queryKey: queryKeys.listaDe(householdId) });

  function cerrar() {
    setHoja(null);
    setError(null);
  }

  const crear = useMutation({
    mutationFn: () => crearLista(householdId, nombre),
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
    setHoja(cual);
  }

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
              accessibilityLabel={`Lista ${lista.name}`}
              onPress={() => onElegir(lista.id)}
              style={[styles.pildora, on && styles.pildoraOn]}
            >
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

      {/* Nueva lista, o por qué no cabe otra. */}
      <HojaInferior visible={hoja === 'nueva'} onClose={cerrar} titulo="Nueva lista">
        {lleno ? (
          <View style={styles.cuerpo}>
            <Text style={styles.texto}>
              {plan === 'basic'
                ? `Con el plan básico puedes tener hasta ${LIMITE.basic} listas, y ya las tienes. Opsi Premium ⭐ te da más.`
                : `Has llegado al máximo de ${LIMITE.premium} listas.`}
            </Text>
            {plan === 'basic' ? (
              <Button
                label="Ver Opsi Premium ⭐"
                onPress={() => {
                  cerrar();
                  router.navigate('/premium');
                }}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.cuerpo}>
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
          </View>
        )}
      </HojaInferior>

      {/* Renombrar o borrar la lista elegida. */}
      <HojaInferior visible={hoja === 'gestionar'} onClose={cerrar} titulo={activa.name}>
        <View style={styles.cuerpo}>
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

          {listas.length > 1 ? (
            <ConfirmAction
              label="Eliminar esta lista"
              icon={<Trash size={20} color={c.expiry} weight="duotone" />}
              confirmLabel="Sí, eliminarla"
              question={`¿Borrar «${activa.name}» con todo lo que tiene apuntado? No se puede deshacer.`}
              busy={borrar.isPending}
              onConfirm={() => borrar.mutate()}
            />
          ) : (
            <Text style={styles.texto}>Tiene que quedar al menos una lista, así que esta no se puede eliminar.</Text>
          )}
        </View>
      </HojaInferior>
    </>
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
}));
