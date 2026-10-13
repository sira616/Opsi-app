import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Scales } from 'phosphor-react-native';

import { createItem, type StorageLocation } from '@/api/inventory';
import type { LineaLista } from '@/api/lista';
import { useNeveraActual } from '@/features/neveras/NeveraActiva';
import { adivinarCategoria, etiquetaCategoria } from '@/shared/lib/categorias';
import { IconoCategoria } from '@/shared/lib/categorias-iconos';
import { describeDbError } from '@/shared/lib/db-errors';
import { ATAJOS, enDias, fechaLegible, isoEnDias } from '@/shared/lib/fecha-input';
import { IconoComida } from '@/shared/lib/iconos-comida';
import { IconoNevera } from '@/shared/lib/iconos-nevera';
import { queryKeys } from '@/shared/lib/query';
import { familyOf, toBase, UNITS, type UnitFamily } from '@/shared/lib/units';
import { Button } from '@/shared/ui/Button';
import { ErrorNote } from '@/shared/ui/ErrorNote';
import { HojaInferior } from '@/shared/ui/HojaInferior';
import { fonts, makeStyles, radius, space, touchTarget, useTheme } from '@/shared/theme/tokens';

import { cantidadInicial, ubicacionSugerida } from './valores';

const DONDE: { value: StorageLocation; label: string }[] = [
  { value: 'pantry', label: 'Despensa' },
  { value: 'fridge', label: 'Nevera' },
  { value: 'freezer', label: 'Congelador' },
  { value: 'other', label: 'Otro' },
];

/** Lo que la persona ha elegido en la hoja, para que «Editar» no lo pierda. */
export type Elegido = { location: StorageLocation; dias: number | null };

type Props = {
  onClose: () => void;
  titulo?: string;
  nombre: string;
  marca?: string | null;
  /** El producto del catálogo al que se enlaza, si lo hay. */
  productoId: string | null;
  unitFamily: UnitFamily | null;
  netQuantity: number | null;
  /** La línea de la lista de la que sale: al guardar, queda comprada. */
  linea?: LineaLista | null;
  /** Abrir el formulario completo, con lo ya elegido. */
  onEditar: (elegido: Elegido) => void;
  onGuardado: (nombre: string) => void;
};

/**
 * La hoja pequeña del alta: un producto que ya se conoce, con todo puesto.
 *
 * Escanear un yogur no debería abrir un formulario de siete campos. El nombre, la
 * cantidad y el pasillo ya se saben; lo que cambia de una compra a otra es DÓNDE se
 * guarda y HASTA CUÁNDO, y esas dos son las únicas que se eligen aquí, de un toque.
 * Todo lo demás se acepta con un botón, o se corrige en el formulario completo con
 * «Editar», que lo abre con lo que se llevaba elegido.
 *
 * La fecha, por defecto, es «sin fecha»: no se inventa una que nadie ha dicho. Los
 * plazos son los de «la calculo yo» del formulario (los días los pone la persona,
 * así que se guarda como `user`).
 *
 * Se monta con una `key` por producto: su estado empieza siempre desde lo propuesto
 * para ESE producto.
 */
