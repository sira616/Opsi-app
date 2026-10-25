import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';

import {
  borrarAsociacion,
  borrarTodasLasAsociaciones,
  corregirAsociacion,
  fetchAsociaciones,
  type AsociacionGuardada,
} from '@/api/marcas';
import { describeDbError } from '@/shared/lib/db-errors';
import { queryKeys } from '@/shared/lib/query';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { Accion, Nota, Section, useAjustesStyles } from './ui';

/** De dónde salió lo recordado, dicho como lo entiende quien lo lee. */
function origenHablado(source: string): string {
  switch (source) {
    case 'manual':
      return 'escrita por ti';
    case 'history':
      return 'del historial';
    case 'catalog':
      return 'del catálogo de Opsi';
    case 'supermarket':
      return 'del catálogo del supermercado';
    default:
      return 'de Open Food Facts';
  }
}

/**
 * Las marcas que Opsi recuerda de los tickets que has revisado: el texto de la línea, la tienda y la marca
 * que confirmaste. Se ven, se corrigen y se borran, una a una o todas.
 *
 * Es lo único que Opsi guarda de un ticket: ni la foto ni el ticket entero ni lo que compraste ese día.
 * Solo se recuerda lo que tú confirmas a propósito al revisarlo, y solo se aplica a ese mismo texto en esa
 * misma tienda. Está a la vista porque es un dato tuyo que se queda guardado.
 */
export function SeccionMarcas() {
  const compartidos = useAjustesStyles();
  const styles = useStyles();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  const lista = useQuery({ queryKey: queryKeys.asociaciones, queryFn: fetchAsociaciones });
  const refrescar = () => queryClient.invalidateQueries({ queryKey: queryKeys.asociaciones });

  const borrar = useMutation({
    mutationFn: borrarAsociacion,
    onSuccess: () => {
      setError(null);
      void refrescar();
    },
    onError: (e) => setError(describeDbError(e)),
  });

  const borrarTodas = useMutation({
    mutationFn: borrarTodasLasAsociaciones,
    onSuccess: () => {
      setError(null);
      setConfirmando(false);
      void refrescar();
    },
    onError: (e) => setError(describeDbError(e)),
  });

  const corregir = useMutation({
    mutationFn: (a: { id: string; nombre: string; marca: string }) => corregirAsociacion(a.id, a.nombre, a.marca),
    onSuccess: () => {
      setError(null);
      setEditando(null);
      void refrescar();
    },
    onError: (e) => setError(describeDbError(e)),
  });

  const filas = lista.data ?? [];

  // Sin nada recordado y sin error no hay nada que enseñar: no se ocupa sitio en Ajustes.
  if (!lista.isPending && !lista.error && filas.length === 0) return null;

  return (
    <Section
      title="Marcas que recuerdo"
      info="Cuando revisas un ticket y confirmas, eliges o escribes una marca, la recuerdo para ese mismo texto de ticket en esa misma tienda. No guardo la foto ni el ticket. Aquí puedes corregirla o borrarla."
    >
      {lista.isPending ? <ActivityIndicator /> : null}
      <ErrorNote message={error ?? (lista.error ? describeDbError(lista.error) : null)} />

      {filas.map((a) =>
        editando === a.id ? (
          <Edicion
            key={a.id}
            a={a}
            guardando={corregir.isPending}
            onGuardar={(nombre, marca) => corregir.mutate({ id: a.id, nombre, marca })}
            onCancelar={() => setEditando(null)}
          />
        ) : (
          <View key={a.id} style={styles.fila}>
            <View style={styles.filaTexto}>
              <Text style={compartidos.rowTitle} numberOfLines={2}>
                {a.name}
              </Text>
              <Text style={compartidos.rowSubtitle} numberOfLines={2}>
                {a.brand !== null ? `Marca: ${a.brand}` : 'Marca sin identificar'} · {origenHablado(a.source)}
              </Text>
              <Text style={styles.traza} numberOfLines={1}>
                Ticket: {a.line_key}
                {a.store_key !== '' ? ` · ${a.store_key}` : ''}
                {a.confirmations > 1 ? ` · confirmada ${a.confirmations} veces` : ''}
              </Text>
            </View>
            <View style={styles.acciones}>
              <Accion
                label="Corregir"
                onPress={() => {
                  setError(null);
                  setEditando(a.id);
                }}
              />
              <Accion label="Quitar" onPress={() => borrar.mutate(a.id)} disabled={borrar.isPending} />
            </View>
          </View>
        ),
      )}

      {filas.length > 0 ? (
        confirmando ? (
          <View style={styles.confirmar}>
            <Text style={compartidos.rowSubtitle}>¿Borrar todas las marcas que recuerdo? No se puede deshacer.</Text>
            <Button label="Sí, borrarlas todas" onPress={() => borrarTodas.mutate()} loading={borrarTodas.isPending} />
            <Button label="Cancelar" variant="quiet" onPress={() => setConfirmando(false)} disabled={borrarTodas.isPending} />
          </View>
        ) : (
          <Accion label="Borrar todas" onPress={() => setConfirmando(true)} />
        )
      ) : null}

      <Nota texto="Borrar una no cambia lo que ya tienes guardado en la nevera: solo hace que la próxima vez te vuelva a preguntar." />
    </Section>
  );
}

function Edicion({
  a,
  guardando,
  onGuardar,
  onCancelar,
}: {
  a: AsociacionGuardada;
  guardando: boolean;
  onGuardar: (nombre: string, marca: string) => void;
  onCancelar: () => void;
}) {
  const styles = useStyles();
  const c = useTheme();
  const [nombre, setNombre] = useState(a.name);
  const [marca, setMarca] = useState(a.brand ?? '');

  return (
    <View style={styles.edicion}>
      <Text style={styles.etiqueta}>Producto</Text>
      <TextInput
        accessibilityLabel="Nombre del producto"
        value={nombre}
        onChangeText={setNombre}
        maxLength={120}
        placeholderTextColor={c.inkFaint}
        style={styles.campo}
      />
      <Text style={styles.etiqueta}>Marca (déjala en blanco si no se sabe)</Text>
      <TextInput
        accessibilityLabel="Marca"
        value={marca}
        onChangeText={setMarca}
        maxLength={80}
        autoCapitalize="words"
        placeholderTextColor={c.inkFaint}
        style={styles.campo}
      />
      <Button label="Guardar" onPress={() => onGuardar(nombre.trim(), marca.trim())} loading={guardando} disabled={nombre.trim() === ''} />
      <Button label="Cancelar" variant="quiet" onPress={onCancelar} disabled={guardando} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  fila: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  filaTexto: { flex: 1, minWidth: 0, gap: 2 },
  traza: { fontSize: 11.5, color: c.inkFaint },
  acciones: { alignItems: 'flex-end' },
  confirmar: { gap: space.xs },
  edicion: { gap: space.xs, paddingVertical: space.sm },
  etiqueta: { fontSize: 12.5, color: c.inkMuted },
  campo: {
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    fontFamily: fonts.medium,
    fontSize: 15,
    color: c.ink,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.ground,
  },
}));