export function HojaAltaRapida({
  onClose,
  titulo = 'Guardar en la nevera',
  nombre,
  marca = null,
  productoId,
  unitFamily,
  netQuantity,
  linea = null,
  onEditar,
  onGuardado,
}: Props) {
  const styles = useStyles();
  const c = useTheme();
  const queryClient = useQueryClient();
  const { activa } = useNeveraActual();

  const categoria = adivinarCategoria(nombre);
  const cantidad = cantidadInicial({ unit_family: unitFamily, net_quantity: netQuantity }, linea);
  const unidad = UNITS.find((u) => u.unit === cantidad.unit)?.label ?? '';

  const [location, setLocation] = useState<StorageLocation>(ubicacionSugerida(categoria));
  const [dias, setDias] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: () =>
      createItem({
        householdId: activa.id,
        name: nombre,
        unitFamily: familyOf(cantidad.unit),
        displayUnit: cantidad.unit,
        quantity: toBase(Number(cantidad.quantity.replace(',', '.')), cantidad.unit),
        location,
        category: categoria,
        limitDate: dias === null ? null : isoEnDias(dias),
        // Los días los pone una persona: ni del envase ni de la app.
        dateKind: dias === null ? null : 'best_before',
        dateSource: dias === null ? null : 'user',
        productId: productoId,
        listaId: linea?.id ?? null,
      }),
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.priorityList(activa.id) }),
        linea ? queryClient.invalidateQueries({ queryKey: queryKeys.lista }) : Promise.resolve(),
      ]);
      onGuardado(nombre);
    },
    onError: (caught: unknown) => setError(describeDbError(caught)),
  });

  return (
    <HojaInferior visible onClose={onClose} titulo={titulo}>
      <View style={styles.producto}>
        <View style={[styles.avatar, { backgroundColor: c.brandSoft }]}>
          <IconoComida nombre={nombre} size={26} color={c.brand} weight="duotone" />
        </View>
        <View style={styles.productoTexto}>
          <Text style={styles.nombre} numberOfLines={2}>
            {nombre}
          </Text>
          {marca ? (
            <Text style={styles.marca} numberOfLines={1}>
              {marca}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Lo ya puesto, a la vista: si algo está mal, se ve antes de aceptar. */}
      <View style={styles.datos}>
        <View style={styles.dato}>
          <IconoCategoria categoria={categoria} size={15} color={c.inkMuted} weight="duotone" />
          <Text style={styles.datoTexto}>{etiquetaCategoria(categoria)}</Text>
        </View>
        <View style={styles.dato}>
          <Scales size={15} color={c.inkMuted} weight="duotone" />
          <Text style={styles.datoTexto}>
            {cantidad.quantity} {unidad}
          </Text>
        </View>
        <View style={styles.dato}>
          <IconoNevera icono={activa.icon} size={15} color={c.inkMuted} />
          <Text style={styles.datoTexto} numberOfLines={1}>
            {activa.name}
          </Text>
        </View>
      </View>

      <View style={styles.bloque}>
        <Text style={styles.etiqueta}>Dónde lo guardas</Text>
        <View style={styles.fila}>
          {DONDE.map((opcion) => (
            <Opcion
              key={opcion.value}
              label={opcion.label}
              on={opcion.value === location}
              onPress={() => setLocation(opcion.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.bloque}>
        <Text style={styles.etiqueta}>Hasta cuándo</Text>
        <View style={styles.fila}>
          <Opcion label="Sin fecha" on={dias === null} onPress={() => setDias(null)} />
          {ATAJOS.map(([etiqueta, d]) => (
            <Opcion key={etiqueta} label={etiqueta} on={dias === d} onPress={() => setDias(d)} />
          ))}
        </View>
        {dias !== null ? (
          <Text style={styles.calculo}>Se guardará el {fechaLegible(enDias(dias))}.</Text>
        ) : null}
      </View>

      <ErrorNote message={error} />

      <View style={styles.botones}>
        <Button
          label="Está bien, guardar"
          onPress={() => {
            setError(null);
            guardar.mutate();
          }}
          loading={guardar.isPending}
        />
        <Button
          label="Editar"
          variant="quiet"
          disabled={guardar.isPending}
          onPress={() => onEditar({ location, dias })}
        />
      </View>
    </HojaInferior>
  );
}

function Opcion({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const styles = useStyles();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.opcion, on && styles.opcionOn]}
    >
      <Text style={[styles.opcionTexto, on && styles.opcionTextoOn]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  producto: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  productoTexto: { flex: 1, minWidth: 0, gap: 2 },
  nombre: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: c.ink },
  marca: { fontSize: 13, color: c.inkMuted },

  datos: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dato: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
    paddingHorizontal: space.md - 2,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: c.surfaceAlt,
  },
  datoTexto: { flexShrink: 1, fontFamily: fonts.medium, fontSize: 12.5, color: c.inkMuted },

  bloque: { gap: space.sm - 2 },
  etiqueta: { fontSize: 12.5, color: c.inkMuted },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm - 2 },
  opcion: {
    minHeight: touchTarget - 4,
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  opcionOn: { borderWidth: 1.5, borderColor: c.brand, backgroundColor: c.brandSoft },
  opcionTexto: { fontFamily: fonts.semibold, fontSize: 13, color: c.inkMuted },
  opcionTextoOn: { color: c.brandInk },
  calculo: { fontSize: 12.5, lineHeight: 17, color: c.inkMuted },

  botones: { gap: space.xs },
}));
